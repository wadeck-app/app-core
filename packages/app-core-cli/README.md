# @wadeck-app/app-core-cli

Manifest validation and a local dev runner for an `app-module` package. Install globally; this
auto-updates in the background, the same way `queue`/`orch`/`flow`/`task` do -- it is a CLI tool,
not a types library (for that, see `@wadeck-app/app-core-sdk`, which stays a project-local
dependency since TypeScript's module resolution genuinely requires that).

## Install

```sh
npm install -g @wadeck-app/app-core-cli
```

## Commands

### `app-core-cli validate <path-to-manifest.json>`

Runs the exact same zod schema app-core's server uses. Prints `OK: ...` and exits 0 on success;
prints the specific validation error(s) and exits 1 on failure.

### `app-core-cli dev <path-to-app-module-dir>`

Boots a real app-core server, pre-registered with your local module, so you can iterate without a
separate app-core checkout:

```sh
app-core-cli dev ./packages/my-app-module
# app-core-cli dev: serving ./packages/my-app-module at http://127.0.0.1:4850
```

`GET /`, `GET /api/modules`, and any route your backend registered (`GET /api/modules/<id>/...`)
all work exactly as they would in production -- including the real dashboard/sidebar frontend,
not just the API.

### `app-core-cli version` / `update` / `self-check`

Standard `@wadeck-app` CLI meta-commands (`shared-cli`): check the installed vs. latest version,
force an immediate update, or verify the install is healthy. The CLI also checks for an update in
the background on every other invocation, matching `queue`/`orchestrator`/`flow`'s convention --
you should rarely need to run `update` manually.

See `@wadeck-app/app-core-sdk`'s README for the full manifest/backend-entry/`$sources` contract
this CLI validates and serves against.
