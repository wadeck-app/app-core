import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runServe } from './serve.js';
import { prepareStandalone, writeStandaloneRegistry } from './standalone.js';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const getJson = (port: number, url: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${url}`, { agent: false }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });

// A module the way `app-core-cli package` leaves it: a manifest that names its backend, and the backend.
function writeBuiltModule(dir: string, id: string): string {
  fs.mkdirSync(path.join(dir, 'api-backend'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'api-backend', 'backend.cjs'), 'module.exports = function (ctx) {};\n');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ id, version: '1.0.0', backendEntryPath: './api-backend/backend.cjs', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Home', view: { type: 'inline', value: { $type: 'Badge', label: 'hello' } } }] }),
  );
  return path.join(dir, 'manifest.json');
}

describe('standalone application (--module)', () => {
  let root: string;
  let moduleDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-standalone-'));
    moduleDir = path.join(root, 'app-module');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const defaultConfigDir = (id: string): string => path.join(root, 'cli-config', 'standalone', id);

  it('refuses a folder without manifest.json and says what to pass', () => {
    fs.mkdirSync(moduleDir);
    expect(() => prepareStandalone(moduleDir, { defaultConfigDir })).toThrow(/no manifest\.json in .*Pass the built module folder/);
  });

  it('refuses a source manifest, naming the command that builds it', () => {
    fs.mkdirSync(moduleDir);
    fs.writeFileSync(path.join(moduleDir, 'manifest.json'), JSON.stringify({ id: 'x', extensionPoints: [] }));
    expect(() => prepareStandalone(moduleDir, { defaultConfigDir })).toThrow(/source manifest.*app-core-cli package/s);
  });

  it('plans the module alone, with its own config dir (the default one is per module id), from the folder or from the manifest', () => {
    const manifest = writeBuiltModule(moduleDir, 'my-app');
    const fromFolder = prepareStandalone(moduleDir, { defaultConfigDir });
    expect(fromFolder.moduleId).toBe('my-app');
    expect(fromFolder.configDir).toBe(path.resolve(defaultConfigDir('my-app')));
    expect(fromFolder.modules).toEqual([{ id: 'my-app', manifestPath: manifest }]);
    expect(prepareStandalone(manifest, { defaultConfigDir, configDir: path.join(root, 'own') }).configDir).toBe(path.join(root, 'own'));
  });

  it('writes a registry with exactly the application, dropping an entry left by an earlier run', () => {
    writeBuiltModule(moduleDir, 'my-app');
    const plan = prepareStandalone(moduleDir, { defaultConfigDir });
    const modulesDir = path.join(plan.configDir, 'modules');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(path.join(modulesDir, 'old.json'), JSON.stringify({ id: 'old', source: { type: 'file', path: 'nowhere' } }));
    writeStandaloneRegistry(plan);
    expect(fs.readdirSync(modulesDir)).toEqual(['my-app.json']);
  });

  it('runs a server that tells the shell it is an application of one module, with the module alone loaded', async () => {
    writeBuiltModule(moduleDir, 'my-app');
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(publicDir);
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>shell</title>');
    fs.writeFileSync(path.join(publicDir, 'build-info.json'), JSON.stringify({ dslUi: 'x' }));
    const port = await freePort();
    const running = await runServe({ publicDir, module: moduleDir, configDir: path.join(root, 'data'), port, defaultStandaloneConfigDir: defaultConfigDir });
    try {
      expect(running.moduleId).toBe('my-app');
      expect(await getJson(port, '/api/shell-settings')).toEqual({ abTests: false, standalone: { moduleId: 'my-app' } });
      const modules = (await getJson(port, '/api/modules')) as { modules: Array<{ id: string }> };
      expect(modules.modules.map((m) => m.id)).toEqual(['my-app']);
    } finally {
      await running.stop();
    }
  });

  it('refuses --config-dir without --module: the global app-core has its own rules', async () => {
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(publicDir);
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html>');
    await expect(runServe({ publicDir, configDir: path.join(root, 'data') })).rejects.toThrow(/--config-dir only applies to --module/);
  });
});
