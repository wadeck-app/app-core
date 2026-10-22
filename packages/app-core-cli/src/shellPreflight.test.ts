import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { shellWarnings, shellWarningsForModule } from './shellPreflight.js';

// A stand-in for a running app-core that answers GET /build-info.json the way the real one does.
interface Fake {
  port: number;
  close: () => Promise<void>;
}

async function startFake(handler: http.RequestListener): Promise<Fake> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const buildInfo = (extra: Record<string, unknown> = {}): http.RequestListener => (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ builtAt: '2026-10-18T12:44:33.900Z', commit: '430ffa0e', dslUi: '2026.10.18-101-b2ef217e', dslRenderer: '2026.10.18-101-b2ef217e', react: '19.3.0', ...extra }));
};

const envFor = (port: number): NodeJS.ProcessEnv => ({ APP_CORE_PORT: String(port), APP_CORE_CONFIG_DIR: path.join(os.tmpdir(), 'app-core-no-such-config') });

let fake: Fake | undefined;
const dirs: string[] = [];

afterEach(async () => {
  await fake?.close();
  fake = undefined;
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('shellWarnings: a module whose dslLib.shared the running app-core shell does not provide', () => {
  it('says what the shell provides, since when, and that the module will be refused', async () => {
    fake = await startFake(buildInfo());
    const [warning, ...rest] = await shellWarnings({ '@wadeck-app/dsl-ui': '>=2026.10.19-110' }, envFor(fake.port));
    expect(rest).toEqual([]);
    expect(warning).toContain(`app-core on port ${fake.port} serves a shell with @wadeck-app/dsl-ui 2026.10.18-101-b2ef217e`);
    expect(warning).toContain('build-info.json built 2026-10-18T12:44:33.900Z, commit 430ffa0e');
    expect(warning).toContain('dslLib.shared asks ">=2026.10.19-110"');
    expect(warning).toContain('refuse this module (HTTP 422) and keep the previous version');
    expect(warning).toContain('npm run build:full');
  });

  it('is silent when every range is satisfied, prereleases included', async () => {
    fake = await startFake(buildInfo());
    expect(await shellWarnings({ '@wadeck-app/dsl-ui': '>=2026.10.18-100', react: '^19' }, envFor(fake.port))).toEqual([]);
  });

  it('reports each package that does not match', async () => {
    fake = await startFake(buildInfo());
    const warnings = await shellWarnings({ react: '^18', '@wadeck-app/dsl-ui': '>=2026.10.19-110' }, envFor(fake.port));
    expect(warnings).toHaveLength(2);
  });

  it('is silent when no app-core runs on the port: nothing to compare with', async () => {
    const probe = await startFake(buildInfo());
    const { port } = probe;
    await probe.close();
    expect(await shellWarnings({ react: '^18' }, envFor(port))).toEqual([]);
  });

  it('says it cannot compare when the running app-core serves no build-info.json', async () => {
    fake = await startFake((_req, res) => {
      res.writeHead(404);
      res.end('not found');
    });
    const [warning] = await shellWarnings({ react: '^18' }, envFor(fake.port));
    expect(warning).toContain('serves no build-info.json (HTTP 404)');
  });

  it('says it cannot compare when build-info.json is not JSON', async () => {
    fake = await startFake((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html>');
    });
    const [warning] = await shellWarnings({ react: '^18' }, envFor(fake.port));
    expect(warning).toContain('serves a build-info.json that is not JSON');
  });

  it('has nothing to say for a module that shares nothing', async () => {
    expect(await shellWarnings({}, envFor(1))).toEqual([]);
  });
});

describe('shellWarningsForModule', () => {
  const moduleWith = (manifest: unknown): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-preflight-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    return dir;
  };

  it('reads the dslLib.shared of the source manifest', async () => {
    fake = await startFake(buildInfo());
    const dir = moduleWith({ id: 'm', extensionPoints: [], dslLib: { shared: { '@wadeck-app/dsl-ui': '>=2026.10.19-110' } } });
    expect(await shellWarningsForModule(dir, envFor(fake.port))).toHaveLength(1);
  });

  it('is silent for a module without dslLib, and for a manifest it cannot read (check reports that)', async () => {
    fake = await startFake(buildInfo());
    expect(await shellWarningsForModule(moduleWith({ id: 'm', extensionPoints: [] }), envFor(fake.port))).toEqual([]);
    expect(await shellWarningsForModule(path.join(os.tmpdir(), 'app-core-no-such-module'), envFor(fake.port))).toEqual([]);
  });
});
