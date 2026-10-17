import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getErrorMessage } from './errors.js';
import { createModuleContext, type ModuleContext } from './moduleContext.js';
import { parseManifest, type Manifest } from './manifest.js';
import { checkSharedRanges, resolveDslLib, type DslLibUrls, type SharedVersions } from './dslLib.js';
import { resolveView, resolveRawYaml } from './viewResolver.js';
import type { RegistryEntry } from './registry.js';
import { ModuleRouteRegistry } from './moduleRoutes.js';

export interface BackendEntryExports {
  // A module's backend entry is a plain ESM module. app-core is agnostic about
  // what it does once loaded -- the only contract app-core relies on is this
  // optional default export, called with the module's own moduleContext.
  default?: (ctx: ModuleContext) => void | Promise<void>;
}

export interface LoadedModule {
  id: string;
  manifest: Manifest;
  manifestDir: string;
  moduleContext: ModuleContext;
  resolvedViews: Array<{ kind: string; slot: string; label?: string; view: unknown; rawYaml: string; order?: number; path?: string }>;
  // Cache-busted URLs of the module's runtime-loaded components (served from /api/modules/<id>/_lib/).
  dslLib?: DslLibUrls;
}

export interface ModuleManagerOptions {
  // Versions of the shared singletons the served frontend was built with (from build-info.json);
  // undefined when unavailable, in which case dslLib.shared ranges cannot be verified.
  sharedVersions?: SharedVersions;
  onWarning?: (message: string) => void;
}

function writeWarning(message: string): void {
  process.stderr.write(`[app-core] ${message}\n`);
}

export interface FailedModule {
  id: string;
  source: string;
  error: string;
  failedAt: string;
}

export class ModuleManager {
  private loaded = new Map<string, LoadedModule>();
  private failed = new Map<string, FailedModule>();
  // Shared across all modules so routes stay scoped by moduleId (enforced in
  // ModuleRouteRegistry itself) and so server.ts's single catch-all dispatcher
  // route can look up any module's registered routes.
  readonly routeRegistry = new ModuleRouteRegistry();

  constructor(private readonly options: ModuleManagerOptions = {}) {}

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

  // A failed load is recorded (and visible via listFailed) until the same id loads
  // successfully or is forgotten; the error is still thrown to the caller.
  async loadFromEntry(entry: RegistryEntry): Promise<LoadedModule> {
    try {
      const loaded = await this.load(entry);
      this.failed.delete(entry.id);
      return loaded;
    } catch (err) {
      this.failed.set(entry.id, {
        id: entry.id,
        source: entry.source.path,
        error: getErrorMessage(err),
        failedAt: new Date().toISOString(),
      });
      throw err;
    }
  }

  // Backend loaded via dynamic import() with cache-busting (not a child
  // process, not a vm context) so a new version or a rewritten backend file
  // always yields a fresh module instance instead of Node's cached one.
  private async load(entry: RegistryEntry): Promise<LoadedModule> {
    const manifestPath = entry.source.path;
    const manifestDir = path.dirname(manifestPath);
    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifest = parseManifest(manifestRaw);

    // Checked before the running instance is replaced: a bad update must not take down a working module.
    const dslLib = this.checkDslLib(entry.id, manifest, manifestDir);

    const existing = this.loaded.get(entry.id);
    if (existing) {
      // Unload = stop routing to the old instance + clear its moduleContext
      // registrations. The old module instance itself may still leak outside
      // moduleContext -- an accepted limitation.
      existing.moduleContext.dispose();
      this.loaded.delete(entry.id);
    }

    const backendPath = path.resolve(manifestDir, manifest.backendEntryPath);
    // mtime+size are part of the key: an update pushed without a version bump must still load the new backend.
    const { mtimeMs, size } = fs.statSync(backendPath);
    const specifier = `${pathToFileURL(backendPath).href}?v=${encodeURIComponent(manifest.version)}&m=${mtimeMs}-${size}`;
    const mod = (await import(specifier)) as BackendEntryExports;

    const moduleContext = createModuleContext(entry.id, this.routeRegistry);
    if (typeof mod.default === 'function') {
      await mod.default(moduleContext);
    }

    const resolvedViews = manifest.extensionPoints.map((ep) => ({
      kind: ep.kind,
      slot: ep.slot,
      label: ep.label,
      view: resolveView(ep, manifestDir),
      rawYaml: resolveRawYaml(ep, manifestDir),
      order: ep.order,
      path: ep.path,
    }));

    const loadedModule: LoadedModule = { id: entry.id, manifest, manifestDir, moduleContext, resolvedViews, dslLib };
    this.loaded.set(entry.id, loadedModule);
    return loadedModule;
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

  unload(id: string): void {
    const existing = this.loaded.get(id);
    if (!existing) {
      return;
    }
    existing.moduleContext.dispose();
    this.loaded.delete(id);
  }

  // Unload plus clearing any recorded failure; returns whether the manager knew the id at all.
  forget(id: string): boolean {
    const known = this.loaded.has(id) || this.failed.has(id);
    this.unload(id);
    this.failed.delete(id);
    return known;
  }
}
