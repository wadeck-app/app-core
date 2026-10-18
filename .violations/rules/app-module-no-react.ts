import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import { importSpecifiers, isReactSpecifier, moduleRootOf, srcFolderOf } from '../lib/appModuleLayout.js';

// React lives only in src/dsl-components (built into the module's dsl-lib). JSX files (.tsx/.jsx) are
// forbidden everywhere else under src, and src/backend and src/commons must not import react/react-dom.
// Mirrors `app-core-cli check`; test files are not exempt there either.
export const rule: Rule = {
  id: 'app-module/no-react',
  tags: 'ts',
  defaultScope: [
    '**/app-module-*/src/**/*.ts',
    '**/app-module-*/src/**/*.tsx',
    '**/app-module-*/src/**/*.js',
    '**/app-module-*/src/**/*.jsx',
    '**/app-module-*/src/**/*.mjs',
    '**/app-module-*/src/**/*.cjs',
  ],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const file of files) {
      const root = moduleRootOf(file);
      if (root === undefined) continue;
      const folder = srcFolderOf(root, file);
      if (folder === undefined) continue;

      if (/\.[jt]sx$/.test(file) && folder !== 'dsl-components' && folder !== 'dsl-views') {
        violations.push({ file, line: 1, message: `JSX files are only allowed in src/dsl-components, found one in src/${folder}. Move the component there, or rename the file to .ts/.js if it has no JSX.` });
      }
      if (folder === 'backend' || folder === 'commons') {
        for (const { spec, line } of importSpecifiers(fs.readFileSync(file, 'utf-8'))) {
          if (isReactSpecifier(spec)) {
            violations.push({ file, line, message: `src/${folder} must not import "${spec}". Move the React code to src/dsl-components.` });
          }
        }
      }
    }

    return violations;
  },
};

export default rule;
