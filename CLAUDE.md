# app-core

## A/B testing UI variants

- Wire every variant into the normal page of the running app (real route, real modules), never only into a separate demo route.
- Add a large floating switcher at the bottom center so nobody types a URL. Reference: `packages/frontend-shell/src/layout/LayoutSwitcher.tsx`.
- Gate it with `import.meta.env.DEV` and persist the choice in `localStorage`.
- Before reporting it ready, click through every variant on the real page with agent-browser and check the console.
