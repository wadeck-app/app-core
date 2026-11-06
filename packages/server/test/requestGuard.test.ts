import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { allowedHostsFrom, hostnameOf } from '../src/requestGuard.js';
import { buildServer, type AppCoreServer } from '../src/server.js';

describe('hostnameOf', () => {
  it('drops the port and keeps the brackets of an IPv6 address', () => {
    expect(hostnameOf('127.0.0.1:4850')).toBe('127.0.0.1');
    expect(hostnameOf('LocalHost:5173')).toBe('localhost');
    expect(hostnameOf('[::1]:4850')).toBe('[::1]');
    expect(hostnameOf('evil.example')).toBe('evil.example');
  });

  it('says undefined for a value that is not a host', () => {
    expect(hostnameOf('a b')).toBeUndefined();
  });
});

describe('allowedHostsFrom', () => {
  it('joins the option and the environment variable, trimmed, lower case, without empty names', () => {
    expect(allowedHostsFrom(['A.example'], { APP_CORE_ALLOWED_HOSTS: ' b.example, ,C.example ' })).toEqual(['a.example', 'b.example', 'c.example']);
    expect(allowedHostsFrom(undefined, {})).toEqual([]);
  });
});

describe('the request guard, on the real server with a module that changes data', () => {
  let dir: string;
  let app: AppCoreServer;

  async function start(allowedHosts?: string[]): Promise<void> {
    app = await buildServer({ configDir: path.join(dir, 'cfg'), ...(allowedHosts === undefined ? {} : { allowedHosts }) });
    const res = await app.server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'acting', source: { type: 'file', path: path.join(dir, 'manifest.json') } } });
    expect(res.statusCode).toBe(201);
  }
  const post = (headers: Record<string, string> = {}, url = '/api/modules/acting/do') => app.server.inject({ method: 'POST', url, headers });
  const get = (headers: Record<string, string> = {}) => app.server.inject({ method: 'GET', url: '/api/modules/acting/read', headers });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-guard-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'acting',
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.mjs',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'api-backend', 'backend.mjs'),
      `export default function (ctx) {
  ctx.registerRoute('POST', '/do', (req, reply) => reply.send({ done: true }));
  ctx.registerRoute('GET', '/read', (req, reply) => reply.send({ read: true }));
}\n`,
    );
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a change that a page of another site asks for, with a message that says what to do', async () => {
    await start();
    for (const site of ['cross-site', 'same-site']) {
      const res = await post({ 'sec-fetch-site': site });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('cross-site-request');
      expect(res.json().message).toContain(`Sec-Fetch-Site: ${site}`);
      expect(res.json().message).toContain('app-core dashboard itself');
    }
  });

  it('lets through what is not a foreign page: the dashboard, an address typed in the browser, and tools that send no such header', async () => {
    await start();
    for (const headers of [{ 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, {}]) {
      const res = await post(headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ done: true });
    }
  });

  it('also refuses, without Sec-Fetch-Site, a change whose Origin is another site, "null" included; the dashboard origins pass', async () => {
    await start();
    for (const origin of ['https://attacker.example', 'http://attacker.example:4850', 'null']) {
      const res = await post({ origin });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('cross-site-request');
      expect(res.json().message).toContain(`"${origin}"`);
    }
    for (const origin of ['http://127.0.0.1:4850', 'http://localhost:5173', 'http://[::1]:4850']) {
      expect((await post({ origin })).statusCode).toBe(200);
    }
    // A read is not stopped by its Origin (the Host check is what protects reads).
    expect((await get({ origin: 'https://attacker.example' })).statusCode).toBe(200);
  });

  it('guards the built-in routes the same way, not only the module ones', async () => {
    await start();
    const res = await post({ 'sec-fetch-site': 'cross-site' }, '/api/modules/register');
    expect(res.statusCode).toBe(403);
  });

  it('does not stop a read from another site by Sec-Fetch-Site (it is the Host check that stops DNS rebinding)', async () => {
    await start();
    expect((await get({ 'sec-fetch-site': 'cross-site' })).statusCode).toBe(200);
  });

  it('refuses a request addressed to a name that is not this machine, reads included (DNS rebinding), and says how to allow one', async () => {
    await start();
    for (const res of [await get({ host: 'attacker.example:4850' }), await post({ host: 'attacker.example' })]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('host-not-allowed');
      expect(res.json().message).toContain('APP_CORE_ALLOWED_HOSTS');
      expect(res.json().message).toContain('attacker.example');
    }
  });

  it('answers to the loopback names whatever the port (the Vite dev server forwards its own)', async () => {
    await start();
    for (const host of ['127.0.0.1:4850', 'localhost:5173', '[::1]:4850', 'LOCALHOST']) {
      expect((await get({ host })).statusCode).toBe(200);
    }
  });

  it('answers to a name added on purpose', async () => {
    await start(['dash.internal']);
    expect((await get({ host: 'dash.internal:8080' })).statusCode).toBe(200);
    expect((await get({ host: 'other.internal' })).statusCode).toBe(403);
  });
});
