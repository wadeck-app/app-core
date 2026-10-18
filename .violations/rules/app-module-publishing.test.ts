import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-publishing.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/publishing', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('passes .gitignore with dist-module and files == ["dist-module"]', async () => {
    mod = createModule();
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('accepts /dist-module/ and CRLF line endings in .gitignore', async () => {
    mod = createModule({ '.gitignore': 'node_modules\r\n/dist-module/\r\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('flags a missing .gitignore', async () => {
    mod = createModule({ '.gitignore': null });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('gitignored');
  });

  it('flags a .gitignore that does not list dist-module', async () => {
    mod = createModule({ '.gitignore': 'node_modules\ndist\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
  });

  it('flags files other than ["dist-module"]', async () => {
    for (const files of [undefined, ['dist-module', 'src'], ['src'], []]) {
      mod = createModule({ 'package.json': JSON.stringify({ name: 'x', files }) });
      expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
      mod.cleanup();
    }
    mod = createModule();
  });

  it('flags a package.json that is not JSON', async () => {
    mod = createModule({ 'package.json': '{nope' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
  });

  it('does not require a package.json (only .gitignore)', async () => {
    mod = createModule({ 'package.json': null });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });
});
