import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { fixtureManifest } from './fixtureManifests.js';


describe('GET /api/slots/:slotId', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-config-slots-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  async function registerBothContributors(server: Awaited<ReturnType<typeof buildServer>>['server']) {
    // The provider first: the contributors require it (decision 82).
    const provider = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'slot-provider', source: { type: 'file', path: fixtureManifest('app-module-slot-provider') } },
    });
    expect(provider.statusCode, provider.body).toBe(201);
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: {
        id: 'slot-contributor-a',
        source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-a') },
      },
    });
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: {
        id: 'slot-contributor-b',
        source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-b') },
      },
    });
  }

  it('aggregates contributions from multiple modules, sorted by order, order field stripped', async () => {
    const { server } = await buildServer({ configDir });
    await registerBothContributors(server);

    const res = await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    // Bare array, not an envelope -- exactly what dsl-renderer's ExtensionSlot expects.
    expect(Array.isArray(body)).toBe(true);

    // order 5 (B) -> order 20 (A) -> no order (B), proving actual sorting
    // happened (B's order=5 entry was declared second in its manifest, after
    // B's no-order entry, yet sorts first in the response).
    expect(body).toEqual([
      { $type: 'Badge', label: 'contributor-b-ordered' },
      { $type: 'Badge', label: 'contributor-a' },
      { $type: 'Badge', label: 'contributor-b-unordered' },
    ]);

    // `order` must never leak into the response -- app-core sorts by it, dsl-renderer never sees it.
    for (const item of body) {
      expect(item).not.toHaveProperty('order');
    }
  });

  it('excludes extensionPoints targeting a different slot (A dashboard widget, B unused-slot entry)', async () => {
    const { server } = await buildServer({ configDir });
    await registerBothContributors(server);

    const res = await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' });
    const body = res.json() as Array<{ label: string }>;
    expect(body.map((v) => v.label)).not.toContain('contributor-a-own-widget');
    expect(body.map((v) => v.label)).not.toContain('contributor-b-unused-slot');
  });

  it('returns an empty array (not an error) for a slot nobody contributes to', async () => {
    const { server } = await buildServer({ configDir });
    await registerBothContributors(server);

    const res = await server.inject({ method: 'GET', url: '/api/slots/test:nobody-contributes-here' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns an empty array when no modules are registered at all', async () => {
    const { server } = await buildServer({ configDir });
    const res = await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
