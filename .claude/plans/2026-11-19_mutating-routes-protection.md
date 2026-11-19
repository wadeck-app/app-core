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

Order: O4 + O1 + O5 first (modules unchanged, daemons keep registering), then O3, then O6.

Left to the user: accept L3 as out of reach; the cost of O3 (open once per browser); one click per action or per session for O6.

Unverified: whether every CLI that calls module routes finds the port in `server.port.json`; whether `register` restricts `source.path`.

## Decisions of the user (2026-11-19)

- O6 (a confirmation per action) is refused: bad UX.
- Cover L3 if possible. Adding authentication to app-core is accepted, although it is a single-user app.

Consequence: O3 (one-time login) becomes a real login, and `sensitive` needs proof of the person, not of the browser. Open: the credential (see the chat message of 2026-11-19). Notes: a session kept on the server (random id, revocable) does what a JWT would here; a JWT is needed only if another service must verify it offline. An unattended daemon calling `register` at boot cannot log in: that channel stays on the O5 token, so L3 stays possible there; it is mitigated, not closed (allowed folders for `source.path`, every registration logged and shown in the UI).
