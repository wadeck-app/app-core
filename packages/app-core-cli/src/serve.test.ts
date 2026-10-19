import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runServe } from './serve.js';

// A free port chosen by the OS: a fixed one collides with any app-core another process (or another test run) already serves.
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

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;

describe('runServe', () => {
  let configDir: string;
  let publicDir: string;
  let stop: (() => Promise<void>) | undefined;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-serve-config-'));
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-serve-public-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>shell</title>');
    fs.writeFileSync(path.join(publicDir, 'build-info.json'), JSON.stringify({ dslUi: 'x' }));
    process.env['APP_CORE_PORT'] = String(PORT);
    process.env['APP_CORE_CONFIG_DIR'] = configDir;
  });

  afterEach(async () => {
    await stop?.();
    stop = undefined;
    delete process.env['APP_CORE_PORT'];
    delete process.env['APP_CORE_CONFIG_DIR'];
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

  it('serves the API, the bundled frontend and build-info.json, and publishes server.port.json', async () => {
    const running = await runServe({ publicDir });
    stop = running.stop;

    expect(running.port).toBe(PORT);
    expect((await fetch(`${BASE}/api/modules`)).status).toBe(200);
    const index = await fetch(`${BASE}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('<title>shell</title>');
    expect(await (await fetch(`${BASE}/build-info.json`)).json()).toEqual({ dslUi: 'x' });
    expect(JSON.parse(fs.readFileSync(path.join(configDir, 'server.port.json'), 'utf8'))).toEqual({
      pid: process.pid,
      port: PORT,
    });
  });

  it('removes server.port.json when stopped', async () => {
    const running = await runServe({ publicDir });
    await running.stop();
    expect(fs.existsSync(path.join(configDir, 'server.port.json'))).toBe(false);
  });

  it('fails with the listen error when the port is already taken', async () => {
    const first = await runServe({ publicDir });
    stop = first.stop;
    await expect(runServe({ publicDir })).rejects.toThrow(/EADDRINUSE/);
  });

  it('fails with an actionable message when the bundled frontend is missing', async () => {
    fs.rmSync(path.join(publicDir, 'index.html'));
    await expect(runServe({ publicDir })).rejects.toThrow(/Bundled frontend not found at .* \(no index\.html\)\. Reinstall/);
  });
});
