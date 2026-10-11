import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseManifest } from '@wadeck-app/app-core-sdk';

// Decision #34: every path-type view in an app-module's manifest must live
// inside its own dsl-frontend/ folder -- DSL data only, never code.
export const rule: Rule = {
  id: 'app-module/view-location',
  tags: 'ts',
  defaultScope: ['**/packages/*-app-module/manifest.json'],
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

      const requiredDir = path.join(dir, 'dsl-frontend') + path.sep;
      for (const ep of manifest.extensionPoints) {
        if (ep.view.type !== 'path') continue;
        const resolvedView = path.resolve(dir, String(ep.view.value));
        if (!resolvedView.startsWith(requiredDir)) {
          violations.push({
            file: manifestPath,
            line: 1,
            message: `extensionPoint "${ep.slot}" view path "${ep.view.value}" must resolve inside this module's dsl-frontend/ folder (Decision #34), resolved to "${resolvedView}".`,
          });
        }
      }
    }

    return violations;
  },
};

export default rule;
