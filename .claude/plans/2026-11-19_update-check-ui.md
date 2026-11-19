# Update check: indicator and deeper health test

Approved by the user (2026-11-19): phases 1 and 2; phase 3 (restart with rollback watchdog) dropped.

## Today

- Every `app-core-cli` start, `serve` included, spawns the detached updater (`cli.ts:73`): one check per 30 minutes, auto-apply, staged install, health test `cli version`, rollback if a check fails.
- The check runs only at launch; the UI shows nothing; `update-state.json` is read by no app-core code.

## Phase 1: indicator

- `GET /api/app-update` reads `update-state.json` and `update-cache.json` of the CLI config dir; no network. Returns the running version, the installed one, the latest known, the status, the previous version, the failure.
- Top bar icon, hidden when running = installed = latest. Green: "X is installed, restart to use it". Orange: "update to X failed: step, message, log file".
- "Restart" button in its popover, same as the tray's restart. The shell waits for the server, sees the new version, reloads. The restart route is a route that changes something: it follows `2026-11-19_mutating-routes-protection.md`.
- The running server starts the updater again every few hours; the 30 minute cache makes each call a file read.
- Per machine: `config.yml` `disabled: true` freezes it; nothing to coordinate.

## Phase 2: health test that runs the server

Replaces the default `cli version` test through `healthCheck` (input: `packageDir`, `entry`, `configDir`, `timeoutMs`; returns `{ ok, output }`; must not write to `configDir`).

1. Start the staged bundle: `node <entry> serve --port 0 --no-tray --no-update --config-dir <temp>`; wait for its port file.
2. Check the served shell: `/` is HTML, every asset it references answers 200, `/build-info.json` carries the staged version.
3. Load the modules: the temp registry is a copy of the real one (entries only, data stays apart). Every module registered on this machine must load, and `/api/modules` must list the same ids as the running server. A module that loads today and not on the staged version fails the update.
4. Ask each module for its own check (decision D7): `GET /api/modules/<id>/health` answers `{ ok, checks: [{ name, ok, detail? }] }`; the module tests what matters to it (its connections to other systems, its data). 404 = nothing proposed: fall back to the base pages of that module (page routes without `:param`: the view resolves and its GET sources answer without a 5xx). A 200 not in that format fails loudly.
5. Always stop the child and its tree; the output of a failure names the module, the check and the server log tail.

Each module owner decides what "it runs" means for their module; a module without a check is still covered by its pages. Nothing is listed in app-core.

Unverified: whether `serve` with a copied registry leaves module daemons alone; which backends talk to other systems at load time.
