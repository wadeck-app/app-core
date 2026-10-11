import { createRegistry } from '@wadeck-app/dsl-renderer';
import { allEntries } from './generated/entries.js';

// Real dsl-ui component catalogue, auto-generated at build time by
// @wadeck-app/dsl-renderer's entriesGenerator (see vite.config.ts). No
// registry overrides: app-core has no custom component package of its own
// (unlike orchestrator's orch-ui).
export const appRegistry = createRegistry(allEntries);
