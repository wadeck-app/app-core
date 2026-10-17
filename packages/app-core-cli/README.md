# @wadeck-app/app-core-cli

Manifest validation, a local dev runner for an `app-module` package, and the app-core server
itself (`serve`). Install globally; it auto-updates in the background like `queue`/`orch`/`flow`.
It is a CLI, not a types library (for that, see `@wadeck-app/app-core-sdk`).

```sh
npm install -g @wadeck-app/app-core-cli
```

## Commands

| Command | What it does |
|---|---|
| `app-core-cli validate <manifest.json>` | Same zod schema the server uses. `OK: ...` and exit 0, or the errors and exit 1 (`--json` for machines). |
| `app-core-cli dev <app-module-dir> [--id <id>]` | Real server pre-registered with your local module and the real dashboard. The id defaults to the folder name without `app-module-` (`app-module-queue` -> `queue`), which is what `$type: queue:<Component>` refers to. |
| `app-core-cli serve` | Runs the real app-core server and bundled frontend in the foreground. See [docs/serve.md](docs/serve.md). |
| `app-core-cli version` / `update` / `self-check` | Standard `@wadeck-app` CLI meta-commands. A background update check runs on every other invocation. |

### `serve` in one minute

```sh
app-core-cli serve
# app-core-cli serve: listening on http://127.0.0.1:4850
```

Port: `APP_CORE_PORT` (default 4850). Registry and `server.port.json`: `APP_CORE_CONFIG_DIR`
(default `~/.config/app-core`). To start it with Orchestrator, with a liveness check so it never
double-starts, see [docs/serve.md](docs/serve.md).

See `@wadeck-app/app-core-sdk`'s docs for the manifest/backend-entry/`$sources` contract this CLI
validates and serves against.
