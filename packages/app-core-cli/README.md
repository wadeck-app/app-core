# @wadeck-app/app-core-cli

Layout check and packaging for an `app-module` package, manifest validation, a local dev runner,
and the app-core server itself (`serve`). Install globally; it auto-updates in the background like `queue`/`orch`/`flow`.
It is a CLI, not a types library (for that, see `@wadeck-app/app-core-sdk`).

```sh
npm install -g @wadeck-app/app-core-cli
```

## Commands

| Command | What it does |
|---|---|
| `app-core-cli validate <manifest.json>` | Same zod schema the server uses, so it targets the packaged `dist-module/manifest.json` (the source manifest has no `version`). `OK: ...` and exit 0, or the errors and exit 1 (`--json` for machines). |
| `app-core-cli check <module-dir> [--link <package>=<folder>]...` | Checks the source layout (`src/{backend,dsl-views,dsl-components,commons}`, import and React rules, `.gitignore`, `package.json` `files`) and the source manifest. Lists every problem with its file and fix; exit 1 if any. Also checks `lifecycle` hook files (under `src/backend`, default export), `requires`, `expose` and contributions to other modules' slots (provider found in the dependencies' `dist-module`; `--link` where not installed). Writes nothing. |
| `app-core-cli package <module-dir> [--out <dir>] [--version <v>] [--link <package>=<folder>]...` | Runs `check`, then builds `dist-module/` (or `--out`): tree-shaken backend bundle (and one per lifecycle hook) with sourcemap, minified dsl-lib, referenced views as compact JSON, CSS copied as built, manifest with `version` stamped. Version: `--version`, else the `BUNDLE_VERSION` env var, else an error. |
| `app-core-cli dev <module-dir> [--port <n>] [--watch [--poll]] [--reset] [--previous-version <v>] [--link <package>=<folder>]... [--id <id>]` | Real server and dashboard with the module and every module it `requires` (resolved like `check` finds providers; `--link` overrides). A source module is packaged into `dist-module` as version `0.0.0-dev` first; a built `dist-module` is registered as is. `--watch` rebuilds on `src/` and `manifest.json` changes and hot-updates it (the old version keeps serving on a failed rebuild); dependencies are not watched. Its config dir `<module-dir>/.app-core-dev` (gitignore it) is kept between runs, so `ctx.dataDir` and the persisted version survive; `--reset` wipes it, `--previous-version <v>` makes `migrate` run as if upgrading from `<v>`. Details: [module-authoring](../app-core-sdk/docs/module-authoring.md#dev). |
| `app-core-cli serve [--no-tray]` | Runs the real app-core server and bundled frontend in the foreground, with a tray icon (status, open, version, update) unless `--no-tray`. See [docs/serve.md](docs/serve.md) and [docs/tray.md](docs/tray.md). |
| `app-core-cli tray` | Tray icon alone, for a server started some other way. See [docs/tray.md](docs/tray.md). |
| `app-core-cli version` / `update` / `self-check` | Standard `@wadeck-app` CLI meta-commands. A background update check runs on every other invocation. |

### `serve` in one minute

```sh
app-core-cli serve
# app-core-cli serve: listening on http://127.0.0.1:4850
```

Port: `APP_CORE_PORT` (default 4850). Registry and `server.port.json`: `APP_CORE_CONFIG_DIR`
(default `~/.config/app-core`), plus each module's `data/<id>/` and `state/<id>.json` (see module-authoring, lifecycle hooks). `APP_CORE_HOOK_TIMEOUT_MS` (default 30000) bounds import, setup and each hook. To start it with Orchestrator, with a liveness check so it never
double-starts, see [docs/serve.md](docs/serve.md).

See `@wadeck-app/app-core-sdk`'s [module-authoring](../app-core-sdk/docs/module-authoring.md) for the layout, manifest, backend-entry and `$sources` contract this CLI checks, packages and serves.
