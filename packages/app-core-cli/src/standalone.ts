import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeRegistryEntry } from '@wadeck-app/app-core-server/registry';
import { resolveModulesDir } from '@wadeck-app/app-core-server/configDir';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { resolveDevDependencies } from './devDependencies.js';
import { OUTPUT_DIR } from './outputDir.js';
import { validateManifestFile } from './validate.js';

export interface StandalonePlan {
  moduleId: string;
  version: string;
  // The folder that keeps the registry, data/ and state/ of this application: its own, not the one of a global app-core.
  configDir: string;
  // The modules the application loads, requirements first, the application's own module last.
  modules: Array<{ id: string; manifestPath: string }>;
}

// The module is the application: its manifest (or the folder holding it), built by `app-core-cli package`. The modules it requires
// are found in the node_modules of its package, as `dev` does, and loaded with it; nothing else is.
export function prepareStandalone(moduleArg: string, options: { configDir?: string; defaultConfigDir: (moduleId: string) => string }): StandalonePlan {
  const resolved = path.resolve(moduleArg);
  const moduleDir = path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
  const manifestPath = path.join(moduleDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`--module ${moduleArg}: no manifest.json in ${moduleDir}. Pass the built module folder (what "app-core-cli package" writes, ${OUTPUT_DIR}) or its manifest.json.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`${manifestPath} is not readable JSON: ${getErrorMessage(err)}. Fix the file.`);
  }
  if (typeof raw !== 'object' || raw === null || !('backendEntryPath' in raw) || typeof raw.backendEntryPath !== 'string') {
    throw new Error(
      `--module ${moduleArg}: ${manifestPath} is a source manifest (no backendEntryPath), which app-core cannot load. Build it first: "app-core-cli package <module-dir> --version <v>", then pass the resulting ${OUTPUT_DIR} folder.`,
    );
  }
  const checked = validateManifestFile(manifestPath);
  if (!checked.ok) {
    throw new Error(checked.message);
  }
  const moduleId = checked.manifest.id;
  const packageRoot = path.basename(moduleDir) === OUTPUT_DIR ? path.dirname(moduleDir) : moduleDir;
  const dependencies = resolveDevDependencies({ id: moduleId, dir: packageRoot, requires: Object.keys(checked.manifest.requires ?? {}) }, {});
  const configDir = path.resolve(options.configDir ?? options.defaultConfigDir(moduleId));
  return {
    moduleId,
    version: checked.manifest.version,
    configDir,
    modules: [...dependencies.map((d) => ({ id: d.id, manifestPath: d.manifestPath })), { id: moduleId, manifestPath }],
  };
}

// Writes the registry of the application: exactly its modules (an entry of an earlier run that is no longer part of it must not load
// again). The data and state of the modules are kept.
export function writeStandaloneRegistry(plan: StandalonePlan): void {
  const modulesDir = resolveModulesDir(plan.configDir);
  try {
    fs.rmSync(modulesDir, { recursive: true, force: true });
  } catch (err) {
    throw new Error(`Could not clear the registry ${modulesDir} of the previous run: ${getErrorMessage(err)}. Stop whatever uses it, or delete the folder by hand.`);
  }
  for (const m of plan.modules) {
    writeRegistryEntry(modulesDir, { id: m.id, source: { type: 'file', path: m.manifestPath } });
  }
}
