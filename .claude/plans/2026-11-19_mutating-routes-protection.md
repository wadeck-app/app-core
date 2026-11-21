# Protecting the routes that change something

Asked by agent-manager-owner on behalf of the user (2026-11-16): only the user, in their browser, should be able to issue such requests. Status: proposals, nothing coded.

## Facts

- `requestGuard.ts` refuses a foreign Host, a foreign `Origin` and `Sec-Fetch-Site: cross-site|same-site`. A request with none of these headers (curl, node `fetch`, another module's server-side call) passes.
- Platform routes that change something: `POST /api/modules/register|update|unregister` (`routes/modules.ts`). `register` takes `source.path`, loads that manifest and writes it to the registry, so it comes back at the next start. Daemons call it through `@wadeck-app/app-core-sdk/register`; the port comes from `server.port.json`.
- Module routes are registered per method (`moduleRoutes.ts`); the manifest declares no effect for a route.
- The browser sends everything through `frontend-shell/src/fetcher.ts` (same-origin); on 5173 Vite proxies `/api` to 4850.

## Threat levels

| Level | Who | Reachable with HTTP alone |
|---|---|---|
| L1 | A web page of another site | Yes, already blocked |
| L2 | A same-user process that is naive or prompt-injected (an agent's `curl`) | Yes, this is the target |
| L3 | A same-user process that is malicious on purpose (reads the browser profile, process arguments, files) | No: needs another OS account or a sandbox |

A header, a cookie or a token can always be copied by L3. The goal is that L2 needs a deliberate act, not one `curl`.

## Options

| # | Mechanism | Stops L2 | Cost for a module | Notes |
|---|---|---|---|---|
| O1 | Non-GET under `/api/` needs `Sec-Fetch-Site: same-origin` or `none`; absent is refused | `curl` yes, `curl -H` no | none | Breaks daemons and CLIs calling `register`: they need O5 |
| O2 | Per-run token in a header, issued by `GET /api/session` or embedded in `index.html` | No: any `GET` gets it | none | This is agent-manager's HMAC scheme, moved up; not worth doing alone |
| O3 | One-time login: the tray or `app-core-cli open` opens the browser on `/?login=<token>`; the server swaps it for an HttpOnly `SameSite=Strict` cookie and burns the token. No `GET` hands out a secret | Yes: needs theft of the cookie or of the command line | none; the shell shows a read-only banner without a session | A typed URL or a bookmark has no cookie until the user opens it once per browser; works on 5173 (cookies ignore the port, the proxy forwards them) |
| O4 | The manifest (or `registerRoute` options) declares each route `read`, `write` or `sensitive`; the host enforces. Default for non-GET is `write`; a route may opt out (`public`) for a webhook | Framework for the others | one optional field | Moves agent-manager's guard to the platform |
| O5 | Machine token file `<configDir>/cli-token` (mode 0600 or user-only ACL), sent as `Authorization: Bearer` by `registerModule` and the CLIs; valid for platform routes and for module routes that opt in; never for `sensitive` | Not by itself (same user can read the file) | none for modules; SDK and CLIs send it | Reading a named file is something the user's own hooks can deny; a `curl` to a port is not |
| O6 | `sensitive` routes answer 202 with a challenge; the shell shows "agent-manager wants to send X to session Y"; the user confirms; the confirmation needs the O3 cookie | Yes, if O3 holds | declare `sensitive` | One click per action, or "allow this session for 10 min" |
| O7 | CLIs and daemons use a named pipe or unix socket; HTTP mutating routes become browser-only | Reduces the surface | every CLI changes | Defer |

## Recommendation

O4 as the frame, with O3 for the browser, O5 for CLIs and daemons, O6 only for routes declared `sensitive` (agent-manager's reply into a session). O1 is what O4 enforces for `write`. Skip O2 and O7 for now.

O5 status (2026-11-21, D11): built as header `X-App-Core-Token` (not `Authorization: Bearer`), on register/update/unregister only; warn first, `APP_CORE_REQUIRE_CLI_TOKEN=1` enforces; a PIN access token also passes.
Still open: flip the default to enforce once the module owners run the new SDK; module routes that opt in are not built.

Order: O4 + O1 + O5 first (modules unchanged, daemons keep registering), then O3, then O6.

Left to the user: accept L3 as out of reach; the cost of O3 (open once per browser); one click per action or per session for O6.

Unverified: whether every CLI that calls module routes finds the port in `server.port.json`; whether `register` restricts `source.path`.

## Decisions of the user (2026-11-19)

- O6 (a confirmation per action) is refused: bad UX.
- Cover L3 if possible. Adding authentication to app-core is accepted, although it is a single-user app.

Consequence: O3 (one-time login) becomes a real login, and `sensitive` needs proof of the person, not of the browser. Open: the credential (see the chat message of 2026-11-19). Notes: a session kept on the server (random id, revocable) does what a JWT would here; a JWT is needed only if another service must verify it offline. An unattended daemon calling `register` at boot cannot log in: that channel stays on the O5 token, so L3 stays possible there; it is mitigated, not closed (allowed folders for `source.path`, every registration logged and shown in the UI).

## Design chosen by the user (2026-11-20): PIN, refresh token, access token

Replaces O3, O6 and the passkey idea for now. Scope of the first delivery: `sensitive` routes only; O1 (header gate on every write) and O5 (machine token for daemons) are a later step.

- Routes declare an effect when a module registers them: `read` (default for GET), `write` (default for the rest), `sensitive`. Only `sensitive` is enforced in this delivery.
- PIN (4 to 12 characters, D10): scrypt hash in `<app-core config dir>/auth.json`, mode 0600. Created and changed only by `app-core-cli pin set` (hidden prompt, offline): never over HTTP, so an agent cannot create the first PIN. Per machine.
- Valid PIN (`POST /api/auth/pin`) gives a refresh token: random, stored hashed server-side in the config dir (survives restarts and updates), sent as an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie, valid 7 days, extended to 7 days from now each time it is used. No absolute cap (one constant if wanted later). No rotation (several tabs refresh without racing).
- `POST /api/auth/refresh` (cookie) returns an access token: JWT HS256 signed with a per-install secret (`<config dir>/auth-secret`, mode 0600, generated at first start), 10 minutes, claim `sensitive: true`. The shell keeps it in localStorage and sends `Authorization: Bearer`.
- A `sensitive` route without a valid access token answers 401 `{ error: 'elevation-required' }`. The shell fetcher then refreshes, and if there is no valid refresh token asks for the PIN in a dialog, then repeats the original request once.
- PIN lockout on the server: 5 wrong tries, then waits that grow (1 min, 5 min, 30 min).
- `POST /api/auth/logout` revokes the refresh token ("Lock now" in the interface).
- No PIN set: sensitive routes answer 403 `{ error: 'pin-not-set' }` with the command to run.

Known limits, said to the user: the access token in localStorage is readable by page scripts and by a same-user process for its 10 minutes; a same-user process that reads `auth.json` can find a 6-digit PIN offline; with daily use the PIN is asked about once if never idle 7 days.

### Amendment (2026-11-21, D9): the PIN can be set from the web app

- Reverses "never over HTTP": `POST /api/auth/pin/set` chooses the first PIN (only while none exists; 409 otherwise) and unlocks at once; `POST /api/auth/pin/change` needs the current PIN, under the same lockout as the login, and closes every other session. The shell opens a "Choose a PIN" dialog at the first sensitive action. `app-core-cli pin set` stays and replaces the PIN without asking the current one.
- Cost: while no PIN exists, a process of the same user can set the first PIN over HTTP (before, only the CLI could). Once a PIN is set, nothing changes. The request guard still refuses cross-site and foreign-origin calls; choose the PIN right after install.
- Reset by hand: delete `<config dir>/auth.json` (shown in the dialogs with its real path; no restart needed). `auth-sessions.json` is not on the list on purpose, see `server/src/auth/pin.ts` (`pinResetHint`).
