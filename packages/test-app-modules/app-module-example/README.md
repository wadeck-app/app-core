# app-module-example

Reference module (id `example`). Copy it to start a module; the comments in the sources say why each line is there. Full reference: [module-authoring.md](../../app-core-sdk/docs/module-authoring.md).

| File | Demonstrates |
|---|---|
| `manifest.json` | `id`, `requires`, `expose` (own slot), `lifecycle`, page / route / dashboard / navbar points, a contribution to `slot-provider:shared-slot`, `dslLib` |
| `src/backend/index.ts` | JSON route, `:id` route with 404, SSE route closed on unload (one `ctx.on` listener per stream, removed with `ctx.off`), `ctx.setInterval` + `ctx.emit`, `ctx.dataDir`, the running state returned as the instance |
| `src/backend/teardown.ts`, `migrate.ts` | Hooks: `teardown` flushes the counter from `ctx.instance` and logs `ctx.reason`; `migrate` renames a state file using `previousVersion` |
| `src/commons/` | `items.ts`: pure code shared by backend and components. `types.ts`: types-only, published through `exports["./types"]` |
| `src/dsl-views/` | `items.yaml`: DataTable fed by `$sources`. `item.yaml`: `$route.id` and an `ExtensionSlot`. `navbar.yaml`: a dsl-lib component. Containers list their nodes under `items:` (not `children:`, which is ignored and renders blank) |
| `src/dsl-components/` | `LiveTicks`: `EventSource` closed on unmount, theme tokens only |

The provider is not installed in this repo (the fixtures are not workspaces), so each command points at its built folder with `--link`; in a real module, `npm install` it instead.

```sh
L="--link @wadeck-app/app-module-slot-provider=../app-module-slot-provider"
app-core-cli check . $L
BUNDLE_VERSION=1.0.0 app-core-cli package . $L
app-core-cli dev . --watch $L
```

`dev` keeps `.app-core-dev/` (gitignored) between runs, so the counter survives; `app-core-cli dev . --previous-version 0.9.0 $L` runs `migrate` as if upgrading from 0.9.0, `--reset` starts clean.
