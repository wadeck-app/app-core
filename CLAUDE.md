# app-core

## A/B testing UI variants

- Wire every variant into the normal page of the running app (real route, real modules), never only into a separate demo route.
- One test = one row of the floating bar at the bottom center, so nobody types a URL. Reference: `packages/frontend-shell/src/layout/AbSwitcher.tsx` (`AbDock` + `AbTest`; see `tabHighlight.ts` for a test definition).
- Each row: the test name on the left (muted, apart from the options), a tooltip on every option saying what it changes, and a hide button (the choice stays applied).
- Gate it with `import.meta.env.DEV` and persist the choice in `localStorage`.
- Before reporting it ready, click through every variant on the real page with agent-browser and check the console.
- Once a test is decided, bake the winner in, delete the losing variants and its row, and keep the bar for the tests still open.
