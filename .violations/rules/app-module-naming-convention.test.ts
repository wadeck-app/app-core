import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-naming-convention.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/naming-convention', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  async function checkFolder(name: string) {
    mod = createModule({}, name);
    return rule.check([mod.at('manifest.json')]);
  }

  it('passes a correctly prefixed name', async () => {
    expect(await checkFolder('app-module-queue')).toHaveLength(0);
  });

  it('rejects a bare "app-module" with no suffix', async () => {
    const violations = await checkFolder('app-module');
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('must be named "app-module-<name>"');
  });

  it('rejects an unrelated name entirely', async () => {
    expect(await checkFolder('queue-module')).toHaveLength(1);
  });

  it('rejects suffix-style naming (queue-app-module)', async () => {
    expect(await checkFolder('queue-app-module')).toHaveLength(1);
  });

  it('skips the generated dist-module/manifest.json', async () => {
    mod = createModule({ 'dist-module/manifest.json': '{}' });
    expect(await rule.check([mod.at('dist-module/manifest.json')])).toHaveLength(0);
  });
});
