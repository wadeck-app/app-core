import * as fs from 'node:fs';
import * as path from 'node:path';

// Decision #14: `<app-core-config-dir>/modules/<id>.json` IS app-core's module
// registry -- not a separate "pending" dropbox. Both app-core (on a successful
// HTTP push) and a daemon (on the fallback path) write to the exact same files.
export interface RegistryEntry {
  id: string;
  source: { type: 'file'; path: string };
}

export function writeRegistryEntry(modulesDir: string, entry: RegistryEntry): void {
  fs.mkdirSync(modulesDir, { recursive: true });
  const file = path.join(modulesDir, `${entry.id}.json`);
  fs.writeFileSync(file, JSON.stringify(entry, null, 2), 'utf8');
}

export function readRegistryEntries(modulesDir: string): RegistryEntry[] {
  if (!fs.existsSync(modulesDir)) return [];
  const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.json'));
  const entries: RegistryEntry[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(modulesDir, file), 'utf8');
    entries.push(JSON.parse(raw) as RegistryEntry);
  }
  return entries;
}
