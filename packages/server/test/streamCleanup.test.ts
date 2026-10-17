import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleRouteRegistry } from '../src/moduleRoutes.js';
import { buildServer, type AppCoreServer } from '../src/server.js';

function newResponse(): ServerResponse {
  return new ServerResponse(new IncomingMessage(new Socket()));
}

describe('ModuleRouteRegistry ends streaming responses of a module when it is unloaded', () => {
  it('destroys a response that already sent its headers and has not finished', () => {
    const registry = new ModuleRouteRegistry();
    const streaming = newResponse();
    streaming.writeHead(200, { 'Content-Type': 'text/event-stream' });
    registry.trackResponse('m', streaming);

    registry.unregisterAllForModule('m');

    expect(streaming.destroyed).toBe(true);
  });

  it('leaves requests still waiting for their handler and finished responses alone', () => {
    const registry = new ModuleRouteRegistry();
    const waiting = newResponse();
    const finished = newResponse();
    finished.writeHead(200);
    finished.end();
    registry.trackResponse('m', waiting);
    registry.trackResponse('m', finished);

    registry.unregisterAllForModule('m');

    expect(waiting.destroyed).toBe(false);
    expect(finished.destroyed).toBe(false);
  });

  it('forgets a response once it closed and never touches another module', () => {
    const registry = new ModuleRouteRegistry();
    const closed = newResponse();
    closed.writeHead(200);
    registry.trackResponse('m', closed);
    closed.emit('close');
    const other = newResponse();
    other.writeHead(200);
    registry.trackResponse('other', other);

    registry.unregisterAllForModule('m');

    expect(closed.destroyed).toBe(false);
    expect(other.destroyed).toBe(false);
  });
});

declare global {
  // eslint-disable-next-line no-var
  var __streamClosedBy: number | undefined;
}

describe('streams opened through registerRoute on the real server', () => {
  let dir: string;
  let app: AppCoreServer;
  let baseUrl: string;

  const register = (endpoint: 'register' | 'update'): Promise<Response> =>
    fetch(`${baseUrl}/api/modules/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'streamy', source: { type: 'file', path: path.join(dir, 'manifest.json') } }),
    });

  // Resolves true when the stream ends or errors, false if it is still open after `ms`.
  async function endsWithin(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<boolean> {
    const ended = (async () => {
      try {
        for (;;) {
          const { done } = await reader.read();
          if (done) {
            return true;
          }
        }
      } catch {
        return true;
      }
    })();
    const stillOpen = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), ms);
    });
    return Promise.race([ended, stillOpen]);
  }

  beforeEach(async () => {
    globalThis.__streamClosedBy = undefined;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-streams-'));
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
  ctx.registerRoute('GET', '/stream', (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' });
    reply.raw.write('data: tick\\n\\n');
    const timer = setInterval(() => reply.raw.write('data: tick\\n\\n'), 20);
    req.raw.on('close', () => {
      clearInterval(timer);
      globalThis.__streamClosedBy = (globalThis.__streamClosedBy ?? 0) + 1;
    });
  });
}\n`,
    );
    app = await buildServer({ configDir: path.join(dir, 'cfg') });
    await app.server.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    expect((await register('register')).status).toBe(201);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function openStream(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const res = await fetch(`${baseUrl}/api/modules/streamy/stream`);
    if (res.body === null) {
      throw new Error('expected a streaming body');
    }
    const reader = res.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('data: tick\n\n');
    return reader;
  }

  it('closes an open stream, and runs the module cleanup, when the module is unregistered', async () => {
    const reader = await openStream();

    const res = await fetch(`${baseUrl}/api/modules/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'streamy' }),
    });
    expect(res.status).toBe(200);

    expect(await endsWithin(reader, 3000)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(globalThis.__streamClosedBy).toBe(1);
  });

  it('closes an open stream when the module is swapped by an update', async () => {
    const reader = await openStream();

    expect((await register('update')).status).toBe(200);

    expect(await endsWithin(reader, 3000)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(globalThis.__streamClosedBy).toBe(1);
    const again = await fetch(`${baseUrl}/api/modules/streamy/stream`);
    expect(again.status).toBe(200);
    await again.body?.cancel();
  });
});
