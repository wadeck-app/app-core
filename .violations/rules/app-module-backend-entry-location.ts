import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BACKEND_ENTRY, hasDefaultExport, moduleRootOf, toPosix } from '../lib/appModuleLayout.js';

// The backend entry is fixed by convention (decision 81): src/backend/index.ts, with a default export.
// The source manifest no longer names it; `package` writes backendEntryPath into dist-module.
export const rule: Rule = {
  id: 'app-module/backend-entry-location',
  tags: 'ts',
  defaultScope: ['**/app-module-*/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const root = moduleRootOf(manifestPath);
      if (root === undefined || toPosix(path.dirname(manifestPath)) !== root) continue;

      const entry = path.join(root, BACKEND_ENTRY);
      if (!fs.existsSync(entry)) {
        violations.push({ file: entry, line: 1, message: `the backend entry is missing: it is always ${BACKEND_ENTRY}. Create it with \`export default function (ctx) { ... }\`.` });
      } else if (!hasDefaultExport(fs.readFileSync(entry, 'utf-8'))) {
        violations.push({ file: entry, line: 1, message: 'the backend entry has no default export. Add `export default function (ctx) { ... }`: app-core calls it when the module loads.' });
      }
    }

    return violations;
  },
};

export default rule;
