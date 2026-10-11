import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { parseManifest } from '@wadeck-app/app-core-sdk';

/**
 * Every app-module package must ship a valid manifest.json -- a package with
 * backend code but no manifest cannot be registered with app-core at all.
 *
 * The violations rule API only hands check() a list of EXISTING files that
 * matched defaultScope -- there is no way to represent "a file is missing"
 * from that list alone. So this rule scopes itself to package.json (always
 * present for a real npm package) as an anchor, and checks for the sibling
 * manifest.json from there, rather than scoping to manifest.json itself
 * (which would never appear in `files` if it's the thing that's missing).
 */
const FORBIDDEN_MESSAGE = 'app-module package is missing manifest.json -- an app-module without a manifest cannot be registered with app-core at all.';

export const rule: Rule = {
  id: 'app-module/manifest-exists-and-valid',
  tags: 'ts',
  defaultScope: ['**/packages/app-module-*/package.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const packageJsonPath of files) {
      const dir = path.dirname(packageJsonPath);
      const manifestPath = path.join(dir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        violations.push({ file: manifestPath, line: 1, message: FORBIDDEN_MESSAGE });
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        violations.push({ file: manifestPath, line: 1, message: `manifest.json is not valid JSON: ${(err as Error).message}` });
        continue;
      }

      try {
        parseManifest(raw);
      } catch (err) {
        if (err instanceof ZodError) {
          const details = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
          violations.push({ file: manifestPath, line: 1, message: `manifest.json failed validation: ${details}` });
        } else {
          violations.push({ file: manifestPath, line: 1, message: `manifest.json failed validation: ${(err as Error).message}` });
        }
      }
    }

    return violations;
  },
};

export default rule;
