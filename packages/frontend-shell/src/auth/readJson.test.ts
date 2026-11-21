import { describe, expect, it } from 'vitest';
import { readJson } from './readJson.js';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readJson', () => {
  it('returns the parsed body of an OK answer', async () => {
    await expect(readJson(json(200, { a: 1 }), 'GET /api/x')).resolves.toEqual({ a: 1 });
  });

  it('throws the server message of a non-OK answer, tagged with the status', async () => {
    const err = (await readJson(json(500, { error: 'auth-file-invalid', message: 'auth.json is not valid. Delete it, then choose a new PIN.' }), 'GET /api/auth/status').catch((e: unknown) => e)) as Error & { status?: number };
    expect(err.message).toBe('auth.json is not valid. Delete it, then choose a new PIN.');
    expect(err.status).toBe(500);
  });

  it('says what was called, the status and what to do when the answer has no message', async () => {
    const err = (await readJson(new Response('', { status: 502 }), 'GET /api/auth/status').catch((e: unknown) => e)) as Error & { status?: number };
    expect(err.message).toContain('GET /api/auth/status answered 502');
    expect(err.message).toContain('retry in a few seconds');
    expect(err.status).toBe(502);
  });

  it('says so when an OK answer is not JSON', async () => {
    const err = (await readJson(new Response('<html>', { status: 200 }), 'GET /api/x').catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('GET /api/x answered 200 but not with JSON');
  });
});
