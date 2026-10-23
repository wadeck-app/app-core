# Tray icon

`app-core-cli serve` shows a tray icon by default; `app-core-cli tray` shows one for a server started some other way (an orchestrator job, another terminal). Windows and macOS only.

| Menu item | Does |
|---|---|
| status line | "running on port N" or "not running", read from `server.port.json` every 3 s |
| Open app-core | opens `http://127.0.0.1:<port>/` |
| version | click to check the latest published version |
| Update to vX | runs the updater forced (same as `app-core-cli update`); then, in `serve`, "Restart to apply the update" |
| Quit | `serve`: stops the server too. `tray`: closes the icon only |

- `serve --no-tray` skips it. Without a tray binary (Linux, missing package) `serve` keeps running and prints the reason; `tray` exits 1.
- Tray log: `<cli config dir>/logs/tray.log`.

## How it ships

The icon is a small Go binary (`tray-go`, `gogpu/systray`, no CGO) that Node drives with JSON lines on stdin/stdout. It is not in the main package:

- CI builds it for win32-x64, darwin-arm64 and darwin-x64 and publishes it as `@wadeck-app/app-core-cli-<platform>`, **only when the binary hash changed**.
- The main package pins those versions exactly in `optionalDependencies`, so updating app-core-cli updates the tray iff the pin moved, and a rollback restores the matching binary.
- At run time the binary is copied to `<cli config dir>/bin/<platform package version>/` and run from there: npm cannot update a package while one of its executables runs on Windows.
- In a checkout, `npm run build-tray --workspace=packages/app-core-cli` (needs Go) builds into `tray-go/dist`, which is used when no platform package is installed.

## Copied from orchestrator: extract it before a third copy

`tray-go/`, `src/tray/trayProcess.ts`, `src/tray/trayBinary.ts` and `ci/scripts/*-platform-packages.sh` are copies of the orchestrator's (`packages/orchestrator-cli`); wdrive carries its own `tray-go` too. The IPC protocol is generic (`init`, `set-menu`, `exit` in; `ready`, `clicked` out). Fixing one copy means fixing all of them by hand.

**If another project needs a tray, or a bug has to be fixed in these files, extract them into a shared package (binary, `TrayProcess`, staging, publish scripts) and make orchestrator, wdrive and app-core depend on it. Do not make a third copy.**
