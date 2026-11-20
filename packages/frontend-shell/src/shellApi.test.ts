import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { elevate } from './auth/elevation.js';
import { fetcher } from './fetcher.js';
import { APP_CORE_SHELL_GLOBAL, ensureSharedGlobals } from './sharedGlobals.js';

// A module's bundle holds the SDK's copy of the key (`@wadeck-app/app-core-sdk/shell`) and the shell its own: they must stay equal.
describe('the shell API given to the dsl-lib components', () => {
  const constIn = (source: string, name: string): string | undefined => new RegExp(`${name} = '([^']+)'`).exec(source)?.[1];

  it('uses the key of the SDK', () => {
    const sdk = fs.readFileSync(path.join(process.cwd(), '..', 'app-core-sdk', 'src', 'shell.ts'), 'utf8');
    expect(constIn(sdk, 'APP_CORE_SHELL_GLOBAL')).toBe('__APP_CORE_SHELL__');
    expect(APP_CORE_SHELL_GLOBAL).toBe(constIn(sdk, 'APP_CORE_SHELL_GLOBAL'));
  });

  it('gives the elevate and the fetcher of the shell itself, before any module bundle is imported', async () => {
    await ensureSharedGlobals();
    const api: unknown = Reflect.get(globalThis, APP_CORE_SHELL_GLOBAL);
    expect(api).toEqual({ elevate, fetcher });
    expect((api as { elevate: unknown }).elevate).toBe(elevate);
    expect((api as { fetcher: unknown }).fetcher).toBe(fetcher);
  });
});
