import { describe, expect, it } from 'vitest';
import { ModuleRouteRegistry, type ModuleRouteHandler } from '../src/moduleRoutes.js';

const handler: ModuleRouteHandler = () => 'ok';

describe('route effect', () => {
  it('defaults to read for GET and HEAD, write for the other methods', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'GET', '/a', handler);
    registry.register('m', 'head', '/b', handler);
    registry.register('m', 'POST', '/c', handler);
    registry.register('m', 'DELETE', '/d', handler);
    expect(['/a', '/c', '/d'].map((p, i) => registry.find('m', ['GET', 'POST', 'DELETE'][i] ?? '', p)?.effect)).toEqual(['read', 'write', 'write']);
    expect(registry.find('m', 'HEAD', '/b')?.effect).toBe('read');
  });

  it('keeps the effect a module declares', () => {
    const registry = new ModuleRouteRegistry();
    registry.register('m', 'POST', '/launch', handler, { effect: 'sensitive' });
    registry.register('m', 'GET', '/reveal', handler, { effect: 'sensitive' });
    expect(registry.find('m', 'POST', '/launch')?.effect).toBe('sensitive');
    expect(registry.find('m', 'GET', '/reveal')?.effect).toBe('sensitive');
  });

  it('refuses an unknown effect, listing the valid ones', () => {
    const registry = new ModuleRouteRegistry();
    expect(() => registry.register('m', 'POST', '/x', handler, { effect: 'dangerous' as never })).toThrow(/effect "dangerous".*read, write, sensitive/);
  });
});
