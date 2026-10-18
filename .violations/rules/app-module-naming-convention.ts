import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as path from 'node:path';
import { OUTPUT_DIR, toPosix } from '../lib/appModuleLayout.js';

// Any package directory shipping a manifest.json (the signal that it's an
// app-module) must itself be named `app-module-<name>`, e.g. `app-module-queue`.
// A bare `app-module` (no suffix) is also rejected, not just names missing the prefix.
// The generated dist-module/manifest.json is not a module folder and is skipped.
const NAME_PATTERN = /^app-module-.+$/;

export const rule: Rule = {
  id: 'app-module/naming-convention',
  tags: 'ts',
  defaultScope: ['**/packages/**/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      if (toPosix(manifestPath).includes(`/${OUTPUT_DIR}/`)) continue;
      const dirName = path.basename(path.dirname(manifestPath));
      if (!NAME_PATTERN.test(dirName)) {
        violations.push({
          file: manifestPath,
          line: 1,
          message: `app-module package directory "${dirName}" must be named "app-module-<name>" -- a bare "app-module" or any other name is not accepted.`,
        });
      }
    }

    return violations;
  },
};

export default rule;
