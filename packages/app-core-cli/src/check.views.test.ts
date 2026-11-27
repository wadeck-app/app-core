import { afterEach, describe, expect, it } from 'vitest';
import { checkModule, type CheckIssue } from './check.js';
import { DSL_COMPONENT_FILES, makeModule, removeModule } from './test-helpers/makeModule.js';

// `check` compiles every view of src/dsl-views against what dsl-ui knows (its known-keys manifest) and what the shell provides
// (`providedContexts` of its build-info.json): what would fail on a user's page fails the module's build instead.
const SHELL = ['AbExperimentsContext', 'HeaderActionsContext', 'RouterContext', 'ToastContext', 'UrlParamContext'];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

async function check(view: string, providedContexts: string[] = SHELL, extra: Record<string, string | null> = {}) {
  const dir = makeModule({ 'src/dsl-views/home.yaml': view, ...extra });
  dirs.push(dir);
  return checkModule(dir, { viewCheck: { providedContexts } });
}

const viewIssues = (issues: CheckIssue[]): CheckIssue[] => issues.filter((i) => i.file === 'src/dsl-views/home.yaml');

describe('check: the views are compiled', () => {
  it('passes a view that uses known components with known keys', async () => {
    const result = await check('$type: Badge\nlabel: hi\n');
    expect(result.issues).toEqual([]);
  });

  it('fails a component that needs one of several props and has none (SearchBar: urlParam, or value and onChange)', async () => {
    const issues = viewIssues((await check('$type: SearchBar\nsize: sm\n')).issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.problem).toContain('missing-prop-group');
    expect(issues[0]?.problem).toContain('SearchBar');
    expect(issues[0]?.problem).toContain('$');
    expect(issues[0]?.fix).not.toBe('');
  });

  it('fails a key the component does not know, naming the node', async () => {
    const issues = viewIssues((await check('$type: Badge\nlabel: hi\nlabell: oops\n')).issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.problem).toContain('labell');
  });

  it('fails a component that needs a context the shell does not provide, and passes once the shell provides it', async () => {
    const view = '$type: PageHeader\ntitle: Hello\nplacement: trail\n';
    const without = viewIssues((await check(view, SHELL.filter((c) => c !== 'HeaderActionsContext'))).issues);
    expect(without).toHaveLength(1);
    expect(without[0]?.problem).toContain('missing-host-context');
    expect(without[0]?.problem).toContain('HeaderActionsContext');
    expect(viewIssues((await check(view)).issues)).toEqual([]);
  });

  it('does not judge components of other modules ("<module>:<Name>"), which its manifest cannot describe', async () => {
    expect(viewIssues((await check('$type: other:Gauge\nvalue: 3\n')).issues)).toEqual([]);
  });

  it('says so when a module has components of its own: their types and keys are not checked', async () => {
    const result = await check('$type: Hello\nwho: me\n', SHELL, DSL_COMPONENT_FILES);
    expect(viewIssues(result.issues)).toEqual([]);
    expect(result.warnings.join('\n')).toContain('src/dsl-components');
    expect(result.warnings.join('\n')).toContain('not checked');
  });

  it('compiles an inline view of the manifest too, and names the manifest entry', async () => {
    const manifest = JSON.stringify({
      id: 'tiny',
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Card', children: [] } } }],
    });
    const result = await check('$type: Badge\nlabel: hi\n', SHELL, { 'manifest.json': manifest, 'src/dsl-views/home.yaml': null });
    const issues = result.issues.filter((i) => i.file === 'manifest.json');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.problem).toContain('extensionPoints[0] (inline view)');
    expect(issues[0]?.problem).toContain('children');
  });

  it('reports a type nobody knows when the module has no components of its own', async () => {
    const issues = viewIssues((await check('$type: Badgee\nlabel: hi\n')).issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.problem).toContain('Badgee');
  });
});
