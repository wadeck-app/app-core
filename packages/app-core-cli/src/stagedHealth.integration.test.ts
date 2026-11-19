import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stagedServerHealthCheck } from './stagedHealth.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliEntry = path.join(__dirname, '../dist/cli.js');
const fixture = path.resolve(__dirname, '../../test-app-modules/app-module-minimal/dist-module/manifest.json');

// Real processes: the built CLI starts its real server on a free port (port 0) with a copy of a registry holding one built module.
describe('stagedServerHealthCheck, real server', () => {
  let work: string;

  beforeEach(() => {
    for (const file of [cliEntry, fixture, path.join(__dirname, '../dist/public/index.html')]) {
      if (!fs.existsSync(file)) {
        throw new Error(`${file} is missing: run "npm run build" then "node scripts/build-fixtures.mjs" from the repository root (npm run test:cli does the second).`);
      }
    }
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-health-real-'));
    fs.mkdirSync(path.join(work, 'modules'), { recursive: true });
    fs.writeFileSync(path.join(work, 'modules', 'module-a.json'), JSON.stringify({ id: 'module-a', source: { type: 'file', path: fixture } }));
  });

  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  const input = { pkgName: '@wadeck-app/app-core-cli', version: '0.0.0-dev', packageDir: path.join(__dirname, '..'), entry: cliEntry, configDir: path.join(work ?? '', 'cli'), timeoutMs: 60_000 };

  it('accepts the built CLI with a registered module and leaves the real registry untouched', async () => {
    const result = await stagedServerHealthCheck({ ...input, configDir: path.join(work, 'cli') }, { realConfigDir: () => work });
    expect(result.ok, result.output).toBe(true);
    expect(result.output).toContain('1 module(s) checked');
    expect(fs.readdirSync(work)).toEqual(['modules']);
  });

  it('refuses it when a registered module cannot load, naming the module', async () => {
    fs.writeFileSync(path.join(work, 'modules', 'ghost.json'), JSON.stringify({ id: 'ghost', source: { type: 'file', path: path.join(work, 'nowhere', 'manifest.json') } }));
    const result = await stagedServerHealthCheck({ ...input, configDir: path.join(work, 'cli') }, { realConfigDir: () => work });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('module "ghost"');
  });
});
