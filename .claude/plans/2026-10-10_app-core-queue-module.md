**Spec:** .claude/specs/2026-10-10_modular-plugin-platform/

# Plan: app-core skeleton + queue as first module

Goal: validate the whole modular-plugin approach end-to-end before porting Orchestrator/Flow/Queue.

Sequencing (Decision #23): start at Phase 1. Phase 0 (`queue` repo refactor) is deferred -- `queue` has other feature work in progress -- and resumes once that settles.

## Phase 0 -- Refactor `queue` into a packages layout (deferred, blocked on queue's current work)

`queue` is currently a flat single-package repo (`queue/package.json`, `queue/src/`). Convert to npm workspaces, mirroring `orchestrator/packages/*`:

- `queue/packages/queue-cli/` -- move existing `src/`, `ci/`, build scripts here unchanged.
- `queue/packages/app-module/` -- new package, scaffolded empty (filled in Phase 2).
- Root `queue/package.json` becomes the workspaces root.

Done when: `queue-cli` builds and tests pass from its new location with no behavior change.

## Phase 1 -- app-core skeleton

New repo content for `app-core` (currently doc-only):

- Node server (per Decision #7): `POST /api/modules/register`, `POST /api/modules/update`. Hardcoded default port, overridable via env/config.
- Module registry (Decision #14): on startup, read every `<app-core-config-dir>/modules/<id>.json`, load each via the loader below. On a successful register/update call, write/update the same file.
- Module loader (Decision #8): dynamic `import()` of `backendEntryPath` with cache-busting; parse `view` (inline or path) as DSL data for `dsl-renderer`.
- `moduleContext` (Decision #9): `setInterval`/`setTimeout`/`on` helpers scoped per module, cleared on unload.
- Manifest parsing (Decision #15): validate `{ version, backendEntryPath, extensionPoints: [...] }` shape; reject unknown `source.type` other than `file` (npm is v2, Decision #11).
- `violations-rules`: new rule enforcing Decision #9, scoped to any `**/packages/app-module/**` path in any repo (Decision #22) -- no per-repo config/opt-in.

Done when: the two endpoints accept a well-formed payload and write it to the registry directory, and `GET /api/modules` reflects loaded modules' resolved extensionPoints as JSON.

**Status: backend portion built and verified (27/27 tests, clean build/typecheck) -- see frontend-shell sub-phase below for the remaining piece.**

### Phase 1b -- Frontend shell (Decision #24/#25, see frontend-shell.md)

app-core needs its own frontend -- it provides the base extension-point slots that modules plug into, this is not optional for Phase 1 to be considered done:

- Vite + React app, consuming `@wadeck-app/dsl-renderer`/`dsl-ui` directly (confirmed in Phase 1 backend work: these packages only export React components, so the frontend is the only place that actually calls `DslRenderer`/`GenericPageRunner`).
- Base layout: sidebar/navbar + a dashboard grid area (per architectural_design_document.md section B and frontend-shell.md).
- On load, fetch `GET /api/modules`; place each `widget`/`dashboard` extensionPoint into the dashboard grid, each `page`/`nav` extensionPoint into the sidebar (clicking routes to a full-page render of that view).
- Polling refresh (Decision #25): poll `GET /api/modules` with exponential backoff on no-change; drop to a very long "hibernate" interval when `document.hidden` is true / the tab loses focus, reset to fast interval on focus regain.
- Served by app-core's own Fastify server via static file serving (mirror `orch-server`'s `@fastify/static` + `copy-app.mjs` build-and-copy pattern) -- no separate frontend dev server/port in production.

Done when: starting app-core, registering Fixture A and Fixture B (from the backend fixtures below) via `POST /api/modules/register`, and opening the app-core URL in a browser actually shows Fixture A's widget on the dashboard and Fixture B's page in the sidebar, rendered by `DslRenderer`/`GenericPageRunner` -- not just visible via the `GET /api/modules` JSON endpoint.

### Phase 1c -- Live data wiring + real DSL components (Decision #26/#27)

Phase 1b predates Decision #26/#27 and only renders static, load-time-resolved views. This phase makes modules' views actually live:

- Backend: `moduleContext.registerRoute(method, path, handler)` -- registers a route on app-core's existing Fastify server instance, path always prefixed `/api/modules/<id>/...` (module id is a fixed literal segment, never a `$route` placeholder -- this is the agreed mitigation for the empty-placeholder silent-skip gap, Decision #27). Tracked per module, removed on unload/swap via the same `dispose()` path as timers/listeners.
- Frontend: implement the `fetcher` function passed to `GenericPageRunner` (confirmed by dsl-owner: `$sources` URLs are free-form strings like `"GET /api/modules/queue/history"`, handed verbatim to this fetcher -- no base-path logic needed, same-origin resolution works as-is).
- Frontend: replace the Phase 1b placeholder DSL registry (`TextBox`/`PageContent`, which are NOT real dsl-ui components) with the actual `@wadeck-app/dsl-ui` component catalogue/registry.
- Update the two Phase 1 fixtures (or add a Fixture C) to exercise `registerRoute()` + `$sources`, so there's real test coverage of the live-data path, not just static views.

Done when: a fixture module's page view fetches live data from its own `registerRoute()`-registered endpoint and re-renders it, through the real `fetcher`/`GenericPageRunner` wiring, using actual dsl-ui components (no placeholders).

### Phase 1d -- Widget/page symmetry + bundle code-splitting (Decision #28/#29)

- Dashboard widgets switch from plain `DslRenderer` to `GenericPageRunner` + the real `fetcher`, same as pages (Decision #28) -- so a widget can declare `$sources` too. Update/extend a fixture to prove a widget with live data actually works (e.g. a Fixture D widget using the same `registerRoute()` pattern as Fixture C's page).
- Code-split dsl-ui's component catalogue via dynamic `import()` instead of a static import at the top of the registry module (Decision #29) -- confirm with a build that the main chunk drops meaningfully below the 500KB warning threshold, or document why it can't if dsl-ui's structure doesn't allow clean splitting.

Done when: a widget with `$sources` renders live data on the dashboard (not just pages), and `npm run build` (frontend) no longer emits the chunk-size warning, or the agent explains why it still does.

### Phase 1 test fixture modules (Decision #23 -- required, not optional)

Since `queue`'s real `app-module` isn't available yet (Phase 0 deferred), build 1-2 throwaway fixture modules inside `app-core`'s own test tree to validate the skeleton:

- Fixture A -- minimal: one widget, no `moduleContext` usage, inline DSL view. Validates basic register -> load -> render -> unload.
- Fixture B -- stresses the lifecycle: uses `moduleContext.setInterval`, a `page` extension point in addition to a `widget`, and a version bump. Validates hot-swap and that the old version's interval stops firing after swap.
- Unit tests: manifest validation (reject bad shapes/unknown `source.type`), registry file read/write, loader cache-busting (two `import()`s of bumped versions return distinct instances), `moduleContext` cleanup on unload.
- Integration tests: full HTTP flow (`POST /api/modules/register` -> widget appears in a rendered page), restart app-core with a pre-existing registry directory (startup load), fallback-file path (write the registry file directly instead of POSTing, confirm startup picks it up).

## Phase 1e -- app-core-sdk + app-module folder convention + violations rules (Decision #31/#34)

Unblocks `queue-owner`, who has `packages/queue-app-module` built as a pure data layer (status/history/replay/dlq/subscribers/push) but no manifest/wiring/views at all -- correct per Decision #4/#9, missing the actual module contract files.

- Restructure app-core itself into a `packages/` workspace: `packages/server` (today's `src/`), `packages/frontend-shell` (today's `app/`), `packages/app-core-sdk` (new).
- `packages/app-core-sdk`: re-exports `Manifest`/`ExtensionPoint`/`ModuleContext`/`RegistrationPayload` types+zod schemas directly from `packages/server` (no hand-copying). Ships `validate <manifest.json>` CLI (runs the real zod schema) and `dev <path-to-app-module>` CLI (boots the real server+loader+frontend pre-registered with one local module).
- New violations rules, same auto-detecting family as Decision #22 (`**/packages/app-module/**`, no per-repo config): (1) `manifest.json` must exist at the package root and validate against the real schema, (2) `backendEntryPath` must resolve inside `api-backend/`, (3) every `view.path` must resolve inside `dsl-frontend/`, (4) no `.tsx`/React/JSX anywhere in the package.
- Publish `app-core-sdk` so `queue-app-module` can depend on it as a devDependency.

Done when: `app-core-sdk validate` and `dev` both work against a real fixture module, the four new violations rules have unit tests (good + bad fixtures per rule, matching `app-module-no-raw-timers.test.ts`'s existing pattern), and running `violations check` against a module missing `manifest.json` (simulating queue-app-module's actual current state) fails with a clear message.

## Phase 1f -- Naming convention fix + publish pipeline + test-app-modules (Decision #37/#38/#39/#36)

Supersedes part of Phase 1e: the violations rules it built are scoped to the literal `packages/app-module/**`, which matches neither `queue`'s real `queue-app-module` nor any future daemon's `<name>-app-module` package. Also discovered: `@wadeck-app/app-core-sdk` has no publish pipeline at all, so it isn't actually installable outside this repo yet.

1. **Fix existing violations rules' scope**: change `**/packages/app-module/**` to `**/packages/*-app-module/**` in all four rules built in Phase 1e (`manifest-exists-and-valid`, `backend-entry-location`, `view-location`, `no-react`). Update their tests' fixture paths to match (e.g. `packages/fake-app-module/` instead of `packages/app-module/`).
2. **New rule**: any directory containing `manifest.json` must itself be named `*-app-module` (Decision #38) -- same auto-detecting family, no per-repo config.
3. **`packages/test-app-modules/`**: move the four existing fixtures here, each renamed descriptively and restructured to the `api-backend/`/`dsl-frontend/` convention (Decision #34), each its own `*-app-module` package so the rules actually validate against them:
   - `minimal-app-module` (was module-a)
   - `lifecycle-app-module` (was module-b, hot-swap/moduleContext.setInterval)
   - `live-page-app-module` (was module-c, registerRoute + $sources page)
   - `live-widget-app-module` (was module-d, registerRoute + $sources widget)
4. **CI/publish pipeline** for `packages/app-core-sdk`: new `.github/workflows/publish.yml`, mirroring `violations-framework`'s exactly (build-and-test job, then a publish job gated on push to main using `wadeck-app/ci-templates`'s `compute-version` action, `npm publish` with GitHub Packages auth). This is app-core's first-ever CI workflow -- app-core has no `.github/` at all today.
5. **SDK README**: must stand alone -- cover the full manifest shape, the backend-entry contract (default-exported function receiving `ModuleContext`), `registerRoute`/`$sources` live-data pattern, the folder convention (`api-backend/`/`dsl-frontend/`) and naming convention (`<name>-app-module`), and both CLIs (`validate`, `dev`), with a complete worked example. Goal: `queue-owner` (or any future daemon author) needs zero further clarifying questions after reading it + installing the published package.

Done when: `violations check` run against `queue`'s real `packages/queue-app-module` (as it exists today, suffix-named, already restructured per the earlier manifest fix) passes cleanly; the four renamed test-app-modules all pass the same checks; `@wadeck-app/app-core-sdk` is actually `npm install`-able (verify by attempting a real install from outside the workspace, e.g. in a scratch directory, not just within the monorepo); the README is complete enough that a fresh read requires no app-core source-diving to build a working module.

## Phase 2 -- `queue`'s `app-module` package

- `manifest.json` matching Decision #15's shape: at least one `extensionPoints` entry (start with a single dashboard widget, e.g. queue depth / DLQ count).
- Backend entry: reads queue's own data (DLQ, subscriber list) by whatever means `queue-cli` already uses internally -- app-core doesn't care how (Decision #4).
- View: DSL YAML for the widget (Decision #16 -- DSL only, no React).
- `violations` rule check: confirm no raw `setInterval`/`addEventListener` in this package's source (Decision #9).

Done when: pointing app-core's registry at this package's manifest (via `file` source) renders the widget with real queue data.

## Phase 3 -- Registration wiring

- `queue` daemon: on its own startup/update, POST to app-core (`register` if unknown, `update` if version changed), per Decision #5/#12.
- Fallback: if the POST fails, `queue` writes `<app-core-config-dir>/modules/queue.json` directly (Decision #12/#14) -- same file app-core itself writes on a successful push, so no separate code path in app-core needed.
- No auth/signing on either path (Decision #6/T-03 accepted risk) -- do not add any.

Done when: starting `queue`'s daemon while app-core is already running updates the dashboard without restarting app-core; starting it while app-core is down and then starting app-core afterward still picks up the module.

## Phase 4 -- Hot-swap validation

- Bump `app-module`'s manifest version, trigger the daemon's update push, confirm app-core swaps the widget's code/view live, no app-core restart.
- Confirm `moduleContext`-registered intervals/listeners from the old version are gone after swap (no duplicate ticking).

## Explicitly not in this plan (see out-of-scope.md)

- npm `source.type` (deferred to v2, Decision #11).
- Any sandboxing/auth between app-core and modules (Decision #6).
- Orchestrator's existing dashboard (`orch-ui`/`orch-server`) -- untouched (Decision #19).
- Porting Orchestrator or Flow to the `app-module` pattern -- comes after `queue` validates the approach (Decision #20).
