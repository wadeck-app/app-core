import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';

// A module that streams Server-Sent Events (e.g. a log tail) through registerRoute: the handler
// receives the raw Fastify request/reply, so it can hijack the reply and keep writing.
describe('registerRoute handlers can stream Server-Sent Events', () => {
  let dir: string;
  let app: AppCoreServer;
  let baseUrl: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-sse-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'sse',
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
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    reply.raw.write('data: one\\n\\n');
    const timer = ctx.setTimeout(() => { reply.raw.write('data: two\\n\\n'); reply.raw.end(); }, 50);
    req.raw.on('close', () => reply.raw.destroy());
    return timer;
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
    const res = await fetch(`${baseUrl}/api/modules/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'sse', source: { type: 'file', path: path.join(dir, 'manifest.json') } }),
    });
    expect(res.status).toBe(201);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('delivers events incrementally with the event-stream content type', async () => {
    const res = await fetch(`${baseUrl}/api/modules/sse/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    if (res.body === null) {
      throw new Error('expected a streaming body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe('data: one\n\n');

    const second = await reader.read();
    expect(decoder.decode(second.value)).toBe('data: two\n\n');

    const end = await reader.read();
    expect(end.done).toBe(true);
  });
});
