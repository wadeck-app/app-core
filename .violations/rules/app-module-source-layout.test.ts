import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-source-layout.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/source-layout', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('passes the standard layout, including README, config files, dotfolders and dist-module', async () => {
    mod = createModule({
      'README.md': '# x\n',
      'tsconfig.json': '{}',
      'vitest.config.ts': 'export default {};\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'dist-module/manifest.json': '{}',
      'src/commons/shared.ts': 'export const a = 1;\n',
    });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('flags legacy source folders at the root', async () => {
    mod = createModule({ 'api-backend/index.js': 'x', 'dsl-frontend/page.yaml': '$type: Badge\n' });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations.map((v) => v.file).sort()).toEqual([mod.at('api-backend'), mod.at('dsl-frontend')].sort());
  });

  it('flags a stray source file at the root', async () => {
    mod = createModule({ 'helper.ts': 'export {};\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
  });

  it('flags an unknown folder and a loose file under src', async () => {
    mod = createModule({ 'src/utils/a.ts': 'export {};\n', 'src/loose.ts': 'export {};\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(2);
  });

  it('flags a missing src folder', async () => {
    mod = createModule({ 'src/backend/index.ts': null, 'src/dsl-views/page.yaml': null });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('no src/ folder');
  });

  it('accepts yaml, yml and json views and flags code in src/dsl-views', async () => {
    mod = createModule({ 'src/dsl-views/b.yml': 'a: 1\n', 'src/dsl-views/c.json': '{}', 'src/dsl-views/d.ts': 'export {};\n', 'src/dsl-views/e.tsx': 'export {};\n' });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations.map((v) => v.file).sort()).toEqual([mod.at('src/dsl-views/d.ts'), mod.at('src/dsl-views/e.tsx')].sort());
  });

  it('ignores the generated dist-module/manifest.json', async () => {
    mod = createModule({ 'dist-module/manifest.json': '{}', 'dist-module/api-backend/backend.cjs': 'x' });
    expect(await rule.check([mod.at('dist-module/manifest.json')])).toHaveLength(0);
  });
});
