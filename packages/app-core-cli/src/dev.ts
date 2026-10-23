import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { writeRegistryEntry } from '@wadeck-app/app-core-server/registry';
import { resolveModulesDir } from '@wadeck-app/app-core-server/configDir';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { writeLoadedVersion } from '@wadeck-app/app-core-server/moduleState';
import { OUTPUT_DIR } from './outputDir.js';
import { packageModule } from './package.js';
import { LINK_USAGE, parseLinkValue, type Links } from './providers.js';
import { validateManifestFile } from './validate.js';
import { resolveDevDependencies } from './devDependencies.js';
import { watchSources, type SourceWatcher } from './watchSources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The version a source module is packaged with under dev: printed, and never mistaken for a release.
export const DEV_VERSION = '0.0.0-dev';
export const DEBOUNCE_MS = 200;
// Where dev keeps the registry, data/ and state/ of the modules it runs, inside the module folder (gitignore it).
export const DEV_CONFIG_DIR = '.app-core-dev';
export const DEV_USAGE = `app-core-cli dev <module-dir> [--port <n>] [--watch [--poll]] [--reset] [--no-tray] [--previous-version <v>] [${LINK_USAGE}]... [--id <module-id>]`;

export type RebuildResult =
  | { ok: true; durationMs: number; version: string; warnings: string[] }
  | { ok: false; durationMs: number; error: string };

export interface DevOptions {
  moduleId?: string;
  port?: number;
  // Rebuild and hot-update the module under development when src/ or manifest.json change (source modules only).
  watch?: boolean;
  // With watch: poll mtimes instead of fs.watch.
  poll?: boolean;
  // Package name -> folder, for required modules that are not installed in node_modules (see providers.ts).
  links?: Links;
  // Wipe <module-dir>/.app-core-dev (data/ and state/ of every module dev runs) before starting.
  reset?: boolean;
  // Persist this as the module's last loaded version before starting, so its migrate hook runs with it as previousVersion.
  previousVersion?: string;
  // Where the registry, data/ and state/ live instead of <module-dir>/.app-core-dev (mainly for tests that must not write into the repo).
  configDir?: string;
  // Called after every rebuild; required with watch, so no result is ever dropped.
  onRebuild?: (result: RebuildResult) => void;
  // Called when the file watcher itself fails; required with watch.
  onWatchError?: (message: string) => void;
}

export interface DevModuleInfo {
  id: string;
  version: string;
  role: 'under development' | 'dependency';
  // Where it came from, for the startup summary.
  origin: string;
}

export interface DevHandle {
  port: number;
  url: string;
  moduleId: string;
  // The config dir the server runs on (<module-dir>/.app-core-dev): kept by close(), so data/ and state/ survive.
  configDir: string;
  // True when --reset found something to wipe.
  resetPerformed: boolean;
  // Dependencies first, the module under development last.
  modules: DevModuleInfo[];
  // Non-fatal findings of the first packaging (e.g. unreferenced views).
  warnings: string[];
  watch?: Pick<SourceWatcher, 'mode' | 'description'>;
  // Set when the module under development failed to load at start but watch is on (the next successful rebuild fixes it).
  startupFailure?: string;
  close: () => Promise<void>;
}

export interface DevArgs {
  moduleId?: string;
  port?: number;
  watch: boolean;
  poll: boolean;
  reset: boolean;
  /** No tray icon next to the dev server. */
  noTray: boolean;
  previousVersion?: string;
  links: Links;
}

// `--id`, `--port`, `--watch`, `--poll`, `--reset`, `--previous-version` and `--link` (repeatable); anything else is an error (no silently ignored typo).
export function parseDevArgs(args: string[]): DevArgs {
  const parsed: DevArgs = { watch: false, poll: false, reset: false, noTray: false, links: {} };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    switch (flag) {
      case '--watch':
        parsed.watch = true;
        break;
      case '--poll':
        parsed.poll = true;
        break;
      case '--reset':
        parsed.reset = true;
        break;
      case '--no-tray':
        parsed.noTray = true;
        break;
      case '--previous-version':
        if (value === undefined || value.startsWith('--')) {
          throw new Error('--previous-version needs a version, e.g. --previous-version 1.0.0 (the version migrate should think it upgrades from).');
        }
        parsed.previousVersion = value;
        i += 1;
        break;
      case '--id':
        if (value === undefined || value.startsWith('--')) {
          throw new Error('--id needs a value, e.g. "app-core-cli dev ./app-module-orchestrator --id orchestrator".');
        }
        parsed.moduleId = value;
        i += 1;
        break;
      case '--port': {
        const port = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(`--port needs a port number between 0 and 65535, got ${value === undefined ? 'nothing' : `"${value}"`}, e.g. --port 4850.`);
        }
        parsed.port = port;
        i += 1;
        break;
      }
      case '--link': {
        const [name, folder] = parseLinkValue(value);
        parsed.links[name] = folder;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown option "${flag}". Usage: ${DEV_USAGE}`);
    }
  }
  if (parsed.poll && !parsed.watch) {
    throw new Error('--poll only applies to --watch. Add --watch, or drop --poll.');
  }
  return parsed;
}

// The two fields dev reads before the manifest is validated as a whole.
interface RawManifest {
  id?: unknown;
  backendEntryPath?: unknown;
}

// The id a module registers under is the one its manifest declares (decision 83); a manifest without
// one is an error, there is no id guessed from the folder name.
function readManifestId(raw: RawManifest, manifestPath: string): string {
  const { id } = raw;
  if (typeof id !== 'string' || id === '') {
    throw new Error(`${manifestPath} has no "id". Every module declares its own id, add e.g. "id": "my-module" to the manifest.`);
  }
  return id;
}

function readManifestJson(manifestPath: string): RawManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`${manifestPath} is not readable JSON: ${getErrorMessage(err)}. Fix the file.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must hold a JSON object. Fix the file.`);
  }
  return parsed;
}

// The folder that holds package.json for a module: the parent of a built dist-module, else the folder itself.
function packageRootOf(moduleDir: string): string {
  return path.basename(moduleDir) === OUTPUT_DIR ? path.dirname(moduleDir) : moduleDir;
}

async function postUpdate(port: number, id: string, manifestPath: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/api/modules/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, source: { type: 'file', path: manifestPath } }),
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const error = (JSON.parse(body) as { error?: unknown }).error;
      detail = typeof error === 'string' ? error : body;
    } catch {
      // Not JSON: the raw body is the best detail there is.
    }
    throw new Error(`the server refused the update (HTTP ${response.status}): ${detail}`);
  }
}

// Boots the REAL server (buildServer, same code app-core's own index.ts uses)
// against the persistent config dir (<module-dir>/.app-core-dev), whose registry is rewritten each run with an entry for the
// given local module and every module it requires -- reuses the real loading logic
// rather than reimplementing it, so there's no drift between `dev` and production.
export async function runDev(appModuleDir: string, opts: DevOptions = {}): Promise<DevHandle> {
  // Accept the module folder, or its manifest.json directly.
  const resolved = path.resolve(appModuleDir);
  const moduleDir = path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
  const manifestPath = path.join(moduleDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${moduleDir}. Pass the module folder (the one containing manifest.json).`);
  }
  const links = opts.links ?? {};
  const raw = readManifestJson(manifestPath);
  const moduleId = readManifestId(raw, manifestPath);
  if (opts.moduleId !== undefined && opts.moduleId !== moduleId) {
    throw new Error(
      `--id "${opts.moduleId}" differs from the "id": "${moduleId}" declared in ${manifestPath}. Drop --id, or change the manifest id.`,
    );
  }
  if (opts.watch === true && (opts.onRebuild === undefined || opts.onWatchError === undefined)) {
    throw new Error('runDev with watch needs onRebuild and onWatchError callbacks: a rebuild result must never be dropped silently.');
  }

  // A built manifest names its backend; a source one is packaged first. Anything else cannot be loaded.
  const isBuilt = typeof raw.backendEntryPath === 'string';
  const isSource = !isBuilt && fs.existsSync(path.join(moduleDir, 'src'));
  if (!isBuilt && !isSource) {
    throw new Error(
      `${manifestPath} is a source manifest (no backendEntryPath) but ${moduleDir} has no src/ folder, so app-core cannot load it. Run "app-core-cli package <module-dir> --version <v>" and pass the resulting dist-module folder to dev, or pass the source module folder.`,
    );
  }
  if (opts.watch === true && !isSource) {
    throw new Error(
      `--watch needs a source module (a folder with src/ and a source manifest.json), but ${moduleDir} is built output. Pass the module folder instead of its dist-module.`,
    );
  }

  const warnings: string[] = [];
  let servedManifest = manifestPath;
  let packageRoot = packageRootOf(moduleDir);
  const outDir = path.join(moduleDir, OUTPUT_DIR);
  if (isSource) {
    // Same pipeline as `package` (check first, with its normal messages); the output is what the server loads.
    const packaged = await packageModule({ moduleDir, outDir, version: DEV_VERSION, links });
    warnings.push(...packaged.warnings);
    servedManifest = packaged.manifestPath;
    packageRoot = moduleDir;
  }
  const served = validateManifestFile(servedManifest);
  if (!served.ok) {
    throw new Error(served.message);
  }

  // Required modules, dependencies first; a failure here names the id and the fix, nothing is started.
  const dependencies = resolveDevDependencies({ id: moduleId, dir: packageRoot, requires: Object.keys(served.manifest.requires ?? {}) }, links);
  const modules: DevModuleInfo[] = [
    ...dependencies.map((d) => ({
      id: d.id,
      version: d.version,
      role: 'dependency' as const,
      origin: `package ${d.packageName} (${d.via === 'link' ? '--link' : 'node_modules'}) in ${d.root}, required by ${d.requiredBy.join(', ')}`,
    })),
    {
      id: moduleId,
      version: served.manifest.version,
      role: 'under development',
      origin: isSource ? `source ${moduleDir}, packaged into ${outDir} as ${DEV_VERSION}` : `built module ${servedManifest}`,
    },
  ];

  if (opts.previousVersion !== undefined && opts.previousVersion === served.manifest.version) {
    throw new Error(
      `--previous-version ${opts.previousVersion} is the version dev loads for "${moduleId}", so migrate would not run (it runs only when the previous version differs). Pass another version, e.g. --previous-version 0.0.1.`,
    );
  }

  // Kept between runs (data/ and state/ survive, so migrate can be exercised); only the registry is rewritten.
  const configDir = opts.configDir ?? path.join(packageRoot, DEV_CONFIG_DIR);
  let resetPerformed = false;
  if (opts.reset === true) {
    resetPerformed = fs.existsSync(configDir);
    try {
      fs.rmSync(configDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (err) {
      throw new Error(`--reset could not remove ${configDir}: ${getErrorMessage(err)}. Stop whatever uses its files (another dev run?) or delete the folder by hand.`);
    }
  }
  const modulesDir = resolveModulesDir(configDir);
  // Entries of an earlier run (a dependency no longer required, another --link) must not load again.
  try {
    fs.rmSync(modulesDir, { recursive: true, force: true });
  } catch (err) {
    throw new Error(`Could not clear the registry ${modulesDir} of the previous dev run: ${getErrorMessage(err)}. Stop whatever uses it, or delete the folder by hand.`);
  }
  if (opts.previousVersion !== undefined) {
    writeLoadedVersion(configDir, moduleId, opts.previousVersion);
  }
  for (const dependency of dependencies) {
    writeRegistryEntry(modulesDir, { id: dependency.id, source: { type: 'file', path: dependency.manifestPath } });
  }
  writeRegistryEntry(modulesDir, { id: moduleId, source: { type: 'file', path: servedManifest } });

  // dev's own bundled copy of the built frontend (packages/frontend-shell/dist,
  // copied here by scripts/bundle.mjs at build time) -- the server's own default
  // publicDir resolution assumes app-core's monorepo layout, which does not exist
  // once this package is installed standalone. See server.ts's `publicDir` option.
  const publicDir = path.join(__dirname, 'public');
  let watcher: SourceWatcher | undefined;
  let closing: Promise<void> | undefined;
  let rebuilding: Promise<void> = Promise.resolve();
  let debounce: NodeJS.Timeout | undefined;
  let stopped = false;
  let built: Awaited<ReturnType<typeof buildServer>>;
  try {
    built = await buildServer({ configDir, publicDir });
  } catch (err) {
    throw new Error(`${getErrorMessage(err)} (config dir ${configDir}; --reset wipes it)`);
  }
  const { server, manager } = built;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      stopped = true;
      clearTimeout(debounce);
      watcher?.close();
      // An in-flight rebuild finishes before the server goes away, so its update never hits a closed server.
      await rebuilding;
      await server.close();
    })();
    return closing;
  };

  try {
    // Port is hardcoded but overridable via env, same as the main server
    // (packages/server/src/port.ts), so `dev` doesn't collide with an
    // already-running instance.
    const envPort = process.env['APP_CORE_PORT'];
    const requestedPort = opts.port ?? (envPort ? Number(envPort) : 4850);
    await server.listen({ port: requestedPort, host: '127.0.0.1' });
    const address = server.server.address();
    const actualPort = typeof address === 'object' && address ? address.port : requestedPort;

    // A module that failed to load is reported, never served silently half-working. The module under
    // development may fail while watching: the next successful rebuild replaces it.
    const failed = manager.listFailed();
    const failures = failed.map((f) => `module "${f.id}" failed to load: ${f.error}`);
    const ownFailure = failed.find((f) => f.id === moduleId);
    if (failed.some((f) => f.id !== moduleId) || (ownFailure !== undefined && opts.watch !== true)) {
      throw new Error(`${failures.join('\n')}\nFix the problem above and run dev again.`);
    }

    if (opts.watch === true) {
      const onRebuild = opts.onRebuild as (result: RebuildResult) => void;
      const rebuildOnce = async (): Promise<void> => {
        const started = performance.now();
        try {
          const packaged = await packageModule({ moduleDir, outDir, version: DEV_VERSION, links });
          await postUpdate(actualPort, moduleId, packaged.manifestPath);
          onRebuild({ ok: true, durationMs: performance.now() - started, version: DEV_VERSION, warnings: packaged.warnings });
        } catch (err) {
          onRebuild({ ok: false, durationMs: performance.now() - started, error: getErrorMessage(err) });
        }
      };
      // One rebuild at a time; changes during a rebuild collapse into exactly one more.
      let pending = false;
      let loop: Promise<void> | undefined;
      const requestRebuild = (): void => {
        pending = true;
        loop ??= (async () => {
          try {
            while (pending && !stopped) {
              pending = false;
              await rebuildOnce();
            }
          } finally {
            loop = undefined;
          }
        })();
        rebuilding = loop;
      };
      watcher = watchSources(moduleDir, {
        mode: opts.poll === true ? 'poll' : 'auto',
        onChange: () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (!stopped) {
              requestRebuild();
            }
          }, DEBOUNCE_MS);
        },
        onError: opts.onWatchError as (message: string) => void,
      });
    }

    return {
      port: actualPort,
      url: `http://127.0.0.1:${actualPort}`,
      moduleId,
      configDir,
      resetPerformed,
      modules,
      warnings,
      watch: watcher === undefined ? undefined : { mode: watcher.mode, description: watcher.description },
      startupFailure: ownFailure === undefined ? undefined : failures.join('\n'),
      close,
    };
  } catch (err) {
    // Nothing is left running or on disk when startup fails.
    try {
      await close();
    } catch (closeErr) {
      throw new Error(`${getErrorMessage(err)}\nCleanup also failed: ${getErrorMessage(closeErr)}`);
    }
    throw err;
  }
}
