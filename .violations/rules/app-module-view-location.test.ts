import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-view-location.js';

describe('app-module/view-location', () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-view-loc-'));
    const appModuleDir = path.join(dir, 'packages', 'fake-app-module');
    fs.mkdirSync(appModuleDir, { recursive: true });
    manifestPath = path.join(appModuleDir, 'manifest.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeManifest(viewPath: string): void {
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      backendEntryPath: './api-backend/index.js',
      extensionPoints: [{ kind: 'page', slot: 'nav', view: { type: 'path', value: viewPath } }],
    }));
  }

  it('flags a view path outside dsl-frontend/', async () => {
    writeManifest('./page.yaml');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('dsl-frontend/');
  });

  it('does not flag a view path inside dsl-frontend/', async () => {
    writeManifest('./dsl-frontend/page.yaml');
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(0);
  });

  it('ignores inline views (no path to check)', async () => {
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      backendEntryPath: './api-backend/index.js',
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } }],
    }));
    const violations = await rule.check([manifestPath]);
    expect(violations).toHaveLength(0);
  });
});
