import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-view-location.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

function manifestWithView(view: unknown): string {
  return JSON.stringify({ id: 'fixture', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'F', view }] });
}

describe('app-module/view-location', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('passes a view inside src/dsl-views', async () => {
    mod = createModule();
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('flags a view outside src/dsl-views (legacy dsl-frontend/)', async () => {
    mod = createModule({
      'manifest.json': manifestWithView({ type: 'path', value: './dsl-frontend/page.yaml' }),
      'dsl-frontend/page.yaml': '$type: Badge\n',
    });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('src/dsl-views/');
  });

  it('flags a referenced view that does not exist', async () => {
    mod = createModule({ 'manifest.json': manifestWithView({ type: 'path', value: './src/dsl-views/missing.yaml' }) });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('does not exist');
  });

  it('flags a view that is not valid YAML', async () => {
    mod = createModule({ 'src/dsl-views/page.yaml': 'a: [unclosed\n' });
    const violations = await rule.check([mod.at('manifest.json')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('not valid YAML');
  });

  it('flags a view that is not an object', async () => {
    mod = createModule({ 'src/dsl-views/page.yaml': '- a\n- b\n' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(1);
  });

  it('ignores inline views (no path to check)', async () => {
    mod = createModule({ 'manifest.json': manifestWithView({ type: 'inline', value: { $type: 'Badge', label: 'ok' } }) });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });

  it('leaves an invalid manifest to manifest-exists-and-valid', async () => {
    mod = createModule({ 'manifest.json': '{}' });
    expect(await rule.check([mod.at('manifest.json')])).toHaveLength(0);
  });
});
