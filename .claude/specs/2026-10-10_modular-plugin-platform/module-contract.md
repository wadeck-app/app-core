# Module Contract -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-10
**Status:** Draft

## Overview

Defines what a module ships, how app-core loads/unloads it at runtime, and what app-core provides to module backend code. Does NOT define how a module's backend talks to its providing daemon (files, DB, CLI) -- that is the module's own concern (Decision #4), out of scope here.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 3 | Module frontend + backend both run inside app-core's own Node process; the providing daemon never executes module code and is never embedded. | User correction on execution boundary (module is not tied to the CLI/daemon; it runs in app-core's own process). | 2026-10-10 |
| 4 | app-core is agnostic about what a module's backend does once loaded. | Keeps app-core generic. | 2026-10-10 |
| 8 | Backend loaded via dynamic `import()` with cache-busting. Frontend is DSL view data (YAML/JSON, `$type` discriminator) rendered at runtime by `dsl-renderer`'s `GenericPageRunner`. | Matches in-process requirement; reuses proven dsl-view/orch-ui pattern. | 2026-10-10 |
| 9 | Leak prevention is dev-time only: `moduleContext.setInterval()`/`moduleContext.on()`-style scoped helpers (auto-cleared on unload) + a `violations-framework` rule banning raw global timer/listener use in module source. No runtime interception. | Runtime throwing would require a Node `vm` context per module (distinct global scope) -- judged too complex for the benefit. | 2026-10-10 |
| 15 | (Shape the server loads, i.e. the packaged manifest; the source manifest an author writes is `{ id, extensionPoints, dslLib.shared }`, Decisions #81/#83.) Manifest shape: `{ version, backendEntryPath, extensionPoints: [{ kind, slot, label?, view: { type: 'inline'\|'path', value } }, ...] }`. A module declares any number of UI contributions in one manifest/version. | Reuses `extensionPoints` vocabulary from architectural_design_document.md; one module = one registration even with multiple UI contributions. | 2026-10-10 |
| 16 | Module UI is DSL-only -- no React escape hatch in a module's `view`. | Preserves consistency and agent-authorability, the original motivation for DSL view. | 2026-10-10 |
| 22 | AMENDED 2026-10-18 (see _index.md #22): the `app-module/*` rules live in this repo's `.violations` and do not auto-apply in any other repo; `app-core-cli check` is the authority. | The rules are local to this repo; `check` is what module authors run. | 2026-10-10 |
| 34 | **Superseded by Decision #81 (2026-10-18), kept for history:** the `api-backend/` + `dsl-frontend/` source folders, `backendEntryPath` in the source manifest and the no-`.tsx` rule no longer apply. Sources live in `src/{backend,dsl-views,dsl-components,commons}`, the backend entry is `src/backend/index.ts`, React is allowed in `src/dsl-components`, and `api-backend/` + `dsl-frontend/` are now `dist-module/` build output. The `app-module/*` rules and `app-core-cli check` implement #81. Original text: `packages/app-module-<name>` folder convention: `manifest.json` at root, `api-backend/` (backendEntryPath + helpers), `dsl-frontend/` (view.path targets, DSL YAML only). Enforced via rules scoped to `**/packages/app-module-*/**`: manifest exists+valid, backendEntryPath resolves inside `api-backend/`, every view.path resolves inside `dsl-frontend/`, no `.tsx`/React/JSX anywhere in the package. | Catches a module shipped with no manifest/wiring automatically via CI instead of manual review. | 2026-10-11 |
| 37/53 | Naming convention is prefix-style: `app-module-<name>` (e.g. `app-module-queue`), not `<name>-app-module`. (Decision #37 briefly got this backwards; corrected by Decision #53.) | User's explicit choice, confirmed twice. | 2026-10-11 |
| 38 | New rule: any directory containing `manifest.json` must itself be named `*-app-module`. | Catches a module shipped under the wrong folder name automatically. | 2026-10-11 |
| 26 | `moduleContext.registerRoute(method, path, handler)` registers an HTTP route on app-core's own server, scoped under `/api/modules/<id>/...`, auto-removed on unload like other `moduleContext` registrations. A view's DSL `$sources` points at that URL for live data. Confirmed by dsl-owner: `$sources` URLs are free-form strings handed verbatim to app-core's own `fetcher`, no base-path conflict. | Direct consequence of Decision #3 (backend runs in-process) + Decision #4 (app-core agnostic) -- not a new capability, just made concrete. | 2026-10-10 |
| 27 | CORRECTED: app-core's fetcher cannot warn on an empty `$sources` placeholder (the skip happens before fetcher is called). Filed as a feature request to dsl-view; RESOLVED upstream via a `console.warn` in `useSourceLoader.ts` (pending the user's review/merge on dsl-view's side). app-core still mitigates independently by keeping the module id a fixed literal in its own `registerRoute()` paths, never a `$route` placeholder -- the warning is a backstop, not relied upon. | No-silent-failures principle; fix landed in dsl-view, not app-core. | 2026-10-10 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Loading mechanics (per Decision #8)
- Backend: `import(entryPath + '?v=' + version + '&m=' + mtimeMs + '-' + size)` (cache-busting via query string) so a new version, or a backend file rewritten under the same version, is a fresh module instance, not the cached one (Decision #65).
- Frontend: no code loading -- the registration payload includes (or references) a DSL view definition consumed directly by `dsl-renderer`.
- Unload: app-core stops routing to the old module's registered routes/handlers and calls its `moduleContext` cleanup (clears any `moduleContext.setInterval`/`moduleContext.on` registrations). The old module instance itself may not be garbage-collected immediately if it leaked outside `moduleContext` -- an accepted limitation of Decision #9.

### Runtime-loaded components, `dsl-lib` (per Decisions #69, #70)
- Layout of the packaged output (`dist-module/`, built by `app-core-cli package`; sources: Decision #81): `{manifest.json, api-backend/, dsl-frontend/, dsl-lib/}`. `dsl-lib/` holds a prebuilt ESM bundle (default export `ComponentRegistryEntry[]`) and its precompiled CSS.
- Manifest: `dslLib: { entry, css?, shared }`; `entry`/`css` must exist and resolve inside `dsl-lib/` (checked at load, failures go to `failed`); `shared` maps package name to a semver range.
- Serving: `GET /api/modules/<id>/_lib/<file>?v=<version>-<mtime>-<size>`, only for loaded modules and only inside `dsl-lib/`; the `_lib` segment is reserved (`registerRoute` refuses it).
- Shared singletons (react, react-dom, react-router-dom, dsl-ui, dsl-renderer) are provided by the shell on `globalThis.__APP_CORE_SHARED__`; the server verifies `shared` against `public/build-info.json` (react, reactDom, reactRouterDom, dslUi, dslRenderer versions) and reports a mismatch through `failed`, keeping any running version. A missing build-info is an explicit stderr warning, not a silent pass.
- Naming: entries are registered as `<moduleId>:<entry.name>`; YAML uses `$type: <moduleId>:<Name>`.

### Page routes (per Decision #71)
- An extension point of `kind: page` may declare `path`; `slot: nav` lists it in the navbar, `slot: route` makes it link-only. Nav pages without `path` keep `/modules/<id>/<index>`.

### Registration source types (per Decision #10)
- `{ type: 'file', path }` -- v1, implemented. app-core reads the manifest directly from this local path.
- `{ type: 'npm', package, version }` -- **deferred to v2** (Decision #11). When built, resolution options considered: (A) shell out to `npm install` into a per-module scratch dir, reusing existing `@wadeck-app/*` registry auth (`~/.npmrc`) -- recommended for correctness (handles the package's own deps, auth, integrity); (B) fetch the tarball directly via the registry HTTP API and extract manually -- faster but reimplements what npm already solves. Revisit when v2 is scoped.

### `moduleContext` (per Decision #9)
Scoped helpers a module's backend must use instead of raw globals:
- `moduleContext.setInterval(fn, ms)` / `moduleContext.setTimeout(fn, ms)` -- tracked per-module, auto-cleared on unload.
- `moduleContext.on(event, fn)` -- tracked per-module, auto-removed on unload.
- `moduleContext.emit(event, ...args)` -- in-module events; `moduleContext.dataDir` -- the module's persistent folder (Decision #87).
- Lifecycle hooks (`teardown`, `migrate`) are declared in the manifest, Decisions #85/#87.
Enforcement: the `app-module/no-raw-timers` rule of this repo flags direct `setInterval`/`setTimeout`/`addEventListener` in module `src/backend`. Dev-time/CI only, not runtime-enforced, and not applied automatically in other repos (Decision #22 as amended).

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
*(none currently -- see _index.md for the broader spec's remaining open questions)*

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
See threat-model.md T-01 (DoS, accepted risk), T-02 (EoP/Info Disclosure, accepted risk), T-03 (Spoofing on the registration channel, accepted risk by extension of Decision #6).
