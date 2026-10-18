// File names inside ctx.dataDir, shared by the backend and its two hooks (each is bundled on its own).
export const TICKS_FILE = 'ticks.json';
// Where an older version kept the counter; `migrate` renames it.
export const LEGACY_TICKS_FILE = 'counter.json';
// Present while an instance is running; `teardown` removes it.
export const RUNNING_FILE = 'running.json';
// One line per closed SSE stream: proof that the cleanup in the route ran.
export const EVENTS_LOG = 'events.log';
// One line per migration.
export const MIGRATIONS_LOG = 'migrations.log';
// One line per teardown, with the reason app-core gave.
export const TEARDOWNS_LOG = 'teardowns.log';
