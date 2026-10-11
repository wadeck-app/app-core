# Frontend Shell -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-10
**Status:** Draft

## Overview

app-core's own frontend: a base shell (navbar/sidebar, dashboard grid, nav page routing) that renders modules' DSL `extensionPoints` into fixed slots. Does NOT define a module's own view content (see module-contract.md) -- only the slots the shell exposes and how it discovers what to render.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 16 | Module UI is DSL-only, rendered by `@wadeck-app/dsl-renderer`/`dsl-ui` -- no React shipped by a module. | Preserves consistency and agent-authorability. | 2026-10-10 |
| 24 | app-core ships its own frontend shell providing base extension-point slots (navbar/sidebar, dashboard widget grid, nav page routing), per architectural_design_document.md section B. | Modules need somewhere to render into; this was always implied, not new scope. | 2026-10-10 |
| 25 | Frontend refresh via polling `GET /api/modules` with exponential backoff, dropping to a very long "hibernate" interval when the tab is unfocused. No SSE/WebSocket push. | Matches the local, low-infra spirit of the rest of the spec; module updates are rare, don't need instant push. | 2026-10-10 |
| 28 | Widgets render through `GenericPageRunner` + the real `fetcher`, same as pages -- no capability tier between widget/page, only placement differs. | No technical reason for the Phase 1c asymmetry; fixing it. | 2026-10-10 |
| 29 | SUPERSEDED by finding: not achievable with current `@wadeck-app/dsl-renderer` -- `entriesGenerator.ts` has no lazy-import option, generated entries are eager by construction. Main chunk stays 1,042.65 kB / 302.99 kB gzip; filed as a feature request to dsl-view. | Thorough investigation found no app-core-side fix; accepted as a known limitation rather than worked around cosmetically. | 2026-10-10 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Base slots
- `widget` / `dashboard` -- rendered into a grid on the main dashboard page.
- `page` / `nav` -- appears as a sidebar/navbar entry; selecting it routes to a full-page render of that extension point's view.

(Only these two slot values exist in the manifest shape validated so far -- Decision #15's `extensionPoints[].slot` is a free-form string today; the frontend shell only knows how to place `dashboard` and `nav`. Any other slot value a module declares is undefined behavior until a new slot is added here.)

### Stack
- Vite + React (required: `@wadeck-app/dsl-renderer`/`dsl-ui` only export React components, confirmed during Phase 1 -- app-core's frontend is the first and only place in this system that actually invokes `DslRenderer`/`GenericPageRunner`).
- Built assets served by app-core's own Fastify server (mirrors `orch-server`'s `@fastify/static` + `copy-app.mjs` pattern) -- no separate frontend server/port.

### Data flow
1. Shell loads on `GET /` (or similar), fetches `GET /api/modules` (already built in Phase 1) to get every loaded module's resolved `extensionPoints` (kind/slot/label/view -- already resolved to DSL JSON server-side, no further YAML parsing needed client-side).
2. Shell places each `widget`/`dashboard` entry into the dashboard grid, each `page`/`nav` entry into the sidebar, rendering their `view` via `DslRenderer`/`GenericPageRunner`.
3. On hot-swap (a module's version changes server-side), the shell polls `GET /api/modules` and re-renders if anything changed (Decision #25). Polling uses exponential backoff when nothing changes, and drops to a very long ("hibernate") interval when `document.hidden`/the tab loses focus; it resets to the fast interval on focus regain.

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
*(none currently -- see _index.md for the broader spec's remaining open questions)*

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
No new STRIDE surface beyond what's already in threat-model.md -- the frontend only renders what `GET /api/modules` already serves.
