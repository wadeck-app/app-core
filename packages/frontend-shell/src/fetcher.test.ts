import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetcher } from './fetcher.js';

const answer = (body: string | null, init: ResponseInit): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, init)));
};
const rejection = async (url: string): Promise<Error & { status?: number }> => {
  try {
    await fetcher(url);
  } catch (err) {
    return err as Error & { status?: number };
  }
  throw new Error('the fetcher did not throw');
};

describe('fetcher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the JSON of a successful answer, and nothing for a 204 or an empty 200', async () => {
    answer('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } });
    expect(await fetcher('POST /api/modules/task/tasks', undefined, {})).toEqual({ id: 7 });
    answer(null, { status: 204 });
    expect(await fetcher('DELETE /api/modules/task/tasks/7')).toBeUndefined();
    answer('', { status: 200 });
    expect(await fetcher('GET /api/modules/task/ping')).toBeUndefined();
  });

  it('says the status, the route and the likely cause for an empty 500 (a dev proxy whose target is down)', async () => {
    answer('', { status: 500, statusText: 'Internal Server Error', headers: { 'content-type': 'text/plain' } });
    const err = await rejection('POST /api/modules/task/tasks');
    expect(err.message).toContain('POST /api/modules/task/tasks answered 500 Internal Server Error with no JSON body');
    expect(err.message).toContain('may be restarting or down');
    expect(err.status).toBe(500);
  });

  it('says the same for a plain-text error body, not a cryptic JSON parse error', async () => {
    answer('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } });
    const err = await rejection('GET /api/modules/task/tasks');
    expect(err.message).toContain('answered 502');
    expect(err.message).not.toContain('Unexpected');
  });

  it('keeps the message the module gave in a JSON error', async () => {
    answer('{"error":"task 7 not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
    const err = await rejection('GET /api/modules/task/tasks/7');
    expect(err.message).toBe('task 7 not found');
    expect(err.status).toBe(404);
    answer('{"message":"bad input"}', { status: 400 });
    expect((await rejection('POST /api/modules/task/tasks')).message).toBe('bad input');
  });

  it('refuses a successful answer that is not JSON (an HTML page for an API route), saying so', async () => {
    answer('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const err = await rejection('GET /api/modules/nowhere/x');
    expect(err.message).toContain('answered 200 but not with JSON (content-type "text/html")');
  });
});
