# Extension Slots -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-11
**Status:** Draft

## Overview

Lets one module contribute UI into another module's view (e.g. `queue`'s subscriber-list page accepting metadata contributions from another module), without app-core needing to know what any given slot "means." Does NOT define the base app-core slots (dashboard/nav -- see frontend-shell.md) -- this is a second, module-to-module layer on top of those.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 32 | `dsl-ui` gains an `ExtensionSlot` component type (`{ $type: "ExtensionSlot", slot: "<name>" }`). The renderer resolves it by asking app-core for every registered `extensionPoint` whose `slot` matches, and renders each one inline. app-core brokers the match generically -- agnostic of slot meaning (Decision #4/P-3). | Cleanest fit with DSL-only (P-5); no bespoke per-module wiring. | 2026-10-11 |
| 33 | Slot contracts (typed/validated context shape) are owned and published by the PROVIDING module (e.g. `queue` publishes its `subscriber-row` slot's type+zod schema from its own `app-module` package), not centralized in app-core/app-core-sdk. Versioning reuses the provider's own package version -- no separate slot-version scheme. A contributor module depends on the provider's published contract package directly, so drift surfaces as a type error or zod parse failure, not silent breakage. `app-core-sdk` ships a generic `assertSlotContract(schema, value)` test-harness helper any provider uses in its own tests to catch its own schema/runtime drift. | User: wants typed, versioned contracts with a test harness forcing clean dependencies; decentralizing keeps app-core agnostic rather than becoming a bottleneck for contracts it has no business knowing about. | 2026-10-11 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

### Example: queue's subscriber-row slot
1. `queue`'s `app-module` package exports a zod schema + inferred TS type for what a `subscriber-row` contribution looks like (e.g. `{ subscriberId: string }` as the context passed to contributors) from its own published package (not app-core-sdk).
2. `queue`'s subscriber-list page DSL includes `{ $type: "ExtensionSlot", slot: "queue:subscriber-row", context: { subscriberId: "$row.id" } }` per row.
3. Another module declares an `extensionPoint` with `slot: "queue:subscriber-row"` in its own manifest, importing `queue`'s published contract package to type-check its contribution against queue's actual schema.
4. app-core, resolving any page containing an `ExtensionSlot` node, looks up every registered module's `extensionPoints` with a matching `slot` string and includes their resolved views in the response -- purely string matching, no semantic knowledge of what "queue:subscriber-row" means.

### Slot naming convention
`<provider-module-id>:<slot-name>` (e.g. `queue:subscriber-row`) -- prevents accidental collisions between unrelated modules reusing a generic name like `row` or `footer`.

### Open design details (not yet decided)
- Exact `ExtensionSlot` DSL node shape/params (context passing, multiple-contribution ordering) -- needs a cross-session design conversation with dsl-owner.
- Whether app-core's existing `GET /api/modules` response needs a new field/endpoint to expose "all extensionPoints for slot X" efficiently, or whether this is computed fresh per `ExtensionSlot` render.

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
- `ExtensionSlot` DSL node design -- pending a conversation with dsl-owner (not yet started).

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
No new STRIDE surface beyond what's in threat-model.md -- same accepted-risk posture (Decision #6) applies; a module contributing to another's slot is just another instance of the agnostic in-process trust model.
