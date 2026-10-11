import type { FastifyReply, FastifyRequest } from 'fastify';

export type ModuleRouteHandler = (req: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;

function normalizeSubPath(subPath: string): string {
  const withLeadingSlash = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const trimmed = withLeadingSlash.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

// Decision #26: a module's backend can register its own HTTP route on app-core's
// server, always scoped under /api/modules/<id>/... -- the id prefix is enforced
// here, never trusted to the caller, so two modules can never collide (Decision #27's
// mitigation: id is always a fixed literal segment, never a $route placeholder).
//
// Fastify/find-my-way has no API to remove a route from a running server instance,
// so dynamic add/remove (needed for Decision #9's unload lifecycle) is implemented
// as a lookup table behind a single catch-all route (see server.ts), not as real
// Fastify route registration/deregistration.
export class ModuleRouteRegistry {
  private routes = new Map<string, ModuleRouteHandler>();

  register(moduleId: string, method: string, subPath: string, handler: ModuleRouteHandler): void {
    const key = `${moduleId}:${method.toUpperCase()}:${normalizeSubPath(subPath)}`;
    this.routes.set(key, handler);
  }

  unregisterAllForModule(moduleId: string): void {
    const prefix = `${moduleId}:`;
    for (const key of this.routes.keys()) {
      if (key.startsWith(prefix)) this.routes.delete(key);
    }
  }

  find(moduleId: string, method: string, subPath: string): ModuleRouteHandler | undefined {
    return this.routes.get(`${moduleId}:${method.toUpperCase()}:${normalizeSubPath(subPath)}`);
  }
}
