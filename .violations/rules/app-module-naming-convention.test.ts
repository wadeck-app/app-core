import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-naming-convention.js';

describe('app-module/naming-convention', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-naming-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function manifestAt(packageDirName: string): string {
    const packageDir = path.join(dir, 'packages', packageDirName);
    fs.mkdirSync(packageDir, { recursive: true });
    const manifestPath = path.join(packageDir, 'manifest.json');
    fs.writeFileSync(manifestPath, '{}\n');
    return manifestPath;
  }

  it('passes a correctly prefixed name', async () => {
    const manifestPath = manifestAt('app-module-queue');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(0);
  });

  it('rejects a bare "app-module" with no suffix', async () => {
    const manifestPath = manifestAt('app-module');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('must be named "app-module-<name>"');
  });

  it('rejects an unrelated name entirely', async () => {
    const manifestPath = manifestAt('queue-module');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
  });

  it('rejects suffix-style naming (queue-app-module)', async () => {
    const manifestPath = manifestAt('queue-app-module');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
  });
});
