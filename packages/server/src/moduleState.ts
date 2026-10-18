import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from './errors.js';

// Per-module state under the config dir. The module id is validated (MODULE_ID_PATTERN) before it gets
// here, so it never contains a path separator.
export function resolveDataDir(configDir: string, id: string): string {
  return path.join(configDir, 'data', id);
}

export function resolveStatePath(configDir: string, id: string): string {
  return path.join(configDir, 'state', `${id}.json`);
}

// The last version of the module that loaded successfully; null on first install.
// A state file that cannot be read is an error: guessing "first install" would skip a needed migrate.
export function readPreviousVersion(configDir: string, id: string): string | null {
  const file = resolveStatePath(configDir, id);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(`module "${id}": cannot read its state file ${file}: ${getErrorMessage(err)}. Fix the file permissions, or delete the file to load the module as a first install (migrate will not run).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw corrupt(id, file, `is not valid JSON (${getErrorMessage(err)})`);
  }
  const version = typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
  if (typeof version !== 'string' || version === '') {
    throw corrupt(id, file, 'has no "version" string');
  }
  return version;
}

function corrupt(id: string, file: string, why: string): Error {
  return new Error(
    `module "${id}": its state file ${file} ${why}. app-core wrote it to remember the last loaded version. ` +
      `Fix: restore it to {"version":"<last loaded version>"}, or delete it to load the module as a first install (migrate will not run).`,
  );
}

// Written only after a successful setup, through a temp file so a crash never leaves half a file.
export function writeLoadedVersion(configDir: string, id: string, version: string): void {
  const file = resolveStatePath(configDir, id);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ version })}\n`);
    fs.renameSync(temp, file);
  } catch (err) {
    throw new Error(`module "${id}": cannot record the loaded version in ${file}: ${getErrorMessage(err)}. Fix the permissions of ${path.dirname(file)}, then register the module again.`);
  }
}

export function clearModuleState(configDir: string, id: string): void {
  const file = resolveStatePath(configDir, id);
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    throw new Error(`module "${id}": cannot delete its state file ${file}: ${getErrorMessage(err)}. Delete it by hand so a later install of the module is not seen as an update.`);
  }
}
