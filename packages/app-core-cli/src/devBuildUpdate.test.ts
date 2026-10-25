import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliEntry = path.join(__dirname, '../dist/cli.js');
const updaterEntry = path.join(__dirname, '../dist/app-core-cli-updater.cjs');

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A real process of the CLI built from this repository, away from the real config dir and the real global npm: a refusal
// that failed would otherwise start an `npm install -g` on the machine running the tests (incident 2026-10-25).
function isolatedEnv(): NodeJS.ProcessEnv {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-devbuild-'));
  scratchDirs.push(scratch);
  return {
    ...process.env,
    APP_CORE_CLI_CONFIG_DIR: path.join(scratch, 'config'),
    NPM_CONFIG_PREFIX: path.join(scratch, 'npm'),
    // Nothing listens there: an install that started would fail instead of reaching the registry.
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9',
    'npm_config_@wadeck-app:registry': 'http://127.0.0.1:9',
  };
}

function requireBuilt(file: string): void {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found: build the CLI first (npm run build --workspace=packages/app-core-cli).`);
  }
}

describe('a build from the repository never updates the global install', () => {
  it('`update` refuses with exit 1 and names the command to run instead', () => {
    requireBuilt(cliEntry);
    const result = spawnSync('node', [cliEntry, 'update'], { encoding: 'utf8', env: isolatedEnv() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to update the global install of app-core-cli');
    expect(result.stderr).toContain('app-core-cli update');
  });

  it('the updater refuses too, whoever started it', () => {
    requireBuilt(updaterEntry);
    const result = spawnSync('node', [updaterEntry], { encoding: 'utf8', env: isolatedEnv() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to update the global install of app-core-cli');
  });
});
