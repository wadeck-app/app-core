import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as path from 'node:path';

/**
 * Decision #37/#38: any package directory shipping a manifest.json (the
 * signal that it's an app-module) must itself be named `<name>-app-module`
 * (suffix-style, e.g. `queue-app-module` -- matches what queue-owner already
 * shipped). A bare `app-module` (no prefix) is also rejected, not just names
 * missing the suffix.
 */
const NAME_PATTERN = /^.+-app-module$/;

export const rule: Rule = {
  id: 'app-module/naming-convention',
  tags: 'ts',
  defaultScope: ['**/packages/**/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const dirName = path.basename(path.dirname(manifestPath));
      if (!NAME_PATTERN.test(dirName)) {
        violations.push({
          file: manifestPath,
          line: 1,
          message: `app-module package directory "${dirName}" must be named "<name>-app-module" (Decision #37/#38) -- a bare "app-module" or any other name is not accepted.`,
        });
      }
    }

    return violations;
  },
};

export default rule;
