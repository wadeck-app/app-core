# `app-core-cli serve`

Runs the same server as `packages/server`, with the frontend built into this package (`dist/public`), in the foreground. Stop it with Ctrl+C or SIGTERM: each module's `teardown` runs first (errors are logged, never block the stop).

| Setting | Default | Note |
|---|---|---|
| `APP_CORE_PORT` | `4850` | Listens on `127.0.0.1` only. |
| `APP_CORE_CONFIG_DIR` | `~/.config/app-core` | Module registry (`modules/<id>.json`), `server.port.json`, and per module `data/<id>/` and `state/<id>.json`. |
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
- The module's package can ship this as its own command: a `bin` that runs `app-core-cli serve --module <its dist-module> --no-update`, with `@wadeck-app/app-core-cli` as a dependency.
- Not covered: a window or installer around the browser, and a name or icon other than the module's title.

`GET /build-info.json` returns `builtAt`, `dslUi`, `dslRenderer` of the bundled frontend.

If the bundled frontend is missing, `serve` exits 1 with a message instead of serving a blank API-only server.

## Start it with Orchestrator

```sh
orch add startup app-core --command "app-core-cli serve" \
  --liveness-strategy portFile --liveness-port-file "~/.config/app-core/server.port.json" \
  --timeout 2000000
```

- The portFile liveness skips an automatic start while the recorded pid is alive. A manual `orch trigger` is not filtered; the port is then simply busy and `serve` exits with the listen error.
- Orchestrator kills a job after `--timeout` seconds (default 300), which would stop the server after five minutes; the value above is about 23 days.

## Updates

Every `app-core-cli` invocation, including `serve`, schedules the background self-update check (`shared-updater`, `without-daemon`) unless `--no-update` or `APP_CORE_CLI_NO_UPDATE=1` is given. The server and frontend are part of the same package, so a new version is used the next time `serve` starts. `app-core-cli update` still updates when you ask for it. A build from the repository (not a CalVer release) never updates.
