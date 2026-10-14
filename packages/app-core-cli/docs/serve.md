# `app-core-cli serve`

Runs the same server as `packages/server`, with the frontend built into this package (`dist/public`), in the foreground. Stop it with Ctrl+C or SIGTERM.

| Setting | Default | Note |
|---|---|---|
| `APP_CORE_PORT` | `4850` | Listens on `127.0.0.1` only. |
| `APP_CORE_CONFIG_DIR` | `~/.config/app-core` | Module registry (`modules/<id>.json`) and `server.port.json`. |

`server.port.json` (`{"pid": ..., "port": ...}`) is written after the server listens and removed on a clean stop. After a forced kill it stays on disk; consumers must check that `pid` is alive.

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

Every `app-core-cli` invocation, including `serve`, schedules the background self-update check (`shared-updater`, `without-daemon`). The server and frontend are part of the same package, so a new version is used the next time `serve` starts.
