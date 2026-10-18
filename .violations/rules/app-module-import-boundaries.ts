import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FORBIDDEN_FOLDER_IMPORTS, importSpecifiers, isNodeSpecifier, moduleRootOf, srcFolderOf } from '../lib/appModuleLayout.js';

// src/commons is shared with the browser-side dsl-components: no Node builtins there. And the folders
// may not reach into each other: backend and dsl-components never import each other, commons imports
// neither. Mirrors `app-core-cli check`.
export const rule: Rule = {
  id: 'app-module/import-boundaries',
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

      for (const { spec, line } of importSpecifiers(fs.readFileSync(file, 'utf-8'))) {
        if (folder === 'commons' && isNodeSpecifier(spec)) {
          violations.push({ file, line, message: `src/commons must not import the Node builtin "${spec}" (it is shared with the browser-side dsl-components). Move that code to src/backend.` });
        }
        if (spec.startsWith('.')) {
          const target = srcFolderOf(root, path.resolve(path.dirname(file), spec));
          if (target !== undefined && FORBIDDEN_FOLDER_IMPORTS[folder].includes(target)) {
            violations.push({ file, line, message: `src/${folder} must not import from src/${target} ("${spec}"). Move what both sides need to src/commons.` });
          }
        }
      }
    }

    return violations;
  },
};

export default rule;
