import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bodyEtag, etagMatches, fileVersion, parseIfNoneMatch, versionEtag } from '../src/conditionalGet.js';
import { buildServer, type AppCoreServer } from '../src/server.js';

describe('If-None-Match', () => {
  it('reads a list of tags, the wildcard, and nothing', () => {
    expect(parseIfNoneMatch('W/"a", "b"')).toEqual(['W/"a"', '"b"']);
    expect(parseIfNoneMatch('*')).toBe('*');
    expect(parseIfNoneMatch(undefined)).toEqual([]);
    expect(parseIfNoneMatch('  ')).toEqual([]);
  });

  it('matches weakly: W/ is ignored on both sides', () => {
    expect(etagMatches('W/"a"', 'W/"a"')).toBe(true);
    expect(etagMatches('"a"', 'W/"a"')).toBe(true);
    expect(etagMatches('W/"x", W/"a"', 'W/"a"')).toBe(true);
    expect(etagMatches('*', 'W/"a"')).toBe(true);
    expect(etagMatches('W/"b"', 'W/"a"')).toBe(false);
    expect(etagMatches(undefined, 'W/"a"')).toBe(false);
  });
});

describe('tags', () => {
  it('gives the same tag to the same body and another to another', () => {
    expect(bodyEtag('{"a":1}')).toBe(bodyEtag('{"a":1}'));
    expect(bodyEtag('{"a":1}')).not.toBe(bodyEtag('{"a":2}'));
    expect(bodyEtag(Buffer.from('x'))).toBe(bodyEtag('x'));
    expect(bodyEtag('x')).toMatch(/^W\/"[A-Za-z0-9_-]{22}"$/);
  });

  it('keeps a plain version as it is and hashes one that would break the header', () => {
    expect(versionEtag('v1.2-3')).toBe('W/"v1.2-3"');
    expect(versionEtag('has "quotes" and spaces')).toMatch(/^W\/"[A-Za-z0-9_-]{22}"$/);
  });
});

describe('fileVersion', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-fileversion-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stays the same while the files do, and changes when one is modified or when another appears', async () => {
    const a = path.join(dir, 'a.json');
    const b = path.join(dir, 'b.json');
    fs.writeFileSync(a, '{"n":1}');
    const first = await fileVersion([a, b]);
    expect(await fileVersion([a, b])).toBe(first);
    fs.writeFileSync(a, '{"n":10}');
    const second = await fileVersion([a, b]);
    expect(second).not.toBe(first);
    fs.writeFileSync(b, '[]');
    expect(await fileVersion([a, b])).not.toBe(second);
  });

  it('treats a missing file as a version of its own, not as an error', async () => {
    const missing = path.join(dir, 'nope.json');
    expect(await fileVersion([missing])).toBe(await fileVersion([missing]));
  });

  it('refuses an empty list', async () => {
    await expect(fileVersion([])).rejects.toThrow('needs at least one file path');
  });
});

describe('the GET routes of a module, on the real server', () => {
  let dir: string;
  let app: AppCoreServer;
  const get = (url: string, headers: Record<string, string> = {}) => app.server.inject({ method: 'GET', url: `/api/modules/tagged${url}`, headers });

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-etag-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'tagged',
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.mjs',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'api-backend', 'backend.mjs'),
      `export default function (ctx) {
  let version = 'v1';
  let computed = 0;
  let counter = 0;
  ctx.registerRoute('GET', '/data', (req, reply) => reply.send({ n: 1 }));
  ctx.registerRoute('GET', '/changing', (req, reply) => reply.send({ n: ++counter }));
  ctx.registerRoute('GET', '/text', (req, reply) => reply.type('text/plain').send('hello'));
  ctx.registerRoute('GET', '/own', (req, reply) => reply.header('ETag', 'W/"mine"').header('Cache-Control', 'max-age=5').send({ own: true }));
  ctx.registerRoute('GET', '/versioned', (req, reply) => {
    if (ctx.unchanged(req, reply, version)) return reply;
    computed++;
    return reply.send({ version, computed });
  });
  ctx.registerRoute('POST', '/bump', (req, reply) => { version = 'v' + (Number(version.slice(1)) + 1); return reply.send({ version }); });
  ctx.registerRoute('POST', '/data', (req, reply) => reply.send({ posted: true }));
}\n`,
    );
    app = await buildServer({ configDir: path.join(dir, 'cfg') });
    const res = await app.server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'tagged', source: { type: 'file', path: path.join(dir, 'manifest.json') } } });
    expect(res.statusCode).toBe(201);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('gives a JSON answer an ETag and asks the client to revalidate it', async () => {
    const res = await get('/data');
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBe(bodyEtag('{"n":1}'));
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.json()).toEqual({ n: 1 });
  });

  it('answers 304 with no body when the client has the tag, and 200 when it has another', async () => {
    const first = await get('/data');
    const again = await get('/data', { 'if-none-match': String(first.headers['etag']) });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
    expect(again.headers['etag']).toBe(first.headers['etag']);
    expect((await get('/data', { 'if-none-match': 'W/"old"' })).statusCode).toBe(200);
    expect((await get('/data', { 'if-none-match': '*' })).statusCode).toBe(304);
  });

  it('sends the new body and a new tag when the answer changed', async () => {
    const first = await get('/changing');
    const second = await get('/changing', { 'if-none-match': String(first.headers['etag']) });
    expect(second.statusCode).toBe(200);
    expect(second.headers['etag']).not.toBe(first.headers['etag']);
    expect(second.json()).toEqual({ n: 2 });
  });

  it('does the same for a text answer', async () => {
    const first = await get('/text');
    expect(first.headers['etag']).toBe(bodyEtag('hello'));
    expect((await get('/text', { 'if-none-match': String(first.headers['etag']) })).statusCode).toBe(304);
  });

  it('leaves the other methods alone', async () => {
    const res = await app.server.inject({ method: 'POST', url: '/api/modules/tagged/data', headers: { 'if-none-match': '*' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeUndefined();
  });

  it('respects the ETag and the Cache-Control the module set itself', async () => {
    const res = await get('/own');
    expect(res.headers['etag']).toBe('W/"mine"');
    expect(res.headers['cache-control']).toBe('max-age=5');
    expect((await get('/own', { 'if-none-match': 'W/"mine"' })).statusCode).toBe(304);
  });

  it('does not touch a 404', async () => {
    const res = await get('/nowhere');
    expect(res.statusCode).toBe(404);
    expect(res.headers['etag']).toBeUndefined();
  });

  it.each(['/api/modules', '/api/slots/anything', '/api/shell-settings'])('the answer of %s, which the shell asks again and again, is a 304 while it does not change', async (url) => {
    const first = await app.server.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    expect(first.headers['etag']).toMatch(/^W\/"/);
    expect(first.headers['cache-control']).toBe('no-cache');
    const again = await app.server.inject({ method: 'GET', url, headers: { 'if-none-match': String(first.headers['etag']) } });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
  });

  it('ctx.unchanged answers 304 before the handler computes anything, until the version changes', async () => {
    const first = await get('/versioned');
    expect(first.statusCode).toBe(200);
    expect(first.headers['etag']).toBe('W/"v1"');
    expect(first.json()).toEqual({ version: 'v1', computed: 1 });

    const second = await get('/versioned', { 'if-none-match': 'W/"v1"' });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');

    await app.server.inject({ method: 'POST', url: '/api/modules/tagged/bump' });
    const third = await get('/versioned', { 'if-none-match': 'W/"v1"' });
    expect(third.statusCode).toBe(200);
    expect(third.headers['etag']).toBe('W/"v2"');
    // computed went 1 -> 2: the 304 in between did not compute.
    expect(third.json()).toEqual({ version: 'v2', computed: 2 });
  });
});

describe('the pure part, usable without Node (the SDK exports createModuleContext to browser code)', () => {
  it('hashes a text to 22 URL-safe characters, the same every time', async () => {
    const { hashText } = await import('../src/etagCore.js');
    expect(hashText('a')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(hashText('a')).toBe(hashText('a'));
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('é')).not.toBe(hashText('e'));
  });

  it('a context built without the file service of the server says what to do for ctx.fileVersion, and ctx.unchanged still works', async () => {
    const { createModuleContext } = await import('../src/moduleContext.js');
    const { ModuleRouteRegistry } = await import('../src/moduleRoutes.js');
    const ctx = createModuleContext('t', new ModuleRouteRegistry(), '/tmp/t');
    await expect(ctx.fileVersion('/tmp/x')).rejects.toThrow('pass { fileVersion } as the fourth argument');

    const sent: string[] = [];
    const headers: Record<string, string> = {};
    const reply = {
      header: (k: string, v: string) => ((headers[k] = v), reply),
      getHeader: (k: string) => headers[k],
      code: (c: number) => (sent.push(`code ${c}`), reply),
      send: () => (sent.push('send'), reply),
      statusCode: 200,
    };
    const request = { method: 'GET', headers: { 'if-none-match': 'W/"v1"' } };
    expect(ctx.unchanged(request as never, reply as never, 'v1')).toBe(true);
    expect(sent).toEqual(['code 304', 'send']);
    expect(headers['ETag']).toBe('W/"v1"');
    expect(() => ctx.unchanged(request as never, reply as never, '')).toThrow('needs a version');
  });
});
