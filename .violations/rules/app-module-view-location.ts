import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { parseSourceManifest } from '@wadeck-app/app-core-sdk';
import { moduleRootOf, toPosix } from '../lib/appModuleLayout.js';

// Every path-type view in the source manifest must be a file inside src/dsl-views/ holding a YAML/JSON
// object (DSL data, never code). Mirrors `app-core-cli check`.
export const rule: Rule = {
  id: 'app-module/view-location',
  tags: 'ts',
  defaultScope: ['**/app-module-*/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const root = moduleRootOf(manifestPath);
      if (root === undefined || toPosix(path.dirname(manifestPath)) !== root) continue;

      let manifest;
      try {
        manifest = parseSourceManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
      } catch {
        continue; // invalid manifest is reported by app-module/manifest-exists-and-valid
      }

      const viewsDir = path.join(root, 'src', 'dsl-views');
      const seen = new Set<string>();
      manifest.extensionPoints.forEach((ep, index) => {
        if (ep.view.type !== 'path') return;
        const value = String(ep.view.value);
        const abs = path.resolve(root, value);
        if (seen.has(abs)) return;
        seen.add(abs);

        const insideViews = toPosix(path.relative(viewsDir, abs));
        if (insideViews.startsWith('..') || path.isAbsolute(insideViews)) {
          violations.push({ file: manifestPath, line: 1, message: `extensionPoints[${index}].view.value "${value}" must be inside src/dsl-views/. Move the file there and reference it as "./src/dsl-views/<file>.yaml".` });
          return;
        }
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          violations.push({ file: manifestPath, line: 1, message: `extensionPoints[${index}].view.value "${value}" does not exist. Create the file, or fix the path.` });
          return;
        }
        try {
          const parsed = parseYaml(fs.readFileSync(abs, 'utf-8'));
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            violations.push({ file: abs, line: 1, message: 'a view must be a YAML/JSON object (with a $type). Start the file with `$type: <Component>`.' });
          }
        } catch (err) {
          violations.push({ file: abs, line: 1, message: `is not valid YAML: ${(err as Error).message.split('\n')[0]}. Fix the syntax.` });
        }
      });
    }

    return violations;
  },
};

export default rule;
