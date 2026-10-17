# Out of Scope -- Modular Plugin Platform

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### Sandboxing / isolation between modules and app-core
**Reason:** explicitly declared out of scope by the user -- this is a local, single-machine, trusted-users-only context. No process sandboxing, permission scoping, or auth boundary between app-core and a loaded module is required for this spec. (Decision #6)
**Covered by:** threat-model.md (STRIDE items affected by this are marked "Accepted risk, by design" rather than mitigated).

### app-core mediating module-to-daemon interaction
**Reason:** how a loaded module's backend talks to its providing daemon (files, DB, CLI calls, etc.) is entirely the module's own concern. app-core does not provide, broker, or standardize this interaction. (Decision #4)
**Covered by:** guiding-principles.md P-3.

### npm-sourced module registration (v1)
**Reason:** deferred to v2. v1 registration only supports `{ type: 'file', path }`. The `npm` source type and its resolution mechanics are documented in module-contract.md as a future decision but not implemented in v1. (Decision #11)
**Covered by:** module-contract.md Design section ("npm resolution -- deferred to v2").

### Changes to Orchestrator's existing standalone dashboard
**Reason:** `orch-ui`/`orch-server` stay exactly as they are for now; this effort does not deprecate, replace, or modify them. (Decision #19)
**Covered by:** n/a -- revisit once Orchestrator's module is actually built (per Decision #20, Orchestrator comes after `queue`).

### Arbitrary React in a module's UI (v1)
**Reason:** module UI must be DSL-only for v1 (view data consumed by `dsl-renderer`/`dsl-ui`). A module cannot ship raw React components as an alternative or escape hatch. EXPLICITLY DEFERRED, NOT PERMANENT, for v2 (Decision #30) -- modules shipping their own specialized component code is realistically expected eventually; v1 just doesn't build the (nontrivial) runtime frontend-plugin mechanism that would require. (Decision #16/#30)
**Covered by:** guiding-principles.md P-5.
**Superseded 2026-10-17 by Decision #69:** modules may now ship runtime-loaded components in `dsl-lib/`; views stay YAML.

### Embedding a module's own app in an iframe
**Reason:** rejected by the user (2026-10-17, Decision #69): it escapes the DSL composition model, splits theme/navigation/toasts across frames and leaves modules unable to combine with each other's slots. Business components are loaded into the shell's own React tree instead.

### Running provider daemons inside app-core's process
**Reason:** the daemon itself (Orchestrator, Queue, Flow) is never loaded into app-core's process -- only the module it provides is. (Decision #3)
**Covered by:** guiding-principles.md P-1, P-2.

## How to challenge scope
If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
