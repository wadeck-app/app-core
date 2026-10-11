import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-core-sdk-no-internal-dependencies.js';

describe('app-core-sdk/no-internal-dependencies', () => {
  let dir: string;
  let sdkPackageJsonPath: string;
  let packagesDir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-sdk-deps-'));
    packagesDir = path.join(dir, 'packages');
    const siblingDir = path.join(packagesDir, 'app-core-server');
    fs.mkdirSync(siblingDir, { recursive: true });
    fs.writeFileSync(path.join(siblingDir, 'package.json'), JSON.stringify({ name: '@wadeck-app/app-core-server' }));

    const sdkDir = path.join(packagesDir, 'app-core-sdk');
    fs.mkdirSync(sdkDir, { recursive: true });
    sdkPackageJsonPath = path.join(sdkDir, 'package.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flags a sibling in-repo package listed under dependencies -- the real bug found', async () => {
    fs.writeFileSync(
      sdkPackageJsonPath,
      JSON.stringify({ name: '@wadeck-app/app-core-sdk', dependencies: { '@wadeck-app/app-core-server': '*', zod: '^3.0.0' } }),
    );
    const violations = await rule.check([sdkPackageJsonPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('@wadeck-app/app-core-server');
  });

  it('passes when the sibling package is a devDependency instead', async () => {
    fs.writeFileSync(
      sdkPackageJsonPath,
      JSON.stringify({
        name: '@wadeck-app/app-core-sdk',
        dependencies: { zod: '^3.0.0' },
        devDependencies: { '@wadeck-app/app-core-server': '*' },
      }),
    );
    const violations = await rule.check([sdkPackageJsonPath]);
    expect(violations).toHaveLength(0);
  });

  it('passes when there are no internal dependencies at all', async () => {
    fs.writeFileSync(sdkPackageJsonPath, JSON.stringify({ name: '@wadeck-app/app-core-sdk', dependencies: { zod: '^3.0.0' } }));
    const violations = await rule.check([sdkPackageJsonPath]);
    expect(violations).toHaveLength(0);
  });
});
