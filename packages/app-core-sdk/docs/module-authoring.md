# Authoring an app-module

Full reference for packages built on `@wadeck-app/app-core-sdk`. Dark-theme rules for views are in the [README](../README.md#dark-theme).

## The contract, end to end

An app-module is a package named `app-module-<name>` (e.g. `app-module-queue`), containing:

```
app-module-<name>/
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
  (renders into app-core's top navbar, routed to a full page). `slot` is `"dashboard"` or
  `"nav"` respectively.
- `extensionPoints[].order` (optional number) only matters if your module contributes to another
  module's `ExtensionSlot` -- app-core sorts by it and strips it before rendering; it's a purely
  structural sort key, app-core never interprets what it means.

Validate it before you ever start app-core (requires `@wadeck-app/app-core-cli`):

```sh
app-core-cli validate ./manifest.json
```

### Registering the module with app-core

A daemon pushes a registration to app-core's own server:

```sh
curl -X POST http://127.0.0.1:4850/api/modules/register \
  -H 'Content-Type: application/json' \
  -d '{"id": "my-module", "source": {"type": "file", "path": "/absolute/path/to/manifest.json"}}'
```

Use `/api/modules/update` instead of `/register` once the module is already known, to push a new
version live with no app-core restart (the backend is reloaded when its file changed, even under an
unchanged `version`; bump `version` anyway so the change is visible). If app-core is unreachable, write the same JSON body
directly to `<app-core-config-dir>/modules/<id>.json` instead -- app-core picks it up on its own
next startup. `id` must be a fixed literal string your daemon controls, never derived from
untrusted input.

### Module ids, load failures and removal

- The module `id` must match `^[A-Za-z0-9][A-Za-z0-9_-]*$` (letters, digits, `_`, `-`); anything else is rejected with `400`.
- A registered module that cannot load (missing or invalid manifest, backend throws) does not stop app-core. It is listed under `failed` in `GET /api/modules` (`id`, `source`, `error`, `failedAt`), printed on stderr at startup, and shown as an alert in the UI. Fix it and re-register, or remove it.
- When your daemon is uninstalled, unregister the module so it does not come back on restart:

```sh
curl -X POST http://127.0.0.1:4850/api/modules/unregister \
  -H 'Content-Type: application/json' -d '{"id": "my-module"}'
```

`200 { "id": "my-module", "removed": true }`; `404` if app-core does not know the id.

### The backend entry

`backendEntryPath` points at a file with a single default export: a function receiving
`ModuleContext` (typed by this package).

```ts
import type { ModuleContext } from '@wadeck-app/app-core-sdk';

export default function (ctx: ModuleContext) {
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
`violations` rule that auto-applies to any `packages/app-module-*/**` path -- no per-repo config
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

### Contributing into another module's slot (`ExtensionSlot`)

If another module exposes an `ExtensionSlot` (e.g. `queue:subscriber-row`), declare an
`extensionPoints[]` entry with `slot: "queue:subscriber-row"` and depend on that module's own
published contract package for the typed shape of what it expects -- the contract is owned by the
providing module, never centralized here.

### `$type` vocabulary

Every `$type` in your views comes from `@wadeck-app/dsl-ui`'s real component catalogue -- check
that package directly for what's available (`Badge`, `DataTable`, `StatTile`, and more). Module UI
is DSL-only: no React, no custom components, by design (consistency and so modules stay easy for
an AI agent to author). This is a v1 rule, not a permanent one -- revisit if a real module ever
needs a genuinely bespoke component.

## Folder and naming conventions, enforced automatically

- Package directory must be named `app-module-<name>` (e.g. `app-module-queue`), not
  `<name>-app-module` and not a bare `app-module`.
- `manifest.json` must exist at the package root and pass validation.
- `backendEntryPath` must resolve inside `api-backend/`.
- Every path-type view must resolve inside `dsl-frontend/`.
- No `.tsx` files, no `react`/`react-dom` imports, anywhere in the package.

All five are enforced by `violations` rules that auto-apply to any `packages/app-module-*/**`
path in any repo -- you don't need to configure anything for these to run against your module.
