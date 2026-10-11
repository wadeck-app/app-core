# Threat Model -- Modular Plugin Platform

**Version:** 1.0
**Date:** 2026-10-10
**Methodology:** STRIDE

## Scope

<!-- What system boundaries and interactions this threat model covers. Fill in as spec evolves. -->
A local, single-user, trusted-users-only application that dynamically loads/unloads self-authored module code (frontend + backend) into app-core's own Node.js process. Covers: the module load/unload boundary inside app-core's process, and the daemon-to-app-core registration/update notification channel (Orchestrator, Queue, Flow). Per Decision #6, inter-module and module/app-core isolation is explicitly an accepted risk, not a mitigated one -- this threat model still names the risks for visibility, it does not silently skip them.

## Assets

What we are protecting:

| Asset | Sensitivity | Owner |
|---|---|---|
| app-core's shared Node process (hosts every loaded module) | High -- a crash or leak in one module affects all other modules and app-core itself (Decision #3, #9) | app-core |
| Module registry directory (`<app-core-config-dir>/modules/<id>.json`) | Medium -- controls which code gets loaded/swapped at runtime (Decision #14) | app-core |
| Per-module backend data (daemon-generated files, DB rows, CLI output a module reads) | Varies -- entirely the module's own concern, app-core has no visibility into it (Decision #4) | module / providing daemon |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| A buggy module (unintentional bug, not malicious) | None -- accidental resource exhaustion or crash | Runs with full access to app-core's process memory (Decision #3, #6) |
| Another local process on the same machine | Could write a fake entry to the module registry directory or call the registration endpoint directly | Local filesystem/network access on the same machine, same user account (Decision #6 explicitly accepts this as trusted) |

## STRIDE analysis

### Spoofing
Resolved as an accepted risk -- see T-03. No auth on the registration endpoint or module registry directory, consistent with Decision #6.

### Tampering
*(pending -- add decisions that affect data writes and transit)*

### Repudiation
*(pending)*

### Information Disclosure
*(pending -- add decisions that affect data exposure and access control)*

### Denial of Service
*(pending)*

### Elevation of Privilege
*(pending)*

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Denial of Service | A single faulty module (unhandled exception, infinite loop, memory leak) running in-process can take down app-core for every other module, since there is no process isolation (Decision #3) and no sandboxing (Decision #6). | None -- accepted risk by design. | Accepted risk | 3, 6 |
| T-02 | Elevation of Privilege / Information Disclosure | A loaded module has unrestricted access to app-core's process memory and to any other module's data; there is no permission boundary between modules (Decision #6). | None -- accepted risk by design. | Accepted risk | 6 |
| T-03 | Spoofing | A local process could send a fake "install module" / "new version" notification to app-core and get arbitrary code loaded and executed in-process. | None -- accepted risk, by extension of Decision #6 (local, trusted-users-only environment; no auth required on `/api/modules/register`/`/update` or on the module registry directory). | Accepted risk | 6 |

## Open security questions

<!-- Security findings that feed into _index.md open questions.
     Format: Q: <question> -> see Open Questions #N in _index.md -->
