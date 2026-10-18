import { describe, it, expect } from 'vitest';
import { DEFAULT_PORT, parsePortEnv, resolvePort } from '../src/port.js';

describe('APP_CORE_PORT', () => {
  it('defaults to 4850 when unset or empty', () => {
    expect(DEFAULT_PORT).toBe(4850);
    expect(parsePortEnv({})).toBeUndefined();
    expect(parsePortEnv({ APP_CORE_PORT: '' })).toBeUndefined();
    expect(resolvePort({})).toBe(4850);
  });

  it('reads a valid port', () => {
    expect(resolvePort({ APP_CORE_PORT: '4861' })).toBe(4861);
    expect(parsePortEnv({ APP_CORE_PORT: '65535' })).toBe(65535);
  });

  it.each(['abc', '0', '-1', '65536', '48.5', ' '])('throws on the malformed value %j instead of using another port', (bad) => {
    expect(() => resolvePort({ APP_CORE_PORT: bad })).toThrow(/Invalid APP_CORE_PORT/);
  });
});
