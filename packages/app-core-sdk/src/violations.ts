import * as fs from 'node:fs';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { ManifestSchema, SourceManifestSchema } from './index.js';

// A rule for the `violations` code-quality runner that checks the manifest.json of an app-module with the very schemas app-core
// applies. It ships with the SDK because every project that has an app-module depends on the SDK: the rule is always the
// version of the schema the module is built against, and nothing else has to be installed or kept in step.
//
// It has the shape the runner expects of a rule but imports nothing from it. A project turns it on with one file,
// `.violations/rules/app-core-manifest.js`:
//
//   export { rule } from '@wadeck-app/app-core-sdk/violations';

interface Violation {
  file: string;
  line: number;
  message: string;
}

export const rule = {
  id: 'app-core-sdk/manifest-valid',
  tags: 'app-module',
  // Any manifest.json: the files that are not an app-core manifest (no `extensionPoints` array) are left alone.
  defaultScope: ['**/manifest.json'],
  defaultSeverity: 'error' as const,

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];
    for (const file of files) {
      let json: unknown;
      try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        // Whether this file is meant for app-core is unknown while it cannot be read: say it is not JSON.
        violations.push({ file, line: 1, message: `manifest.json is not valid JSON (${getErrorMessage(err)}). Fix the syntax.` });
        continue;
      }
      if (typeof json !== 'object' || json === null || !Array.isArray((json as { extensionPoints?: unknown }).extensionPoints)) {
        continue;
      }
      // A packaged manifest (what `package` writes) names its backend; the one an author writes does not.
      const schema = 'backendEntryPath' in json ? ManifestSchema : SourceManifestSchema;
      const result = schema.safeParse(json);
      if (!result.success) {
        for (const issue of result.error.issues) {
          violations.push({ file, line: 1, message: `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}` });
        }
      }
    }
    return violations;
  },
};
