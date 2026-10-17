import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';

interface ListedModules {
  modules: Array<{ id: string; extensionPoints: Array<{ view: { label?: string } }> }>;
  failed: Array<{ id: string }>;
}

// A running module must survive an update whose views are broken: the update is rejected and the
// previous instance keeps serving its routes and views.
describe('a broken update does not take down a working module', () => {
  let dir: string;
  let app: AppCoreServer;

  const update = (): Promise<{ statusCode: number }> =>
    app.server.inject({
      method: 'POST',
      url: '/api/modules/update',
      payload: { id: 'steady', source: { type: 'file', path: path.join(dir, 'manifest.json') } },
    });

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-safety-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.mkdirSync(path.join(dir, 'dsl-frontend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.mjs',
        extensionPoints: [{ kind: 'page', slot: 'nav', label: 'P', view: { type: 'path', value: './dsl-frontend/page.yaml' } }],
      }),
    );
    fs.writeFileSync(path.join(dir, 'dsl-frontend', 'page.yaml'), '$type: Badge\nlabel: working\n');
    fs.writeFileSync(
      path.join(dir, 'api-backend', 'backend.mjs'),
      "export default function (ctx) { ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({ pong: true })); }\n",
    );
    app = await buildServer({ configDir: path.join(dir, 'cfg') });
    expect((await update()).statusCode).toBe(200);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the previous instance, its routes and its views when the new view YAML is invalid', async () => {
    fs.writeFileSync(path.join(dir, 'dsl-frontend', 'page.yaml'), '$type: [unclosed\n');

    expect((await update()).statusCode).toBe(500);

    const ping = await app.server.inject({ method: 'GET', url: '/api/modules/steady/ping' });
    expect(ping.json()).toEqual({ pong: true });
    const body = (await app.server.inject({ method: 'GET', url: '/api/modules' })).json<ListedModules>();
    expect(body.modules.map((m) => m.id)).toEqual(['steady']);
    expect(body.modules[0]?.extensionPoints[0]?.view.label).toBe('working');
    expect(body.failed.map((f) => f.id)).toEqual(['steady']);
  });
});
