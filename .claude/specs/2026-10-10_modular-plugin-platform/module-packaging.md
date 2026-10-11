# Module Packaging -- Modular Plugin Platform

**Version:** v0.1
**Last updated:** 2026-10-11
**Status:** DEFERRED to a future iteration (2026-10-11) -- documented for later, not current work. User: "defer a une iteration 2! faut que je me focus sur juste un premier truc qui fonctionne."

## Overview

A module (backend + DSL frontend) packaged as a zip/link that app-core can install, replace (update), and uninstall at runtime -- a new registration source distinct from today's `{ type: 'file', path }` (Decision #10), which assumes the package already exists, pre-built, on local disk. Does NOT cover bring-your-own-component (Decision #30, stays v2-deferred) or any new security/sandboxing model (Decision #6/#49 extend unchanged).

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 48 | Strictly install-replace-uninstall, one version at a time -- no multi-version coexistence. | User confirmed. | 2026-10-11 |
| 49 | Security/trust stance (Decision #6) extends unchanged -- dynamically loaded frontend JS from a module package is not a different risk tier. | User confirmed. | 2026-10-11 |
| 50 | Bring-your-own-component stays v2-deferred (Decision #30) -- not in scope for this feature. Keep the design from foreclosing it later, but do not build toward it now. | User confirmed. | 2026-10-11 |

## Design

<!-- Architecture, data flow, contracts, schema, etc. Fill in as decisions are made. -->

## Open questions

<!-- Questions specific to this module that are also in _index.md > Open Questions. -->
- (DEFERRED, resolve when this iteration starts) What does "zip/link" actually mean -- finally building the already-deferred `{ type: 'npm' }` source (Decision #10/#11), or a new, simpler, registry-agnostic mechanism (fetch a zip from any URL, extract, install -- no npm semantics)? Two options sketched and ready to pick up: (A) build the already-deferred npm source (reuse `npm install` + existing registry auth), (B) a new, simpler registry-agnostic zip-URL/path source (no npm semantics, no auth). Leaning B based on literal wording ("zip/link" not "npm package") and the trusted/no-security-model context making npm's auth machinery unnecessary -- not decided, just the leading candidate for whoever picks this up.

## Security considerations

<!-- STRIDE findings relevant to this module. Cross-reference threat-model.md. -->
Decision #6/#49 apply unchanged -- no new sandboxing/auth model for this feature.
