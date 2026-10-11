import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-backend-entry-location.js';

describe('app-module/backend-entry-location', () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-backend-loc-'));
    const appModuleDir = path.join(dir, 'packages', 'app-module-fake');
    fs.mkdirSync(appModuleDir, { recursive: true });
    manifestPath = path.join(appModuleDir, 'manifest.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeManifest(backendEntryPath: string): void {
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      backendEntryPath,
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } }],
    }));
  }

  it('flags a backendEntryPath outside api-backend/', async () => {
    writeManifest('./backend.js');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('api-backend/');
  });

  it('does not flag a backendEntryPath inside api-backend/', async () => {
    writeManifest('./api-backend/index.js');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(0);
  });

  it('rejects a sneaky look-alike folder (api-backend-fake/) via proper path containment', async () => {
    writeManifest('./api-backend-fake/index.js');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
  });
});
