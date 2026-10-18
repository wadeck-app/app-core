import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { parseSourceManifest } from '@wadeck-app/app-core-sdk';
import { isDir, listFiles, moduleRootOf, toPosix } from '../lib/appModuleLayout.js';

/**
 * Every app-module must ship a valid source manifest.json (id, extensionPoints, dslLib.shared only;
 * `package` writes version, backendEntryPath and dslLib.entry/css into dist-module/manifest.json), and
 * dslLib must agree with src/dsl-components.
 *
 * The rule API only hands check() existing files, so "a file is missing" cannot be represented from
 * manifest.json itself. The rule scopes itself to package.json (present in every real package) as an
 * anchor and looks for the sibling manifest.json from there.
 */
export const rule: Rule = {
  id: 'app-module/manifest-exists-and-valid',
  tags: 'ts',
  defaultScope: ['**/app-module-*/package.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const packageJsonPath of files) {
      const root = moduleRootOf(packageJsonPath);
      if (root === undefined || toPosix(path.dirname(packageJsonPath)) !== root) continue;
      const manifestPath = path.join(root, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        violations.push({ file: manifestPath, line: 1, message: 'app-module package is missing manifest.json -- an app-module without a manifest cannot be registered with app-core at all.' });
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        violations.push({ file: manifestPath, line: 1, message: `manifest.json is not valid JSON: ${(err as Error).message}` });
        continue;
      }

      let manifest;
      try {
        manifest = parseSourceManifest(raw);
      } catch (err) {
        const details = err instanceof ZodError ? err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') : (err as Error).message;
        violations.push({
          file: manifestPath,
          line: 1,
          message: `manifest.json failed validation: ${details}. The source manifest holds only id, extensionPoints and dslLib.shared; \`package\` writes the rest.`,
        });
        continue;
      }

      const componentsDir = path.join(root, 'src', 'dsl-components');
      const entryExists = fs.existsSync(path.join(componentsDir, 'index.ts'));
      const hasComponents = isDir(componentsDir) && listFiles(componentsDir).length > 0;
      if (manifest.dslLib !== undefined && !entryExists) {
        violations.push({ file: path.join(componentsDir, 'index.ts'), line: 1, message: 'manifest.json declares dslLib but src/dsl-components/index.ts is missing. Create it (default-exporting the ComponentRegistryEntry[]), or remove dslLib.' });
      }
      if (manifest.dslLib === undefined && hasComponents) {
        violations.push({ file: manifestPath, line: 1, message: 'src/dsl-components has files but manifest.json has no dslLib, so they would not be packaged. Add `"dslLib": { "shared": { ... } }`, or delete src/dsl-components.' });
      }
    }

    return violations;
  },
};

export default rule;
