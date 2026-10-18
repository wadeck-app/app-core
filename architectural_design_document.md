# Architecture: app-core (historical design, then current shape)

> **Historical.** The first sections below are the original design (written for "plugins" and a `registerPlugin({ app, storage, router })` hook). They were NOT built that way. Do not implement against them. The real contract is in [module-authoring.md](packages/app-core-sdk/docs/module-authoring.md); decisions are in `.claude/specs/2026-10-10_modular-plugin-platform/_index.md`.

## Current shape

| Topic | What exists |
|---|---|
| Unit of extension | An `app-module-<name>` package (a "module", not a "plugin"), published from the daemon's own repo. Sources under `src/{backend,dsl-views,dsl-components,commons}`, built by `app-core-cli package` into `dist-module/`. |
| Registration | The daemon pushes it: `POST /api/modules/register` (SDK: `@wadeck-app/app-core-sdk/register`). app-core stores a pointer in `<config dir>/modules/<id>.json` and reloads it at startup. No `config/plugins.json`. |
| Backend | `src/backend/index.ts` default-exports `(ctx: ModuleContext) => void`, loaded in app-core's process. `ctx` offers `registerRoute`, scoped timers and listeners, `dataDir`. Optional `teardown` and `migrate` hooks. |
| Storage | None provided. A module keeps its files in `ctx.dataDir` (`<config dir>/data/<id>/`), which app-core never deletes. There is no storage service, no atomic-write helper, no ingestion endpoint. |
| Frontend | The shell is fixed. Modules contribute DSL views (YAML/JSON, `@wadeck-app/dsl-ui`) to the slots `dashboard`, `nav`, `route`, `navbar`, `overlay` and to other modules' slots (`<providerId>:<slot>`, `ExtensionSlot`). A module may ship React components (dsl-lib) loaded at runtime. Discovery: `GET /api/modules`, `GET /api/slots/:slotId`. |
| Module to module | `requires` (id to semver range) and `expose` (types, slots) in the manifest. |
| Stack | Node >= 22, Fastify, React + Vite shell. |

## Original design (historical)

Three layers: a core (Node server plus React shell), external plugins (own repos, backend and frontend bundles), standalone CLIs pushing data. Points that still hold: modules live in their own repos, the shell has extension points (widgets, pages), the server discovers modules at startup. Points that were dropped or changed:

| Original idea | Reality |
|---|---|
| `config/plugins.json` lists plugins | Registry folder `<config dir>/modules/<id>.json`, written by `register`. |
| `registerPlugin({ app, storage, router })` | `export default (ctx: ModuleContext)`. |
| File-based JSON storage service, atomic writes | Not built; `ctx.dataDir` only. |
| `POST /api/internal/ingest/:pluginId` for CLIs | Not built. |
| `GET /api/manifests`, plugin-provided React bundle, `frontendEntry` | `GET /api/modules`; views are DSL data; React only through `dslLib`. |
| Manifest `{ id, name, version, type, backendEntry, frontendEntry, extensionPoints: {...} }` | `{ id, extensionPoints: [...], dslLib?, requires?, expose?, lifecycle? }` as source; the packaged one adds `version`, `backendEntryPath`. See module-authoring. |
| Table columns / actions extension points | Not built. |
