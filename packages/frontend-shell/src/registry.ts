import { createRegistry, type ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';
import { allEntries } from './generated/entries.js';

// Real dsl-ui component catalogue, auto-generated at build time by
// @wadeck-app/dsl-renderer's entriesGenerator (see vite.config.ts). Modules add
// their own components at runtime (dsl-lib) under a `<moduleId>:` prefix.
export const appRegistry = createRegistry(allEntries);

const keysByModule = new Map<string, string[]>();

export function unregisterModuleEntries(moduleId: string): void {
  for (const key of keysByModule.get(moduleId) ?? []) {
    delete appRegistry[key];
  }
  keysByModule.delete(moduleId);
}

// Registers a module's components as `<moduleId>:<entry.name>`; replaces any previous set of that module.
export function registerModuleEntries(moduleId: string, entries: ComponentRegistryEntry[]): void {
  unregisterModuleEntries(moduleId);
  const prefixed = createRegistry(entries.map((entry) => ({ ...entry, name: `${moduleId}:${entry.name}` })));
  Object.assign(appRegistry, prefixed);
  keysByModule.set(moduleId, Object.keys(prefixed));
}
