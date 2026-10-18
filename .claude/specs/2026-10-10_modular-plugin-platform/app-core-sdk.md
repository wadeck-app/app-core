# app-core-sdk -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-11
**Status:** Draft

## Overview

A published package (`@wadeck-app/app-core-sdk`) giving module authors (queue, orchestrator, flow, future daemons) typed contracts and a local dev/test loop, without needing a separate app-core checkout. Does NOT define the extension-slot contract mechanism (see extension-slots.md) -- just the base manifest/moduleContext contract and dev tooling.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 31 | `@wadeck-app/app-core-sdk` lives inside app-core's own repo (which gets a `packages/` split: `packages/server`, `packages/frontend-shell`, `packages/app-core-sdk`). Re-exports `Manifest`/`ExtensionPoint`/`ModuleContext`/`RegistrationPayload` types+zod schemas from `packages/server` directly -- single source of truth, no hand-copied drift. Ships `validate <manifest.json>` and `dev <path-to-app-module>` CLIs. (Update, Decision #80: the CLI commands live in `@wadeck-app/app-core-cli`, together with the new `check` and `package`; the SDK keeps types, schemas and `register`.) | Matches `violations-framework`'s existing shape; avoids app-core and module authors drifting out of sync on the contract. | 2026-10-11 |
| 41 | New rule `app-core-sdk/no-internal-dependencies` (package.json check) + a build-time assertion in `scripts/bundle.mjs` (dist-output check, since `dist/**` is excluded from violations scanning by design) -- together, permanent coverage against the SDK ever shipping an internal cross-package reference again. | Catches this class of bug permanently, not just the one instance found. | 2026-10-11 |
| 39 | A CI/publish pipeline (GitHub Actions, mirroring `violations-framework/.github/workflows/publish.yml`) must exist before the SDK is actually consumable externally -- confirmed none existed. README must be self-explanatory enough that a module author needs no further hand-holding. | Discovered via `queue-owner`'s real 404 attempting `npm install`; user: "it's expected to be self-explanatory." | 2026-10-11 |
| - | FIXED and verified (2026-10-11): (1) `dev` CLI now actually serves the real frontend standalone -- `buildServer()` takes a configurable `publicDir`, app-core-sdk bundles `frontend-shell`'s built assets into its own `dist/public`, root build order fixed so `frontend-shell` builds before `app-core-sdk`. (2) `.d.ts` bundling fixed via `rollup-plugin-dts`, zero `@wadeck-app/app-core-server` references in the published declaration file. Both verified by the parent via a real `npm pack` -> fresh external scratch install -> real HTTP round trip (`GET /` returns real HTML, referenced asset also 200) and a real `tsc --strict` consumption test. Published via a real, watched CI run (build-and-test + publish both green). | User explicitly rejected the frontend gap as an acceptable "known limitation" -- it had to actually work, not be documented around. | 2026-10-11 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Package layout (app-core itself, post-split)
- `packages/server` -- today's `src/` (Fastify server, loader, registry, moduleContext, manifest validation, moduleRoutes).
- `packages/frontend-shell` -- today's `app/` (Vite+React shell).
- `packages/app-core-sdk` -- new, published to the same private registry (`npm.pkg.github.com`) as every other `@wadeck-app/*` package.

*(The CLI sections below describe the original design; the commands now live in `@wadeck-app/app-core-cli` and `dev` takes the module folder with its dependencies, see Decisions #80/#88.)*

### `validate` CLI
`app-core-cli validate <dist-module/manifest.json>` (originally `app-core-sdk validate`) runs the exact zod schema `packages/server` uses server-side (imported, not re-implemented), so a module author catches a malformed manifest before ever starting app-core.

### `dev` CLI
`app-core-sdk dev ./packages/app-module` boots the real `packages/server` + `packages/frontend-shell` code (not a mock -- reuses the actual implementation to avoid drift), pre-registered with just the one local module path given. Lets e.g. `queue` iterate on its `app-module` package with a local dev loop inside queue's own repo, without checking out app-core separately.

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
*(none currently -- see _index.md for the broader spec's remaining open questions)*

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
None beyond what's already in threat-model.md -- this is dev tooling, not a new runtime surface.
