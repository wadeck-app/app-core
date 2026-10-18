import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-manifest-exists-and-valid.js';
import { createModule, VALID_MODULE_FILES, type TempModule } from '../lib/appModuleTestUtil.js';

const withDslLib = JSON.stringify({ ...JSON.parse(VALID_MODULE_FILES['manifest.json']!), dslLib: { shared: { react: '^19' } } });

describe('app-module/manifest-exists-and-valid', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('passes a valid source manifest', async () => {
    mod = createModule();
    expect(await rule.check([mod.at('package.json')])).toHaveLength(0);
  });

  it('flags a missing manifest.json -- a module shipped with code and no manifest', async () => {
    mod = createModule({ 'manifest.json': null });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('missing manifest.json');
  });

  it('flags a manifest that is not JSON', async () => {
    mod = createModule({ 'manifest.json': '{nope' });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('not valid JSON');
  });

  it('flags a manifest without an id', async () => {
    mod = createModule({ 'manifest.json': JSON.stringify({ extensionPoints: JSON.parse(VALID_MODULE_FILES['manifest.json']!).extensionPoints }) });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('id');
  });

  it('flags build-output fields in the source manifest (version, backendEntryPath)', async () => {
    const manifest = { ...JSON.parse(VALID_MODULE_FILES['manifest.json']!), version: '1.0.0', backendEntryPath: './api-backend/index.js' };
    mod = createModule({ 'manifest.json': JSON.stringify(manifest) });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('failed validation');
  });

  it('flags dslLib declared without src/dsl-components/index.ts', async () => {
    mod = createModule({ 'manifest.json': withDslLib });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('src/dsl-components/index.ts');
  });

  it('flags src/dsl-components files with no dslLib in the manifest', async () => {
    mod = createModule({ 'src/dsl-components/index.ts': 'export default [];\n' });
    const violations = await rule.check([mod.at('package.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('no dslLib');
  });

  it('passes dslLib together with src/dsl-components/index.ts', async () => {
    mod = createModule({ 'manifest.json': withDslLib, 'src/dsl-components/index.ts': 'export default [];\n' });
    expect(await rule.check([mod.at('package.json')])).toHaveLength(0);
  });
});
