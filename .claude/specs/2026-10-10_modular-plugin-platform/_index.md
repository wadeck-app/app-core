# Spec: Modular Plugin Platform

**Created:** 2026-10-10
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 92 decisions logged, 0 open questions -- MILESTONE: first real module (queue) working end-to-end
**Iteration:** 1

## Summary

<!-- One paragraph: what this spec covers and why it exists. Fill in after first few decisions. -->
Evolves app-core (originally designed by Gemini as a "Modular Manager Dashboard") into the single modular base application for all of the user's tools. Core goals: (1) plugins/modules can be added, hot-loaded, and hot-unloaded at runtime without a server restart; (2) existing background CLI tools (Orchestrator, Queue, Flow) can expose UI modules inside app-core instead of being pure CLIs; (3) evaluate a DSL-based view system (instead of hand-written React) as the standard way modules declare their UI, to improve consistency and make modules easier for AI agents to author.

**Verified workspace context (as of 2026-10-10):**
- `app-core` currently contains only `architectural_design_document.md` -- no code yet.
- `dsl-view` (`@wadeck-app/dsl-renderer` + `@wadeck-app/dsl-ui`) defines views as plain JSON/YAML objects with a `$type` discriminator, rendered at runtime by `DslRenderer`/`GenericPageRunner` (which parses YAML text at runtime, not build time) -- so DSL views already support dynamic/runtime loading. Already consumed by `orch-ui`.
- `orchestrator` (`@wadeck-app/orchestrator-cli`) is a real daemon (`orch start/stop/restart`) with a Fastify-based `orch-server` (API routes for jobs/events/heartbeat/logs) and an existing dashboard (`orch-ui`) already built on dsl-renderer/dsl-ui.
- `queue` (`@wadeck-app/queue-cli`) is a local event-queue daemon/CLI (push/retry/dlq/etc.).
- `flow`/`task` CLIs are published from `agent-fleet`'s `flow-cli` package (`@wadeck-app/flow-cli`); `agent-fleet` itself is a larger multi-agent orchestration system.
- `@wadeck-app/singleton-daemon-kit` is a shared library (port file, takeover, health HTTP, CLI dispatch) already used by orchestrator, queue, and flow-cli -- an existing daemon convention, not something to invent from scratch.

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 1 | "Q" refers to the `queue` tool (`@wadeck-app/queue-cli`, local event-queue daemon with push/retry/dlq). | Decided | 2026-10-10 | User confirmation after verified workspace research. |
| 2 | "Flow" refers to the `flow`/`task` CLIs published from `agent-fleet`'s `flow-cli` package (`@wadeck-app/flow-cli`), not a separate standalone project. | Decided | 2026-10-10 | User confirmation after verified workspace research. |

## Decision Log (cont.)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 3 | A module's frontend AND backend code both run inside app-core's own Node process. The providing daemon (Orchestrator, Queue, Flow, future tools) never executes module code itself and is never embedded into app-core -- its lifecycle stays fully independent, exactly as today. | Decided | 2026-10-10 | User correction: the module is not directly or indirectly tied to the CLI/daemon -- it should run in the same process as app-core. |
| 4 | app-core is agnostic about what a loaded module's backend code actually does (reading daemon-generated files, hitting a DB, calling the daemon's CLI, etc.). app-core's only responsibility is to load/unload the module code itself. | Decided | 2026-10-10 | User statement: app-core must be agnostic about what the module actually does -- in the end, app-core does not care. |
| 5 | A daemon pushes notifications to app-core, not the other way around: "I have a module, install it" on first detection, and "I have a new version, swap it" on update. app-core does not poll or scan daemons. | Decided | 2026-10-10 | User example: Orchestrator/wdrive currently require a manual "Open Dashboard" click; the goal is the daemon proactively informs app-core instead. |
| 6 | Security/isolation between modules (and between a module and app-core) is explicitly out of scope for now: single-machine, trusted-users-only context. No sandboxing or auth is required between app-core and a loaded module. | Decided | 2026-10-10 | User statement: security is not a concern here -- this is local, trusted users only. |

## Decision Log (cont. 2)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 7 | app-core exposes a dedicated HTTP endpoint on its own Node server for module registration/updates (e.g. `POST /api/modules/register`, `POST /api/modules/update`) -- no separate discovery protocol is invented. app-core listens on a hardcoded default port that is overridable via config/env, specifically to support testing. | Decided | 2026-10-10 | User: app-core is already a Node.js server, so it should just get a simple dedicated endpoint rather than inventing something new; port should be hardcoded but overridable (especially for testing). |

## Decision Log (cont. 3)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 8 | A module's backend is loaded via dynamic `import()` with cache-busting (not a child process, not a `vm` context). The module's frontend is DSL view data (YAML/JSON with a `$type` discriminator), rendered at runtime by `dsl-renderer`'s `GenericPageRunner` -- no code loading needed for the UI. | Decided | 2026-10-10 | User confirmed Option B over the child-process alternative, matching Decision #3 (module runs inside app-core's own process). |
| 9 | Leak prevention for timers/listeners is enforced at dev-time only: app-core provides scoped helpers (e.g. `moduleContext.setInterval()`, `moduleContext.on()`) that it auto-clears on unload, and a `violations-framework` rule flags direct use of global `setInterval`/`setTimeout`/`addEventListener`/raw listeners in module source. No runtime interception/throwing is implemented -- it would require running module backends in a Node `vm` context (to give module code a distinct global scope from app-core's own code/dependencies), which was judged too complex for the benefit. | Decided | 2026-10-10 | User: "on oublie le throw c'est trop complique" after the vm-context tradeoff was explained. |

## Decision Log (cont. 4)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 10 | `POST /api/modules/register` carries only a pointer to the manifest, not the manifest content itself: `{ id, source: { type: 'file', path } }` or `{ id, source: { type: 'npm', package, version } }`. The manifest (reached via that path, or found inside the resolved npm package) contains the fuller contract -- `backendEntryPath`, `view` (inline or path), `extensionPoints` (per Decision from the manifest-shape discussion). | Decided | 2026-10-10 | User: the best approach is to give a path to the manifest, and app-core must also be able to be told "go fetch this from npm" -- both a file source and an npm source. |

## Decision Log (cont. 5)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 11 | The `npm` source type (Decision #10) is deferred to v2. v1 only implements `{ type: 'file', path }` registration. npm resolution mechanics (Option A/B from this turn) remain documented as a future decision, not built now. | Decided | 2026-10-10 | User: keep npm support for a v2. |

## Decision Log (cont. 6)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 12 | A daemon always tries the HTTP push to app-core first (Decision #7/#10). If unreachable, the daemon falls back to writing its manifest reference to a well-known local file instead (not a retry loop). On its own startup, app-core reads that fallback location and loads any modules it finds there that it doesn't already have the latest version of. | Decided | 2026-10-10 | User: CLIs should try to contact app-core first, and if they cannot, they register their manifest in a file instead -- so that on its next wake-up, app-core loads the missing modules. |

## Decision Log (cont. 7)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 13 | Fallback file: one file per daemon at `<app-core-config-dir>/pending-modules/<id>.json`, containing the identical JSON shape as the HTTP registration payload (`{ id, source: { type: 'file', path } }`). app-core lists that directory on startup and processes each file as if received via HTTP. (Path superseded by Decision #14.) | Decided | 2026-10-10 | User: "A go!" |

## Decision Log (cont. 8)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 14 | The fallback directory IS app-core's module registry, not a separate dropbox. `<app-core-config-dir>/modules/<id>.json` is the single source of truth for every registered module: app-core writes/updates it on a successful HTTP push, and a daemon writes it directly as the fallback when the push fails. No separate internal state store, no reconciliation step -- app-core's startup logic is simply "load everything found in this directory." | Decided | 2026-10-10 | User: in the end, doesn't the app-core server just store these directly in that folder? |

## Decision Log (cont. 9)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 15 | Manifest shape: `{ version, backendEntryPath, extensionPoints: [{ kind, slot, label?, view: { type: 'inline'\|'path', value } }, ...] }`. A module declares any number of UI contributions (widgets, pages) in a single manifest/version, each with its own placement (`kind`/`slot`) and view (inline DSL data or a path to it). Reuses the `extensionPoints` vocabulary already present in architectural_design_document.md. | Decided | 2026-10-10 | User: "B clearly" |

## Decision Log (cont. 10)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 16 | Module UI is DSL-only -- no React escape hatch. If a widget can't be expressed in the DSL, that's a signal `dsl-ui`/`dsl-renderer` needs a new primitive, not a reason to allow raw React in a module. | Decided | 2026-10-10 | User: "DSL only!" -- keeps consistency and agent-authorability, the original motivation for considering DSL view at all. |

## Decision Log (cont. 11)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| - | Audit (consistency/completeness) completed -- 8 findings (0 critical, 2 high, 2 medium, 3 low, 1 info). See `audits/2026-10-10_consistency/report.md`. | Logged | 2026-10-10 | User requested a review of the spec against their actual answers and the out-of-scope/guiding-principles coverage. |

## Decision Log (cont. 12)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 17 | "wdrive" is NOT currently in scope as a provider daemon. Orchestrator, Queue, and Flow remain the only in-scope provider daemons for this spec. | Decided | 2026-10-10 | User: "wdrive n'est pas en scope actuellement" (resolves audit finding F7). |
| 18 | Audit fixes applied: F1 (French quotes translated to English across all decision rationales), F2 (T-03 status contradiction fixed in module-contract.md/daemon-registration.md), F3 (Decision #13 marked superseded by #14), F4 (threat-model.md Assets/Threat actors tables filled in), F5 (added guiding-principles.md P-5 for DSL-only UI), F6 (added out-of-scope.md entry for arbitrary React). | Logged | 2026-10-10 | User: "correct!" (confirmed audit findings should be fixed). |

## Decision Log (cont. 13)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 19 | Orchestrator's existing standalone dashboard (`orch-ui`/`orch-server`) is left unchanged for now -- not deprecated, replaced, or modified as part of this effort. | Decided | 2026-10-10 | User: for now, the orch dashboard will not change. |
| 20 | Implementation order: build app-core first, with `queue` as the first module to validate the approach end-to-end, before porting Orchestrator and other CLIs. | Decided | 2026-10-10 | User: start implementing app-core, with `queue` as the first module to validate the approach, then move on to the other CLIs. |

## Decision Log (cont. 14)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 21 | A daemon's app-core module lives inside that daemon's own repo, in a dedicated package named `app-module` -- not inside app-core. For `queue` specifically (currently a flat single-package repo, confirmed via `queue/package.json`), this requires first refactoring it into an npm-workspaces "packages/" layout (mirroring Orchestrator's existing `packages/orch-app, orch-server, orch-ui, orchestrator-cli` structure) before adding the new `app-module` package. | Decided | 2026-10-10 | User: the queue module must live in the queue repo itself, so queue needs to be refactored into a "packages" layout before building the new `app-module` package. |

## Decision Log (cont. 15)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 22 | AMENDED 2026-10-18 (was: the rule auto-applies to any `**/packages/app-module/**` path in any repo, no opt-in). The `app-module/*` violations rules live in THIS repo's `.violations` and do not apply on their own in any other repo (a repo would need its own config); `app-core-cli check` is the authority every module repo can run. The rules cover the layout checks and mirror `check` (parity test). | Decided | 2026-10-10 | User: add violations rules for app-module packages. Amended because the rules are local rules of this repo, not a shared package; `check` is what ships to module authors. |
| 23 | Implementation starts with Plan Phase 1 (app-core skeleton) instead of Phase 0 (queue repo refactor), since `queue` currently has other feature work in progress. Phase 1 must include one or more dedicated test/fixture modules (not `queue`) with clean unit + integration tests validating the loader/registry/moduleContext/DSL rendering end-to-end. Phase 0 (queue refactor into `packages/`) is deferred, not cancelled -- it resumes once `queue`'s current work settles. | Decided | 2026-10-10 | User: queue is currently being worked on for other features, so start with Phase 1; make sure to have test module(s) to validate with clean unit/integration tests. |

## Decision Log (cont. 16)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 24 | app-core ships its own frontend shell providing the base extension-point slots (navbar/sidebar, dashboard widget grid, nav page routing) that modules' `extensionPoints` plug into -- per architectural_design_document.md section B (Core Frontend & Extension Points). Phase 1 was backend-only; this was a gap, not a scope change -- the frontend was always implied by the original architecture doc and by modules needing a UI at all. | Decided | 2026-10-10 | User: app-core must provide the base extension points (navbar, sidebar, etc.) that app-modules plug into -- this was already requested, not new scope. |

## Decision Log (cont. 17)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 25 | Frontend refresh mechanism: polling `GET /api/modules`, not SSE/WebSocket push. Polling uses exponential backoff, and drops to a very long interval ("hibernate") when the page/tab does not have focus. | Decided | 2026-10-10 | User: polling with exponential backoff, and hibernate (very long polling) when the user doesn't have focus on the page. |

## Decision Log (cont. 18)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 26 | `moduleContext` gains `registerRoute(method, path, handler)`, letting a module's backend register an HTTP route directly on app-core's own Fastify server (scoped under `/api/modules/<id>/...` to avoid collisions between modules), auto-removed on unload/swap like every other `moduleContext` registration (Decision #9). A view's DSL data points its `$sources` at that URL for live data -- the view calling its own backend was already implied by Decision #3 (backend runs in-process) + Decision #4 (app-core agnostic about module internals), this isn't a new capability, just making the existing contract concrete. CONFIRMED by dsl-owner (cross-session, verified against dsl-view source): `$sources.<key>.url` is a free-form string (`"GET /api/modules/queue/history"`) handed verbatim to the host's own `fetcher` function (`GenericPageRunner`'s `fetcher` prop) -- dsl-renderer does no base-path logic itself, so app-core's per-module prefix needs zero special-casing. Params (`$route.x`, `$urlParam.x`, `$ctx.x`, `$vars.x`, `$source.x`) substitute `{placeholder}` tokens or append as query string. | Decided | 2026-10-10 | User: views are supposed to call their own backend -- this follows directly from already-decided process/agnosticism, not a new open question. |
| 27 | CORRECTED (was wrong as first logged): app-core's `fetcher` cannot warn on an empty `$sources` path placeholder -- `useSourceLoader.ts` skips the fetch before `fetcher` is ever invoked, confirmed by dsl-owner. The warning cannot be implemented app-core-side at all. Filed as a feature request to dsl-view instead. **RESOLVED upstream (2026-10-10, dsl-owner): a `console.warn` was added in `useSourceLoader.ts` for exactly this case (pending the user's own review/merge on the dsl-view side, not yet committed/pushed). app-core's own mitigation (module id as a fixed literal in `registerRoute()` paths, never a `$route` placeholder) stays in place regardless -- the warning is a backstop, not something app-core's design relies on.** | Decided | 2026-10-10 | Matches the user's own standing rule: no silent config failures -- fix landed in dsl-view, not app-core, since app-core has no hook into the skip. |

## Decision Log (cont. 19)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 28 | Dashboard widgets get the same `$sources`/live-data capability as pages -- both render through `GenericPageRunner` + the real `fetcher`, not just pages. The widget/page split is a placement distinction (dashboard grid vs. sidebar+route), not a capability tier; Phase 1c's asymmetry (pages via `GenericPageRunner`, widgets via plain `DslRenderer`) was an implementation artifact, not an intended limitation. | Decided | 2026-10-10 | No technical reason for the asymmetry; `extensionPoints` (Decision #15) treats widget/page uniformly, the frontend should too. |
| 29 | SUPERSEDED by finding: investigated and confirmed NOT achievable with the current `@wadeck-app/dsl-renderer` version -- `entriesGenerator.ts`'s `BuildEntriesOptions` has no lazy/dynamic-import option (only `usePackageImports`, an unrelated monorepo-path toggle), and the generated `entries.tsx` statically imports every dsl-ui component by construction. Code-splitting this would require an upstream `entriesGenerator` change (per-component dynamic `import()` generation). `manualChunks` was deliberately NOT used as a workaround since it only quiets the warning cosmetically (same code still loads eagerly). Main chunk stays 1,042.65 kB / 302.99 kB gzip. Filed as a feature request to dsl-view. | Decided | 2026-10-10 | Thorough investigation (verified against entriesGenerator.ts source) found no real fix on app-core's side; the 500KB warning is accepted as a known limitation, not silently worked around. |

## Decision Log (cont. 20)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 30 | Decision #16 (DSL-only, no React escape hatch) stays MANDATORY for v1, but is explicitly deferred-not-permanent for v2 -- modules shipping their own specialized React component code (e.g. Flow's DAG visualizer, a custom DLQ inspector) is realistically expected to come up eventually, same treatment as npm sourcing (Decision #11). Not building toward it now: it requires dynamically loading foreign component code into app-core's single running frontend at runtime (shared React instance, version conflicts, a browser-level plugin system) -- categorically harder than anything built so far and not needed by any real module yet. | Decided | 2026-10-11 | User: realistically some module will want a bespoke component eventually; defer rather than pretend DSL-only is forever or over-build for it now. |

## Decision Log (cont. 21)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 31 | New published package `@wadeck-app/app-core-sdk`, living inside app-core's own repo (which gets a `packages/` split too: `packages/server` = today's `src/`, `packages/frontend-shell` = today's `app/`, `packages/app-core-sdk` = new). Re-exports `Manifest`/`ExtensionPoint`/`ModuleContext`/`RegistrationPayload` types+zod schemas directly from the server package (single source of truth, no hand-copied drift). Ships two CLIs: `validate <manifest.json>` (runs app-core's own zod validation locally) and `dev <path-to-app-module>` (boots the real app-core server+loader+frontend pre-registered with one local module, for fast local iteration without a separate app-core checkout). | Decided | 2026-10-11 | User: "1+2 parfait" -- matches `violations-framework`'s existing shape (types/rules package + CLI). |
| 32 | Module-to-module extension points: Option A (new DSL primitive). `dsl-ui` gains an `ExtensionSlot` component type (e.g. `{ $type: "ExtensionSlot", slot: "queue:subscriber-row" }`); when the renderer hits it, app-core resolves every registered module `extensionPoint` whose `slot` matches and renders each inline. app-core brokers slot matching generically -- it does not know or care what any given slot "means" (consistent with Decision #4/P-3). | Decided | 2026-10-11 | User: "3 A me semble bien." -- cleanest fit with DSL-only (P-5), no bespoke per-module wiring needed. |
| 33 | Slot contracts (the typed/validated shape of context passed into an `ExtensionSlot` and expected from a contribution) are owned and published by the PROVIDING module itself, not centralized in app-core or app-core-sdk -- e.g. `queue` publishes its `subscriber-row` slot's type+zod schema as part of its own `app-module` package. Versioning reuses the provider's own normal package version (no separate slot-version scheme). A contributor module takes a real dependency on the provider's published contract package to get the type, so a breaking change surfaces as a type error or a zod parse failure, not silent breakage. `app-core-sdk` ships a generic, reusable test-harness helper (e.g. `assertSlotContract(schema, value)`) any provider uses in its own test suite to catch drift between its declared schema and what it actually passes at runtime. | Decided | 2026-10-11 | User: wants slot contracts typed, versioned on type change, with a test harness to prevent oversights, forcing clean module-to-module dependencies. Keeping the registry decentralized (provider-owned) matches app-core's agnosticism principle (P-3) -- a centralized registry in app-core-sdk would make app-core the bottleneck for contracts it has no business knowing about. |

## Decision Log (cont. 22)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 34 | `packages/app-module` gets a required internal folder convention: `manifest.json` at the package root, `api-backend/` (containing `backendEntryPath`'s target plus any internal helper files it imports), `dsl-frontend/` (containing every `view.path` target -- DSL YAML data only, never code). Enforced via new rules in the same `app-module/*` violations family as Decision #22 (auto-applies to any `**/packages/app-module/**` path, no per-repo config): (1) `manifest.json` must exist and validate against the real schema, (2) `backendEntryPath` must resolve inside `api-backend/`, (3) every `view.path` must resolve inside `dsl-frontend/`, (4) no `.tsx`/React/JSX anywhere in the package. | Decided | 2026-10-11 | User: wants a violations check to catch exactly the gap `queue-owner` hit (built a backend data layer with no manifest/wiring/views at all) automatically via CI, not via manual cross-session correction. Folder naming kept as the user's original proposal -- "dsl-" prefix already disambiguates from real frontend code, no need to avoid the word "frontend." |

## Decision Log (cont. 23)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 35 | Middleware-style module hooks (running on every app-core request, not just a module's own registered paths) are deferred to a future iteration -- not built now. Tracked in a new `future-iterations.md` alongside other deferred items. | Decided | 2026-10-11 | User: "les middleware feront partie d'une prochaine iteration" -- not needed by any real module today, same deferred-not-permanent treatment as Decision #11/#30. |
| 36 | One of app-core's own repo packages must be `packages/test-app-module` -- a real package (not just ad-hoc test fixtures) validating `app-core-sdk`, the test suite, types/signatures, loading/unloading, and CI scripts end-to-end. The existing fixtures (module-a/b/c/d) move there, restructured to follow the `api-backend/`/`dsl-frontend/` convention (Decision #34) so this package also validates that convention and its violations rules, not just basic loading. | Decided | 2026-10-11 | User: "un des packages du repo doit etre un test-app-module... les modules que tu as cree peuvent simplement etre deplace dans test-app-modules." |

## Decision Log (cont. 24)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 37 | app-module naming convention is SUFFIX-style: `<name>-app-module` (e.g. `queue-app-module`, matching what `queue-owner` already shipped), not prefix-style (`app-module-<name>`). Violations rules' glob changes from the literal `**/packages/app-module/**` (Decision #22/#34) to `**/packages/*-app-module/**`. app-core's own test fixtures move to `packages/test-app-modules/<descriptive-name>-app-module/` (e.g. `minimal-app-module`, `lifecycle-app-module`, `live-page-app-module`, `live-widget-app-module` -- descriptive names, not module-a/b/c/d). | Decided | 2026-10-11 | Avoids forcing `queue-owner` to rename an already-shipped, CI-green package for a convention still being finalized -- matches the user's stated goal of minimizing unnecessary churn/back-and-forth. |
| 38 | New violations rule: any package directory containing a `manifest.json` (the signal that it's an app-module) must itself be named matching `*-app-module`. Catches a module shipped under the wrong folder name automatically. | Decided | 2026-10-11 | User: "une autre regle de violation de s'assurer que tout app-module doit etre appele [app-module-*]... en se basant sur la presence d'un manifest." |
| 39 | `@wadeck-app/app-core-sdk` is not actually publishable yet -- confirmed no `.github/` workflow exists in app-core's repo at all (verified: `find .github` returns nothing), unlike every other `@wadeck-app/*` package. A CI/publish pipeline must be built (mirroring `violations-framework`'s `publish.yml`: build-and-test job + publish job gated on push to main, using `wadeck-app/ci-templates`'s `compute-version` action) before `queue-owner` can actually `npm install` it. SDK documentation (README) must be thorough enough to be self-explanatory -- no further hand-holding expected once published. | Decided | 2026-10-11 | User: "once you're done... that should be enough for it to refactor its module. If it's not, your documentation must be updated... it's expected to be self-explanatory." Discovered via `queue-owner`'s real 404 when attempting `npm install`. |

## Decision Log (cont. 25)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 40 | `ExtensionSlot` wire contract resolved: new `GET /api/slots/:slotId` endpoint returns a bare array of resolved DSL view nodes (no envelope) -- matches dsl-owner's proposed renderer-side fix with zero further dsl-renderer changes. Multi-contributor ordering is handled by a generic, slot-agnostic `order` field on each contributing `extensionPoints[]` entry; app-core sorts and strips it before emitting the bare array, so app-core still never needs semantic knowledge of what a slot means (P-3 preserved). | Decided | 2026-10-11 | Dictated by consistency with Decision #32/#33 and P-3 once dsl-owner's two already-existing building blocks (`$sources`, `renderChildren`) were confirmed -- no new ceremony needed. |

## Decision Log (cont. 26)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 41 | New violations rule `app-core-sdk/no-internal-dependencies`: `package.json`'s `dependencies` must never list a sibling in-repo package (dynamically discovered from `packages/*/package.json` names, not hardcoded). Catches the exact class of bug that made the SDK uninstallable, permanently, at dev-time. A SECOND check, a build-time assertion in `scripts/bundle.mjs`, covers what the rule structurally cannot: `dist/**` is globally excluded from violations scanning by design (lints source, not build artifacts), so the published bundle/`.d.ts` output is asserted clean of internal references right after being produced, failing the build loudly if not. | Decided | 2026-10-11 | User (via `queue-owner`): app-core-sdk is the "base" package every app-module depends on, should have zero internal cross-package references of any kind, type-only or runtime -- worth a permanent rule, not just a one-off fix. |

## Decision Log (cont. 27)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 42 | Approved: split into `@wadeck-app/app-core-sdk` (types/schemas only, stays a project-local dependency -- required by TypeScript module resolution, not a style choice) and a new `@wadeck-app/app-core-cli` (`validate`/`dev` commands, global auto-updating binary via `shared-updater`, matching queue/orch/flow/task's convention). | Decided | 2026-10-11 | User (via `queue-owner`): "Wadeck approved the split -- go ahead." |
| 43 | CORRECTION: dsl-renderer/dsl-ui are pinned to an exact calver release in app-core's package.json, not `latest`/`*` -- they do NOT demonstrate a deliberate "libraries stay pinned" convention as I originally claimed; that was an overstatement. The underlying technical argument (types require real `node_modules` resolution, ruling out a global-binary distribution for that half) is unaffected by pinning strategy and still holds. The new `app-core-sdk`/`app-core-cli` packages use `latest`/`*` ranges, matching the user's actual stated preference, independent of whatever the ongoing dsl-renderer/dsl-ui pinning investigation (user + dsl-owner) concludes. | Decided | 2026-10-11 | `queue-owner` verified app-core's real package.json directly rather than trusting my earlier claim -- correction accepted, not defended. |

## Decision Log (cont. 28)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 44 | `GET /api/slots/:slotId` built and verified -- aggregates every loaded module's `extensionPoints` matching the slot, sorts by the new optional `order` field (Decision #40's mitigation, ascending, no-order entries last), strips `order`, responds with a bare array (`[]` if nothing matches). Independently re-verified by the parent via a real running server + curl (not just unit tests): sorting proven correct, no `order` key leaks, unused slot returns `[]` not an error. 70/70 tests pass. | Decided | 2026-10-11 | Completes the `ExtensionSlot` mechanism's app-core side; `dsl-owner`'s renderer side was already built and tested. |

## Decision Log (cont. 29)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 45 | `app-core-sdk`/`app-core-cli` split built and independently verified: types-only `app-core-sdk` (pinned per-project), `app-core-cli` (`validate`/`dev`, global auto-update via `shared-updater`'s `without-daemon` strategy, mirroring `queue-cli`'s real `updater-entry.ts` pattern exactly). Kept `app-core-cli` as both package and bin name, no backward-compat alias (nothing shipped against the old name yet). Real external install verified by the parent (not just the implementing agent): `npm pack` both -> fresh scratch install -> `validate` works, real `tsc --strict` consumption test passes. 75/75 tests. | Decided | 2026-10-11 | Completes Decision #42. |
| 46 | Found and fixed during verification: `app-core-cli dev` never actually read `APP_CORE_PORT`, unlike the main server (Decision #7) -- hardcoded 4850 with no override path at all, discovered because it blocked the parent's own verification (a leftover process was already on 4850). Fixed by wiring the same env var through `runDev`'s default port resolution. Verified end-to-end on a real external install, real port override, real HTTP round trip. | Decided | 2026-10-11 | Decision #7 already promised "overridable via env... to support testing" for the main server; `dev` silently didn't honor that promise. | 2026-10-11 |
| 47 | Real end-to-end `ExtensionSlot` integration test built and passing: a real spawned app-core server process, the real published `@wadeck-app/dsl-renderer@2026.10.11-090` (confirmed `ExtensionSlot` is genuinely present in the published build, not just dsl-owner's local uncommitted source as it briefly was), real HTTP registration of two contributor fixtures, real `GET /api/slots/test:shared-slot` fetch through the real `fetcher`/`GenericPageRunner`, with DOM-position assertions proving the server-side `order` sort is real (not pass-through). | Decided | 2026-10-11 | Requested by `dsl-owner` to validate both sides' work together, not just in isolation. | 2026-10-11 |

## Decision Log (cont. 30)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 48 | New feature area: packaging a module (backend + frontend) as a zip/link that app-core can install/uninstall/update at runtime. Strictly install-replace-uninstall, one version at a time -- no multi-version coexistence during a rollout. | Decided | 2026-10-11 | User: "strictly install-replace-uninstall one at a time? oui." |
| 49 | Security/trust stance (Decision #6, local trusted-users-only, no sandboxing) extends to this feature too -- dynamically loaded frontend JS from a module package is not treated as a different risk tier. | Decided | 2026-10-11 | User: "pas de souci de securite, c'est du trusted!" |
| 50 | Bring-your-own-component (a module shipping genuinely new React components, not just DSL referencing dsl-ui) stays v2-deferred (Decision #30) -- NOT part of this new packaging feature's current scope. The user raised it with dsl-owner only so the packaging design doesn't accidentally foreclose it later, not as a current requirement. | Decided | 2026-10-11 | User: "pour le bring-your-own-component c'est une v2, j'indiquais juste a dsl-owner ce qu'il devait imaginer comme plan pour pas casser ca dans le futur." |

## Decision Log (cont. 31)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 51 | Module packaging (zip/link install/update/uninstall, Decision #48/#49/#50) deferred to a future iteration -- documented in module-packaging.md and future-iterations.md, not current work. | Decided | 2026-10-11 | User: "defer a une iteration 2! faut que je me focus sur juste un premier truc qui fonctionne." |

## Decision Log (cont. 32)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 52 | MILESTONE: `queue`'s real `app-module` works end-to-end against a live app-core instance -- registered, two `StatTile` dashboard widgets and a `DataTable` history page, all live-data-backed via `$sources` + `moduleContext.registerRoute()`. Independently verified by the parent (not just trusting `queue-owner`'s report): `GET /api/modules` on the real running instance shows queue's exact manifest/views, `GET /api/modules/queue/history` returns genuine live daemon history data (real task/flow events). `queue-owner` additionally confirmed visually via a real headless-browser screenshot (not independently re-verified by the parent, but credible given the underlying data/manifest are independently confirmed real). First real module to complete the full loop the whole spec was built toward (Decision #20's "queue first" plan). | Decided | 2026-10-11 | First real end-to-end validation of the entire platform, not a test fixture. |

## Decision Log (cont. 33)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 53 | CORRECTION of Decision #37: naming convention is PREFIX-style (`app-module-<name>`, e.g. `app-module-queue`), not suffix-style. The user had already stated this explicitly ("la violation rules doit etre packages/**/app-module-*") before Decision #37 was logged; #37 incorrectly inferred suffix-style from an unrelated later message about documentation self-sufficiency, overriding an explicit instruction that was never actually retracted. All violations rules' globs, the naming-convention rule's pattern, and all 6 test-app-modules fixtures renamed/fixed to match (`app-module-minimal`, `app-module-lifecycle`, `app-module-live-page`, `app-module-live-widget`, `app-module-slot-contributor-a`, `app-module-slot-contributor-b`). `queue`'s real `queue-app-module` will now fail the naming-convention rule -- this is intentional: the user wants the rule itself to be `queue-owner`'s feedback loop, not a direct instruction from app-core to rename. | Decided | 2026-10-11 | User caught the error: "non j'ai jamais dit de garder le suffixe... je veux le app-module-x!!!!" |
| 54 | New standing rule for all code comments in this repo: no decision-number references ("Decision #N") or historical/incident narrative in code comments. Comments describe the current invariant/behavior only; git history and the spec own the "why/when/who decided" record. Applied retroactively to the files touched during Decision #53's fix; NOT yet applied repo-wide to earlier code (a separate, larger cleanup pass if wanted later). | Decided | 2026-10-11 | User: "pas d'historique de decision dans le code! git et les specs servent a ca!" |

## Decision Log (cont. 34)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 55 | BUG FOUND: the 6 `app-module/*` violations rules (Decisions #22/#34/#37/#38) were built as LOCAL files in app-core's own `.violations/rules/`, which per violations-framework's documented behavior only auto-run inside app-core's own repo -- they never had a path to reach a consumer repo like `queue`. Describing them as "auto-applying to any repo" was incorrect; conflated "no per-repo config within app-core" with "global across every repo." Caught by `queue-owner` attempting to actually trigger one. Fix in progress: migrating all 6 to the real global package (`@wadeck-app/violations-rules`), coordinated with `violations-owner`. `app-core-sdk/no-internal-dependencies` (Decision #41) correctly stays local -- it's inherently app-core-specific. | Open (fix requested, not yet landed) | 2026-10-11 | User: "je pense que ta regle de violation ne trigger pas proprement car elle doit etre globale (dans violations rules) pas dans ton projet ou dans le sdk!" |

## Decision Log (cont. 35)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 56 | `app-core-cli validate` gains a `--json` flag, emitting the parsed+validated manifest as JSON on success (or `{"error": "..."}` on failure). `validateManifestFile()` now returns the parsed `Manifest` on success too. Requested by `violations-owner` so `backend-entry-location`/`view-location` rules can share app-core's one authoritative schema instead of hand-rolled field extraction. | Decided | 2026-10-11 | Cross-repo request from `violations-owner`, implemented and verified (real subprocess test + manual run). |

## Decision Log (cont. 36)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 57 | BUG FOUND AND FIXED: `app-core-cli`'s self-update was broken since it was first built -- `cli.ts` correctly expected the updater bundle at `app-core-cli-updater.cjs` (matching the universal `<binary-name>-updater.cjs` convention confirmed across queue/orchestrator/flow-cli), but `bundle.mjs` actually produced `updater-entry.bundle.cjs` (named after its source file instead). The two names never matched, so `app-core-cli update` always failed with "updater not found," and because the self-updater can't fix itself from a broken state, every real install stayed stuck on whatever version was first installed. Found via `violations-owner`'s real-world report of a stuck install. Fixed `bundle.mjs`'s output filename and `package.json`'s `files` entry; also added the same updater bundle-size safeguard (500KB limit) every other `@wadeck-app` CLI's bundler has. Verified for real: ran the actual `update` command locally, confirmed it found the updater, executed it, and upgraded to the real published latest version, then passed `self-check`. | Decided | 2026-10-11 | User: "assure toi que le app-core-cli suit les memes principes que flow, task, orch niveau auto-update!" |

## Decision Log (cont. 37)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 58 | RESOLVED: the 6 `app-module/*` rules are genuinely migrated, published (`@wadeck-app/violations-rules@2026.10.11-121`), and verified by the parent via a real scratch consumer repo (not just trusting `violations-owner`'s report) -- a misnamed `queue-app-module` package correctly flags, a correctly-named `app-module-queue` passes clean (0 violations), including the `manifest-exists-and-valid` rule's shell-out to the real `app-core-cli` succeeding. `queue-owner` cleared to rename for real. | Decided | 2026-10-11 | Closes the gap found in Decision #55. |
| - | Follow-up to Decision #58: `violations-owner` added `app-core-cli` to their own CI (so the "flags X" assertions exercise the real validator, not just a skip branch) and fixed a Node `DEP0190` shell-arg deprecation warning in the `app-core-cli` shell-out. Published `2026.10.11-123`. Re-verified by the parent against the same scratch repo: version confirmed real, warning confirmed gone, `0 violations` on correct naming still holds. | Logged | 2026-10-11 | Closes a minor finding raised during Decision #58's verification. |

## Decision Log (cont. 38)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 59 | BUG FOUND AND FIXED (part 1, insufficient on its own): the frontend never imported `@wadeck-app/dsl-ui/theme.css` -- fixed by mirroring `orch-app/src/main.tsx`'s pattern. | Decided | 2026-10-11 | User screenshot showed unstyled output. |
| 60 | BUG FOUND AND FIXED (part 2, the real root cause): `theme.css` only provides CSS custom-property tokens (`--color-*`) and `@font-face` rules -- `dsl-ui`'s actual component styling is Tailwind utility classes, generated via `@tailwind base/components/utilities` directives processed against `dsl-ui`'s own Tailwind preset (`@wadeck-app/dsl-ui/tailwind-preset` + its `dslUiContent` scan paths). app-core's frontend had no Tailwind build configured at all (no `tailwind.config`, no `postcss.config`, no `tailwindcss`/`postcss`/`autoprefixer` deps), so none of those utility classes were ever generated -- components rendered structurally (borders, some colors from `theme.css`'s own non-Tailwind rules) but with zero real typography/spacing/theming. Fixed by replicating `orch-app`'s exact build setup: added the 3 dev dependencies, `postcss.config.js`, `tailwind.config.ts` (using `dslUiPreset` + `dslUiContent`, confirmed required per `orch-app`'s own comment -- Tailwind only reads `content` from the top-level config, the preset can't contribute scan paths itself), new `src/index.css` with the 3 `@tailwind` directives, imported in `main.tsx` after `theme.css`. Verified visually via `agent-browser` (real headless Chromium screenshot, not assumed): CSS output grew from 2.80 kB to 38.04 kB, and the before/after screenshots show real Inter font + correct `StatTile` card styling replacing raw browser-default serif text. | Decided | 2026-10-11 | User: "utilise agent-browser pour tester... y a tjs pas de style" -- the first fix wasn't actually sufficient, caught by the user insisting on a real visual check rather than trusting the build-output size alone. | 2026-10-11 |

## Decision Log (cont. 39)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 61 | Frontend shell redesigned using real `dsl-ui` layout components, mirroring `orch-app`'s actual composition pattern rather than inventing a new one: top `NavBar` (`AppNavBar`, replacing the old vertical `Sidebar`) with brand + nav links, `PageContent`/`PageSection` wrapping routed content, real `Card` components replacing hand-rolled inline-styled divs on the dashboard grid. `Sidebar.tsx`/`.test.tsx` renamed to `NavBar.tsx`/`.test.tsx` (same test assertions, same accessible roles/names, only the visual composition changed). Verified visually via `agent-browser`: dashboard and the Queue History page both render with real styling, correct active-link highlighting, and genuine live data. | Decided | 2026-10-11 | User: "utilise le dsl-ui pour faire une plus belle page, inspire-toi de orchestrator ui!" | 2026-10-11 |

## Decision Log (cont. 40)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 62 | The frontend shell supports a light and a dark theme. The palette already exists in `@wadeck-app/dsl-ui/theme.css` (`.dark` / `[data-theme='dark']` tokens), so no palette is added in app-core. The shell only activates it: `theme.ts` (`getInitialTheme`/`applyTheme`/`useTheme`) toggles the `dark` class on `<html>`, using the same `localStorage` key (`theme`) as dsl-ui's own `useTheme`, defaulting to `prefers-color-scheme`; the theme is applied in `main.tsx` before first render (no light flash). `AppNavBar` shows an `IconButton` (lucide `Sun`/`Moon`, as in `orch-ui`). `lucide-react` is declared in `frontend-shell` (already a dsl-ui dependency). Module authors get no new API: views follow the theme automatically if they use only dsl-ui components with semantic props and no raw colors; the rules are documented in `packages/app-core-sdk/README.md` ("Dark theme"). Same change fixed stale `<name>-app-module` naming in that README (Decision #53 convention is `app-module-<name>`). | Decided | 2026-10-13 | User request. dsl-ui's `useTheme` is not exported from the package root, so a 20-line local equivalent was written instead of a deep import; candidate for a dsl-ui export. |
| 63 | Dev workflow: `npm run dev:all` (`scripts/dev-all.mjs`) runs the server (`tsx watch`) and the Vite dev server together, with prefixed logs, a port-in-use preflight (4850, 5173) and whole-process-tree shutdown on Windows. It is registered as the Orchestrator startup job `app-core-dev` with `--timeout 2000000`. Port 4850 serves the API plus a frozen build of the frontend (`public/`, production-like); port 5173 is the live-reload dev loop and proxies `/api` to 4850. | Decided | 2026-10-13 | User request ("one command for the Orchestrator startup job"). The Orchestrator default job timeout (300s) killed the dev servers after 5 minutes; a 1-year timeout was killed after 0.2s. The max supported timeout and a proper long-running job mode are open with orch-owner. |

## Decision Log (cont. 41)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 64 | The shell uses `dsl-ui`'s own `useTheme` (exported from the package root since `@wadeck-app/dsl-ui@2026.10.12-091`); the local `theme.ts` from Decision #62 is removed. Because `useTheme` applies the `dark` class only after the first render, `index.html` carries a small inline script that applies the stored/system theme before first paint. `@wadeck-app/dsl-ui` and `@wadeck-app/dsl-renderer` are declared as `latest` in the root and `frontend-shell` `package.json` (same as `violations-rules`): a caret range on a calver prerelease pins one exact version. `App.tsx` wraps the shell in dsl-ui's `RouterProvider`, which provides `UrlParamContext`: module views can bind components to URL params (Pagination/PageSizeSelect `urlParam`), and without it such a view crashes the whole page. `src/generated/entries.tsx` is regenerated by `vite build`/dev start and must be rebuilt (`npm run build:full`) after every dsl-ui upgrade. Supersedes the local-hook part of Decision #62. | Decided | 2026-10-13 | dsl-owner confirmed the missing export was unintentional and published it; queue-owner's paginated history needs `urlParam` support in the served frontend. Verified in a real browser: Next sends `GET /api/modules/queue/history?page=1`, size change sends `?page=1&limit=50`, no page errors. |

## Decision Log (cont. 42)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 65 | Operability and hygiene batch. (a) The backend import cache key is `version` plus the backend file's `mtimeMs` and size, so an update pushed without a version bump still loads the new backend (previously views refreshed but the old backend stayed cached). (b) The server writes `<config-dir>/server.port.json` (`{pid, port}`) after listening and removes it on shutdown if it still owns it; the Orchestrator job `app-core-dev` uses `--liveness-strategy portFile` on it so an automatic start is skipped while the server is alive (a manual `orch trigger` is not filtered; `dev-all.mjs` refuses to start on a busy port). (c) `npm run copy-app` writes `public/build-info.json` (`builtAt`, `dslUi`, `dslRenderer`) so anyone can see from outside which dsl versions the served frontend was built with; asset filenames stay unhashed. (d) The SDK README is a short entry point; the full authoring reference moved to `packages/app-core-sdk/docs/module-authoring.md` (published in `files`), keeping the README under the `readme-system-length` limit. (e) `violations check` is clean: pre-existing findings fixed, `public/**` excluded from scanning, and two entry-point files carry justified `ts/no-barrel-index` suppressions. | Decided | 2026-10-14 | Found while integrating the queue module: a same-version update silently kept the old backend; peers had no way to verify the served frontend or to avoid double starts. |

## Decision Log (cont. 43)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 66 | The production server ships inside the existing global, auto-updating `@wadeck-app/app-core-cli` as the foreground command `app-core-cli serve`; `packages/server` stays private and unpublished. The CLI bundle already inlines the server code and carries the built frontend in `dist/public` (with `build-info.json`); `fastify`, `@fastify/static`, `zod` and `js-yaml` were already runtime dependencies, so no new dependency. `serve` and `packages/server/src/index.ts` share one start sequence (`startServer` in `packages/server/src/start.ts`, exported as `@wadeck-app/app-core-server/start`), which also writes `server.port.json`. `serve` exits 1 with an actionable message if the bundled frontend is missing or the port is taken. Because every CLI invocation schedules the `shared-updater` background check, the server and frontend update with the CLI and a new version is used the next time `serve` starts (Decision #57). `publish.yml` needs no new step: `npm run build` already builds frontend, server and CLI before the CLI is published. Orchestrator job for the installed server: `orch add startup app-core --command "app-core-cli serve" --liveness-strategy portFile --liveness-port-file "~/.config/app-core/server.port.json" --timeout 2000000` (the dev job `app-core-dev` is unchanged). Details: `packages/app-core-cli/docs/serve.md`. | Decided | 2026-10-15 | Reuses the packaging precedent (orchestrator-cli ships server + public assets in its CLI package) instead of a second published package. Verified end to end: `npm pack`, install of the tarball into a temp prefix, `serve` on port 4861 answered API 200, index html, `build-info.json` and a module registration. |

## Decision Log (cont. 44)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 67 | The Orchestrator job `app-core-dev` uses `--timeout 0` (no timeout). Orchestrator 2026.10.17-408 fixed the ceiling found by measurement (a timeout above 2147483s killed the job after 0.3s because the timer overflowed 32 bits): large values now work, `0` means no timeout (documented in `orch --help`), negative or fractional values are rejected at add/edit. Re-verified on the installed build with temporary jobs: `0` and `31536000` both ran to completion. Supersedes the `2000000` workaround of Decision #63. | Decided | 2026-10-17 | Reported with measurements to orch-owner, who fixed it the same day. |

## Decision Log (cont. 45)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 68 | Failed modules are never silent, and modules can be removed at runtime. (a) `ModuleManager` records every failed load (`id`, `source`, `error`, `failedAt`) until the same id loads or is forgotten; `GET /api/modules` returns `{ modules, failed }` (additive), startup writes one actionable stderr line per failed module (the Fastify logger stays off), and the frontend shows a `role="alert"` banner. (b) New `POST /api/modules/unregister { id }`: disposes the module, deletes its registry file, clears its failure; `200 { id, removed: true }`, `404` when unknown everywhere, `400` on an invalid id. (c) Module ids are restricted to `^[A-Za-z0-9][A-Za-z0-9_-]*$` for register, update and unregister, and every registry path is built through one guarded function: the previous rule (`min(1)`) let `register` write outside the modules dir with an id like `../x`. | Decided | 2026-10-17 | Verified in code: `logger: false` made startup load failures invisible, `ModuleManager.unload()` had no HTTP route and registry files were never removed, and the id was unvalidated. Original goal: modules are loaded AND unloaded without a restart. |

## Decision Log (cont. 45)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 69 | Modules may ship their own business components, loaded at runtime (option B): a module bundles a prebuilt ESM file of `ComponentRegistryEntry[]` plus precompiled CSS in a `dsl-lib/` folder (`app-module-<name>/{manifest.json, api-backend/, dsl-frontend/, dsl-lib/}`). The shell imports it when the module loads, merges the entries into its registry and injects the CSS, and removes both on unload or hot-swap. Module views stay YAML: the components are only new `$type` values. Amends Decisions #16, #30 and #50 (UI no longer strictly DSL-only; the "DSL-only" rule now means "views are DSL"). Rejected by the user: iframes (see out-of-scope.md) and a build-time bridge (option A). | Decided | 2026-10-17 | User chose B directly when asked (orchestrator's LogViewer SSE tail and live banner have no dsl-ui equivalent; user goal is packaging modules and loading/unloading them on the fly, which A cannot do for the React half). Folder name `dsl-lib` relayed by orch-owner as the user's call; see Q4. |
| 70 | Contract for `dsl-lib`. Manifest field `dslLib: { entry, css?, shared }`; `entry` and `css` must resolve inside `dsl-lib/` and exist (checked at load, failures go to `failed`). app-core serves the files at `/api/modules/<id>/_lib/<file>?v=<version>-<mtime>-<size>` (`_lib` is reserved: a module cannot register routes under it). The bundle's default export is `ComponentRegistryEntry[]`; each entry is registered under `<moduleId>:<Name>`, so YAML authors write `$type: orchestrator:JobCardGrid`. Shared singletons (react, react-dom, react-router-dom, `@wadeck-app/dsl-ui`, `@wadeck-app/dsl-renderer`) are provided by the shell on `globalThis.__APP_CORE_SHARED__` under their package names and are externalized in the module bundle at build time to read from it (an import map is not used: the shell is a hashed Vite bundle with no stable bare specifiers). `shared` ranges are verified by the server at load against `public/build-info.json` (extended with the react, react-dom, react-router-dom versions); a mismatch, or a missing build-info, is reported through `failed` (or on stderr when it cannot be checked), never silently. | Decided | 2026-10-17 | Keeps one React instance, makes skew an explicit actionable error, and reuses the failed-module reporting and `_lib` static serving that need no shell rebuild. |
| 71 | Parameterised and non-nav module pages. An extension point of `kind: page` may declare `path` (e.g. `/jobs/:id`, no `..`, params as `:name`). The shell mounts it at `/modules/<moduleId><path>` as its own react-router route, so GenericPageRunner receives the params as `$route.<name>`. `slot: 'nav'` lists the page in the navbar; `slot: 'route'` makes it reachable only by link (detail, edit and log pages). Nav pages without `path` keep today's `/modules/<id>/<index>` route. Routes are derived from the polled module list, so unloading or swapping a module removes its routes. | Decided | 2026-10-17 | orch-owner's blocker for app-module-orchestrator (job detail, edit, logs pages). dsl-renderer resolves `$route` from `useParams()`, so per-page routes need no renderer change. |

## Decision Log (cont. 46)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 72 | `registerRoute` supports `:name` segments (BUG FOUND: routes were matched by exact string, so queue's `/history/:eventId`, `/dlq/:id/replay` and every parameterised route answered 404 or ran with the literal ":eventId"). Matching is per segment (method + segment count, static beats parameter, leftmost first); `req.params` contains only the module's own parameters, never the catch-all's internal `id` and `*` (so a module may name a parameter `id`, as queue and orchestrator do); two routes with the same method and shape throw at registration instead of overwriting; `ModuleRouteHandler` is typed with `Params: Record<string, string>`. Also: `app-core-cli dev` defaults the module id to the folder name without `app-module-` (production id), accepts `--id` and a `manifest.json` path, and prints the id. | Decided | 2026-10-17 | Reported with a live reproduction by orch-owner. Reserving the name `id` (their first suggestion) would have made queue fail to load, so the internal params are hidden instead. `dev` registering `app-module-<name>` as its folder name made `$type: <name>:Component` unresolvable in dev. |

## Decision Log (cont. 47)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 73 | Review adjustments after the first dsl-lib implementation. (a) A page `path` of `"/"` is valid and is the module home page, mounted at `/modules/<id>` (with or without a trailing slash); its navbar link is exact-match so it is not highlighted on the module's other pages. (b) All side-effect-free checks of an update (dsl-lib files and shared ranges, view YAML) run before the running instance is disposed: a broken update (e.g. invalid YAML) is rejected and recorded in `failed`, and the previous version keeps serving its routes and views; the shell banner says "The previous version is still running." (c) Shell: a module dropped and re-registered with the same lib URL during an import no longer injects a second stylesheet; bundle entries must have a `render` function and a plain name (no ":"; the shell adds `<moduleId>:`). (d) Docs: the built `dsl-lib/` may be committed or generated in CI, but must exist when the module registers. | Decided | 2026-10-17 | Independent review plus a real two-module browser run (alpha with a "/" home, beta; routes with params, broken-YAML update, unregister of one module). orch-owner needed "/" for orch-ui's "Back to jobs" links; before the reorder, a YAML typo in an update removed the running module from the list. |

## Decision Log (cont. 48)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 74 | Unloading a module ends its streaming responses. The route registry tracks every response handed to a module handler (until `close`); on unload, swap (update) or unregister it destroys those whose headers were already sent and that have not finished (an SSE tail, any hijacked stream), so the module's `req.raw.on('close')` cleanup runs and the client reconnects to the new version. Requests still waiting for their handler (no header sent) are left alone. Heuristic accepted: a normal response being flushed at the exact instant of an unload can be cut. Delivers the follow-up recorded in future-iterations.md. | Decided | 2026-10-17 | orch-owner reported that an open log stream kept running the old backend code, with its raw timers, until the browser tab closed. User asked to build it. Verified with the real server (unregister and update both close an open stream and trigger the module cleanup once). |

## Decision Log (cont. 49)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 75 | CSS contract for `dsl-lib`: the module's stylesheet is built with the dsl-ui Tailwind preset AND `dslUiContent`, plus the module's own sources, so it carries every utility dsl-ui uses in the same canonical order as the shell's sheet. The shell keeps injecting the module link AFTER its own stylesheet; no shell change. Rejected: injecting the module link before the shell's (measured: fixes dsl-ui elements but breaks the module's own shorthand/longhand combinations) and a delta-only sheet (fragile against shell-only longhands). Documented in module-authoring.md. | Decided | 2026-10-17 | orch-owner found the dsl-ui SearchBar icon overlapping its placeholder inside the orchestrator module: its sheet repeated `.px-2` without `.pl-7`. A browser experiment with minimal sheets (8px today, 28px with a superset sheet) showed ordering across two Tailwind sheets cannot be fixed by link order alone. |

## Decision Log (cont. 50)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 76 | Daemons register their module through the SDK: `@wadeck-app/app-core-sdk/register` (node-only subpath; the main entry stays free of `node:` imports, asserted at build) exports `registerModule({ id, manifestPath, env?, timeoutMs? })`, `unregisterModule({ id, env?, timeoutMs? })`, `describeRegistration` and typed outcomes (`registered \| refused{httpStatus,reason} \| deferred{file} \| skipped{reason}`; unregister adds `unregistered \| not-registered \| cleared`). Port = APP_CORE_PORT, else the `server.port.json` app-core wrote, else 4850; a malformed APP_CORE_PORT throws; a timeout counts as "not running"; the pickup file `<configDir>/modules/<id>.json` is written only when app-core's config dir already exists; it rejects only for what the caller must fix (invalid id, bad port, missing manifest). Config dir, port file, id rule and default port come from the server package (single source). The SDK gets an `exports` map (`.` and `./register`) plus `typesVersions` for node10 resolution (orchestrator-cli is CommonJS). | Decided | 2026-10-18 | orch-owner and queue each had their own registration code; orch-owner's version had the behaviours both needed. Queue and orchestrator are expected to switch to it. |
| 77 | Two more shell slots for DSL widgets: `kind: 'widget', slot: 'navbar'` (inline in the navbar, right side, before the theme toggle, every page) and `slot: 'overlay'` (mounted once per widget at the app root, every page; the component positions itself). Rendered like dashboard widgets, behind the dsl-lib ready gate (quiet), each in an error boundary: a throwing component shows "<module>: widget error" and logs the module id instead of blanking the shell. Ordered by `order`, then module order; added and removed with the module. Not handled: z-index conflicts between modules' overlays. | Decided | 2026-10-18 | orch-owner needs a status area in the navbar and a global failure toast stack to match the standalone dashboard. |
| 78 | The navbar has a "Versions" menu (info icon) listing app-core's version and commit, every loaded module's version, modules that failed to load, and the libraries the frontend was built with (dsl-ui, dsl-renderer, react, build time). `build-info.json` gains `appCore` (the version injected into app-core-cli by the CI; `0.0.1` in a local build) and `commit` (short git sha, omitted without git); the dev server proxies `/build-info.json`. Uses Radix Popover directly, because dsl-ui's `Popover` anchors at the page's top-left (its trigger is wrapped in a `display: contents` span); reported to dsl-owner. A placeholder to be moved later. | Decided | 2026-10-18 | User asked for a simple version display now, to be relocated later. Found by a real-browser check; the first version used dsl-ui's Popover and opened in the wrong place. |

## Decision Log (cont. 51)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 79 | Verification pass on the navbar, overlay and versions work, in a real browser on a local test server (agent-browser), changing: (a) the Versions menu is back on dsl-ui's `Popover` now that dsl-owner fixed its anchor (dsl-ui 2026.10.18-101; panel measured under the icon, right edges aligned), so the direct `@radix-ui/react-popover` dependency of Decision #78 is removed; (b) the dsl-lib fixture's navbar and overlay widgets use theme tokens, after a fixed dark text proved unreadable in the dark theme, and the authoring doc now says so; (c) measured: navbar widgets of two modules sit side by side in module order, overlays of two modules pinned to the same corner stack exactly on top of each other (no shell-level arbitration, documented); (d) the PUBLISHED SDK 2026.10.18-029 was installed in a temp directory and exercised against a real server: registered, listed, unregistered, not-registered, deferred, cleared, skipped without creating any folder, and clear rejections for a missing manifest and a malformed port. | Decided | 2026-10-18 | User asked to close the open points that can be tested locally. |
| 80 | Build-time module tooling (`package`, `check`, and `dev` with dependencies) lives in `app-core-cli`, not in the SDK. `esbuild` moves from devDependency to dependency of `app-core-cli` (kept external in its bundle, its native binary cannot be bundled). | Decided | 2026-10-18 | The SDK is installed in production daemons and must stay light, with zero internal dependencies and a `node:`-free main entry (asserted at build). The CLI is the dev/CI tool and already owns `validate` and `dev`. Requested by queue-owner (`package`), whose bundle.ts encoded real bugs: a CJS bundle needs `module.exports = module.exports.default` or the loader sees no function; the manifest copy needs the build version. |
| 81 | Module source layout: `manifest.json` at the package root; sources only under `src/{backend,dsl-views,dsl-components,commons}`; `dist-module/` is generated, gitignored, safe to delete, and is the only thing published (`files: ["dist-module"]`, no zip: an npm tarball is already an archive). `dist-module/` holds the rewritten `manifest.json`, `api-backend/`, `dsl-frontend/`, `dsl-lib/` and the exposed types. | Decided | 2026-10-18 | Keeps every module in one structure and stops ad-hoc `src` folders. Supersedes the "React source outside the `app-module-*` folder" advice in module-authoring.md and the no-`.tsx` rule of Decision #34 for `src/dsl-components`. |
| 82 | Module-to-module contract: the manifest gets `requires` (module id to semver range, checked at load, a missing or mismatching module goes to `failed`, load order follows it) and `expose` (path to the module's types, and its slots). Slot ids are always prefixed with the providing module's id (`<id>:<slot>`). Each exposed slot lists the DSL `$type`s it accepts, and the bundle validation rejects a contribution to another module's slot whose view uses another `$type`. | Decided | 2026-10-18 | A npm dependency types a contribution but does not guarantee the provider is loaded (today a contribution to an absent slot is silently never rendered). Prefixing prevents name conflicts. Restricting `$type`s stops a module injecting a form where a slot expects icon buttons (same idea as an ActionBar). |
| 83 | Every module has its own id, declared in its manifest (`"id": "queue"`, `"id": "orchestrator"`), same charset as today. It is the prefix of the module's slots and the key of `requires`. Registration must use that id; a different id is refused. | Decided | 2026-10-18 | The slot prefix and `requires` need the id at package time, when no daemon has registered the module yet. User: each module must have its own id. Settled when implementing: a manifest without `id` is an error in `check`, `register` and `dev` (no default from the folder name). |
| 84 | app-core persists the last successfully loaded version of each module. It is handed to lifecycle hooks as the previous version, and `migrate` gets a per-module `ctx.dataDir`. | Decided | 2026-10-18 | Migrations and cleanups need to know which version they replace; today nothing is stored (only the registry entry). Hooks themselves: Decision #85. |
| 85 | Lifecycle hooks are declared in the manifest: `lifecycle: { teardown?, migrate? }`, each a path to its own file whose default export is the function (source: `./src/backend/<file>.ts`; `package` bundles each to `api-backend/<name>.cjs`). `check` and the server verify the file and its function export. Resolves Q5. | Decided | 2026-10-18 | Declared paths are validated before anything is replaced, need no naming convention, and keep the backend bundle free of hook code. Q5 proposal accepted by the assistant under the user's "autonomie sur le plan". |
| 86 | `requires` / `expose` / prefixed slots as built. `requires: { id: range }`; `expose: { types?, slots: { name: { accepts: [$type] } } }`; shell slots stay `dashboard\|nav\|route\|navbar\|overlay`, any other slot id MUST be `<providerId>:<name>` (error in `check` and at load). Only the ROOT `$type` of a contribution is validated (children are not). `check`/`package` find the provider through the contributor's package.json dependencies (`node_modules/<dep>/dist-module/manifest.json` with that id), or `--link <package>=<folder>` where it is not installed. Versions are compared only by the server, at load (strict semver, a non-semver version never matches); `check` does not compare them. Load order follows `requires` (topological); a missing/failed provider, a version outside the range, a cycle, or a rejected slot/`$type` sends the module to `failed` (register answers 422). No cascade: updating or unregistering a provider re-validates nothing, its contributors stay served until the next start. `expose.types` is a types-only file copied alone to `dist-module/types/index.d.ts` (`package.json` `exports["./types"]` must point at it). | Decided | 2026-10-18 | Implements #82. Rejected: version comparison in `check` (the installed provider may differ from the one app-core runs) and cascading unloads (a provider update would silently take its contributors down). |
| 87 | Lifecycle semantics. Load/update order: pre-checks and import of the new backend and hooks (no side effect; failure keeps the old instance serving) -> old `teardown` (old context, old version) -> old context disposed -> `migrate` (only when `previousVersion` is non-null and differs) -> setup -> version persisted. Hook context `{ id, version, previousVersion, dataDir }`. `previousVersion` is the last version that loaded, kept in `<configDir>/state/<id>.json` (unparsable file fails the load naming it; unregister clears it). `ctx.dataDir` = `<configDir>/data/<id>/`, created before any hook, NEVER deleted (not even on unregister). Import, setup and each hook have a timeout (30 s, `APP_CORE_HOOK_TIMEOUT_MS`, invalid value stops startup). A failure after teardown leaves the module `failed` with NO rollback and its new context disposed; `migrate` reruns on the next load, so it must be idempotent. Teardown errors/timeouts go to stderr and never block an unload or update. Loads/unloads/forgets of one id are serialized. `unload` and `forget` are async; `ModuleManager` shutdown (also Fastify `onClose`) runs every teardown. `ModuleManagerOptions.configDir` is now required. | Decided | 2026-10-18 | Implements #84. No rollback because the old instance is already torn down and re-running it could repeat side effects. dataDir kept because teardown cannot tell an uninstall from an update. |
| 88 | `app-core-cli dev` takes a source module (checked, packaged into `dist-module` as version `0.0.0-dev`, always printed) or a built `dist-module`. Dependencies from `requires` + package.json are resolved like `check` does (`--link` overrides), recursively, each id once, and registered first; an unresolved id, a source-only dependency or a cycle stops `dev` with the id, who requires it and the fix. `--watch` (source modules only) rebuilds on `src/` and `manifest.json` changes (`fs.watch` recursive, 200 ms debounce; mtime polling every 500 ms where recursive watch is unavailable or with `--poll`, announced in the banner) through the server's own `/api/modules/update`; a failed rebuild keeps the previous version serving. Dependencies are NOT watched. The scratch config dir (so `dataDir` and the persisted version) is removed on exit. | Decided | 2026-10-18 | Implements the `dev` part of #80. Dependencies are not watched to keep the watcher on the one module under development. |
| 89 | BUG FOUND and fixed: a `.cjs` backend rewritten at the same path kept serving its OLD code on update. Native Node caches CommonJS by path and ignores the `?v=` query of the import URL, so #65's cache key never applied to `.cjs` (what `package` emits). The loader now deletes the file's `require.cache` entry before importing. It affected production updates, not only `dev --watch`. Vitest bypasses that cache, so the regression test runs the COMPILED loader in a child `node` process (`updateSamePath.test.ts`); verified failing without the fix (`['first','first']`). | Decided | 2026-10-18 | Found by the `dev --watch` end-to-end test. An in-process test gave false assurance. |
| 90 | Reference module `packages/test-app-modules/app-module-example` (id `example`, built by `build-fixtures`), with an end-to-end test (`exampleModule.test.ts`) per demonstrated behaviour: JSON route, `:id` route + 404, SSE closed on unload, `ctx.setInterval` + `ctx.on/emit`, teardown/migrate with `dataDir` and `previousVersion` (version swap), own exposed slot, contribution to `slot-provider:shared-slot`, views (DataTable on `$sources`, `$route.id`, inline, navbar dsl-lib component). | Decided | 2026-10-18 | User goal: a clean base to start real modules. Platform awkwardness found while writing it is in "Known limitations / follow-ups". |
| 91 | `POST /api/modules/register\|update` answers a manifest that fails validation with `module "<id>": the manifest <path> is invalid: <field>: <reason>; ... Run "app-core-cli validate <path>" ...` (still 400, `issues` kept); a bad request body says `Invalid payload: <field>: <reason>. Fix the request body.` | Decided | 2026-10-18 | Both used to answer the bare `Invalid payload`, which blamed the request when the manifest file was wrong. |

## Decision Log (cont. 52)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 92 | Documentation pass: statements of earlier rows that no longer match the code (rows are not rewritten). #15: the manifest shape `{ version, backendEntryPath, ... }` is the PACKAGED manifest; the source manifest is `{ id, extensionPoints, dslLib?, requires?, expose?, lifecycle? }` (#81, #83, #85). #34: superseded by #81 (`src/{backend,dsl-views,dsl-components,commons}`). #36: the reference fixtures live in `packages/test-app-modules/` (several `app-module-*` folders, built by `scripts/build-fixtures.mjs`), not one `packages/test-app-module`. #37: superseded by #53 (prefix `app-module-<name>`). #33: `assertSlotContract` was never built; a provider publishes its slot types through `expose.types` (#86) and the slot is fetched at `GET /api/slots/<providerId>:<slot>` (no `/contributions` suffix). Guiding principle P-6 now reads `app-module-<name>`. `architectural_design_document.md` is marked historical; a root README, a start-here path, a migration checklist, a troubleshooting table and the limitations list were added to `module-authoring.md`. | Decided | 2026-10-18 | A reader of the earlier rows must not implement APIs that were never built. |

## Decision Log (cont. 53)

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 93 | Provider cascade and auto-recovery (fixes former limitation L1). When `P` is unloaded, unregistered, or ends up failed, every loaded module that requires it (transitively) is unloaded, dependents before providers, teardown reason `dependency`, and recorded in `failed` with cause `requirement` and `required module "P" was unregistered|failed: ...`; registry entries are kept. After `P` is updated and loaded, its direct dependents are revalidated with the load rules (range, exposed slots, root `$type`): incompatible ones fail with the exact problems, compatible ones are untouched; an update refused by the pre-checks changes nothing. Whenever a module becomes loaded (register, update, startup) or something is unregistered, failed modules with cause `requirement` whose requires are all loaded are retried to a fixpoint in topological order (a retry that fails again updates its message; cause `error` is never retried). A load that would create a require cycle with loaded modules is refused. HTTP: register, update and unregister answer `cascaded` and `recovered`; `GET /api/modules` failed entries carry `cause`. | Decided | 2026-10-18 | Contracts must hold while running, not only at the next start. Known gap: an update of `P` that fails after its own teardown tears dependents down after `P`. |
| 94 | Registration outcome (fixes former limitation L5). A rejection for a requirement not met, with the module not running, keeps the registry entry (module stays registered and failed, retried by #93); a failure after the old version was torn down keeps it too (cause `error`, not retried); a rejection before anything changed keeps nothing for a new module and leaves an existing module's entry and running version alone, and records no failure for a module that has no entry. Answers carry `retained` and a sentence saying what was kept. The registry entry is written after the load outcome is known. A manifest path that does not exist, or is not JSON, answers 400 naming the path and the fix (was a raw ENOENT, 500). | Decided | 2026-10-18 | The old behaviour kept any failed registration, which surprised callers. |
| 95 | Teardown context (fixes former limitation L3, L6): `reason` is `update|unregister|unload|shutdown|dependency` and `instance` is what the backend default export returned (awaited, same object; the old teardown gets the old instance). `migrate` gets neither. SDK: `ModuleTeardownContext<T>`, `ModuleTeardownHook<T>`, `ModuleTeardownReason`, `ModuleSetup<T>`. `dataDir` is still never deleted by app-core; a module may delete it on `unregister` itself. Example: counter flushed from `instance`. | Decided | 2026-10-18 | Hooks are separate bundles and could not see memory or intent. |
| 96 | Shutdown (fixes former limitation L4): teardowns run level by level (modules nobody requires first, then what they required), the modules of one level concurrently, each under its own timeout. | Decided | 2026-10-18 | N slow hooks cost the longest, not N timeouts. |
| 97 | `ctx.setInterval/setTimeout` return an opaque `ModuleTimerHandle`; `ctx.clearInterval/clearTimeout(handle)` and `ctx.off(event, fn)` added. Clearing or `off` after dispose, or twice, is a no-op; a non-handle or a handle of the other kind throws; a fired timeout is dropped from tracking. Backward compatible (ignoring the return value still works). | Decided | 2026-10-18 | Fixes former limitation L7: per-request timers and listeners can now be released. |
| 98 | `dev` config dir is `<module-dir>/.app-core-dev` (for a built `dist-module`, the folder holding it), kept between runs; only the registry is rewritten each start. `--reset` wipes it, `--previous-version <v>` persists `<v>` for the module so `migrate` runs (refused when equal to the loaded version). Dependencies' state lives in the same dir. `check` accepts the dot folder, `package` never copies it; `.app-core-dev` is gitignored in the repo, the example and the fixtures. Fixes former limitation L2. | Decided | 2026-10-18 | `migrate` can be exercised across `dev` sessions. |
| 99 | Inherent limitations, kept in the table below and in module-authoring: a timed-out promise cannot be cancelled in JavaScript; module code can leak outside `ctx` (same process, #9); no rollback to the old version after a teardown when the new code overwrote the same file. No rollback is attempted. | Decided | 2026-10-18 | Not fixable inside this architecture. |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| Q4 | The folder name `dsl-lib` was relayed by orch-owner as the user's explicit choice, not heard from the user directly in this session. Confirm it before module authors depend on it. | Low | Resolved 2026-10-17 -- the user confirmed `dsl-lib` directly |
| Q1 | `dsl-ui` does not export `useTheme`/`ThemeMode` from its root, so `frontend-shell/src/theme.ts` duplicates it (Decision #62). Waiting on dsl-owner to export and publish; then delete `theme.ts` and use the export. | Medium | Resolved -- Decision #64 |
| Q2 | Orchestrator job `--timeout`: max supported value unknown (1 year was killed after 0.2s, 2000000s works) and no documented permanent/detached job mode. Job `app-core-dev` uses 2000000s meanwhile (Decision #63). Measured 2026-10-17 on orch 2026.10.14-407: `--timeout 2147483` runs to completion, `--timeout 2147484` is killed after 0.3s (boundary 2^31-1 ms); results sent to orch-owner, who owns validation, docs and a long-running job mode. | Medium | Resolved -- fixed in orch 2026.10.17-408 (Decision #67) |
| Q3 | Raw colors in module DSL views are not checked by any rule (`tailwind/no-raw-color-class` covers .ts/.tsx only). violations-owner agreed on a new `app-module/no-raw-color-in-views` rule (feasible with the current runner); spec with tested patterns and fixtures sent, waiting for it to be built and published, then bump app-core's `violations-rules`. | Low | Resolved -- rule published in violations-rules 2026.10.12-126 and installed in app-core |

## Known limitations / follow-ups

| # | Item | Detail |
|---|---|---|
| L1 | A timed-out promise cannot be cancelled (inherent) | A step reported as timed out may still run in the background (#99). |
| L2 | Module code can leak outside `ctx` (inherent) | Same process (#9): raw timers, global listeners and handles survive unload. |
| L3 | No rollback after a teardown (inherent) | When the new code overwrote the same file the old version cannot come back; the module stays failed (#99). |
| L4 | Dependents of a provider whose update failed after its teardown are torn down after it | The failure is only known once the new setup ran (#93). |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md` | Explicitly excluded items |
| `threat-model.md` | Security threats and mitigations |
| `module-contract.md` | Module bundle format, loading/unloading mechanics, lifecycle helpers |
| `daemon-registration.md` | Daemon-to-app-core registration/update transport, fallback file, startup reconciliation |
| `frontend-shell.md` | app-core's own frontend: base extension-point slots (top navbar, dashboard, nav pages) |
| `extension-slots.md` | Module-to-module extension points: `ExtensionSlot` DSL primitive, provider-owned slot contracts |
| `app-core-sdk.md` | `@wadeck-app/app-core-sdk`: shared types/schemas, manifest validator, local dev runner |
| `module-packaging.md` | Zip/link-based module install/update/uninstall at runtime |
| `future-iterations.md` | Deferred ideas/items for later iterations (middleware, etc.) -- not current scope |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-10-10 | Initial spec created |
| v0.1 | 2026-10-10 | Implementation plan written: `.claude/plans/2026-10-10_app-core-queue-module.md` (app-core skeleton + queue as first module) |
| v0.1 | 2026-10-18 | Decisions #80-#92: module tooling (`check`, `package`, `dev` with dependencies), source layout, `requires`/`expose`, lifecycle hooks, example module, documentation pass |
