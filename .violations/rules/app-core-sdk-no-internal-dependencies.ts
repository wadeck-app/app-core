import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';

// app-core-sdk is the "base" package every app-module depends on -- it must
// never have a runtime "dependencies" entry on any sibling in-repo package
// (@wadeck-app/app-core-server, @wadeck-app/app-core-shell, or any future
// internal package), since none of those are published and such a dependency
// makes the SDK literally uninstallable outside this monorepo (the exact bug
// found via queue-owner's real external install: @wadeck-app/app-core-server
// was listed under "dependencies" instead of "devDependencies"). devDependencies
// on a sibling package is fine (build-time only, never resolved by a consumer).
//
// This only catches package.json's declared dependency, not a reference that
// might still leak into the actual built output -- that half is asserted at
// build time in scripts/bundle.mjs instead, since dist/** is globally excluded
// from violations scanning by design (lints source, not build artifacts).
export const rule: Rule = {
  id: 'app-core-sdk/no-internal-dependencies',
  tags: 'ts',
  defaultScope: ['**/packages/app-core-sdk/package.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const packageJsonPath of files) {
      const sdkDir = path.dirname(packageJsonPath);
      const packagesDir = path.dirname(sdkDir);
      const siblingNames = fs
        .readdirSync(packagesDir)
        .filter((dir) => path.join(packagesDir, dir) !== sdkDir)
        .map((dir) => {
          const pkgPath = path.join(packagesDir, dir, 'package.json');
          if (!fs.existsSync(pkgPath)) return null;
          try {
            return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name as string;
          } catch {
            return null;
          }
        })
        .filter((name): name is string => Boolean(name));

      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies ?? {});

      for (const dep of deps) {
        if (siblingNames.includes(dep)) {
          violations.push({
            file: packageJsonPath,
            line: 1,
            message: `"dependencies" lists "${dep}", a sibling in-repo package that is never published. app-core-sdk must have zero internal cross-package runtime dependencies -- move it to "devDependencies" if it's needed at build time only.`,
          });
        }
      }
    }

    return violations;
  },
};

export default rule;
