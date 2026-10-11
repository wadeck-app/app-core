# Guiding Principles -- Modular Plugin Platform

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Daemons stay fully independent
A provider daemon (Orchestrator, Queue, Flow, future tools) is never embedded in, spawned by, or lifecycle-managed by app-core, and app-core is never embedded in the daemon. Each keeps its own install/update/daemon lifecycle exactly as it works standalone today.
**Why:** these CLIs already work independently in production; app-core is an additive UI host, not a replacement runtime for them. (Decision #3)

### P-2: Module code runs inside app-core's own process
A module's frontend and backend both execute inside app-core's Node process, never inside the providing daemon's process and never by app-core calling out to the daemon as a remote API.
**Why:** stated explicitly by the user as the required split of responsibility -- the daemon only ever notifies app-core, it never serves the module's logic at request time. (Decision #3)

### P-3: app-core is agnostic about module internals
app-core's responsibility is limited to loading, unloading, and swapping module code. What a module's backend does once loaded (reading daemon-generated files, querying a DB, shelling out to a CLI) is entirely the module's business and is never app-core's concern.
**Why:** keeps app-core generic and able to host any future module without app-core needing daemon-specific integration logic. (Decision #4)

### P-4: Daemon-initiated push, not app-core polling
A daemon is responsible for detecting app-core and pushing registration/update notifications to it. app-core never polls or scans daemons looking for modules or new versions.
**Why:** matches the user's stated flow (daemon says "I have a module" / "I have a new version") and avoids app-core needing daemon-specific polling logic for every future tool. (Decision #5)

### P-5: Module UI is DSL-only
A module's UI is always expressed as DSL view data (consumed by `dsl-renderer`/`dsl-ui`), never as raw React shipped by the module. If a widget can't be expressed in the DSL, that's a signal the DSL/`dsl-ui` component set needs a new primitive, not a reason to allow a React escape hatch.
**Why:** preserves UI consistency across all modules and keeps modules easy to author for AI agents -- the original motivation for considering DSL view at all. (Decision #16)

### P-6: A module lives in its own daemon's repo, in an `app-module` package
A daemon's app-core module (frontend + backend code per P-2) is published from a dedicated package named `app-module` inside that daemon's own repo (e.g. `queue/packages/app-module`), never inside app-core's own repo. A flat (non-workspaces) repo must first be refactored into a `packages/` layout before this package can be added.
**Why:** keeps module code co-located with and versioned alongside the daemon that owns it, and mirrors the `packages/` convention Orchestrator already uses. (Decision #21)

### P-7: Module-to-module slot contracts are provider-owned, never centralized
When one module contributes UI into another module's `ExtensionSlot`, the typed/versioned contract for that slot is published by the PROVIDING module from its own package -- never defined or centralized in app-core or app-core-sdk. app-core only brokers slot-name matching generically.
**Why:** app-core stays agnostic about what any module-to-module contract means (consistent with P-3); centralizing it in app-core would make app-core a bottleneck for contracts it has no business knowing about. (Decision #33)
