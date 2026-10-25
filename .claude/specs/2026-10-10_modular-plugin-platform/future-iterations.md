# Future Iterations -- Modular Plugin Platform

Ideas and items explicitly deferred, not forgotten. Nothing here is current scope -- revisit when actually needed, don't build toward these preemptively.

## app-core's own backlog

### Middleware-style module hooks
A module can only register handlers for its own specific paths (`moduleContext.registerRoute()`, Decision #26) via the single catch-all Fastify route + lookup table (Decision #26's design). There is no way for a module to hook into every app-core request (no `onRequest`/`preHandler`-style cross-cutting hook exposed to modules).
**Deferred:** 2026-10-11 (Decision #35). **Reason:** not needed by any real module yet; same deferred-not-permanent treatment as npm sourcing (Decision #11) and modules shipping their own components (Decision #30).

### Closing long-lived responses on unload
A module route that streams (SSE log tail through `reply.hijack()`) keeps running after the module is unloaded or swapped: the route disappears but the already-open response and its raw timers live until the browser tab closes. Idea: track hijacked responses per module and destroy them on dispose so clients reconnect to the new version. Needs a way to tell a streaming response from a normal one in flight.
**Deferred:** 2026-10-17 (reported by orch-owner). **Reason:** no leak across reloads, only until the client disconnects; not needed yet.
**Delivered 2026-10-17 (Decision #74):** on unload, swap or unregister the module's responses that already sent headers and have not finished are destroyed.

### npm-sourced module registration
`{ type: 'npm', package, version }` registration source exists in the schema but is rejected in v1.
**Deferred:** Decision #11. **Reason:** `file` source covers every real need so far; resolution mechanics (shell out to `npm install` vs. raw tarball fetch) are designed but unbuilt -- see module-contract.md.

### Modules shipping their own React components
Decision #16/P-5 mandates DSL-only module UI for v1. Realistically expected to come up eventually (a module needing something no generic `dsl-ui` component can express).
**Deferred:** Decision #30. **Reason:** requires a real runtime frontend-plugin system (foreign component code loaded into app-core's single running frontend, shared React instance, version conflicts) -- categorically harder than anything built so far, not needed by any real module yet.

### Module packaging (zip/link install/update/uninstall)
A module (backend + DSL frontend) packaged as a zip/link that app-core can install, replace, and uninstall at runtime -- distinct from today's `{ type: 'file', path }` source, which assumes a pre-built package already on local disk. Strictly install-replace-uninstall, one version at a time (Decision #48); same trusted/no-sandboxing stance as everything else (Decision #49); explicitly NOT bring-your-own-component (Decision #30/#50 -- stays its own separate, further-out v2 item).
**Deferred:** 2026-10-11. **Reason:** user wants to focus on getting one real end-to-end thing working first (`queue`'s real module registering with app-core) before taking on new scope.
**See:** module-packaging.md -- design sketch and the A/B source-type question are captured there, ready to pick up.

### TODO: refactor and extract the dashboard into an app-module
The dashboard (lattice of 100px cells, free drag-and-drop placement, module filter, refresh, hide, layout kept in the browser) is part of the frontend shell: `Dashboard.tsx`, `dashboardLayout.ts`, `useDashboardState.ts`, `WidgetCell.tsx`, `DragGuides.tsx`. The idea is to make it a module like the others (a page in the nav that collects the `widget`/`dashboard` extension points), so the shell keeps only the slots.
**Deferred:** 2026-10-25 (user decision: keep it included for now). **Reason:** a module can only render DSL today (Decision #16/#30), and the dashboard needs pointer drag, measured layout and widget hosting, which DSL cannot express; extracting it needs the frontend-plugin system above or new DSL primitives.

## Upstream asks pending (dsl-view, not app-core's own backlog)

### `entriesGenerator` lazy/code-split option
Filed as a feature request to dsl-owner (Decision #29's finding). `@registryLazy` opt-in tag approach is in progress on dsl-view's side as of 2026-10-11.

### `ExtensionSlot` DSL primitive
Needed for module-to-module extension points (Decision #32/#33). Design conversation with dsl-owner started 2026-10-11, not yet resolved -- see extension-slots.md "Open design details."

### `useSourceLoader` silent-skip warning
Fixed by dsl-owner (`console.warn` in `useSourceLoader.ts`) but pending the user's own review/merge on the dsl-view side as of 2026-10-10 -- see Decision #27.
