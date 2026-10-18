# Module packaging: `check` + `package` (then `requires`/`expose`, hooks, dev)

Spec: `.claude/specs/2026-10-10_modular-plugin-platform/_index.md`, decisions 80-84, open question Q5.

## Delivery order

| Step | Content | Status |
|---|---|---|
| 1 | Manifest `id` + `app-core-cli check` + `app-core-cli package` | done |
| 2 | `requires` + `expose` (typed slots, `$type` validation at bundle) | done |
| 3 | `lifecycle` hooks + persisted previous version + `ctx.dataDir` + atomic swap | done (Q5 resolved) |
| 4 | `dev` with dependencies + watch | done |
| 5 | Violations rules for `src/` + docs + fixtures migration | done |

Historical note: step 1 alone did not give typed slots, `requires`, hooks or the build of `src/dsl-components`; steps 2-5 added them (all done).

## Step 1 design

- Source layout: `manifest.json` at root, `src/{backend,dsl-views,dsl-components,commons}`. Output: `dist-module/{manifest.json,api-backend/backend.cjs,dsl-frontend/**,dsl-lib/**}`.
- Source manifest paths point at sources (`./src/backend/index.ts`, `./src/dsl-views/page.yaml`); `package` rewrites them to the output paths.
- `check <module-dir>`: layout (allowed root entries, only the 4 `src/` folders, no `.tsx` outside `dsl-components`, no React in `backend`/`commons`, `.gitignore` has `dist-module`, `files` is `["dist-module"]`), manifest valid, every referenced file exists. Each error names the offending file and the fix.
- `package <module-dir> --out <dir> [--version <v>]` (default out `dist-module`, default version `BUNDLE_VERSION`, otherwise an error, no silent default):
  1. `check` the source.
  2. esbuild the backend entry: cjs, node22, footer `module.exports = module.exports.default;`, output `.cjs`.
  3. Copy views and prebuilt `dsl-lib` files; stamp `version`; rewrite paths.
  4. Validate the output manifest and that every path resolves inside the output.
- Manifest `id` (decision 83): required; `register` refuses a different id. Cases still to settle: manifest without `id` in `dev`/`register` (proposal: explicit error).
- Loader: fail loudly when the backend default export is not a function (today `loader.ts:129` skips silently). Behaviour change for existing modules; check fixtures first.
- `esbuild` kept `external` in `scripts/bundle.mjs`.

## Tests (written before the code)

- `check`: one test per rule, valid module passes, error text names the file.
- `package`: real subprocess on a fixture; the bundle loads through the real `ModuleManager` and registers its routes (the bug queue hit); version stamped; output `check`s.
- Loader: non-function default export lands in `failed`.

## Consequences for existing modules

- Fixtures in `packages/test-app-modules` use the old layout; they stay on the old rules until migrated.
- queue and orchestrator must move to the new layout to use `package` (their `api-backend/` and `dsl-frontend/` become build output).

## Decided (user, 2026-10-18)

- Backend entry by convention: `src/backend/index.ts` (the source manifest no longer names it; `package` writes `backendEntryPath` in the output).
- All fixtures in `packages/test-app-modules` are migrated to the new layout: they validate the tooling and are the reference for real modules. Server tests register the built `dist-module/manifest.json`, produced by `package` before the tests.
- `package` shrinks, it does not just copy:
  - backend: esbuild bundle, tree-shaken, not minified (readable production stack traces), with a sourcemap;
  - `dsl-lib`: built from `src/dsl-components` with esbuild (shared singletons external to `__APP_CORE_SHARED__`, tree-shaken, minified), so `dsl-lib` joins step 1;
  - views: only the files the manifest references are emitted, parsed, validated and re-emitted compact; unreferenced files are reported;
  - CSS: copied as built until a CSS tool is approved (Tailwind would be a new dependency of the CLI, not added without asking).

## Status (2026-10-18)

Step 1 done and verified (check, package, manifest id, loader fails on non-function default, fixtures migrated, violations rules, docs). Steps 2-4 below were delegated sequentially (each verified before the next); step 5 builds `app-module-example` and closes docs/spec. Q5 resolved by assistant (user: "autonomie sur le plan"): hooks are declared in the manifest as paths.

## Step 2 design: `requires`, `expose`, prefixed slots

- Manifest (source and output): `requires?: { "<moduleId>": "<semver range>" }`, `expose?: { types?: "<path>", slots?: { "<localName>": { accepts: ["<$type>", ...] } } }`.
- Slot ids: shell slots stay `dashboard|nav|route|navbar|overlay`; any other slot MUST be `<providerId>:<localName>`. An unprefixed custom slot is an error in `check` and at load.
- Types: `expose.types` points to a types-only `.ts`/`.d.ts` in `src/commons`; `package` copies it to `dist-module/types/index.d.ts` (esbuild transform must emit no runtime code, else error) and rewrites the path; `check` requires package.json `exports["./types"].types` to point at it. No TypeScript runtime dependency is added to the CLI.
- Contribution validation (CLI `check`/`package`, and server at load): for each extension point targeting `<providerId>:<local>`: the module must list `providerId` in `requires`; the provider's output manifest is found through the contributor's package.json dependencies (node_modules/<dep>/dist-module/manifest.json with that id); the slot must be exposed; the ROOT `$type` of the contributed view must be in `accepts` (children not validated, documented). Shared pure logic lives in the server package and is imported by the CLI.
- Server: topological load order from `requires`; a missing provider, a version outside the range, or a cycle sends the module to `failed` with the fix; a contribution to a slot the loaded provider does not expose, or with a non-accepted root `$type`, sends it to `failed`. No cascade on provider update/unregister (documented limitation, listed in the report).
- Fixtures: new `app-module-slot-provider` (id `slot-provider`, exposes `shared-slot` accepting `Badge`); contributors a/b use `slot-provider:shared-slot` + `requires`; update tests and `/api/slots` ids.

## Step 3 design: lifecycle hooks, previous version, dataDir, safe swap

- Manifest `lifecycle?: { teardown?: path, migrate?: path }` (source paths under src/backend; `package` bundles each to api-backend/<name>.cjs with the same footer; file and function export validated at register/check).
- `ctx.dataDir` (`<configDir>/data/<id>/`, created at load). Hooks get `{ id, version, previousVersion, dataDir }`; `previousVersion` is the last successfully loaded version, persisted at `<configDir>/state/<id>.json` after a successful setup; null on first install.
- Order on load/update: pre-checks, import new backend, old `teardown` (timeout), old dispose, `migrate` (only when previousVersion is non-null and differs), `setup`, persist version. A failure after teardown leaves the module in `failed` (no rollback, documented); the new context is always disposed on failure (no orphan routes); a failure in the import or pre-checks keeps the old instance serving.
- Timeouts on import+setup and on each hook (default 30 s, env `APP_CORE_HOOK_TIMEOUT_MS`); teardown errors are logged on stderr and never block the unload.
- Server shutdown (`stop()`) runs teardown and dispose of every module.
- SDK: `ModuleContext.dataDir`, types for hook contexts.

## Step 4 design: `dev` with dependencies

- `dev <module-dir>` accepts a source module (packages it into `dist-module` with version `0.0.0-dev`, printed) or a `dist-module` folder; `--watch` re-packages on `src/` changes (debounced) and updates in place.
- Dependencies: from `requires` and package.json dependencies, the dependency modules' `dist-module` are registered first, recursively and in order; a required id with no resolvable package is an explicit error naming the fix.

## Step 5: `app-module-example` reference fixture (SSE route, `:param` route, `ctx.on`, exposed slot + contribution, hooks, dsl-lib), final docs, spec decisions (Q5 and the rest), amend decision 22.

## Status step 3 (2026-10-18)

Step 3 done as designed: manifest `lifecycle`, `check`/`package`, `ctx.dataDir`, persisted previous version, new load order, timeouts, shutdown teardown (`ModuleManager.shutdown`, Fastify `onClose`), docs. Choices beyond the design: a teardown failing during an update is logged and the update continues; per-id serialization of load/unload/forget; `ModuleManagerOptions.configDir` is required; `unload`/`forget` are async. Spec Q5 and decision 84 text not yet amended.

## Status step 5 (2026-10-18)

Done: `app-module-example` + `exampleModule.test.ts`, spec decisions #85-#91 (Q5 resolved, #22 amended), "Known limitations / follow-ups" L1-L7 in the spec `_index.md` (single place), `updateSamePath.test.ts` now runs the compiled loader in a child Node process, clear 400 messages for invalid manifests/payloads (#91).

## Status: known limitations removed (2026-10-18)

Decisions 93-99 in the spec. L1 cascade and auto-recovery, L2 persistent `dev` dir (`--reset`, `--previous-version`), L3 teardown `reason`, L4 parallel shutdown per level, L5 explicit retained/not-retained registration (+ 400 for a missing manifest path), L6 `instance` handed to teardown, L7 timer handles, `clearInterval/clearTimeout`, `ctx.off`. Tests first for each: `cascade`, `registrationOutcome`, `teardownContext`, `shutdownParallel`, `moduleContextHandles` (server), `devPersistence` (cli), SDK type test. Left as inherent: uncancellable timed-out promises, leaks outside `ctx`, no rollback after a teardown.
