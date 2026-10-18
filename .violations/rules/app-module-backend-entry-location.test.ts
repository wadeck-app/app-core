import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { rule } from './app-module-backend-entry-location.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/backend-entry-location', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('passes src/backend/index.ts with a default export', async () => {
    mod = createModule();
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('passes `export { x as default }`', async () => {
    mod = createModule({ 'src/backend/index.ts': 'function run() {}\nexport { run as default };\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('flags a missing src/backend/index.ts', async () => {
    mod = createModule({ 'src/backend/index.ts': null, 'src/backend/other.ts': 'export {};\n' });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('src/backend/index.ts');
  });

  it('flags an entry with no default export (a commented-out one does not count)', async () => {
    mod = createModule({ 'src/backend/index.ts': '// export default function () {}\nexport const x = 1;\n' });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('no default export');
  });

  it('ignores the generated dist-module manifest', async () => {
    mod = createModule({ 'dist-module/manifest.json': '{}' });
    expect(await rule.check([mod.at('dist-module/manifest.json')])).toHaveLength(0);
  });

  it('flags the legacy layout (entry only under api-backend/)', async () => {
    mod = createModule({ 'src/backend/index.ts': null });
    fs.mkdirSync(mod.at('api-backend'), { recursive: true });
    fs.writeFileSync(mod.at('api-backend/index.js'), 'export default () => {};\n');
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
  });
});
