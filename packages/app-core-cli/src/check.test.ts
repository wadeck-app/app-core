import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { checkModule, formatCheckIssues, type CheckIssue } from './check.js';
import { BASE_MANIFEST, DSL_COMPONENT_FILES, makeModule, removeModule } from './test-helpers/makeModule.js';

const dirs: string[] = [];

function module_(overrides: Record<string, string | null> = {}): string {
  const dir = makeModule(overrides);
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

// Fails with the full list of issues when there are none expected, so a regression shows what was reported.
async function issuesOf(overrides: Record<string, string | null>): Promise<CheckIssue[]> {
  return (await checkModule(module_(overrides))).issues;
}

function only(issues: CheckIssue[], file: string): CheckIssue {
  const found = issues.filter((i) => i.file === file);
  if (found.length !== 1) {
    throw new Error(`expected exactly one issue for ${file}, got ${JSON.stringify(issues, null, 2)}`);
  }
  return found[0]!;
}

describe('checkModule: a valid module', () => {
  it('passes and returns the parsed source manifest', async () => {
    const result = await checkModule(module_());
    expect(result.issues).toEqual([]);
    expect(result.manifest?.id).toBe('tiny');
  });

  // Regression: "check ." reported every source file as unparsable (esbuild needs an absolute working dir).
  it('passes when the module folder is given as a relative path', async () => {
    const dir = module_();
    const relative = path.relative(process.cwd(), dir);
    expect(path.isAbsolute(relative)).toBe(false);
    const result = await checkModule(relative);
    expect(result.issues).toEqual([]);
  });

  it('passes with a dsl-components library and a style.css', async () => {
    const result = await checkModule(module_({ ...DSL_COMPONENT_FILES, 'src/dsl-components/style.css': '.x{}' }));
    expect(result.issues).toEqual([]);
  });

  it('tolerates dotfiles, config files and the other allowed root entries', async () => {
    const issues = await issuesOf({
      '.eslintrc.json': '{}',
      '.prettierrc': '{}',
      'vitest.config.ts': 'export default {};',
      'tsconfig.build.json': '{}',
      'package-lock.json': '{}',
      'LICENSE': 'MIT',
      'node_modules/x/index.js': '',
      'dist-module/manifest.json': '{}',
    });
    expect(issues).toEqual([]);
  });
});

describe('checkModule: module folder', () => {
  it('reports a missing folder', async () => {
    const result = await checkModule(path.join(os.tmpdir(), 'app-core-cli-check-missing-folder'));
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.problem).toMatch(/does not exist/);
  });
});

describe('checkModule: layout', () => {
  it('rejects an unknown root folder and names it', async () => {
    const issues = await issuesOf({ 'api-backend/backend.mjs': '' });
    const issue = only(issues, 'api-backend');
    expect(issue.problem).toMatch(/not allowed at the module root/);
    expect(issue.fix).toContain('src/');
  });

  it('rejects an unknown root file', async () => {
    const issue = only(await issuesOf({ 'notes.txt': 'x' }), 'notes.txt');
    expect(issue.problem).toMatch(/not allowed at the module root/);
  });

  it('rejects a missing src folder', async () => {
    const issues = await issuesOf({ 'src/backend/index.ts': null, 'src/commons/greeting.ts': null, 'src/dsl-views/home.yaml': null });
    expect(issues.map((i) => i.file)).toContain('src');
  });

  it('rejects any src folder other than the four known ones', async () => {
    const issue = only(await issuesOf({ 'src/utils/x.ts': '' }), 'src/utils');
    expect(issue.fix).toMatch(/backend.*dsl-views.*dsl-components.*commons/s);
  });

  it('rejects a loose file directly under src', async () => {
    only(await issuesOf({ 'src/index.ts': '' }), 'src/index.ts');
  });

  it('allows only yaml, yml and json in dsl-views', async () => {
    const issues = await issuesOf({ 'src/dsl-views/notes.md': 'x', 'src/dsl-views/extra.yml': '$type: Badge\n', 'src/dsl-views/sub/more.json': '{}' });
    expect(issues.map((i) => i.file)).toEqual(['src/dsl-views/notes.md']);
  });

  it('rejects .tsx and .jsx outside dsl-components, and allows them inside', async () => {
    const issues = await issuesOf({
      'src/backend/Page.tsx': 'export const A = 1;',
      'src/commons/Thing.jsx': 'export const B = 1;',
      ...DSL_COMPONENT_FILES,
    });
    expect(issues.map((i) => i.file).sort()).toEqual(['src/backend/Page.tsx', 'src/commons/Thing.jsx']);
    expect(only(issues, 'src/backend/Page.tsx').fix).toContain('src/dsl-components');
  });

  it('requires the backend entry src/backend/index.ts', async () => {
    const issue = only(await issuesOf({ 'src/backend/index.ts': null, 'src/backend/other.ts': 'export {};' }), 'src/backend/index.ts');
    expect(issue.problem).toMatch(/backend entry/);
    expect(issue.fix).toMatch(/export default/);
  });

  it('requires the backend entry to default-export something', async () => {
    const issue = only(await issuesOf({ 'src/backend/index.ts': 'export const nope = 1;\n' }), 'src/backend/index.ts');
    expect(issue.problem).toMatch(/default export/);
  });
});

describe('checkModule: imports', () => {
  it.each([
    ['react', "import { useState } from 'react';\nexport default () => useState;\n"],
    ['react-dom/client', "import { createRoot } from 'react-dom/client';\nexport default () => createRoot;\n"],
    ['react/jsx-runtime', "import 'react/jsx-runtime';\nexport default () => 1;\n"],
  ])('rejects %s in the backend', async (_name, source) => {
    const issue = only(await issuesOf({ 'src/backend/index.ts': source }), 'src/backend/index.ts');
    expect(issue.problem).toMatch(/React/);
    expect(issue.fix).toContain('src/dsl-components');
  });

  it('rejects react in commons even when the import is unused', async () => {
    const issue = only(await issuesOf({ 'src/commons/greeting.ts': "import { useState } from 'react';\nexport const GREETING = 'x';\n" }), 'src/commons/greeting.ts');
    expect(issue.problem).toMatch(/React/);
  });

  it('allows react in dsl-components', async () => {
    expect(await issuesOf(DSL_COMPONENT_FILES)).toEqual([]);
  });

  it('rejects node: imports in commons (static, dynamic and require)', async () => {
    const issues = await issuesOf({
      'src/commons/greeting.ts': "import fs from 'node:fs';\nexport const GREETING = String(fs);\n",
      'src/commons/dyn.ts': "export const load = () => import('node:path');\n",
      'src/commons/req.ts': "export const r = () => require('node:os');\n",
    });
    expect(issues.map((i) => i.file).sort()).toEqual(['src/commons/dyn.ts', 'src/commons/greeting.ts', 'src/commons/req.ts']);
    expect(issues[0]!.problem).toMatch(/node:/);
  });

  it('rejects a bare node builtin in commons', async () => {
    // The bare specifier is assembled so the repo's node: prefix rule does not flag this fixture text itself.
    const bareImport = `import { join } from '${'pa' + 'th'}';\nexport const GREETING = join('a', 'b');\n`;
    only(await issuesOf({ 'src/commons/greeting.ts': bareImport }), 'src/commons/greeting.ts');
  });

  it('allows node: imports in the backend', async () => {
    const source = "import { join } from 'node:path';\nexport default function () { join('a'); }\n";
    expect(await issuesOf({ 'src/backend/index.ts': source })).toEqual([]);
  });

  it('rejects commons importing backend or dsl-components', async () => {
    const issues = await issuesOf({
      'src/commons/a.ts': "import { x } from '../backend/index.js';\nexport const y = x;\n",
      'src/commons/b.ts': "export * from '../dsl-components/Hello.js';\n",
      ...DSL_COMPONENT_FILES,
    });
    expect(issues.map((i) => i.file).sort()).toEqual(['src/commons/a.ts', 'src/commons/b.ts']);
    expect(only(issues, 'src/commons/a.ts').problem).toMatch(/commons.*backend/s);
  });

  it('rejects backend importing dsl-components and the reverse', async () => {
    const issues = await issuesOf({
      ...DSL_COMPONENT_FILES,
      'src/backend/index.ts': "import { Hello } from '../dsl-components/Hello.js';\nexport default function () { return Hello; }\n",
      'src/dsl-components/index.ts': "import { x } from '../backend/index.js';\nexport default [x];\n",
    });
    expect(issues.map((i) => i.file).sort()).toEqual(['src/backend/index.ts', 'src/dsl-components/index.ts']);
  });

  it('allows backend and dsl-components to import commons', async () => {
    const issues = await issuesOf({
      ...DSL_COMPONENT_FILES,
      'src/dsl-components/index.ts': "import { GREETING } from '../commons/greeting.js';\nexport default [{ name: GREETING }];\n",
    });
    expect(issues).toEqual([]);
  });

  it('ignores an import that only appears in a comment or a string', async () => {
    const source = "// import 'react'\nconst s = \"import x from 'react'\";\nexport default function () { return s; }\n";
    expect(await issuesOf({ 'src/backend/index.ts': source })).toEqual([]);
  });

  it('names the file when it does not parse', async () => {
    const issue = only(await issuesOf({ 'src/commons/greeting.ts': 'export const = ;\n' }), 'src/commons/greeting.ts');
    expect(issue.problem).toMatch(/cannot be parsed/);
  });
});

describe('checkModule: manifest', () => {
  it('reports a missing manifest.json', async () => {
    const issue = only(await issuesOf({ 'manifest.json': null }), 'manifest.json');
    expect(issue.problem).toMatch(/No manifest/);
  });

  it('reports invalid JSON', async () => {
    only(await issuesOf({ 'manifest.json': '{ nope' }), 'manifest.json');
  });

  it('reports a missing id with the zod path', async () => {
    const issue = only(await issuesOf({ 'manifest.json': JSON.stringify({ extensionPoints: BASE_MANIFEST.extensionPoints }) }), 'manifest.json');
    expect(issue.problem).toMatch(/id/);
  });

  it.each(['backendEntryPath', 'version'])('rejects the output-only key %s in the source manifest and explains why', async (key) => {
    const manifest = JSON.stringify({ ...BASE_MANIFEST, [key]: './src/backend/index.ts' });
    const issue = only(await issuesOf({ 'manifest.json': manifest }), 'manifest.json');
    expect(issue.problem).toContain(key);
    expect(issue.fix).toMatch(/package/);
  });

  it('rejects dslLib.entry and dslLib.css in the source manifest', async () => {
    const manifest = JSON.stringify({ ...BASE_MANIFEST, dslLib: { entry: './dsl-lib/e.mjs', css: './dsl-lib/s.css', shared: {} } });
    const issue = only(await issuesOf({ ...DSL_COMPONENT_FILES, 'manifest.json': manifest }), 'manifest.json');
    expect(issue.problem).toMatch(/entry/);
  });

  it('reports a referenced view file that does not exist', async () => {
    const issue = only(await issuesOf({ 'src/dsl-views/home.yaml': null, 'src/dsl-views/other.yaml': '$type: Badge\n' }), 'src/dsl-views/home.yaml');
    expect(issue.problem).toMatch(/referenced by manifest.json.*does not exist/s);
  });

  it('rejects a view path outside src/dsl-views', async () => {
    const manifest = JSON.stringify({
      ...BASE_MANIFEST,
      extensionPoints: [{ kind: 'page', slot: 'nav', view: { type: 'path', value: './elsewhere/home.yaml' } }],
    });
    const issue = only(await issuesOf({ 'manifest.json': manifest, 'elsewhere/home.yaml': '$type: Badge\n' }), 'elsewhere/home.yaml');
    expect(issue.problem).toMatch(/src\/dsl-views/);
  });

  it('rejects a view file whose YAML does not parse', async () => {
    only(await issuesOf({ 'src/dsl-views/home.yaml': '$type: [unclosed\n' }), 'src/dsl-views/home.yaml');
  });

  it('requires src/dsl-components/index.ts when dslLib is declared', async () => {
    const issue = only(await issuesOf({ 'manifest.json': DSL_COMPONENT_FILES['manifest.json']! }), 'src/dsl-components/index.ts');
    expect(issue.problem).toMatch(/dslLib/);
  });

  it('requires dslLib in the manifest when src/dsl-components exists', async () => {
    const issue = only(await issuesOf({ ...DSL_COMPONENT_FILES, 'manifest.json': JSON.stringify(BASE_MANIFEST) }), 'manifest.json');
    expect(issue.problem).toMatch(/dsl-components/);
  });
});

describe('checkModule: publishing hygiene', () => {
  it('requires a .gitignore', async () => {
    const issue = only(await issuesOf({ '.gitignore': null }), '.gitignore');
    expect(issue.fix).toContain('dist-module');
  });

  it('requires dist-module in .gitignore', async () => {
    const issue = only(await issuesOf({ '.gitignore': 'node_modules\n' }), '.gitignore');
    expect(issue.problem).toMatch(/dist-module/);
  });

  it.each(['dist-module', '/dist-module', 'dist-module/', '/dist-module/'])('accepts %s in .gitignore', async (line) => {
    expect(await issuesOf({ '.gitignore': `# build\n${line}\n` })).toEqual([]);
  });

  it('does not accept dist-module inside a comment or another word', async () => {
    only(await issuesOf({ '.gitignore': '# dist-module\nmy-dist-module-x\n' }), '.gitignore');
  });

  it('requires package.json files to equal ["dist-module"] when package.json exists', async () => {
    for (const files of [undefined, ['dist-module', 'src'], ['src']]) {
      const issue = only(await issuesOf({ 'package.json': JSON.stringify({ name: 'tiny', files }) }), 'package.json');
      expect(issue.fix).toContain('"files": ["dist-module"]');
    }
  });

  it('does not require package.json itself', async () => {
    expect(await issuesOf({ 'package.json': null })).toEqual([]);
  });

  it('reports a package.json that is not valid JSON', async () => {
    only(await issuesOf({ 'package.json': '{ nope' }), 'package.json');
  });
});

describe('checkModule: reporting', () => {
  it('collects every issue instead of stopping at the first', async () => {
    const issues = await issuesOf({ 'notes.txt': 'x', '.gitignore': null, 'src/backend/Page.tsx': '' });
    expect(issues.map((i) => i.file).sort()).toEqual(['.gitignore', 'notes.txt', 'src/backend/Page.tsx']);
  });

  it('formats each issue with its file and fix', async () => {
    const dir = module_({ '.gitignore': null });
    const { issues } = await checkModule(dir);
    const text = formatCheckIssues(dir, issues);
    expect(text).toContain(dir);
    expect(text).toContain('.gitignore');
    expect(text).toContain('Fix:');
    expect(text).toMatch(/1 problem/);
  });
});

describe('checkModule: lifecycle hooks', () => {
  const lifecycle = { ...BASE_MANIFEST, lifecycle: { teardown: './src/backend/teardown.ts', migrate: './src/backend/migrate.ts' } };
  const hookFile = 'export default async function (ctx: { dataDir: string }): Promise<void> {\n  void ctx.dataDir;\n}\n';
  const withHooks = (overrides: Record<string, string | null> = {}): Record<string, string | null> => ({
    'manifest.json': JSON.stringify(lifecycle),
    'src/backend/teardown.ts': hookFile,
    'src/backend/migrate.ts': hookFile,
    ...overrides,
  });

  it('passes with both hooks present and default-exporting a function', async () => {
    expect(await issuesOf(withHooks())).toEqual([]);
  });

  it('names a declared hook file that does not exist, with the fix', async () => {
    const issue = only(await issuesOf(withHooks({ 'src/backend/migrate.ts': null })), 'src/backend/migrate.ts');
    expect(issue.problem).toContain('lifecycle.migrate');
    expect(issue.problem).toContain('does not exist');
    expect(issue.fix).toContain('remove lifecycle.migrate');
  });

  it('names a hook file without a default export', async () => {
    const issue = only(await issuesOf(withHooks({ 'src/backend/teardown.ts': 'export function teardown() {}\n' })), 'src/backend/teardown.ts');
    expect(issue.problem).toBe('the teardown hook has no default export');
    expect(issue.fix).toContain('previousVersion');
  });

  it('refuses a hook outside src/backend', async () => {
    const manifest = { ...BASE_MANIFEST, lifecycle: { teardown: './src/commons/teardown.ts' } };
    const issue = only(await issuesOf({ 'manifest.json': JSON.stringify(manifest), 'src/commons/teardown.ts': hookFile }), 'manifest.json');
    expect(issue.problem).toContain('lifecycle.teardown "./src/commons/teardown.ts" must be a .ts or .js file inside src/backend');
  });

  it('refuses the backend entry as a hook', async () => {
    const manifest = { ...BASE_MANIFEST, lifecycle: { migrate: './src/backend/index.ts' } };
    const issue = only(await issuesOf({ 'manifest.json': JSON.stringify(manifest) }), 'manifest.json');
    expect(issue.problem).toContain('points at the backend entry');
  });

  it('reports a hook that cannot be parsed once, as a source file problem', async () => {
    const issues = await issuesOf(withHooks({ 'src/backend/teardown.ts': 'export default function ( {\n' }));
    expect(only(issues, 'src/backend/teardown.ts').problem).toContain('cannot be parsed');
  });

  it('rejects an unknown lifecycle key in the manifest', async () => {
    const manifest = { ...BASE_MANIFEST, lifecycle: { setup: './src/backend/index.ts' } };
    expect(only(await issuesOf({ 'manifest.json': JSON.stringify(manifest) }), 'manifest.json').problem).toContain('lifecycle');
  });
});
