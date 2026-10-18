import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';
import { fixtureManifest } from './fixtureManifests.js';

// End-to-end check of the reference module (test-app-modules/app-module-example, id "example"): the real
// packaged output, registered over HTTP in a real server next to the module it requires. Each test is one
// behaviour the example is there to demonstrate; if one fails, the README of the example is lying.
describe('app-module-example, the reference module', () => {
  let configDir: string;
  let app: AppCoreServer;
  let baseUrl: string;
  const scratchDirs: string[] = [];

  const dataDir = (): string => path.join(configDir, 'data', 'example');
  const api = (sub: string): string => `${baseUrl}/api/modules/example${sub}`;
  const post = (endpoint: string, body: unknown): Promise<Response> =>
    fetch(`${baseUrl}/api/modules/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const register = (endpoint: 'register' | 'update', manifestPath: string): Promise<Response> =>
    post(endpoint, { id: 'example', source: { type: 'file', path: manifestPath } });

  // Reads server-sent events until `count` data lines arrived (fails after `ms`), returning their payloads.
  async function readEvents(reader: ReadableStreamDefaultReader<Uint8Array>, count: number, ms: number): Promise<string[]> {
    const decoder = new TextDecoder();
    const found: string[] = [];
    let buffer = '';
    const deadline = Date.now() + ms;
    while (found.length < count) {
      const left = deadline - Date.now();
      if (left <= 0) {
        throw new Error(`Only ${found.length} of ${count} events arrived within ${ms} ms (received: ${JSON.stringify(found)}).`);
      }
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No event within ${ms} ms (received: ${JSON.stringify(found)}).`)), left)),
      ]);
      if (chunk.done) {
        throw new Error(`The stream ended after ${found.length} of ${count} events.`);
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (block.startsWith('data: ')) {
          found.push(block.slice('data: '.length));
        }
      }
    }
    return found;
  }

  // Waits for a file to appear (fails after `ms`): the module's close handler runs asynchronously.
  async function waitForFile(file: string, ms: number): Promise<void> {
    const deadline = Date.now() + ms;
    while (!fs.existsSync(file)) {
      if (Date.now() > deadline) {
        throw new Error(`${file} did not appear within ${ms} ms.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  // Resolves true when the stream ends or errors, false when it is still open after `ms`.
  async function endsWithin(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<boolean> {
    const ended = (async () => {
      try {
        for (;;) {
          if ((await reader.read()).done) {
            return true;
          }
        }
      } catch {
        // A destroyed socket rejects the read: the stream is over, which is what is asked.
        return true;
      }
    })();
    return Promise.race([ended, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);
  }

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-example-'));
    app = await buildServer({ configDir });
    await app.server.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    // The provider first: the example requires it.
    const provider = await post('register', { id: 'slot-provider', source: { type: 'file', path: fixtureManifest('app-module-slot-provider') } });
    expect(provider.status, await provider.clone().text()).toBe(201);
    const example = await register('register', fixtureManifest('app-module-example'));
    expect(example.status, await example.clone().text()).toBe(201);
  });

  afterEach(async () => {
    await app.server.close();
    fs.rmSync(configDir, { recursive: true, force: true });
    for (const dir of scratchDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serves a plain JSON route', async () => {
    const res = await fetch(api('/items'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { items: Array<{ id: string; name: string; status: string }> };
    expect(body.items.map((item) => item.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(body.items[0]).toEqual({ id: 'alpha', name: 'Alpha', status: 'active' });
  });

  it('serves a :param route, and answers 404 with an actionable message for an unknown id', async () => {
    const known = await fetch(api('/items/beta'));
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ id: 'beta', name: 'Beta', status: 'idle' });

    const unknown = await fetch(api('/items/nope'));
    expect(unknown.status).toBe(404);
    const body = (await unknown.json()) as { error: string };
    expect(body.error).toContain('"nope"');
    expect(body.error).toContain('/items');
  });

  it('streams ticks over SSE (ctx.setInterval, ctx.emit, a ctx.on listener per stream removed with ctx.off), ends the stream on unload with its close handler run, and flushes the counter from ctx.instance in teardown', async () => {
    const res = await fetch(api('/events'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();

    // First event is sent on connect; the second can only come from the interval -> emit -> on chain.
    const [first, second] = await readEvents(reader, 2, 4000);
    const firstTick = (JSON.parse(first!) as { tick: number }).tick;
    const secondTick = (JSON.parse(second!) as { tick: number }).tick;
    expect(secondTick).toBe(firstTick + 1);
    expect(fs.existsSync(path.join(dataDir(), 'events.log'))).toBe(false);
    // Setup marked the instance as running. The counter lives in memory: nothing is saved while it runs.
    expect(fs.existsSync(path.join(dataDir(), 'running.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir(), 'ticks.json'))).toBe(false);

    const unregistered = await post('unregister', { id: 'example' });
    expect(unregistered.status).toBe(200);

    expect(await endsWithin(reader, 2000)).toBe(true);
    // The module's own cleanup ran (req.raw.on('close')), its teardown removed the marker, and flushed the counter
    // it got from setup as ctx.instance, with the reason app-core gave.
    expect(fs.existsSync(path.join(dataDir(), 'running.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir(), 'teardowns.log'), 'utf8')).toBe('unregister\n');
    // The server side of the socket reports "close" a moment after the client saw the end.
    await waitForFile(path.join(dataDir(), 'events.log'), 2000);
    expect(fs.readFileSync(path.join(dataDir(), 'events.log'), 'utf8')).toContain('stream closed');
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir(), 'ticks.json'), 'utf8')) as { ticks: number };
    expect(saved.ticks).toBeGreaterThanOrEqual(secondTick);
  }, 15_000);

  it('runs no migrate on a first install', () => {
    expect(fs.existsSync(path.join(dataDir(), 'migrations.log'))).toBe(false);
  });

  it('migrate receives previousVersion on a version swap and renames the legacy state file, then setup reads it', async () => {
    // A newer build of the same module: the same dist-module with another version stamped, in another folder.
    // The folder is named "dist-module" on purpose: vitest.config.ts only lets Node load a CommonJS bundle
    // natively from such a path; anywhere else vitest wraps it and the default export is no longer the function.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-example-v2-'));
    scratchDirs.push(scratch);
    const v2 = path.join(scratch, 'dist-module');
    fs.cpSync(path.dirname(fixtureManifest('app-module-example')), v2, { recursive: true });
    const manifestPath = path.join(v2, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version: string };
    expect(manifest.version).toBe('1.0.0');
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: '1.1.0' }));
    // What version 1.0.0 would have left behind: its state under the legacy name.
    fs.writeFileSync(path.join(dataDir(), 'counter.json'), JSON.stringify({ ticks: 41 }));

    const updated = await register('update', manifestPath);
    expect(updated.status, await updated.clone().text()).toBe(200);

    expect(fs.existsSync(path.join(dataDir(), 'counter.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir(), 'ticks.json'), 'utf8'))).toEqual({ ticks: 41 });
    expect(fs.readFileSync(path.join(dataDir(), 'migrations.log'), 'utf8').trim()).toBe('1.0.0 -> 1.1.0');
    // The old instance was torn down for an update (before migrate ran).
    expect(fs.readFileSync(path.join(dataDir(), 'teardowns.log'), 'utf8')).toBe('update\n');

    // Setup of the new version resumed from the migrated file.
    const res = await fetch(api('/events'));
    const reader = res.body!.getReader();
    const [first] = await readEvents(reader, 1, 4000);
    // The 1 s interval may already have ticked once or twice since setup.
    const resumed = (JSON.parse(first!) as { tick: number }).tick;
    expect(resumed).toBeGreaterThanOrEqual(41);
    expect(resumed).toBeLessThan(45);
    // The stream is ended from the server side: measured, a client-side cancel or abort here left a connection
    // open that made server.close() wait past the hook timeout.
    await post('unregister', { id: 'example' });
    await endsWithin(reader, 2000);
    // Let the module's close handler finish before the config dir is removed.
    await waitForFile(path.join(dataDir(), 'events.log'), 2000);
  }, 15_000);

  it('exposes its own slot and fills the slot of the provider it requires', async () => {
    const own = await fetch(`${baseUrl}/api/slots/example:row-actions`);
    expect(own.status).toBe(200);
    // Nobody contributes to it here: an exposed slot with no contributor is an empty array, not an error.
    expect(await own.json()).toEqual([]);

    const shared = await fetch(`${baseUrl}/api/slots/slot-provider:shared-slot`);
    expect(await shared.json()).toEqual([{ $type: 'Badge', label: 'example-contribution' }]);
  });

  it('resolves its views: nav page with a DataTable fed by $sources, route page using $route.id, inline widget, navbar widget', async () => {
    const body = (await (await fetch(`${baseUrl}/api/modules`)).json()) as {
      modules: Array<{ id: string; version: string; extensionPoints: Array<{ kind: string; slot: string; path?: string; view: Record<string, unknown> }> }>;
      failed: unknown[];
    };
    expect(body.failed).toEqual([]);
    const example = body.modules.find((m) => m.id === 'example');
    expect(example?.version).toBe('1.0.0');
    const points = example!.extensionPoints;
    const bySlot = (slot: string) => points.filter((p) => p.slot === slot);

    const [nav] = bySlot('nav');
    const navJson = JSON.stringify(nav!.view);
    expect(navJson).toContain('"DataTable"');
    expect(navJson).toContain('/api/modules/example/items');

    const [route] = bySlot('route');
    expect(route!.path).toBe('/items/:id');
    const routeJson = JSON.stringify(route!.view);
    expect(routeJson).toContain('$route.id');
    expect(routeJson).toContain('ExtensionSlot');
    expect(routeJson).toContain('example:row-actions');

    expect(bySlot('dashboard').map((p) => p.view)).toEqual([{ $type: 'Badge', label: 'example', variant: 'info' }]);
    expect(JSON.stringify(bySlot('navbar')[0]!.view)).toContain('example:LiveTicks');
  });

  it('serves the dsl-lib bundle that reads the SSE route', async () => {
    const body = (await (await fetch(`${baseUrl}/api/modules`)).json()) as { modules: Array<{ id: string; dslLib?: { entryUrl: string; cssUrl?: string } }> };
    const dslLib = body.modules.find((m) => m.id === 'example')?.dslLib;
    expect(dslLib?.entryUrl).toMatch(/^\/api\/modules\/example\/_lib\/entries\.mjs\?v=1\.0\.0-/);

    const entries = await (await fetch(`${baseUrl}${dslLib!.entryUrl}`)).text();
    expect(entries).toContain('EventSource');
    expect(entries).toContain('/api/modules/example/events');
    // Cleanup on unmount, and the shared singletons come from the shell instead of being bundled.
    expect(entries).toContain('.close()');
    expect(entries).toContain('__APP_CORE_SHARED__');

    const css = await (await fetch(`${baseUrl}${dslLib!.cssUrl!}`)).text();
    expect(css).toContain('var(--color-content)');
    // Theme tokens only: no color literal.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
