# `app-core-cli serve`

Runs the same server as `packages/server`, with the frontend built into this package (`dist/public`), in the foreground. Stop it with Ctrl+C or SIGTERM: each module's `teardown` runs first (errors are logged, never block the stop).

| Setting | Default | Note |
|---|---|---|
| `APP_CORE_PORT` | `4850` | Listens on `127.0.0.1` only. |
| `APP_CORE_CONFIG_DIR` | `~/.config/app-core` | Module registry (`modules/<id>.json`), `server.port.json`, and per module `data/<id>/` and `state/<id>.json`. |
| `APP_CORE_CSP` | `enforce` | `report-only` logs what the policy would block without blocking it; `off` sends no policy (a warning says so). Any other value stops the server at startup. See "Content-Security-Policy". |
| `APP_CORE_HOOK_TIMEOUT_MS` | `30000` | Timeout of a module's import, setup and each lifecycle hook. A value that is not a positive integer stops the server at startup. |

`server.port.json` (`{"pid": ..., "port": ...}`) is written after the server listens and removed on a clean stop. After a forced kill it stays on disk; consumers must check that `pid` is alive.

## Flags

| Flag | Effect |
|---|---|
| `--no-tray` | No tray icon. |
| `--no-update` | No background self-update, and no update check or install in the tray (it shows the version only). `APP_CORE_CLI_NO_UPDATE=1` does the same. Also accepted by `dev`. |
| `--module <dir|manifest.json>` | An application made of one module, see below. |
| `--config-dir <dir>` | With `--module`: where the application keeps its registry, `data/` and `state/`. Default `<app-core-cli config dir>/standalone/<module id>`. Refused without `--module`. |
| `--port <n>` | Port to listen on; wins over `APP_CORE_PORT`. |
| `--ab-tests` | Shows the A/B test dock (`AbTest` nodes and the shell's own tests) in this production build. Off without it. The server prints a line at start and answers `GET /api/shell-settings` with `{"abTests": true}`. A tray Restart or an update restart keeps the flag. |

## An application made of one module (`--module`)

`app-core-cli serve --module ./dist-module --no-tray --no-update` serves one built module (what `app-core-cli package` writes; a source manifest is refused with the command to run) and the modules it `requires`, found in the `node_modules` of its package as `dev` does. Nothing else is loaded, and the registry is rewritten at each start, so an application never picks up modules of a global app-core.

- The shell has no dashboard, no module tabs and no "Modules" or "A/B tests" pages; the brand is the module's title, and `/` opens the first page the module adds to the menu (`slot: "nav"`). `GET /api/shell-settings` answers `{"abTests": false, "standalone": {"moduleId": "<id>"}}`.
- A module with no `nav` page has nothing to open on: the page says so.
- The module's package ships this as its own command: a `bin` script that resolves `@wadeck-app/app-core-cli/dist/cli.bundle.js` with `createRequire` and runs `serve --module <dist-module> --no-update` plus the arguments it was given. The script, the `package.json` fields and the steps are in `app-core-cli help standalone` (the text is `src/helpStandalone.ts`); the script was run against a built module and served it.
- Not covered: a window or installer around the browser, a name or icon other than the module's title, hiding the information menu of the top bar.

`GET /build-info.json` returns `builtAt`, `dslUi`, `dslRenderer` of the bundled frontend.

If the bundled frontend is missing, `serve` exits 1 with a message instead of serving a blank API-only server.

## Content-Security-Policy

Every HTML response (the shell, and any HTML a module route answers) carries `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`; the source and the reason of each directive are in `packages/server/src/csp.ts`. A response that has its own policy keeps it and gets this one too.

- Blocked: inline scripts and styles (`<script>`, `<style>`, `style="..."`), `eval`, any other origin (images, fonts, fetch, WebSocket), `data:` and `blob:` URLs, framing, `<base>`, forms to other sites.
- Allowed: files of this origin, which includes every module bundle under `/api/modules/<id>/_lib/`.
- Not isolated: modules from each other. A bundle is a script of this origin and still reads what other modules show (threat model T-04); the policy stops what leaves for another site, injected scripts and framing.
- A violation is posted by the browser to `POST /api/csp-report` and logged once per distinct case: `[csp] blocked "<uri>" (img-src) on /modules/x/y. ...`. `APP_CORE_CSP=report-only` turns a module that breaks into log lines instead of a broken page.
- Vite's dev server (5173) sends no policy; `serve`, `dev` and the server on 4850 do.
- Not included: `require-trusted-types-for 'script'`. The shell renders Markdown and charts through `innerHTML`, so a Trusted Types policy with a sanitizer comes first.

## Start it with Orchestrator

```sh
app-core-cli startup enable    # the server starts with Orchestrator
app-core-cli startup disable   # it no longer does; a running server is not stopped
app-core-cli startup status    # the job, and what is outdated in it
```

- `enable` calls `orch ensure startup ...` (Orchestrator 2026.11.14-592 or later): safe to repeat, it prints `added`, `updated` or `unchanged`, and keeps any field of the job you edited by hand that it does not set. Same surface as `machine startup`.
- Nothing runs it for you, not even `update`: it changes what starts at login. It never runs `orch install`; it tells you to when Orchestrator itself may not start at login.
- A job that already starts the server (it uses the server's port file), such as the repository's `app-core-dev` (`npm run dev:all`), is the one used: its command, label and folder are kept, and only the missing settings are completed. Otherwise the job `app-core` (`app-core-cli serve`) is created. `--id <job-id>` picks one explicitly; several candidates without `--id` is an error that lists them.
- The settings: `--timeout 0` (Orchestrator's default of 300 s would stop the server after five minutes), one run at a time, and the portFile liveness: an automatic start is skipped while the recorded pid is alive. A manual `orch trigger` is not filtered; the port is then simply busy and `serve` exits with the listen error.
- `disable` never removes a job it did not create (command other than `app-core-cli serve`) unless `--id` names it. `enable --id` next to another job on the same port file prints a warning: two jobs would fight for the port.

## Updates

Every `app-core-cli` invocation, including `serve`, schedules the background self-update check (`shared-updater`, `without-daemon`) unless `--no-update` or `APP_CORE_CLI_NO_UPDATE=1` is given. The server and frontend are part of the same package, so a new version is used the next time `serve` starts. `app-core-cli update` still updates when you ask for it. A build from the repository (not a CalVer release) never updates.

### Update indicator and restart

- A running `serve` starts the updater again every 6 hours (the 30 minute cache of `shared-updater` makes a call that comes too soon a file read). No timer with `--no-update`.
- `GET /api/app-update` reads `update-state.json`, `update-cache.json` (in `APP_CORE_CLI_CONFIG_DIR`, else `~/.config/app-core-cli`) and the `package.json` of the installed package; no network. It answers `state`: `up-to-date`, `restart-needed` (installed differs from running), `update-failed` (`failure`: message, `step` is the updater's `phase` in `update-state.json`, when it recorded one; log file of the day), `update-available`, `applying`, or `unknown` with a `reason` (a run from sources such as `dev:all`, a missing or unreadable file). `canRestart` says whether the restart below is offered.
- The top bar shows the state (hidden when up to date) and polls every 5 minutes and on window focus.
- `POST /api/app-update/restart` needs the PIN (same rules as a `sensitive` module route, `pin.md`), answers 202, then runs the tray's Restart. The shell waits for the server to answer with the installed version and reloads. 409 `restart-unavailable` when the server is not started by `serve`.

### An update is refused unless the new server runs

The new version is installed into a staging folder first. The updater runs `cli version`, then starts `serve --port 0 --no-tray --no-update` of that version with a temp app-core config dir (copy of the `modules/*.json` registry entries only, no data) and the real home (HOME, USERPROFILE, APPDATA, XDG_*), so module backends reach their systems as they do in the running server (only the `cli version` step runs with a temp home) and requires, within 60 s:

- `/` is HTML, every same-origin script/link it references answers 200, `/build-info.json` parses;
- every module registered here is loaded in `/api/modules` (a module that also fails in the running server is excused; with no running server, any failed module refuses the update);
- each loaded module's `GET /api/modules/<id>/health` is ok, or, when it answers 404, its base pages resolve and their GET sources answer without a 5xx. A 5xx source or an `ok: false` `/health` refuses the update only if the running server answers the same URL healthily; if it fails there too it is a warning line in the output. With no running server to compare, it refuses and says so (format and rules: `app-core-sdk/docs/module-authoring.md`, "Update test").

The stage and its process tree are always stopped and the temp dir removed (retried for about 5 s; a folder still locked is removed by the next update check, which also sweeps `app-core-staged-health-*` folders of the temp dir older than 10 minutes, and reports one older than 24 h that it cannot remove). On refusal nothing is switched, the old version keeps running, and the message (step, module, last 40 lines of the staged server output) is in `<app-core-cli config dir>/logs/<date>.ndjson` and printed by `app-core-cli update`.
