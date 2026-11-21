# PIN for sensitive actions

A module declares a route `sensitive` (`ctx.registerRoute(method, path, handler, { effect: 'sensitive' })`, see `app-core-sdk/docs/module-authoring.md`). The route answers only with an access token that the user's PIN unlocks.

## Set it

In the dashboard, or in a terminal:

```
app-core-cli pin set      # typed twice, hidden, 4 to 12 characters
app-core-cli pin status   # set or not; never prints the hash
```

- Dashboard, no PIN yet: the first sensitive action (or the key icon in the top bar, "Choose a PIN") opens a dialog (new PIN + confirm) and unlocks at once. `POST /api/auth/pin/set` works only while none exists (else 409).
- Dashboard, PIN set: key icon, "Change PIN" (current, new, confirm). `POST /api/auth/pin/change` checks the current PIN under the same lockout as the login, closes every other session, and refuses a new PIN equal to the old one.
- The CLI needs an interactive terminal; the PIN is never taken from argv, a pipe or a file. It replaces the PIN without asking the current one.
- While no PIN exists, a process of your user can set the first one over HTTP. Choose it right after install.
- Per machine: stored as a scrypt hash in `<config dir>/auth.json` (`APP_CORE_CONFIG_DIR`, else `~/.config/app-core`; `--config-dir <dir>` for an application started with `serve --module`).
- Setting a new PIN closes every session (all refresh and access tokens stop working).
- No PIN set: a sensitive route answers 403 `pin-not-set`; the dashboard then opens the "Choose a PIN" dialog and repeats the action.

## Forgot the PIN

Delete `<config dir>/auth.json` (the dialogs and the key menu show the real path, from `GET /api/auth/status` `resetHint`). No restart needed: the file is read at every request. Then choose a new PIN. Do not delete `auth-sessions.json` too: it holds the counter that revokes old access tokens, and resetting it could make a token issued before valid again.

## What the user sees

1. A sensitive action without a token: the dashboard refreshes silently from its cookie; if there is none, it asks the PIN in a dialog, then repeats the action once. Cancel rejects the action ("Sensitive action cancelled: PIN not entered").
2. 5 wrong PINs lock for 1 minute, then 5, then 30 (per server process, reset by a restart or a right PIN). The dialog counts the seconds.
3. With daily use the PIN is asked about once; again after 7 days without use.
4. The lock icon in the top bar ("Lock sensitive actions") ends the session at once. The key icon next to it ("PIN settings") is always there.

## Files (config dir)

| File | Content |
|---|---|
| `auth.json` | scrypt hash, salt and parameters of the PIN |
| `auth-secret` | 32 random bytes signing the access tokens (created at first use) |
| `auth-sessions.json` | SHA-256 of each refresh token, its expiry, and the generation counter (logout and a new PIN increment it) |

Tokens: access = JWT HS256, 10 minutes, kept by the dashboard in localStorage `app-core.access-token`. Refresh = random, HttpOnly `SameSite=Strict` cookie on `/api/auth`, 7 days sliding (`REFRESH_WINDOW_MS` in `server/src/auth/tokens.ts`), no absolute cap. The cookie has no `Secure` flag (plain http on localhost).

## Limits

- The access token in localStorage is readable by page scripts and by a process of the same user during its 10 minutes.
- A process of the same user that can read `auth.json` can find a 4 to 12 character PIN offline (a 4-digit one in minutes: scrypt slows each try, it cannot stop a try of 10,000 values). Only the salted scrypt hash is stored, never the PIN.
- File modes (0600) are not enforced on Windows: the files are readable by your whole user account.
- Only routes declared `sensitive` are protected. Ordinary write routes are not (`/api/modules/register|update|unregister` have the machine token, below).
- A restart resets the lockout; an access token not yet expired survives a restart (secret and generation are on disk).
- `sensitive` guards HTTP callers: code of a module running inside the shell page can reach the PIN session through `appFetcher`/`elevate` (a module bundle is trusted like the shell).
- `POST /api/modules/register`, `update` and `unregister` (they load code into the server) are protected by the machine token `<config dir>/cli-token` (warn first, `APP_CORE_REQUIRE_CLI_TOKEN=1` refuses; see `serve.md`), not by the PIN. A process that can read `<config dir>/cli-token` still passes.
- `POST /api/auth/pin/set` (first PIN from the dashboard) needs an `Origin` of this server or `Sec-Fetch-Site: same-origin`: it stops a bare `curl`, not a script that sends these headers.
- `auth-sessions.json` is read, changed and written without a lock across processes: a session created by the server at the instant `app-core-cli pin set` revokes all could survive that change.
- Anyone who can reach `POST /api/auth/logout` can lock the session (the request guard still applies).
