import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-manifest-exists-and-valid.js';

describe('app-module/manifest-exists-and-valid', () => {
  let dir: string;
  let packageJsonPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-manifest-'));
    const appModuleDir = path.join(dir, 'packages', 'app-module-fake');
    fs.mkdirSync(appModuleDir, { recursive: true });
    packageJsonPath = path.join(appModuleDir, 'package.json');
    fs.writeFileSync(packageJsonPath, '{}\n');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flags a missing manifest.json -- the real-world gap found when a module ships code with no manifest', async () => {
    const violations = await rule.check([packageJsonPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('missing manifest.json');
  });

  it('flags an invalid manifest.json (fails zod schema)', async () => {
    const manifestPath = path.join(path.dirname(packageJsonPath), 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0', extensionPoints: [] }));
    const violations = await rule.check([packageJsonPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('failed validation');
  });

  it('passes a real, valid manifest.json', async () => {
    const manifestPath = path.join(path.dirname(packageJsonPath), 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      backendEntryPath: './api-backend/index.js',
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } }],
    }));
    const violations = await rule.check([packageJsonPath]);
    expect(violations).toHaveLength(0);
  });
});
