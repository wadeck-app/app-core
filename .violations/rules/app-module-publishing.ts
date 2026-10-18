import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { moduleRootOf, OUTPUT_DIR, toPosix } from '../lib/appModuleLayout.js';

// dist-module is generated, so it is gitignored, and it is the only thing published
// (package.json "files": ["dist-module"]). Mirrors `app-core-cli check`.
export const rule: Rule = {
  id: 'app-module/publishing',
  tags: 'ts',
  defaultScope: ['**/app-module-*/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const root = moduleRootOf(manifestPath);
      if (root === undefined || toPosix(path.dirname(manifestPath)) !== root) continue;

      const gitignore = path.join(root, '.gitignore');
      if (!fs.existsSync(gitignore)) {
        violations.push({ file: gitignore, line: 1, message: `missing; ${OUTPUT_DIR} must be gitignored. Create .gitignore containing the line "${OUTPUT_DIR}".` });
      } else {
        const lines = fs.readFileSync(gitignore, 'utf-8').split(/\r?\n/).map((l) => l.trim());
        if (!lines.some((line) => /^\/?dist-module\/?$/.test(line))) {
          violations.push({ file: gitignore, line: 1, message: `does not ignore ${OUTPUT_DIR}, which is generated. Add the line "${OUTPUT_DIR}".` });
        }
      }

      const packageJson = path.join(root, 'package.json');
      if (!fs.existsSync(packageJson)) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      } catch (err) {
        violations.push({ file: packageJson, line: 1, message: `is not valid JSON: ${(err as Error).message}` });
        continue;
      }
      const pkgFiles = typeof parsed === 'object' && parsed !== null ? (parsed as { files?: unknown }).files : undefined;
      if (!Array.isArray(pkgFiles) || pkgFiles.length !== 1 || pkgFiles[0] !== OUTPUT_DIR) {
        violations.push({ file: packageJson, line: 1, message: `"files" is ${JSON.stringify(pkgFiles)}, but only ${OUTPUT_DIR} may be published. Set "files": ["${OUTPUT_DIR}"].` });
      }
    }

    return violations;
  },
};

export default rule;
