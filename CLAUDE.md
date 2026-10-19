# app-core

## A/B testing UI variants

- Wire every variant into the normal page of the running app (real route, real modules), never only into a separate demo route.
- Use `useAbTest` and `<AbDock tests={[...]} />` from `@wadeck-app/dsl-ui` (sources in the dsl-view repo, `packages/dsl-ui/src/components/dev/`). One test = one row of the floating bar at the bottom center, so nobody types a URL.
- Declare a test in one call: `const tab = useAbTest({ id, label, initial, options: { key: { label, hint } } })`, apply `tab.value`, render `<AbDock tests={[tab]} />`. The hint of each option is its tooltip: say what it changes.
- The dock hides itself outside development; the choice is stored under `ab.<id>`, can be forced by a link (`?ab.<id>=<option>`) and follows other tabs. A row can be hidden; its choice stays applied.
- Before reporting it ready, click through every variant on the real page with agent-browser and check the console.
- Once a test is decided, bake the winner in and delete the losing variants and the `AbDock`. No test is open right now: `AppFrame` in `App.tsx` renders none.
