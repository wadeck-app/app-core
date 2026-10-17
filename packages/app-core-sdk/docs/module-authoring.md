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
- `extensionPoints[].path` (optional, pages only, e.g. `"/jobs/:id"`): mounts the page at
  `/modules/<moduleId><path>` as its own route; `:name` segments reach the view as `$route.name`.
  Segments are letters, digits, `_` or `-`; no `..`, no trailing slash. The path `"/"` alone is the
  module's home page, mounted at `/modules/<moduleId>` (with or without a trailing slash).
- `slot: "route"` (with `kind: "page"`): the page is reachable only by link, not listed in the
  navbar (detail, edit and log pages). Link to it from another view with dsl-ui `Link`/`ButtonLink`
  (`href: /modules/<moduleId>/jobs/...`). Routes disappear when the module is unloaded or swapped.
- `dslLib` (optional): runtime-loaded components, see "Shipping components (dsl-lib)" below.
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

#### Streaming responses (SSE)

A handler may stream: call `reply.hijack()`, then write to `reply.raw` (`writeHead(200, { 'Content-Type':
'text/event-stream' })`, `write('data: ...\n\n')`). Clean up in `req.raw.on('close', ...)`.

When your module is unloaded, swapped by an update or unregistered, app-core ends the streams it
already started (headers sent, not finished): your `close` handler runs and the client reconnects
(`EventSource` does it by itself) to the new version. Requests still waiting for their handler are not
touched.

#### Route parameters

A sub path may contain `:name` segments. The handler reads them from `req.params`, which holds only
your own parameters (a parameter may be called `id`):

```ts
ctx.registerRoute('POST', '/dlq/:id/replay', (req, reply) => reply.send({ replayed: req.params.id }));
```

- Matching is per segment, on method and segment count; static segments win over parameters
  (`/jobs/new` before `/jobs/:id`).
- Values are URL-decoded. A malformed encoding answers 404.
- Two routes of the same method and shape (`/a/:x` and `/a/:y`) cannot both be registered:
  `registerRoute` throws, and the module is reported in `failed` instead of silently overwriting one.
- Names must be letters, digits or `_`; the sub path `/_lib` is reserved (see dsl-lib below).

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
that package directly for what's available (`Badge`, `DataTable`, `StatTile`, and more). Views are
always DSL (consistency, and so modules stay easy for an AI agent to author). Prefer a generic
dsl-ui component; ship your own only when none can express the behaviour (a streaming log viewer,
say), through `dslLib` below.

## Shipping components (dsl-lib)

A module may bring its own business components. They are loaded into the shell at runtime, so no
shell rebuild is needed, and removed again when the module is unloaded or swapped.

```
app-module-<name>/
  dsl-lib/
    entries.mjs      prebuilt ESM bundle; default export = ComponentRegistryEntry[]
    style.css        precompiled CSS for those components (the shell does not scan your classes)
```

```json
"dslLib": {
  "entry": "./dsl-lib/entries.mjs",
  "css": "./dsl-lib/style.css",
  "shared": { "react": "^19", "react-router-dom": "^7", "@wadeck-app/dsl-ui": ">=2026.10.14-0" }
}
```

- `entry` and `css` must exist and resolve inside `dsl-lib/`. app-core serves them at
  `/api/modules/<id>/_lib/<file>?v=<version>-<mtime>-<size>`; `_lib` is reserved, so
  `registerRoute` refuses sub paths under it.
- Each entry is registered as `<moduleId>:<entry.name>`: a module registered as `orchestrator`
  with an entry named `JobCardGrid` is used in YAML as `$type: orchestrator:JobCardGrid`. Built-in
  dsl-ui components keep their plain names. A component that renders children by `$type` must use
  those exact names.
- Views of the module are not rendered until its components are loaded (the shell shows a loading
  state, or an alert with the reason if the import fails).
- Shared singletons: the shell provides `react`, `react/jsx-runtime`, `react-dom`,
  `react-dom/client`, `react-router-dom`, `@wadeck-app/dsl-ui` and `@wadeck-app/dsl-renderer` on
  `globalThis.__APP_CORE_SHARED__`, keyed by package name. Your bundle must not contain its own
  copy (two Reacts, or two dsl-ui contexts, break hooks, toasts and routing); build it with those
  specifiers externalized to that global.
- `shared` declares the ranges you built against. At load, app-core checks them against the
  versions the shell was built with (`/build-info.json`); a mismatch, an unknown package or an
  invalid range makes the module fail with a message in `GET /api/modules` `failed`, and the running
  version is kept. If `build-info.json` is missing the check is skipped with a warning on stderr.
- The shell provides the router, `ToastProvider` and the theme tokens (use dsl-ui semantic classes,
  never raw colors). Use relative `/api/modules/<id>/...` URLs for your module's own endpoints.

Reference esbuild plugin (tested by the repo's fixture,
`packages/test-app-modules/_sources/dsl-lib-fixture/build.mjs`). Keep the React source outside the
`app-module-*` folder; only the built `dsl-lib/` output goes into it. Commit it, or generate it in CI
before the package is published: app-core refuses a module whose declared `dsl-lib/` files do not exist
when it registers:

```js
import { build } from 'esbuild';

const SHARED = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'react-router-dom',
  '@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer'];

const appCoreShared = {
  name: 'app-core-shared',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (SHARED.includes(args.path)) return { path: args.path, namespace: 'app-core-shared' };
      // Deep imports emitted by entriesGenerator resolve to the shared dsl-ui root.
      if (args.path.startsWith('@wadeck-app/dsl-ui/dist/')) return { path: '@wadeck-app/dsl-ui', namespace: 'app-core-shared' };
    });
    b.onLoad({ filter: /.*/, namespace: 'app-core-shared' }, (args) => ({
      contents: `module.exports = globalThis.__APP_CORE_SHARED__[${JSON.stringify(args.path)}];`,
      loader: 'js',
    }));
  },
};

await build({ entryPoints: ['src/entries.mjs'], outfile: 'app-module-x/dsl-lib/entries.mjs',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', plugins: [appCoreShared] });
```

Components run in the shell's origin with full DOM access: install only modules you trust.

## Folder and naming conventions, enforced automatically

- Package directory must be named `app-module-<name>` (e.g. `app-module-queue`), not
  `<name>-app-module` and not a bare `app-module`.
- `manifest.json` must exist at the package root and pass validation.
- `backendEntryPath` must resolve inside `api-backend/`.
- Every path-type view must resolve inside `dsl-frontend/`.
- No `.tsx` files, no `react`/`react-dom` imports, anywhere in the package (React source for a
  `dsl-lib` lives in a separate package; only its built output goes into `dsl-lib/`).

All five are enforced by `violations` rules that auto-apply to any `packages/app-module-*/**`
path in any repo -- you don't need to configure anything for these to run against your module.
