import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as url from 'node:url';
import { validateManifestFile } from './validate.js';
import { runDev } from './dev.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test-app-modules');

describe('validateManifestFile', () => {
  it('passes a real valid manifest fixture', () => {
    const result = validateManifestFile(path.join(fixturesDir, 'app-module-minimal', 'manifest.json'));
    expect(result.ok).toBe(true);
  });

  it('fails with a clear message when the file is missing', () => {
    const result = validateManifestFile(path.join(fixturesDir, 'does-not-exist', 'manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('No manifest found');
  });

  it('fails with zod issue details on an invalid manifest', () => {
    const result = validateManifestFile(path.join(__dirname, '../test-fixtures/invalid-manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('failed manifest validation');
  });
});

describe('runDev', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it('boots the real server against a local module fixture', async () => {
    const result = await runDev(path.join(fixturesDir, 'app-module-minimal'), { port: 0 });
    close = result.close;
    expect(result.port).toBeGreaterThan(0);
  });
});
