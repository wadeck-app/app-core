import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getErrorMessage } from './errors.js';
import {
  createModuleContext,
  type ModuleContext,
  type ModuleHookContext,
  type ModuleLifecycleHook,
  type ModuleTeardownContext,
  type ModuleTeardownHook,
  type ModuleTeardownReason,
} from './moduleContext.js';
import { clearModuleState, readPreviousVersion, resolveDataDir, writeLoadedVersion } from './moduleState.js';
import { resolveHookTimeoutMs, runWithTimeout } from './hookTimeout.js';
import { ManifestIdMismatchError, parseManifest, type Manifest } from './manifest.js';
import { checkSharedRanges, resolveDslLib, type DslLibUrls, type SharedVersions } from './dslLib.js';
import { resolveView, resolveRawYaml } from './viewResolver.js';
import type { RegistryEntry } from './registry.js';
import { ModuleRouteRegistry } from './moduleRoutes.js';
import { formatContributionProblems, rootTypeOf, validateContributions, type ContributionProblem, type ProviderLookup } from './contributions.js';
import { orderByRequires, readRequiredIds } from './loadOrder.js';

const nodeRequire = createRequire(import.meta.url);

// A module whose requires or slot contributions cannot be honoured; the message lists each problem with its fix.
export class ModuleRequirementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleRequirementError';
  }
}

// The manifest file itself cannot be used (missing, unreadable, not JSON): the request was fine, the path or the file is not.
export class ManifestFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestFileError';
  }
}

// An error message ending in exactly one period, to be followed by more sentences.
function sentence(err: unknown): string {
  return getErrorMessage(err).replace(/\.?$/, '.');
}

function describeDefault(value: unknown): string {
  return value === undefined ? 'no default export' : `a ${typeof value}`;
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

export interface BackendEntryExports {
  // A module's backend entry is a plain ESM module. app-core is agnostic about
  // what it does once loaded -- the only contract app-core relies on is this
  // default export, called with the module's own moduleContext. A missing or
  // non-function default fails the load. The lifecycle hook files follow the same rule.
  default?: unknown;
}

type ImportedFunction = (ctx: never) => unknown;

export interface LoadedModule {
  id: string;
  manifest: Manifest;
  manifestDir: string;
  // The manifest file this instance was loaded from.
  source: string;
  moduleContext: ModuleContext;
  resolvedViews: Array<{ kind: string; slot: string; label?: string; view: unknown; rawYaml: string; order?: number; path?: string; width?: number; height?: number }>;
  // Cache-busted URLs of the module's runtime-loaded components (served from /api/modules/<id>/_lib/).
  dslLib?: DslLibUrls;
  // <configDir>/data/<id>/, the module's own persistent data (never deleted by app-core).
  dataDir: string;
  // What migrate receives; its teardown gets the same fields plus the reason and `instance`.
  hookContext: ModuleHookContext;
  // What the backend's default export (setup) returned, handed to teardown as `instance`.
  instance: unknown;
  teardown?: ModuleTeardownHook;
}

export interface ModuleManagerOptions {
  // Where the per-module data/ and state/ folders live: the same config dir as the registry.
  configDir: string;
  // Timeout for importing a backend and for each of setup, migrate and teardown. Defaults to
  // APP_CORE_HOOK_TIMEOUT_MS, or 30 s; an invalid env value throws when the manager is created.
  hookTimeoutMs?: number;
  // Versions of the shared singletons the served frontend was built with (from build-info.json);
  // undefined when unavailable, in which case dslLib.shared ranges cannot be verified.
  sharedVersions?: SharedVersions;
  // Receives warnings and teardown failures; defaults to a line on stderr.
  onWarning?: (message: string) => void;
}

function writeWarning(message: string): void {
  process.stderr.write(`[app-core] ${message}\n`);
}

// requirement: a module it requires is missing, failed, or does not fit; retried automatically when that changes.
// error: anything else (invalid manifest, setup or migrate threw, ...); only a new registration retries it.
export type FailureCause = 'requirement' | 'error';

export interface FailedModule {
  id: string;
  source: string;
  error: string;
  failedAt: string;
  cause: FailureCause;
}

// What a change did to the other modules, filled in even when the change itself throws.
export interface ChangeReport {
  // Modules unloaded because a module they require was unregistered, unloaded, failed or changed incompatibly (in teardown order).
  cascaded: string[];
  // Failed modules that were loaded again because what they require is back.
  recovered: string[];
  // Set when the change itself did not succeed. requirement: a required module is missing or does not fit.
  // rejected: refused by the checks that run before anything is replaced (the running version, if any, keeps serving).
  // failed: the running version was already torn down and the new one did not start.
  failure?: 'requirement' | 'rejected' | 'failed';
}

export function newChangeReport(): ChangeReport {
  return { cascaded: [], recovered: [] };
}

// Why a provider is gone, for the message of the modules that required it.
type ProviderLoss = { kind: 'unregistered' } | { kind: 'unloaded' } | { kind: 'failed'; detail: string };

function lossMessage(providerId: string, loss: ProviderLoss): string {
  const again = 'This module is loaded again automatically once it is back.';
  switch (loss.kind) {
    case 'unregistered':
      return `required module "${providerId}" was unregistered: register "${providerId}" again. ${again}`;
    case 'unloaded':
      return `required module "${providerId}" was unloaded: load "${providerId}" again. ${again}`;
    case 'failed':
      return `required module "${providerId}" failed: ${sentence(loss.detail)} Fix "${providerId}" first (GET /api/modules lists its error under "failed"). ${again}`;
  }
}

export class ModuleManager {
  private loaded = new Map<string, LoadedModule>();
  private failed = new Map<string, FailedModule>();
  private readonly hookTimeoutMs: number;
  // Per-module chain: loads, unloads and forgets of one id never interleave across their awaits. Locks are only
  // ever taken provider first, then the modules that require it, so they cannot deadlock (a require cycle between
  // loaded modules is refused at load).
  private queues = new Map<string, Promise<void>>();
  private shuttingDown = false;
  // Shared across all modules so routes stay scoped by moduleId (enforced in
  // ModuleRouteRegistry itself) and so server.ts's single catch-all dispatcher
  // route can look up any module's registered routes.
  readonly routeRegistry = new ModuleRouteRegistry();

  constructor(private readonly options: ModuleManagerOptions) {
    this.hookTimeoutMs = options.hookTimeoutMs ?? resolveHookTimeoutMs();
  }

  get(id: string): LoadedModule | undefined {
    return this.loaded.get(id);
  }

  list(): LoadedModule[] {
    return [...this.loaded.values()];
  }

  listFailed(): FailedModule[] {
    return [...this.failed.values()];
  }

  hasFailed(id: string): boolean {
    return this.failed.has(id);
  }

  // Forgets the recorded failure of an id (a rejected registration that left nothing behind).
  clearFailure(id: string): void {
    this.failed.delete(id);
  }

  // Loads (or reloads) a module. A failed load is recorded (and visible via listFailed) until the same id loads
  // successfully or is forgotten; the error is still thrown to the caller. Afterwards the modules that require
  // this one are revalidated (incompatible ones are unloaded), and failed modules whose requirements are now met
  // are loaded; both are listed in `report`.
  async loadFromEntry(entry: RegistryEntry, report: ChangeReport = newChangeReport()): Promise<LoadedModule> {
    let loaded: LoadedModule;
    try {
      loaded = await this.serialize(entry.id, () => this.attempt(entry, report));
    } catch (err) {
      // The running instance was torn down and the new one did not start: whoever required it loses it.
      if (report.failure === 'failed' && !this.loaded.has(entry.id)) {
        await this.cascadeUnload(entry.id, { kind: 'failed', detail: firstLine(this.failed.get(entry.id)?.error ?? getErrorMessage(err)) }, report);
      }
      throw err;
    }
    await this.revalidateDependents(entry.id, report);
    await this.recoverFailed(report);
    return loaded;
  }

  // One load attempt, inside the id's lock; records or clears the failure.
  private async attempt(entry: RegistryEntry, report: ChangeReport): Promise<LoadedModule> {
    const progress = { applied: false };
    try {
      const loaded = await this.load(entry, progress);
      this.failed.delete(entry.id);
      return loaded;
    } catch (err) {
      const requirement = err instanceof ModuleRequirementError;
      this.recordFailure(entry, getErrorMessage(err), requirement ? 'requirement' : 'error');
      report.failure = progress.applied ? 'failed' : requirement ? 'requirement' : 'rejected';
      throw err;
    }
  }

  // For a module that is known not to load without trying (e.g. a require cycle found at startup).
  recordFailure(entry: RegistryEntry, error: string, cause: FailureCause = 'error'): void {
    this.failed.set(entry.id, { id: entry.id, source: entry.source.path, error, failedAt: new Date().toISOString(), cause });
  }

  // Where a required module is looked up: among the loaded modules only, which is why the startup loads
  // them in `requires` order.
  private lookupLoaded(id: string): ProviderLookup {
    const provider = this.loaded.get(id);
    if (provider !== undefined) {
      return { found: true, provider: { version: provider.manifest.version, expose: provider.manifest.expose } };
    }
    const failure = this.failed.get(id);
    return failure === undefined
      ? {
          found: false,
          why: `module "${id}" is not loaded`,
          fix: `Register "${id}" first (it must be loaded before the modules that require it), then register this module again.`,
        }
      : {
          found: false,
          why: `module "${id}" failed to load (${failure.error.split('\n')[0]})`,
          fix: `Fix "${id}" first (GET /api/modules lists the full error under "failed"), then register this module again.`,
        };
  }

  // The manifest file as JSON; a file that does not exist or cannot be parsed is a ManifestFileError naming the path and the fix.
  private readManifestFile(id: string, manifestPath: string): unknown {
    let text: string;
    try {
      text = fs.readFileSync(manifestPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ManifestFileError(
          `module "${id}": the manifest ${manifestPath} does not exist. Fix: register the absolute path of the packaged manifest ("app-core-cli package" writes <module>/dist-module/manifest.json), or correct the path.`,
        );
      }
      throw new ManifestFileError(`module "${id}": cannot read the manifest ${manifestPath}: ${getErrorMessage(err)}. Fix: register the path of the packaged manifest.json file, and check its permissions.`);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ManifestFileError(`module "${id}": the manifest ${manifestPath} is not valid JSON (${getErrorMessage(err)}). Fix the file, or run "app-core-cli package" again.`);
    }
  }

  // Backend and hooks are loaded via dynamic import() with cache-busting (not a child process, not a vm
  // context) so a new version or a rewritten file always yields a fresh module instance instead of Node's
  // cached one.
  //
  // Order: pre-checks and imports (no side effects: a failure keeps the running instance serving), then
  // teardown + dispose of the old instance, migrate of the new one (only for a known, different previous
  // version), setup, and finally the persisted version. A failure after the teardown leaves the module
  // failed: the old instance is not restored. `progress.applied` tells the caller which side of that line a failure was on.
  private async load(entry: RegistryEntry, progress: { applied: boolean }): Promise<LoadedModule> {
    const manifestPath = entry.source.path;
    const manifestDir = path.dirname(manifestPath);
    const manifest = parseManifest(this.readManifestFile(entry.id, manifestPath));
    if (manifest.id !== entry.id) {
      throw new ManifestIdMismatchError(entry.id, manifest.id, manifestPath);
    }

    // Everything that can be checked without side effects (dsl-lib files and ranges, view YAML) is
    // done before the running instance is replaced: a bad update must not take down a working module.
    const dslLib = this.checkDslLib(entry.id, manifest, manifestDir);
    const resolvedViews = manifest.extensionPoints.map((ep) => ({
      kind: ep.kind,
      slot: ep.slot,
      label: ep.label,
      view: resolveView(ep, manifestDir),
      rawYaml: resolveRawYaml(ep, manifestDir),
      order: ep.order,
      path: ep.path,
      width: ep.width,
      height: ep.height,
    }));

    const problems = this.findProblems(entry.id, manifest, resolvedViews);
    if (problems.length > 0) {
      throw new ModuleRequirementError(formatContributionProblems(entry.id, problems));
    }

    // Read before anything is replaced: a corrupt state file must not cost the running instance.
    const previousVersion = readPreviousVersion(this.options.configDir, entry.id);
    const lifecycle = manifest.lifecycle;
    const setup = await this.importFunction(entry.id, manifest.version, manifestPath, 'backendEntryPath', manifest.backendEntryPath, 'the backend');
    const migrate =
      lifecycle?.migrate === undefined ? undefined : await this.importFunction(entry.id, manifest.version, manifestPath, 'lifecycle.migrate', lifecycle.migrate, 'the migrate hook');
    const teardown =
      lifecycle?.teardown === undefined ? undefined : await this.importFunction(entry.id, manifest.version, manifestPath, 'lifecycle.teardown', lifecycle.teardown, 'the teardown hook');

    const dataDir = resolveDataDir(this.options.configDir, entry.id);
    fs.mkdirSync(dataDir, { recursive: true });
    const hookContext: ModuleHookContext = { id: entry.id, version: manifest.version, previousVersion, dataDir };

    progress.applied = true;
    const existing = this.loaded.get(entry.id);
    if (existing) {
      await this.stopInstance(existing, 'update');
    }
    const afterTeardown = existing === undefined ? '' : ` The previous version (${existing.manifest.version}) was already torn down and is not restored.`;

    if (migrate !== undefined && previousVersion !== null && previousVersion !== manifest.version) {
      try {
        await runWithTimeout(`module "${entry.id}": migrate`, this.hookTimeoutMs, () => (migrate as ModuleLifecycleHook)(hookContext));
      } catch (err) {
        throw new Error(
          `module "${entry.id}": migrate (${lifecycle?.migrate}) from ${previousVersion} to ${manifest.version} failed: ${sentence(err)}${afterTeardown} ` +
            'The module is failed. Fix the hook (it runs again on every load until it succeeds, so it must be safe to run twice), then register the module again.',
        );
      }
    }

    const moduleContext = createModuleContext(entry.id, this.routeRegistry, dataDir);
    let instance: unknown;
    try {
      instance = await runWithTimeout(`module "${entry.id}": setup`, this.hookTimeoutMs, () => (setup as (ctx: ModuleContext) => unknown)(moduleContext));
    } catch (err) {
      // Routes, timers and listeners registered before the failure must not outlive it.
      moduleContext.dispose();
      throw new Error(
        `module "${entry.id}": setup (default export of ${manifest.backendEntryPath}) failed: ${sentence(err)}${afterTeardown} ` +
          'The module is failed and nothing it registered is left behind. Fix the backend, then register the module again.',
      );
    }
    try {
      writeLoadedVersion(this.options.configDir, entry.id, manifest.version);
    } catch (err) {
      moduleContext.dispose();
      throw err;
    }

    const loadedModule: LoadedModule = {
      id: entry.id,
      manifest,
      manifestDir,
      source: manifestPath,
      moduleContext,
      resolvedViews,
      dslLib,
      dataDir,
      hookContext,
      instance,
      teardown: teardown as ModuleTeardownHook | undefined,
    };
    this.loaded.set(entry.id, loadedModule);
    return loadedModule;
  }

  // Imports a backend or hook file and returns its default export, which must be a function.
  private async importFunction(id: string, version: string, manifestPath: string, field: string, declared: string, what: string): Promise<ImportedFunction> {
    const file = path.resolve(path.dirname(manifestPath), declared);
    if (!fs.existsSync(file)) {
      throw new Error(`module "${id}": ${what} ${file} (${field} in ${manifestPath}) does not exist. Fix: rebuild the module with "app-core-cli package", or correct the path.`);
    }
    // mtime+size are part of the key: an update pushed without a version bump must still load the new code.
    const { mtimeMs, size } = fs.statSync(file);
    // Native Node caches a CommonJS file by path and ignores the query below, so a rewritten .cjs (what
    // "package" emits) would keep serving the old code: drop its cache entry first. Node keys that cache by the REAL
    // path, which differs from `file` when a folder on the way is a link (a global npm prefix that is a junction, nvm):
    // drop both, or the update would never be seen.
    delete nodeRequire.cache[file];
    delete nodeRequire.cache[fs.realpathSync(file)];
    const specifier = `${pathToFileURL(file).href}?v=${encodeURIComponent(version)}&m=${mtimeMs}-${size}`;
    let mod: BackendEntryExports;
    try {
      mod = (await runWithTimeout(`module "${id}": import of ${file}`, this.hookTimeoutMs, () => import(specifier))) as BackendEntryExports;
    } catch (err) {
      throw new Error(`module "${id}": cannot import ${what} ${file} (${field}): ${sentence(err)} The running version, if any, keeps serving.`);
    }
    if (typeof mod.default !== 'function') {
      throw new Error(
        `module "${id}": ${what} ${file} (${field}) must default-export a function (ctx) => void, got ${describeDefault(mod.default)}. ` +
          'For a CJS bundle add the footer `module.exports = module.exports.default;` ("app-core-cli package" does it); for ESM write `export default function (ctx) {}`.',
      );
    }
    return mod.default as ImportedFunction;
  }

  // Runs the instance's teardown (errors and timeouts are logged, never thrown: an instance that cannot
  // tear down must still be replaced or removed), then disposes its context and drops it. The old module
  // instance itself may still leak outside moduleContext -- an accepted limitation.
  private async stopInstance(mod: LoadedModule, reason: ModuleTeardownReason): Promise<void> {
    try {
      const teardown = mod.teardown;
      if (teardown !== undefined) {
        const context: ModuleTeardownContext = { ...mod.hookContext, reason, instance: mod.instance };
        await runWithTimeout(`module "${mod.id}": teardown`, this.hookTimeoutMs, () => teardown(context));
      }
    } catch (err) {
      (this.options.onWarning ?? writeWarning)(`module "${mod.id}": teardown of version ${mod.manifest.version} failed, the module is unloaded anyway: ${getErrorMessage(err)}`);
    } finally {
      mod.moduleContext.dispose();
      this.loaded.delete(mod.id);
    }
  }

  private serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).then(fn);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(id, tail);
    void tail.then(() => {
      if (this.queues.get(id) === tail) {
        this.queues.delete(id);
      }
    });
    return run;
  }

  // Every problem that keeps a module from loading or staying loaded: a required module that is missing or
  // outside its range, a contribution to a slot its provider does not expose or a $type the slot does not
  // accept, and a require cycle with the modules that are loaded.
  private findProblems(id: string, manifest: Manifest, resolvedViews: LoadedModule['resolvedViews']): ContributionProblem[] {
    const problems = validateContributions({
      moduleId: id,
      requires: manifest.requires,
      contributions: resolvedViews.map((v, index) => ({ index, slot: v.slot, rootType: rootTypeOf(v.view) })),
      selfExpose: manifest.expose,
      lookup: (providerId) => this.lookupLoaded(providerId),
      mode: 'load',
    });
    for (const providerId of Object.keys(manifest.requires ?? {})) {
      const cycle = this.cycleThrough(id, providerId);
      if (cycle !== undefined) {
        problems.push({
          about: 'manifest',
          problem: `requires "${providerId}", which requires "${id}" in turn: require cycle (${cycle.join(' -> ')})`,
          fix: 'Remove one of the "requires" in the cycle (extract what the modules share into a third module).',
        });
      }
    }
    return problems;
  }

  // The path id -> provider -> ... -> id through the loaded modules' `requires`, or undefined when there is none.
  private cycleThrough(id: string, providerId: string): string[] | undefined {
    const visited = new Set<string>();
    const walk = (current: string, trail: string[]): string[] | undefined => {
      if (current === id) {
        return trail;
      }
      if (visited.has(current)) {
        return undefined;
      }
      visited.add(current);
      for (const next of Object.keys(this.loaded.get(current)?.manifest.requires ?? {})) {
        const found = walk(next, [...trail, next]);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    };
    return walk(providerId, [id, providerId]);
  }

  private checkDslLib(id: string, manifest: Manifest, manifestDir: string): DslLibUrls | undefined {
    const dslLib = resolveDslLib(id, manifest, manifestDir);
    if (manifest.dslLib === undefined) {
      return undefined;
    }
    const { unverified } = checkSharedRanges(manifest.dslLib.shared, this.options.sharedVersions);
    if (unverified.length > 0) {
      (this.options.onWarning ?? writeWarning)(
        `module "${id}": cannot verify dslLib.shared for ${unverified.join(', ')} (no build-info.json with these versions next to the served frontend; run "npm run build:full").`,
      );
    }
    return dslLib;
  }

  // The loaded modules that list `providerId` in their `requires`, in load order.
  private dependentsOf(providerId: string): LoadedModule[] {
    return [...this.loaded.values()].filter((m) => m.manifest.requires?.[providerId] !== undefined);
  }

  // Unloads (teardown reason "dependency") every loaded module that requires `providerId`, transitively,
  // each one after the modules that require it, and records each as failed with `cause: requirement`.
  // Their registry entries are untouched: they come back when the provider does.
  private async cascadeUnload(providerId: string, loss: ProviderLoss, report: ChangeReport): Promise<void> {
    for (const dependent of this.dependentsOf(providerId)) {
      await this.serialize(dependent.id, async () => {
        const current = this.loaded.get(dependent.id);
        if (current === undefined || current.manifest.requires?.[providerId] === undefined) {
          return;
        }
        await this.takeDown(current, lossMessage(providerId, loss), report);
      });
    }
  }

  // Inside the module's lock: its own dependents first, then the module, recorded as failed with `reason`.
  private async takeDown(mod: LoadedModule, reason: string, report: ChangeReport): Promise<void> {
    await this.cascadeUnload(mod.id, { kind: 'failed', detail: firstLine(reason) }, report);
    if (this.loaded.get(mod.id) !== mod) {
      return;
    }
    await this.stopInstance(mod, 'dependency');
    this.recordFailure({ id: mod.id, source: { type: 'file', path: mod.source } }, reason, 'requirement');
    report.cascaded.push(mod.id);
  }

  // After `providerId` was loaded in a new version: each module that requires it is checked again with the
  // same rules as at load (range, exposed slots, accepted root $type). Incompatible ones are unloaded and failed
  // with the reason; compatible ones are not touched.
  private async revalidateDependents(providerId: string, report: ChangeReport): Promise<void> {
    for (const dependent of this.dependentsOf(providerId)) {
      await this.serialize(dependent.id, async () => {
        const current = this.loaded.get(dependent.id);
        if (current === undefined) {
          return;
        }
        const problems = this.findProblems(current.id, current.manifest, current.resolvedViews);
        if (problems.length === 0) {
          return;
        }
        const version = this.loaded.get(providerId)?.manifest.version ?? 'a new version';
        const reason =
          formatContributionProblems(current.id, problems, `cannot stay loaded after "${providerId}" was updated to ${version}`) +
          '\nThis module is loaded again automatically once the contract holds again.';
        await this.takeDown(current, reason, report);
      });
    }
  }

  // Loads again the failed modules whose failure is a requirement and whose required modules are all loaded now,
  // providers before dependents, until a whole pass loads nothing more. A retry that fails again updates the
  // module's failed message. Each pass loads at least one module or stops, so it always ends.
  async recoverFailed(report: ChangeReport = newChangeReport()): Promise<string[]> {
    const recovered: string[] = [];
    if (this.shuttingDown) {
      return recovered;
    }
    // A module unloaded by this very change was just evaluated: retrying it now would only repeat the message.
    const justCascaded = new Set(report.cascaded);
    for (let progress = true; progress; ) {
      progress = false;
      const candidates = [...this.failed.values()].filter((f) => f.cause === 'requirement' && !this.loaded.has(f.id) && !justCascaded.has(f.id));
      for (const candidate of orderByRequires(candidates, (f) => readRequiredIds(f.source)).ordered) {
        if (readRequiredIds(candidate.source).some((id) => !this.loaded.has(id))) {
          continue;
        }
        const entry: RegistryEntry = { id: candidate.id, source: { type: 'file', path: candidate.source } };
        const ok = await this.serialize(candidate.id, async () => {
          if (this.loaded.has(candidate.id) || this.failed.get(candidate.id)?.cause !== 'requirement') {
            return false;
          }
          try {
            await this.attempt(entry, newChangeReport());
            return true;
          } catch {
            // attempt() recorded the new failure on the module; it stays listed under "failed" with its message.
            return false;
          }
        });
        if (ok) {
          recovered.push(candidate.id);
          report.recovered.push(candidate.id);
          progress = true;
        }
      }
    }
    return recovered;
  }

  // Runs the module's teardown (reason "unload"), then disposes it, after unloading the modules that require it.
  // Teardown failures are logged on stderr and never block it.
  unload(id: string, report: ChangeReport = newChangeReport()): Promise<void> {
    return this.serialize(id, async () => {
      await this.unloadNow(id, 'unload', { kind: 'unloaded' }, report);
    });
  }

  private async unloadNow(id: string, reason: ModuleTeardownReason, loss: ProviderLoss, report: ChangeReport): Promise<void> {
    if (this.loaded.has(id)) {
      await this.cascadeUnload(id, loss, report);
    }
    const existing = this.loaded.get(id);
    if (existing) {
      await this.stopInstance(existing, reason);
    }
  }

  // Unload (teardown reason "unregister", dependents first) plus clearing any recorded failure and the persisted
  // version (a module removed on purpose must not keep a stale previous version); returns whether the manager
  // knew the id at all. The module's dataDir is never deleted. Failed modules that can load now are then loaded.
  async forget(id: string, report: ChangeReport = newChangeReport()): Promise<boolean> {
    const known = await this.serialize(id, async () => {
      const wasKnown = this.loaded.has(id) || this.failed.has(id);
      await this.unloadNow(id, 'unregister', { kind: 'unregistered' }, report);
      this.failed.delete(id);
      clearModuleState(this.options.configDir, id);
      return wasKnown;
    });
    await this.recoverFailed(report);
    return known;
  }

  // Server shutdown: teardown + dispose of every loaded module, level by level: the modules nobody requires
  // first, all of one level at the same time (each with its own timeout), then the ones they required, so a
  // module always goes before its providers. Idempotent; state files are kept (a restart is not an update) and
  // nothing is recorded as failed.
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    try {
      for (;;) {
        const remaining = [...this.loaded.values()];
        if (remaining.length === 0) {
          return;
        }
        const required = new Set(remaining.flatMap((m) => Object.keys(m.manifest.requires ?? {})));
        const level = remaining.filter((m) => !required.has(m.id));
        // A require cycle among loaded modules is refused at load; should one exist, stop everything at once rather than loop.
        const batch = level.length === 0 ? remaining : level;
        await Promise.all(
          batch.map((m) =>
            this.serialize(m.id, async () => {
              const existing = this.loaded.get(m.id);
              if (existing) {
                await this.stopInstance(existing, 'shutdown');
              }
            }),
          ),
        );
      }
    } finally {
      this.shuttingDown = false;
    }
  }
}
