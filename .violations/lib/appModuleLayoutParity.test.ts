import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { checkModule } from '../../packages/app-core-cli/src/check.js';
import { createModule, VALID_MODULE_FILES } from './appModuleTestUtil.js';
import { listFiles, toPosix } from './appModuleLayout.js';
import { rule as backendEntry } from '../rules/app-module-backend-entry-location.js';
import { rule as importBoundaries } from '../rules/app-module-import-boundaries.js';
import { rule as manifestValid } from '../rules/app-module-manifest-exists-and-valid.js';
import { rule as noReact } from '../rules/app-module-no-react.js';
import { rule as publishing } from '../rules/app-module-publishing.js';
import { rule as sourceLayout } from '../rules/app-module-source-layout.js';
import { rule as viewLocation } from '../rules/app-module-view-location.js';
import type { Rule } from '@wadeck-app/violations-rules';

// The violations rules replicate `app-core-cli check` (the authoritative layout implementation) with
// text scanning. This test runs both on the same modules and requires the same verdict, so a layout
// rule changed in check.ts but not here fails loudly instead of drifting.
const SCENARIOS: Array<{ name: string; files: Record<string, string | null> }> = [
  { name: 'valid module', files: {} },
  { name: 'valid module with commons, components and tooling files', files: {
    'README.md': '#', 'tsconfig.json': '{}', 'src/commons/a.ts': 'export const a = 1;\n',
    'manifest.json': JSON.stringify({ ...JSON.parse(VALID_MODULE_FILES['manifest.json']!), dslLib: { shared: { react: '^19' } } }),
    'src/dsl-components/index.ts': "import { a } from '../commons/a.js';\nexport default [a];\n",
    'src/dsl-components/Card.tsx': "import { useState } from 'react';\nexport const Card = useState;\n" } },
  { name: 'legacy root folder', files: { 'api-backend/index.js': 'x' } },
  { name: 'stray root file', files: { 'helper.ts': 'export {};\n' } },
  { name: 'unknown src folder', files: { 'src/utils/a.ts': 'export {};\n' } },
  { name: 'loose file under src', files: { 'src/loose.ts': 'export {};\n' } },
  { name: 'code in dsl-views', files: { 'src/dsl-views/x.ts': 'export {};\n' } },
  { name: 'tsx in backend', files: { 'src/backend/W.tsx': 'export const x = 1;\n' } },
  { name: 'react in backend', files: { 'src/backend/index.ts': "import 'react';\nexport default () => {};\n" } },
  { name: 'react in commons', files: { 'src/commons/a.ts': "import { useState } from 'react';\nexport { useState };\n" } },
  { name: 'node in commons', files: { 'src/commons/a.ts': "import fs from 'node:fs';\nexport { fs };\n" } },
  { name: 'bare node builtin in commons', files: { 'src/commons/a.ts': "import path from 'path';\nexport { path };\n" } },
  { name: 'backend imports dsl-components', files: { 'src/backend/index.ts': "import '../dsl-components/x.js';\nexport default () => {};\n" } },
  { name: 'dsl-components imports backend', files: { 'src/dsl-components/x.ts': "import { y } from '../backend/y.js';\nexport { y };\n" } },
  { name: 'commons imports backend', files: { 'src/commons/a.ts': "import { y } from '../backend/y.js';\nexport { y };\n" } },
  { name: 'type-only import of node in commons', files: { 'src/commons/a.ts': "import type { Stats } from 'node:fs';\nexport type S = Stats;\n" } },
  { name: 'commented-out react import', files: { 'src/backend/index.ts': "// import 'react';\nexport default () => {};\n" } },
  { name: 'missing backend entry', files: { 'src/backend/index.ts': null, 'src/backend/other.ts': 'export {};\n' } },
  { name: 'backend entry without default export', files: { 'src/backend/index.ts': 'export const x = 1;\n' } },
  { name: 'view outside dsl-views', files: {
    'manifest.json': JSON.stringify({ id: 'f', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'F', view: { type: 'path', value: './page.yaml' } }] }),
    'page.yaml': '$type: Badge\n' } },
  { name: 'missing view file', files: { 'src/dsl-views/page.yaml': null } },
  { name: 'view not an object', files: { 'src/dsl-views/page.yaml': '- a\n' } },
  { name: 'manifest without id', files: { 'manifest.json': JSON.stringify({ extensionPoints: JSON.parse(VALID_MODULE_FILES['manifest.json']!).extensionPoints }) } },
  { name: 'dslLib without components entry', files: {
    'manifest.json': JSON.stringify({ ...JSON.parse(VALID_MODULE_FILES['manifest.json']!), dslLib: { shared: {} } }) } },
  { name: 'components without dslLib', files: { 'src/dsl-components/index.ts': 'export default [];\n' } },
  { name: 'no .gitignore', files: { '.gitignore': null } },
  { name: '.gitignore without dist-module', files: { '.gitignore': 'dist\n' } },
  { name: 'wrong package files', files: { 'package.json': JSON.stringify({ files: ['src'] }) } },
];

// The rules that mirror check.ts. Each violation's file, relative to the module and with forward slashes.
const RULES: Rule[] = [sourceLayout, importBoundaries, noReact, backendEntry, viewLocation, publishing];

async function ruleVerdict(root: string): Promise<boolean> {
  const all = listFiles(root);
  const sourceFiles = all.filter((f) => /\.[cm]?[jt]sx?$/.test(f) && toPosix(path.relative(root, f)).startsWith('src/'));
  const results = await Promise.all([
    ...RULES.map((rule) => rule.check(rule === noReact || rule === importBoundaries ? sourceFiles : [path.join(root, 'manifest.json')])),
    manifestValid.check([path.join(root, 'package.json')]),
  ]);
  return results.some((violations) => violations.length > 0);
}

describe('app-module rules agree with `app-core-cli check`', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, async () => {
      const mod = createModule(scenario.files);
      try {
        const cliFails = (await checkModule(mod.root)).issues.length > 0;
        const rulesFail = await ruleVerdict(mod.root);
        expect({ scenario: scenario.name, rulesFail }).toEqual({ scenario: scenario.name, rulesFail: cliFails });
      } finally {
        mod.cleanup();
      }
      // checkModule starts esbuild, slow on a loaded machine.
    }, 30_000);
  }
});
