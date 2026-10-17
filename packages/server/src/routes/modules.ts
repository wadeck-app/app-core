import type { FastifyInstance, FastifyReply } from 'fastify';
import * as path from 'node:path';
import { getErrorMessage } from '../errors.js';
import { parseRegistrationPayload, parseUnregisterPayload, UnsupportedSourceTypeError } from '../manifest.js';
import { removeRegistryEntry, writeRegistryEntry, type RegistryEntry } from '../registry.js';
import type { ModuleManager } from '../loader.js';
import { ZodError } from 'zod';

export interface ModulesRoutesOptions {
  modulesDir: string;
  manager: ModuleManager;
}

async function handleRegisterOrUpdate(
  body: unknown,
  modulesDir: string,
  manager: ModuleManager,
): Promise<{ id: string; version: string; extensionPoints: number }> {
  const payload = parseRegistrationPayload(body);
  const manifestPath = path.resolve(payload.source.path);
  const entry: RegistryEntry = { id: payload.id, source: { type: 'file', path: manifestPath } };

  // app-core itself writes/updates the registry file on a successful push --
  // the push path and the fallback-file path converge on the exact same
  // storage, so there is no separate reconciliation step.
  writeRegistryEntry(modulesDir, entry);
  const loaded = await manager.loadFromEntry(entry);
  return { id: loaded.id, version: loaded.manifest.version, extensionPoints: loaded.resolvedViews.length };
}

export async function modulesRoutes(server: FastifyInstance, opts: ModulesRoutesOptions): Promise<void> {
  const { modulesDir, manager } = opts;

  server.post('/api/modules/register', async (req, reply) => {
    try {
      const result = await handleRegisterOrUpdate(req.body, modulesDir, manager);
      return reply.code(201).send(result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  server.post('/api/modules/update', async (req, reply) => {
    try {
      const result = await handleRegisterOrUpdate(req.body, modulesDir, manager);
      return reply.code(200).send(result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Removes a module for good: stops routing to it, disposes its moduleContext and deletes its
  // registry file, so it does not come back on the next start. A daemon calls this on uninstall.
  server.post('/api/modules/unregister', async (req, reply) => {
    try {
      const { id } = parseUnregisterPayload(req.body);
      const hadRegistryFile = removeRegistryEntry(modulesDir, id);
      const wasKnown = manager.forget(id);
      if (!wasKnown && !hadRegistryFile) {
        return reply.code(404).send({
          error: `Module "${id}" is not registered. GET /api/modules lists the loaded modules and the ones that failed to load.`,
        });
      }
      return reply.code(200).send({ id, removed: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Internal inspection endpoint for tests/dashboard -- lists currently loaded
  // modules and their resolved views (views are DSL data, not code), plus the modules
  // whose registration exists but failed to load, with the reason.
  server.get('/api/modules', async (_req, reply) => {
    const modules = manager.list().map((m) => ({
      id: m.id,
      version: m.manifest.version,
      extensionPoints: m.resolvedViews,
      dslLib: m.dslLib,
    }));
    return reply.code(200).send({ modules, failed: manager.listFailed() });
  });
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof UnsupportedSourceTypeError) {
    return reply.code(422).send({ error: getErrorMessage(err) });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'Invalid payload', issues: err.issues });
  }
  return reply.code(500).send({ error: getErrorMessage(err) });
}
