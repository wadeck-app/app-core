# Daemon Registration -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-10
**Status:** Draft

## Overview

Defines how a provider daemon (Orchestrator, Queue, Flow, future tools) tells app-core about a module to install or a new version to swap to. Does NOT define what app-core does once it has the manifest (see module-contract.md for loading/unloading mechanics).

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 5 | Daemon pushes to app-core; app-core does not poll daemons. | Matches user's stated flow. | 2026-10-10 |
| 7 | app-core exposes `POST /api/modules/register` and `POST /api/modules/update` on its own Node server, listening on a hardcoded default port, overridable via config/env (for testing). No separate discovery protocol. | User: reuse app-core's existing server, don't invent new mechanisms. | 2026-10-10 |
| 10 | Registration payload is a pointer, not the manifest content: `{ id, source: { type: 'file', path } }` (npm source deferred, see Decision #11). | Keeps the push small; manifest content lives at the referenced location. | 2026-10-10 |
| 12 | Primary path: daemon pushes via HTTP. Fallback: if app-core is unreachable, the daemon writes its manifest reference to a well-known local file instead of retrying. app-core reads that fallback location on its own startup and loads anything it's missing or out of date on. | User: CLIs try to contact app-core first; on failure, drop a file for app-core to pick up on next wake. | 2026-10-10 |
| 13 | Fallback file: one file per daemon at `<app-core-config-dir>/pending-modules/<id>.json`, same JSON shape as the HTTP payload (`{ id, source: { type: 'file', path } }`). app-core lists the directory on startup and processes each file like an HTTP registration. (Path superseded by Decision #14.) | User: "A go!" | 2026-10-10 |
| 14 | Directory renamed in intent from "fallback dropbox" to app-core's actual module registry: `<app-core-config-dir>/modules/<id>.json`. app-core itself writes/updates this file on a successful HTTP push (not just the daemon on the fallback path). No separate internal state -- this directory is the single source of truth, loaded in full on every app-core startup. | User: in the end, doesn't the app-core server just store these directly in that folder? | 2026-10-10 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Push path (primary)
1. Daemon detects app-core is reachable (resolves port per Decision #7).
2. Daemon `POST`s `{ id, source: { type: 'file', path } }` to `/api/modules/register` (new module) or `/api/modules/update` (new version of a known module).
3. app-core loads/swaps the module per module-contract.md.

### Fallback path (app-core unreachable)
1. Daemon's push attempt fails (connection refused / timeout) -- no retry loop is implemented by the daemon.
2. Daemon writes/overwrites `<app-core-config-dir>/modules/<id>.json` directly (same shape as the HTTP payload).
3. On app-core's own next startup, app-core reads that directory and loads any module it doesn't already have at the latest known version.

### Module registry (per Decision #14)
`<app-core-config-dir>/modules/<id>.json` is app-core's single source of truth for registered modules -- not a separate "pending" dropbox. On a successful HTTP push, app-core itself writes/updates the file (so the push path and the fallback path converge on the same storage). On startup, app-core loads every file found in this directory; no separate internal state or reconciliation step is needed.

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
*(none currently -- see _index.md for the broader spec's remaining open questions)*

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
T-03 (Spoofing on the registration channel) applies equally to the fallback file path: any local process that can write to the fallback location could register a fake module reference, same as the HTTP endpoint. Accepted risk by extension of Decision #6 -- see threat-model.md.
