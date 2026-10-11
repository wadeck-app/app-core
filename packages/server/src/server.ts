import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { modulesRoutes } from './routes/modules.js';
import { slotsRoutes } from './routes/slots.js';
import { ModuleManager } from './loader.js';
import { resolveModulesDir } from './configDir.js';
import { readRegistryEntries } from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildServerOptions {
  configDir?: string;
  publicDir?: string;
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
export async function buildServer(opts: BuildServerOptions = {}): Promise<AppCoreServer> {
  const modulesDir = resolveModulesDir(opts.configDir);
  const manager = new ModuleManager();

  const server = Fastify({ logger: false });
  await server.register(modulesRoutes, { modulesDir, manager });
  await server.register(slotsRoutes, { manager });

  // A module's own registerRoute()-registered routes are dispatched through a
  // single catch-all, since Fastify/find-my-way has no API to remove a route
  // from a running instance (see moduleRoutes.ts). This route requires at
  // least one path segment after :id, so it never collides with the static
  // /api/modules, /api/modules/register, /api/modules/update routes above.
  server.all('/api/modules/:id/*', async (req, reply) => {
    const { id } = req.params as Record<string, string>;
    const wildcard = (req.params as Record<string, string>)['*'] ?? '';
    const handler = manager.routeRegistry.find(id, req.method, `/${wildcard}`);
    if (!handler) {
      return reply.code(404).send({ error: 'not-found' });
    }
    return handler(req, reply);
  });

  // app-core serves its own frontend shell (built from packages/frontend-shell,
  // copied into the repo root's public/ by scripts/copy-app.mjs) -- same
  // static-serving + SPA-fallback pattern as orch-server. __dirname here is
  // packages/server/dist at runtime, so public/ at the repo root is 3 levels up.
  const publicDir = opts.publicDir ?? path.resolve(__dirname, '../../../public');
  const hasPublic = fs.existsSync(publicDir);
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

  for (const entry of readRegistryEntries(modulesDir)) {
    try {
      await manager.loadFromEntry(entry);
    } catch (err) {
      // A single bad registry entry must not block startup for every other
      // module -- app-core has no isolation guarantee, but startup itself
      // should still succeed.
      server.log.error({ err, moduleId: entry.id }, 'failed to load module from registry on startup');
    }
  }

  return { server, manager, modulesDir };
}
