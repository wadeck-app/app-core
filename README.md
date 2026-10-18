# app-core

A local dashboard host. Daemons (Queue, Orchestrator, Flow...) ship an `app-module` package; app-core loads it at runtime, hot-swaps it on update and serves its backend routes and DSL views. Everything runs in app-core's own Node process, bound to `127.0.0.1`, for trusted local users only.

## Packages

| Package | Role |
|---|---|
| `packages/server` | Fastify server: module registry, loader, lifecycle hooks, route registry, `/api/*`. |
| `packages/frontend-shell` | React shell: navbar, dashboard, pages, `ExtensionSlot`, runtime-loaded dsl-lib components. |
| `packages/app-core-sdk` | Types, manifest schemas and the `register` subpath a daemon uses to register its module. Published as `@wadeck-app/app-core-sdk`. |
| `packages/app-core-cli` | `@wadeck-app/app-core-cli`: `check`, `package`, `dev`, `validate`, `serve`. Bundles the server and the shell. |
| `packages/test-app-modules` | Fixture modules used by the tests; `app-module-example` is the reference module to copy. |

## Build, test, run

Node >= 22.

```sh
npm install
npm run build        # shell, server, sdk, cli (this order)
npm run test:all     # server, shell, sdk, cli; fixtures are rebuilt first (build-fixtures.mjs)
npm run test:violations-rules
npx violations check
```

| Goal | Command |
|---|---|
| Server + shell with hot reload (ports 4850 and 5173); output without colors, ends with a `[dev-all] ready:` line holding both URLs | `npm run dev:all` |
| Built shell copied to `public/` for the server | `npm run build:full` |
| The packaged app, foreground | `app-core-cli serve` ([docs](packages/app-core-cli/docs/serve.md)) |
| Rebuild the fixtures only | `npm run build:fixtures` (needs `npm run build` first) |

## Writing a module

Start with [Start here](packages/app-core-sdk/docs/module-authoring.md#start-here-the-5-minute-path) in the authoring guide. Reference pieces:

- [module-authoring.md](packages/app-core-sdk/docs/module-authoring.md): layout, manifest, backend, hooks, slots, dsl-lib, migration checklist, troubleshooting, limitations.
- [registering-a-module.md](packages/app-core-sdk/docs/registering-a-module.md): the daemon-side `register` API.
- [app-module-example](packages/test-app-modules/app-module-example/README.md): tested module to copy.
- [app-core-cli README](packages/app-core-cli/README.md) and [app-core-sdk README](packages/app-core-sdk/README.md).

## Design and history

- [architectural_design_document.md](architectural_design_document.md): original design, partly historical, points to the real contract.
- `.claude/specs/2026-10-10_modular-plugin-platform/_index.md`: decision log (what was decided and built) and known limitations.
