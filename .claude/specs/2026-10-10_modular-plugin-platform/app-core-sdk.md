# app-core-sdk -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-11
**Status:** Draft

## Overview

A published package (`@wadeck-app/app-core-sdk`) giving module authors (queue, orchestrator, flow, future daemons) typed contracts and a local dev/test loop, without needing a separate app-core checkout. Does NOT define the extension-slot contract mechanism (see extension-slots.md) -- just the base manifest/moduleContext contract and dev tooling.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 31 | `@wadeck-app/app-core-sdk` lives inside app-core's own repo (which gets a `packages/` split: `packages/server`, `packages/frontend-shell`, `packages/app-core-sdk`). Re-exports `Manifest`/`ExtensionPoint`/`ModuleContext`/`RegistrationPayload` types+zod schemas from `packages/server` directly -- single source of truth, no hand-copied drift. Ships `validate <manifest.json>` and `dev <path-to-app-module>` CLIs. | Matches `violations-framework`'s existing shape; avoids app-core and module authors drifting out of sync on the contract. | 2026-10-11 |
| 39 | A CI/publish pipeline (GitHub Actions, mirroring `violations-framework/.github/workflows/publish.yml`) must exist before the SDK is actually consumable externally -- confirmed none existed. README must be self-explanatory enough that a module author needs no further hand-holding. | Discovered via `queue-owner`'s real 404 attempting `npm install`; user: "it's expected to be self-explanatory." | 2026-10-11 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Package layout (app-core itself, post-split)
- `packages/server` -- today's `src/` (Fastify server, loader, registry, moduleContext, manifest validation, moduleRoutes).
- `packages/frontend-shell` -- today's `app/` (Vite+React shell).
- `packages/app-core-sdk` -- new, published to the same private registry (`npm.pkg.github.com`) as every other `@wadeck-app/*` package.

### `validate` CLI
`app-core-sdk validate ./packages/app-module/manifest.json` runs the exact zod schema `packages/server` uses server-side (imported, not re-implemented), so a module author catches a malformed manifest before ever starting app-core.

### `dev` CLI
`app-core-sdk dev ./packages/app-module` boots the real `packages/server` + `packages/frontend-shell` code (not a mock -- reuses the actual implementation to avoid drift), pre-registered with just the one local module path given. Lets e.g. `queue` iterate on its `app-module` package with a local dev loop inside queue's own repo, without checking out app-core separately.

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
*(none currently -- see _index.md for the broader spec's remaining open questions)*

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
None beyond what's already in threat-model.md -- this is dev tooling, not a new runtime surface.
