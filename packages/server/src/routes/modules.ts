import type { FastifyInstance, FastifyReply } from 'fastify';
import * as path from 'node:path';
import { parseRegistrationPayload, UnsupportedSourceTypeError } from '../manifest.js';
import { writeRegistryEntry, type RegistryEntry } from '../registry.js';
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

  // Decision #14: app-core itself writes/updates the registry file on a
  // successful push -- the push path and the fallback-file path converge on
  // the exact same storage, so there is no separate reconciliation step.
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

  // Internal inspection endpoint for tests/dashboard -- lists currently loaded
  // modules and their resolved views (Decision #8/#16: views are DSL data, not code).
  server.get('/api/modules', async (_req, reply) => {
    const modules = manager.list().map((m) => ({
      id: m.id,
      version: m.manifest.version,
      extensionPoints: m.resolvedViews,
    }));
    return reply.code(200).send({ modules });
  });
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof UnsupportedSourceTypeError) {
    return reply.code(422).send({ error: err.message });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'Invalid payload', issues: err.issues });
  }
  return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
}
