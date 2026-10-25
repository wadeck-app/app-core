# app-core

## A/B testing UI variants

- Wire every variant into the normal page of the running app (real route, real modules), never only into a separate demo route.
- Use `useAbTest` from `@wadeck-app/dsl-ui` and show the test in the dock (`useDockTests`, or `<AbDock tests={[...]} />` where no host is mounted) (sources in the dsl-view repo, `packages/dsl-ui/src/components/dev/`). One test = one row of the floating bar at the bottom center, so nobody types a URL.
- Declare a test in one call: `const tab = useAbTest({ id, label, initial, options: { key: { label, hint } } })`, apply `tab.value`, render `<AbDock tests={[tab]} />`. The hint of each option is its tooltip: say what it changes.
- The dock hides itself outside development; the choice is stored under `ab.<id>`, can be forced by a link (`?ab.<id>=<option>`) and follows other tabs. A row can be hidden; its choice stays applied.
- Before reporting it ready, click through every variant on the real page with agent-browser and check the console.
- Once a test is decided, bake the winner in and delete the losing variants and the `AbDock`. No shell test is open right now (decided: the side menu is fixed as AppShell draws it; the dashboard is a lattice of 100px square cells, 16px apart, where the user drops a widget on any cell, empty cells above it included: cells drawn under the widgets, a target snapped to them, only the widgets in the way go down, live while it is held; `dashboardLayout.ts`). `App.tsx` mounts the dsl-ui `<AbExperiments>` host once: the shell's tests join its single dock with `useDockTests(tests)` (instead of rendering their own `<AbDock>`), next to the `AbTest` nodes that module views declare. To see the dock you need the Vite dev server (`npm run dev` in `packages/frontend-shell`; `APP_CORE_API=<url>` points its proxy at another app-core than the one on 4850). After changing dsl packages in node_modules, restart the dev job (`orch restart-job app-core-dev`): the running Vite keeps the old bundles and shows a blank page.

## dsl packages

- Always take the latest `@wadeck-app/dsl-ui` and `@wadeck-app/dsl-renderer` when dsl-owner publishes (standing instruction of the user). `npm install @wadeck-app/dsl-renderer@latest @wadeck-app/dsl-ui@latest`, then put `"latest"` back in the root `package.json` and in the root entry of `package-lock.json` (npm rewrites them to a caret range), build, test, commit.
- Then ask orch-owner for `orch restart-job app-core-dev` right away: a running Vite keeps the old bundles and shows a blank page, and the server reads `public/build-info.json` only at start (refresh it with `npm run build:full` first when the shell served on 4850 must carry the new versions).

## Tray icon (app-core-cli)

- `packages/app-core-cli/tray-go`, `src/tray/trayProcess.ts`, `src/tray/trayBinary.ts` and `ci/scripts/*-platform-packages.sh` are copies of the orchestrator's (wdrive has its own `tray-go` too). A third copy is not acceptable: when another project needs a tray, or one of these files needs a fix, extract them into a shared package first. Details: `packages/app-core-cli/docs/tray.md`.
- The tray binary ships in `@wadeck-app/app-core-cli-<platform>` packages published by CI only when its hash changes; `optionalDependencies` pins them exactly. Never ship the binary in the main package.
- Titles in the tray menu are ASCII only (the Go pipe corrupts anything else); `tray.test.ts` enforces it.
- The tray lives and dies with its server (`serve` green, `dev` and `dev:all` blue, amber when there is something to look at) and never polls: its menu changes only after a click.
