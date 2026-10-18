import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { ModuleManager } from '@wadeck-app/app-core-server/loader';
import { makeModule, removeModule } from './test-helpers/makeModule.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliEntry = path.join(__dirname, '../dist/cli.js');

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

function packageWithRealCli(): { out: string; manifestPath: string } {
  if (!fs.existsSync(cliEntry)) {
    throw new Error(`${cliEntry} not found: build the CLI first (npm run build --workspace=packages/app-core-cli).`);
  }
  const moduleDir = makeModule();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-e2e-'));
  dirs.push(moduleDir, scratch);
  const out = path.join(scratch, 'dist-module');
  execFileSync('node', [cliEntry, 'package', moduleDir, '--out', out, '--version', '1.2.3'], { encoding: 'utf8' });
  return { out, manifestPath: path.join(out, 'manifest.json') };
}

describe('package output loads in a real app-core', () => {
  it('registers through the real server and answers the module route (proves the CJS footer)', async () => {
    const { manifestPath } = packageWithRealCli();
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-e2e-cfg-'));
    dirs.push(configDir);
    const { server } = await buildServer({ configDir });
    try {
      const register = await server.inject({
        method: 'POST',
        url: '/api/modules/register',
        payload: { id: 'tiny', source: { type: 'file', path: manifestPath } },
      });
      expect(register.statusCode, register.body).toBe(201);
      expect(register.json()).toEqual({ id: 'tiny', version: '1.2.3', extensionPoints: 1, cascaded: [], recovered: [] });

      const ping = await server.inject({ method: 'GET', url: '/api/modules/tiny/ping' });
      expect(ping.statusCode, ping.body).toBe(200);
      expect(ping.json()).toEqual({ greeting: 'hello' });

      const listed = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as {
        modules: Array<{ id: string; extensionPoints: Array<{ view: unknown }> }>;
      };
      expect(listed.modules.map((m) => m.id)).toEqual(['tiny']);
      expect(listed.modules[0]!.extensionPoints[0]!.view).toEqual({ $type: 'Badge', label: 'hi' });
    } finally {
      await server.close();
    }
  });

  it('refuses the same output registered under another id, with the fix', async () => {
    const { manifestPath } = packageWithRealCli();
    const manager = new ModuleManager({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-e2e-cfg-')) });
    await expect(manager.loadFromEntry({ id: 'not-tiny', source: { type: 'file', path: manifestPath } })).rejects.toThrow(
      /"not-tiny".*"id": "tiny"/s,
    );
  });
});
