# app-core

## A/B testing UI variants

- Wire every variant into the normal page of the running app (real route, real modules), never only into a separate demo route.
- Declare each test with `useAbTest` and render `<AbDock tests={[...]} />` (`packages/frontend-shell/src/layout/AbSwitcher.tsx`, `useAbTest.ts`). `AbSwitcher.test.tsx` is a complete example.
- One test = one row of the floating bar at the bottom center, so nobody types a URL: the name on the left (muted, apart from the options), a tooltip on every option saying what it changes, a hide button (the choice stays applied).
- The dock hides itself outside development (`isDev.ts`); the choice is stored under `ab.<id>`, can be forced by a link (`?ab.<id>=<option>`) and follows other tabs.
- Before reporting it ready, click through every variant on the real page with agent-browser and check the console.
- Once a test is decided, bake the winner in, delete the losing variants and its row. No test is open right now: `AppFrame` in `App.tsx` renders no `AbDock`.
