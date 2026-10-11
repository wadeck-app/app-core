# @wadeck-app/app-core-sdk

Types, manifest validation, and a local dev runner for authoring an `app-module` package that
app-core loads at runtime. If you're building a module for Orchestrator, Queue, Flow, or any
future daemon, this is the only package you need.

## Install

```sh
npm install --save-dev @wadeck-app/app-core-sdk
```

## The contract, end to end

An app-module is a package named `<name>-app-module` (e.g. `queue-app-module`), containing:

```
<name>-app-module/
  manifest.json
  api-backend/
    backend.mjs       (or .js/.ts compiled to this folder -- backendEntryPath target)
  dsl-frontend/
    page.yaml          (any view referenced by a path-type extensionPoint)
```

### manifest.json

```json
{
  "version": "1.0.0",
  "backendEntryPath": "./api-backend/backend.mjs",
  "extensionPoints": [
    {
      "kind": "page",
      "slot": "nav",
      "label": "My Module",
      "view": { "type": "path", "value": "./dsl-frontend/page.yaml" }
    }
  ]
}
```

- `backendEntryPath` must resolve inside `api-backend/`.
- Every `view` of `type: "path"` must resolve inside `dsl-frontend/`.
- `view` can also be `{ "type": "inline", "value": { "$type": "Badge", "label": "..." } }` for a
  widget simple enough not to need its own file.
- `extensionPoints[].kind` is `"widget"` (renders into app-core's dashboard grid) or `"page"`
  (renders into app-core's sidebar nav, routed to a full page). `slot` is `"dashboard"` or
  `"nav"` respectively.

Validate it before you ever start app-core:

```sh
npx app-core-sdk validate ./manifest.json
```

### Registering the module with app-core

A daemon pushes a registration to app-core's own server:

```sh
curl -X POST http://127.0.0.1:4850/api/modules/register \
  -H 'Content-Type: application/json' \
  -d '{"id": "my-module", "source": {"type": "file", "path": "/absolute/path/to/manifest.json"}}'
```

Use `/api/modules/update` instead of `/register` once the module is already known, to push a new
version live with no app-core restart. If app-core is unreachable, write the same JSON body
directly to `<app-core-config-dir>/modules/<id>.json` instead -- app-core picks it up on its own
next startup. `id` must be a fixed literal string your daemon controls, never derived from
untrusted input.

### The backend entry

`backendEntryPath` points at a file with a single default export: a function receiving
`ModuleContext`. It's called once when app-core loads (or reloads) your module.

```js
// api-backend/backend.mjs
export default function (ctx) {
  // Register an HTTP route under /api/modules/<your-module-id>/history --
  // app-core enforces the id prefix itself, you only give the sub-path.
  ctx.registerRoute('GET', '/history', (_req, reply) => {
    return reply.code(200).send({ entries: ['...'] });
  });

  // Scoped timers/listeners -- use these, never raw setInterval/setTimeout/
  // addEventListener. app-core clears everything registered here automatically
  // when your module is unloaded or swapped to a new version.
  ctx.setInterval(() => {
    // periodic background work
  }, 30_000);
}
```

Raw `setInterval`/`setTimeout`/`addEventListener`, and any React/JSX usage, are rejected by a
`violations` rule that auto-applies to any `packages/*-app-module/**` path -- no per-repo config
needed. If you use `violations check` in your repo, this is enforced automatically.

### Live data in a view (`$sources`)

A view can fetch live data from a route your own backend registered:

```yaml
# dsl-frontend/page.yaml
$sources:
  history:
    url: GET /api/modules/my-module/history

$type: DataTable
rows: $sources.history.entries
```

The URL in `$sources` is a plain string handed to app-core's frontend `fetcher` -- same-origin,
no base-path logic to worry about. Keep the module id a fixed literal in the URL (as shown), never
a `$route`/dynamic placeholder -- an empty-placeholder path silently skips the fetch in the
underlying DSL renderer, so a fixed literal is the safe pattern.

### `$type` vocabulary

Every `$type` in your views comes from `@wadeck-app/dsl-ui`'s real component catalogue -- check
that package directly for what's available (`Badge`, `DataTable`, `StatTile`, and more). Module UI
is DSL-only: no React, no custom components, by design (consistency and so modules stay easy for
an AI agent to author).

## CLI reference

### `app-core-sdk validate <path-to-manifest.json>`

Runs the exact same zod schema app-core's server uses. Prints `OK: ...` and exits 0 on success;
prints the specific validation error(s) and exits 1 on failure.

### `app-core-sdk dev <path-to-app-module-dir>`

Boots a real app-core server, pre-registered with your local module, so you can iterate without a
separate app-core checkout:

```sh
npx app-core-sdk dev ./packages/my-app-module
# app-core-sdk dev: serving ./packages/my-app-module at http://127.0.0.1:4850
```

`GET /api/modules` and any route your backend registered (`GET /api/modules/<id>/...`) work
exactly as they would in production.

**Known limitation:** `dev` currently serves the API only -- app-core's dashboard/sidebar frontend
is NOT served when `app-core-sdk` is installed as a standalone package outside the app-core
monorepo (it returns 404 for `/`). This is a verified, real gap (not a guess): app-core's static
frontend resolution is tied to the monorepo's own directory layout, which doesn't exist once this
package is installed elsewhere. Use `curl`/`validate` to verify your module's data and manifest
during development; full visual verification currently requires running against a real app-core
checkout. Tracked as a known gap, not silently papered over.

## Folder and naming conventions, enforced automatically

- Package directory must be named `<name>-app-module` (e.g. `queue-app-module`), not
  `app-module-<name>` and not a bare `app-module`.
- `manifest.json` must exist at the package root and pass validation.
- `backendEntryPath` must resolve inside `api-backend/`.
- Every path-type view must resolve inside `dsl-frontend/`.
- No `.tsx` files, no `react`/`react-dom` imports, anywhere in the package.

All five are enforced by `violations` rules that auto-apply to any `packages/*-app-module/**`
path in any repo -- you don't need to configure anything for these to run against your module.
