import * as fs from 'node:fs';
import * as path from 'node:path';
import { MODULE_ID_PATTERN } from './moduleId.js';

// `<app-core-config-dir>/modules/<id>.json` IS app-core's module registry --
// not a separate "pending" dropbox. Both app-core (on a successful
// HTTP push) and a daemon (on the fallback path) write to the exact same files.
export interface RegistryEntry {
  id: string;
  source: { type: 'file'; path: string };
}

// Every registry path is built here, so an id can never escape the modules dir.
function registryFile(modulesDir: string, id: string): string {
  if (!MODULE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid module id "${id}": it must start with a letter or digit and contain only letters, digits, "_" and "-".`);
  }
  return path.join(modulesDir, `${id}.json`);
}

export function writeRegistryEntry(modulesDir: string, entry: RegistryEntry): void {
  const file = registryFile(modulesDir, entry.id);
  fs.mkdirSync(modulesDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entry, null, 2), 'utf8');
}

export function hasRegistryEntry(modulesDir: string, id: string): boolean {
  return fs.existsSync(registryFile(modulesDir, id));
}

// Returns whether a registry file existed (and was deleted).
export function removeRegistryEntry(modulesDir: string, id: string): boolean {
  const file = registryFile(modulesDir, id);
  if (!fs.existsSync(file)) {
    return false;
  }
  fs.rmSync(file);
  return true;
}

export function readRegistryEntries(modulesDir: string): RegistryEntry[] {
  if (!fs.existsSync(modulesDir)) {
    return [];
  }
  const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.json'));
  const entries: RegistryEntry[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(modulesDir, file), 'utf8');
    entries.push(JSON.parse(raw) as RegistryEntry);
  }
  return entries;
}
