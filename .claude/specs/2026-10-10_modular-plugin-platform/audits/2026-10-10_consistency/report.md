# Audit Report -- Consistency + Completeness -- Modular Plugin Platform

**Date:** 2026-10-10
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Reviewed `_index.md`, `guiding-principles.md`, `out-of-scope.md`, `threat-model.md`, `module-contract.md`, `daemon-registration.md` against the actual conversation (user's exact statements/decisions), checking for: contradictions between files, decisions misattributed or paraphrased beyond what the user said, and gaps in guiding-principles/out-of-scope/threat-model coverage relative to decisions already made.

## Executive summary

Decisions themselves are accurately attributed to what the user actually said -- no fabrication found this pass. The main defect is a non-negotiable rule violation (French quotes embedded in rationale columns throughout, rule 9 requires English-only) and one direct cross-file contradiction (T-03's status disagrees between threat-model.md and the two module files). Several completeness gaps are minor and low-risk.

## Findings

| ID | Severity | Finding | File / Section | Recommendation |
|---|---|---|---|---|
| F1 | HIGH | Decision Log rationale columns contain raw French user quotes (Decisions #3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16) across `_index.md`, `module-contract.md`, `daemon-registration.md`. Violates spec-mode's non-negotiable rule 9 ("English only... No French, no mixed language. This rule has no exceptions"). | `_index.md` Decision Log (multiple rows); `module-contract.md` Decisions table; `daemon-registration.md` Decisions table | Translate every quoted rationale to English (paraphrase preserving meaning), or replace with an English summary of the user's point instead of a direct quote. |
| F2 | HIGH | T-03 (Spoofing) is marked "Accepted risk" in `threat-model.md` (Mitigations table + STRIDE Spoofing section), but `module-contract.md` Security considerations and `daemon-registration.md` Security considerations still say "still open" / "Still open per threat-model.md" -- direct contradiction. | `module-contract.md` line 49; `daemon-registration.md` line 47 | Update both to say "Accepted risk, see threat-model.md T-03" instead of "still open". |
| F3 | MEDIUM | Decision #13 documents the fallback file path as `<app-core-config-dir>/pending-modules/<id>.json`. Decision #14 supersedes this with `<app-core-config-dir>/modules/<id>.json`, but Decision #13's own row is not marked as superseded -- a reader of #13 alone would get the wrong path. | `_index.md` Decision #13 row; `daemon-registration.md` Decision #13 row | Add "(path superseded by Decision #14)" to Decision #13's text in both files. |
| F4 | MEDIUM | `threat-model.md` Assets and Threat actors tables are still placeholder ("none identified yet") even though the Mitigations table and multiple decisions already name concrete assets (app-core's shared process, the module registry directory, per-module data) and actors (a buggy/malicious local module, another local process). | `threat-model.md` Assets / Threat actors sections | Fill in both tables from what T-01/T-02/T-03 and Decisions #3/#6/#12-14 already imply. |
| F5 | LOW | Decision #16 (DSL-only UI, no React escape hatch) is a durable, recurring design constraint but has no corresponding entry in `guiding-principles.md` (only P-1 through P-4 exist, covering process boundary and agnosticism, not UI authoring). | `guiding-principles.md` | Consider adding a P-5 principle for DSL-only UI authoring, since it will govern every future module-authoring decision, not just this one. |
| F6 | LOW | `out-of-scope.md` does not list "arbitrary React in a module's UI" as an excluded item, even though Decision #16 explicitly excludes it. | `out-of-scope.md` | Add an excluded item entry mirroring Decision #16, same root cause as F5. |
| F7 | LOW | "wdrive" is named as a real example daemon in Decision #5's rationale (and confirmed to exist as `C:\Workspace_Tooling\wdrive` in the workspace), but it was never added to the spec's roster of in-scope provider daemons -- the Summary and `guiding-principles.md` P-1 only name Orchestrator/Queue/Flow. | `_index.md` Summary; `guiding-principles.md` P-1 | Clarify with the user whether wdrive is in scope alongside Orchestrator/Queue/Flow, or was purely an illustrative aside. |
| F8 | INFO | `_index.md` Status field has stayed static ("In Progress") through 16 decisions, never updated with a running resolved-count as the spec-mode protocol (step 4d) calls for. | `_index.md` header | Update Status to reflect current progress, e.g. "In Progress -- v0.1 -- 16 decisions logged, 0 open questions". |

## New open questions raised

- Is "wdrive" an in-scope provider daemon alongside Orchestrator/Queue/Flow, or just an example the user used in passing? (see F7)
