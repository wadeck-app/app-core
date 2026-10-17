import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';

// `req.params` holds exactly the `:name` segments of the route the module registered (a module may
// name one `:id`); the catch-all's own `id` and `*` params are not exposed.
export type ModuleRouteHandler = (
  req: FastifyRequest<{ Params: Record<string, string> }>,
  reply: FastifyReply,
) => unknown | Promise<unknown>;

export interface FoundRoute {
  handler: ModuleRouteHandler;
  params: Record<string, string>;
}

interface RouteEntry {
  method: string;
  pattern: string;
  segments: string[];
  handler: ModuleRouteHandler;
}

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeSubPath(subPath: string): string {
  const withLeadingSlash = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const trimmed = withLeadingSlash.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function splitSegments(normalized: string): string[] {
  return normalized === '/' ? [] : normalized.slice(1).split('/');
}

function isParam(segment: string): boolean {
  return segment.startsWith(':');
}

function validatePattern(subPath: string, segments: string[]): void {
  const seen = new Set<string>();
  for (const segment of segments) {
    if (segment === '') {
      throw new Error(`registerRoute: "${subPath}" has an empty path segment ("//"); remove the extra slash.`);
    }
    if (!isParam(segment)) {
      continue;
    }
    const name = segment.slice(1);
    if (!PARAM_NAME.test(name)) {
      throw new Error(`registerRoute: "${subPath}" has an invalid parameter "${segment}"; use letters, digits and "_", e.g. ":eventId".`);
    }
    if (seen.has(name)) {
      throw new Error(`registerRoute: "${subPath}" declares the parameter ":${name}" twice.`);
    }
    seen.add(name);
  }
}

function sameShape(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((segment, i) => {
    const other = b[i];
    return isParam(segment) ? other !== undefined && isParam(other) : segment === other;
  });
}

// A module's backend can register its own HTTP route on app-core's server,
// always scoped under /api/modules/<id>/... -- the id prefix is enforced
// here, never trusted to the caller, so two modules can never collide (the id
// is always a fixed literal segment, never a $route placeholder).
//
// Routes may contain `:name` segments. Matching is per segment: same method and segment count,
// static segments win over parameters (leftmost first). Two routes with the same shape (e.g.
// "/a/:x" and "/a/:y") cannot both be registered.
//
// Fastify/find-my-way has no API to remove a route from a running server
// instance, so dynamic add/remove (needed for the unload lifecycle) is
// implemented as a lookup table behind a single catch-all route (see
// server.ts), not as real Fastify route registration/deregistration.
export class ModuleRouteRegistry {
  private routes = new Map<string, RouteEntry[]>();
  private openResponses = new Map<string, Set<ServerResponse>>();

  register(moduleId: string, method: string, subPath: string, handler: ModuleRouteHandler): void {
    const normalized = normalizeSubPath(subPath);
    if (normalized === '/_lib' || normalized.startsWith('/_lib/')) {
      throw new Error(
        `registerRoute: "${subPath}" is reserved. /api/modules/${moduleId}/_lib/ serves the files of the module's dsl-lib folder; choose another sub path.`,
      );
    }
    const segments = splitSegments(normalized);
    validatePattern(subPath, segments);

    const upperMethod = method.toUpperCase();
    const entries = this.routes.get(moduleId) ?? [];
    const conflict = entries.find((entry) => entry.method === upperMethod && sameShape(entry.segments, segments));
    if (conflict) {
      throw new Error(
        `registerRoute: ${upperMethod} "${normalized}" conflicts with the already registered ${upperMethod} "${conflict.pattern}" (same method and path shape). Remove one, or rename a static segment.`,
      );
    }
    entries.push({ method: upperMethod, pattern: normalized, segments, handler });
    this.routes.set(moduleId, entries);
  }

  // Remembers a response handed to one of the module's handlers until it closes, so unloading the
  // module can end the ones that stream (see unregisterAllForModule).
  trackResponse(moduleId: string, response: ServerResponse): void {
    const open = this.openResponses.get(moduleId) ?? new Set<ServerResponse>();
    open.add(response);
    this.openResponses.set(moduleId, open);
    response.once('close', () => {
      open.delete(response);
    });
  }

  // Drops the module's routes and ends its streaming responses (headers sent, not finished, e.g. an
  // SSE log tail): the route is gone but such a response would otherwise keep running the old
  // code until the client disconnects. The client reconnects (EventSource does it by itself) and
  // reaches the new version; the module's `req.raw.on('close')` cleanup runs. Requests still
  // waiting for their handler (no header sent yet) are left alone.
  unregisterAllForModule(moduleId: string): void {
    this.routes.delete(moduleId);
    const open = this.openResponses.get(moduleId);
    this.openResponses.delete(moduleId);
    for (const response of open ?? []) {
      if (response.headersSent && !response.writableEnded) {
        response.destroy();
      }
    }
  }

  find(moduleId: string, method: string, subPath: string): FoundRoute | undefined {
    const entries = this.routes.get(moduleId);
    if (!entries) {
      return undefined;
    }
    const upperMethod = method.toUpperCase();
    let requested: string[];
    try {
      requested = splitSegments(normalizeSubPath(subPath)).map((segment) => decodeURIComponent(segment));
    } catch {
      return undefined;
    }

    let best: RouteEntry | undefined;
    for (const entry of entries) {
      if (entry.method !== upperMethod || entry.segments.length !== requested.length) {
        continue;
      }
      const matches = entry.segments.every((segment, i) => isParam(segment) || segment === requested[i]);
      if (matches && (best === undefined || moreSpecific(entry.segments, best.segments))) {
        best = entry;
      }
    }
    if (!best) {
      return undefined;
    }

    const params: Record<string, string> = {};
    best.segments.forEach((segment, i) => {
      const value = requested[i];
      if (isParam(segment) && value !== undefined) {
        params[segment.slice(1)] = value;
      }
    });
    return { handler: best.handler, params };
  }
}

// True when `a` has a static segment where `b` has a parameter at the first position they differ.
function moreSpecific(a: string[], b: string[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const aStatic = !isParam(a[i] ?? '');
    const bStatic = !isParam(b[i] ?? '');
    if (aStatic !== bStatic) {
      return aStatic;
    }
  }
  return false;
}
