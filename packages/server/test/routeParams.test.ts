import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleRouteRegistry, type ModuleRouteHandler } from '../src/moduleRoutes.js';
import { buildServer, type AppCoreServer } from '../src/server.js';

const handler: ModuleRouteHandler = () => 'ok';
const other: ModuleRouteHandler = () => 'other';

describe('ModuleRouteRegistry with :name segments', () => {
  it('matches a static route exactly and exposes no params', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/status', handler);
    expect(registry.find('m', 'GET', '/status')).toEqual({ handler, params: {} });
    expect(registry.find('m', 'GET', '/other')).toBeUndefined();
  });

  it('extracts and URL-decodes parameters', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/jobs/:jobId/runs/:runId', handler);
    expect(registry.find('m', 'GET', '/jobs/a%20b/runs/42')?.params).toEqual({ jobId: 'a b', runId: '42' });
  });

  it('does not match a different segment count or method', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/history/:eventId', handler);
    expect(registry.find('m', 'GET', '/history')).toBeUndefined();
    expect(registry.find('m', 'GET', '/history/a/b')).toBeUndefined();
    expect(registry.find('m', 'POST', '/history/a')).toBeUndefined();
  });

  it('lets static segments win over parameters, leftmost first', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/jobs/:id', handler);
    registry.register('m', 'GET', '/jobs/new', other);
    expect(registry.find('m', 'GET', '/jobs/new')?.handler).toBe(other);
    expect(registry.find('m', 'GET', '/jobs/7')?.handler).toBe(handler);
  });

  it('keeps modules separate and forgets a module on unregister', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('a', 'GET', '/x/:v', handler);
    expect(registry.find('b', 'GET', '/x/1')).toBeUndefined();
    registry.unregisterAllForModule('a');
    expect(registry.find('a', 'GET', '/x/1')).toBeUndefined();
  });

  it('refuses two routes of the same shape instead of silently overwriting one', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/a/:x', handler);
    expect(() => registry.register('m', 'GET', '/a/:y', other)).toThrow(/conflicts with the already registered GET "\/a\/:x"/);
    expect(() => registry.register('m', 'GET', '/a/:x', other)).toThrow(/conflicts/);
    registry.register('m', 'POST', '/a/:x', other);
    registry.register('m', 'GET', '/a/:x/resource', other);
  });

  it('lets a module name its own parameter "id"', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'POST', '/dlq/:id/replay', handler);
    expect(registry.find('m', 'POST', '/dlq/e1/replay')?.params).toEqual({ id: 'e1' });
  });

  it('rejects invalid, duplicated parameter names and empty segments', () => {
    const registry = new ModuleRouteRegistry();
    expect(() => registry.register('m', 'GET', '/a/:*', handler)).toThrow(/invalid parameter/);
    expect(() => registry.register('m', 'GET', '/a/:', handler)).toThrow(/invalid parameter/);
    expect(() => registry.register('m', 'GET', '/a/:x/:x', handler)).toThrow(/twice/);
    expect(() => registry.register('m', 'GET', '/a//b', handler)).toThrow(/empty path segment/);
  });

  it('returns nothing for a malformed percent-encoding instead of throwing', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/a/:x', handler);
    expect(registry.find('m', 'GET', '/a/%E0%A4%A')).toBeUndefined();
  });
});

describe('parameterised routes on the real server', () => {
  let dir: string;
  let app: AppCoreServer;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-params-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.mjs',
        extensionPoints: [
          { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'api-backend', 'backend.mjs'),
      `export default function (ctx) {
  ctx.registerRoute('GET', '/history', (req, reply) => reply.send({ list: true }));
  ctx.registerRoute('GET', '/history/:eventId', (req, reply) => reply.send({ params: req.params }));
  ctx.registerRoute('POST', '/dlq/:id/replay', (req, reply) => reply.send({ params: req.params }));
}\n`,
    );
    app = await buildServer({ configDir: path.join(dir, 'cfg') });
    const res = await app.server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'queueish', source: { type: 'file', path: path.join(dir, 'manifest.json') } },
    });
    expect(res.statusCode).toBe(201);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('gives the handler exactly its own params, without the catch-all id and *', async () => {
    const res = await app.server.inject({ method: 'GET', url: '/api/modules/queueish/history/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ params: { eventId: 'abc' } });
  });

  it('still serves the static sibling route, and a parameter named "id" is the route\'s own value', async () => {
    const list = await app.server.inject({ method: 'GET', url: '/api/modules/queueish/history' });
    expect(list.json()).toEqual({ list: true });
    const replay = await app.server.inject({ method: 'POST', url: '/api/modules/queueish/dlq/xyz/replay' });
    expect(replay.json()).toEqual({ params: { id: 'xyz' } });
  });

  it('answers 404 for a path no route matches', async () => {
    const res = await app.server.inject({ method: 'GET', url: '/api/modules/queueish/history/a/b' });
    expect(res.statusCode).toBe(404);
  });
});
