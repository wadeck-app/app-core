import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { modulesRoutes } from './routes/modules.js';
import { slotsRoutes } from './routes/slots.js';
import { libContentType, resolveLibRequest, sharedVersionsFromBuildInfo, type SharedVersions } from './dslLib.js';
import { ModuleManager } from './loader.js';
import { resolveConfigDir, resolveModulesDir } from './configDir.js';
import { readRegistryEntries } from './registry.js';
import { getErrorMessage } from './errors.js';
import { orderByRequires, readRequiredIds } from './loadOrder.js';
import { etagHook } from './conditionalGet.js';
import { inventoryAbTests } from './abTestScan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildServerOptions {
  configDir?: string;
  publicDir?: string;
  // Turns the A/B test dock on in the served shell (it is off outside development). `app-core-cli serve --ab-tests`.
  abTests?: boolean;
}

export interface AppCoreServer {
  server: FastifyInstance;
  manager: ModuleManager;
  modulesDir: string;
}

// On startup, app-core loads every file found in the module registry
// directory -- this covers both modules that pushed successfully earlier and
// modules a daemon dropped via the fallback-file path while app-core was
// unreachable. No separate reconciliation step.
// Versions of the shared singletons the served frontend was built with, from the
// build-info.json written next to it. Undefined (with an explicit stderr line) when unreadable.
interface SharedInfo {
  versions: SharedVersions;
  origin: string;
}

// The versions of the shared packages installed in the checkout next to the served frontend (<repo>/node_modules), when
// there is one: what a rebuild of the frontend would put in build-info.json.
function installedVersions(publicDir: string): SharedVersions {
  const installed: SharedVersions = {};
  for (const pkg of ['react', 'react-dom', 'react-router-dom', '@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer']) {
    try {
      const version = (JSON.parse(fs.readFileSync(path.resolve(publicDir, '..', 'node_modules', pkg, 'package.json'), 'utf8')) as { version?: unknown }).version;
      if (typeof version === 'string') {
        installed[pkg] = version;
      }
    } catch {
      // Not installed there (a served folder that is not inside a checkout): nothing to compare with.
    }
  }
  return installed;
}

function readSharedVersions(publicDir: string): SharedInfo | undefined {
  const file = path.join(publicDir, 'build-info.json');
  if (!fs.existsSync(file)) {
    process.stderr.write(`[app-core] ${file} not found: dslLib.shared ranges of modules cannot be verified (run "npm run build:full").\n`);
    return undefined;
  }
  try {
    const info = JSON.parse(fs.readFileSync(file, 'utf8')) as { builtAt?: unknown; commit?: unknown };
    const versions = sharedVersionsFromBuildInfo(info);
    const built = typeof info.builtAt === 'string' ? `built ${info.builtAt}` : 'build time unknown';
    const commit = typeof info.commit === 'string' ? `, commit ${info.commit}` : '';
    let origin = `${file}, ${built}${commit}`;
    // A frontend built before the packages were updated: the file describes what is served, but it is older than the install.
    const installed = installedVersions(publicDir);
    const differing = Object.entries(installed).filter(([pkg, version]) => versions[pkg] !== undefined && versions[pkg] !== version);
    if (differing.length > 0) {
      const detail = differing.map(([pkg, version]) => `${pkg} ${version} installed, ${versions[pkg]} in the served shell`).join('; ');
      origin += `; the served shell looks stale (${detail}): run "npm run build:full" to rebuild it`;
      process.stderr.write(`[app-core] ${file} is older than the installed packages (${detail}). Modules are checked against the served shell, not the installed packages: run "npm run build:full".\n`);
    }
    return { versions, origin };
  } catch (err) {
    process.stderr.write(`[app-core] ${file} is unreadable (${getErrorMessage(err)}): dslLib.shared ranges of modules cannot be verified.\n`);
    return undefined;
  }
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<AppCoreServer> {
  const modulesDir = resolveModulesDir(opts.configDir);
  // app-core serves its own frontend shell (built from packages/frontend-shell,
  // copied into the repo root's public/ by scripts/copy-app.mjs) -- same
  // static-serving + SPA-fallback pattern as orch-server. __dirname here is
  // packages/server/dist at runtime, so public/ at the repo root is 3 levels up.
  const publicDir = opts.publicDir ?? path.resolve(__dirname, '../../../public');
  const hasPublic = fs.existsSync(publicDir);
  // Throws here, at startup, when APP_CORE_HOOK_TIMEOUT_MS is not a positive integer.
  const shared = hasPublic ? readSharedVersions(publicDir) : undefined;
  const manager = new ModuleManager({
    configDir: opts.configDir ?? resolveConfigDir(),
    sharedVersions: shared?.versions,
    sharedOrigin: shared?.origin,
  });

  const server = Fastify({ logger: false });
  // Any way of closing the server (stop(), dev, tests) runs the modules' teardown first; idempotent.
  server.addHook('onClose', async () => {
    await manager.shutdown();
  });
  await server.register(modulesRoutes, { modulesDir, manager });
  await server.register(slotsRoutes, { manager });
  // What the shell cannot know from its build: settings of this server process, read once per page load.
  server.get('/api/shell-settings', { onSend: etagHook }, async () => ({ abTests: opts.abTests === true }));
  // The A/B tests the installed modules declare, over all their pages (see abTestScan.ts for what is exact and what is estimated).
  server.get('/api/ab-tests', { onSend: etagHook }, async () => {
    const inventory = await inventoryAbTests(manager.list());
    return { exact: inventory.views.length, estimated: inventory.components.length, total: inventory.views.length + inventory.components.length, ...inventory };
  });

  // Files of a module's dsl-lib folder (runtime-loaded components). Registered before the
  // catch-all below, and `_lib` is reserved so a module cannot register a route under it.
  server.get('/api/modules/:id/_lib/*', async (req, reply) => {
    const params = req.params as Record<string, string>;
    const mod = manager.get(params['id'] ?? '');
    const file = mod?.dslLib === undefined ? undefined : resolveLibRequest(mod.manifestDir, params['*'] ?? '');
    if (file === undefined) {
      return reply.code(404).send({ error: 'not-found' });
    }
    return reply.header('Cache-Control', 'no-cache').type(libContentType(file)).send(fs.createReadStream(file));
  });

  // A module's own registerRoute()-registered routes are dispatched through a
  // single catch-all, since Fastify/find-my-way has no API to remove a route
  // from a running instance (see moduleRoutes.ts). This route requires at
  // least one path segment after :id, so it never collides with the static
  // /api/modules, /api/modules/register, /api/modules/update routes above.
  // `etagHook`: a GET answer that is text gets an ETag and becomes a 304 when the client already has it (see conditionalGet.ts).
  server.all<{ Params: Record<string, string> }>('/api/modules/:id/*', { onSend: etagHook }, async (req, reply) => {
    const { id } = req.params;
    const wildcard = req.params['*'] ?? '';
    const found = manager.routeRegistry.find(id, req.method, `/${wildcard}`);
    if (!found) {
      return reply.code(404).send({ error: 'not-found' });
    }
    manager.routeRegistry.trackResponse(id, reply.raw);
    // The handler sees only its own `:name` segments, never the catch-all's `id` (module id) and `*`.
    delete req.params['id'];
    delete req.params['*'];
    Object.assign(req.params, found.params);
    return found.handler(req, reply);
  });

  if (hasPublic) {
    await server.register(fastifyStatic, { root: publicDir });
  }
  server.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not-found' });
    }
    if (hasPublic) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'shell-not-built' });
  });

  // Required modules load first (decision 82); members of a require cycle cannot load at all.
  const { ordered, cycles } = orderByRequires(readRegistryEntries(modulesDir), (entry) => readRequiredIds(entry.source.path));
  for (const entry of readRegistryEntries(modulesDir)) {
    const cycle = cycles.get(entry.id);
    if (cycle === undefined) {
      continue;
    }
    const error = `module "${entry.id}" is part of a require cycle (${cycle}), so none of its members can load. Fix: remove one of the "requires" in the cycle (extract what they share into a third module), then re-register the modules.`;
    manager.recordFailure(entry, error, 'requirement');
    process.stderr.write(`[app-core] ${error}\n`);
  }
  for (const entry of ordered) {
    try {
      await manager.loadFromEntry(entry);
    } catch (err) {
      // A single bad registry entry must not block startup for every other
      // module -- app-core has no isolation guarantee, but startup itself
      // should still succeed. Written to stderr explicitly: the Fastify logger is off.
      process.stderr.write(
        `[app-core] module "${entry.id}" failed to load from ${entry.source.path}: ${getErrorMessage(err)}. ` +
          `Fix the manifest, re-register it, or remove it with POST /api/modules/unregister {"id":"${entry.id}"}.\n`,
      );
    }
  }

  // Anything that failed on a requirement and can load now (the order above makes it rare, but it is cheap and cannot loop).
  await manager.recoverFailed();

  return { server, manager, modulesDir };
}
