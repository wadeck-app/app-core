import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseManifest } from '@wadeck-app/app-core-sdk';

// an app-module's backendEntryPath must live inside its own
// api-backend/ folder -- keeps the backend/view split enforced, not just documented.
export const rule: Rule = {
  id: 'app-module/backend-entry-location',
  tags: 'ts',
  defaultScope: ['**/packages/app-module-*/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const dir = path.dirname(manifestPath);
      let manifest;
      try {
        manifest = parseManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
      } catch {
        continue; // invalid manifest is reported by app-module/manifest-exists-and-valid
      }

      const requiredDir = path.join(dir, 'api-backend') + path.sep;
      const resolvedEntry = path.resolve(dir, manifest.backendEntryPath);
      if (!resolvedEntry.startsWith(requiredDir)) {
        violations.push({
          file: manifestPath,
          line: 1,
          message: `backendEntryPath "${manifest.backendEntryPath}" must resolve inside this module's api-backend/ folder, resolved to "${resolvedEntry}".`,
        });
      }
    }

    return violations;
  },
};

export default rule;
