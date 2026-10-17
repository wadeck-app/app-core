import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateManifestFile } from './validate.js';
import { defaultModuleId, parseIdFlag, runDev } from './dev.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test-app-modules');
const cliEntry = path.join(__dirname, '../dist/cli.js');

describe('validateManifestFile', () => {
  it('passes a real valid manifest fixture and returns the parsed manifest', () => {
    const result = validateManifestFile(path.join(fixturesDir, 'app-module-minimal', 'manifest.json'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.version).toBeTruthy();
      expect(result.manifest.extensionPoints.length).toBeGreaterThan(0);
    }
  });

  it('fails with a clear message when the file is missing', () => {
    const result = validateManifestFile(path.join(fixturesDir, 'does-not-exist', 'manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('No manifest found');
    }
  });

  it('fails with zod issue details on an invalid manifest', () => {
    const result = validateManifestFile(path.join(__dirname, '../test-fixtures/invalid-manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('failed manifest validation');
    }
  });
});

describe('cli validate --json (real subprocess, not a unit-level call)', () => {
  it('emits the parsed manifest as JSON on success', () => {
    const manifestPath = path.join(fixturesDir, 'app-module-minimal', 'manifest.json');
    const stdout = execFileSync('node', [cliEntry, 'validate', manifestPath, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBeTruthy();
    expect(Array.isArray(parsed.extensionPoints)).toBe(true);
  });

  it('emits a JSON error object (not plain text) on an invalid manifest', () => {
    const manifestPath = path.join(__dirname, '../test-fixtures/invalid-manifest.json');
    let stdout = '';
    try {
      stdout = execFileSync('node', [cliEntry, 'validate', manifestPath, '--json'], { encoding: 'utf8' });
    } catch (err) {
      stdout = (err as { stdout?: string }).stdout ?? '';
    }
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('failed manifest validation');
  });
});

describe('runDev', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) {
      await close();
    }
    close = undefined;
  });

  it('boots the real server against a local module fixture', async () => {
    const result = await runDev(path.join(fixturesDir, 'app-module-minimal'), { port: 0 });
    close = result.close;
    expect(result.port).toBeGreaterThan(0);
  });

  it('registers app-module-<name> as <name>, matching its production id', async () => {
    const result = await runDev(path.join(fixturesDir, 'app-module-minimal'), { port: 0 });
    close = result.close;
    expect(result.moduleId).toBe('minimal');
  });

  it('honours an explicit module id and accepts the manifest.json path', async () => {
    const result = await runDev(path.join(fixturesDir, 'app-module-minimal', 'manifest.json'), { port: 0, moduleId: 'custom' });
    close = result.close;
    expect(result.moduleId).toBe('custom');
  });

  it('explains what to pass when no manifest.json is found', async () => {
    await expect(runDev(path.join(fixturesDir, 'does-not-exist'), { port: 0 })).rejects.toThrow(/Pass the module folder/);
  });
});

describe('dev id helpers', () => {
  it('defaultModuleId strips the app-module- prefix only', () => {
    expect(defaultModuleId('/x/app-module-queue')).toBe('queue');
    expect(defaultModuleId('/x/queue')).toBe('queue');
    expect(defaultModuleId('/x/app-module-')).toBe('app-module-');
  });

  it('parseIdFlag reads --id and rejects a missing value', () => {
    expect(parseIdFlag([])).toBeUndefined();
    expect(parseIdFlag(['--id', 'orchestrator'])).toBe('orchestrator');
    expect(() => parseIdFlag(['--id'])).toThrow(/needs a value/);
    expect(() => parseIdFlag(['--id', '--other'])).toThrow(/needs a value/);
  });
});
