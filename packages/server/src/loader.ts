import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createModuleContext, type ModuleContext } from './moduleContext.js';
import { parseManifest, type Manifest } from './manifest.js';
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
  resolvedViews: Array<{ kind: string; slot: string; label?: string; view: unknown; rawYaml: string; order?: number }>;
}

export class ModuleManager {
  private loaded = new Map<string, LoadedModule>();
  // Shared across all modules so routes stay scoped by moduleId (enforced in
  // ModuleRouteRegistry itself) and so server.ts's single catch-all dispatcher
  // route can look up any module's registered routes.
  readonly routeRegistry = new ModuleRouteRegistry();

  get(id: string): LoadedModule | undefined {
    return this.loaded.get(id);
  }

  list(): LoadedModule[] {
    return [...this.loaded.values()];
  }

  // Backend loaded via dynamic import() with cache-busting (not a child
  // process, not a vm context) so a version bump always yields a fresh module
  // instance instead of Node's cached one.
  async loadFromEntry(entry: RegistryEntry): Promise<LoadedModule> {
    const manifestPath = entry.source.path;
    const manifestDir = path.dirname(manifestPath);
    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifest = parseManifest(manifestRaw);

    const existing = this.loaded.get(entry.id);
    if (existing) {
      // Unload = stop routing to the old instance + clear its moduleContext
      // registrations. The old module instance itself may still leak outside
      // moduleContext -- an accepted limitation.
      existing.moduleContext.dispose();
      this.loaded.delete(entry.id);
    }

    const backendPath = path.resolve(manifestDir, manifest.backendEntryPath);
    const specifier = `${pathToFileURL(backendPath).href}?v=${encodeURIComponent(manifest.version)}`;
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
    }));

    const loadedModule: LoadedModule = { id: entry.id, manifest, manifestDir, moduleContext, resolvedViews };
    this.loaded.set(entry.id, loadedModule);
    return loadedModule;
  }

  unload(id: string): void {
    const existing = this.loaded.get(id);
    if (!existing) return;
    existing.moduleContext.dispose();
    this.loaded.delete(id);
  }
}
