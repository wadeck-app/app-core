import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  describeRegistration,
  describeRegistrationFailure,
  registerModule,
  resolveAppCorePort,
  unregisterModule,
} from './register.js';

interface Recorded {
  method: string | undefined;
  url: string | undefined;
  contentType: string | undefined;
  body: string;
}

interface FakeAppCore {
  port: number;
  requests: Recorded[];
  close: () => Promise<void>;
}

type Responder = (res: http.ServerResponse) => void;

async function startFakeAppCore(respond: Responder): Promise<FakeAppCore> {
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, contentType: req.headers['content-type'], body });
      respond(res);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  return {
    port: address.port,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const replyJson =
  (status: number, body: object): Responder =>
  (res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

// A port nothing listens on: bind a server, read its port, close it.
async function unusedPort(): Promise<number> {
  const fake = await startFakeAppCore(replyJson(200, {}));
  const { port } = fake;
  await fake.close();
  return port;
}

describe('app-core module registration from a daemon', () => {
  let tmp: string;
  let manifestPath: string;
  let fake: FakeAppCore | undefined;

  const envFor = (port: number, configDir: string): NodeJS.ProcessEnv => ({
    APP_CORE_PORT: String(port),
    APP_CORE_CONFIG_DIR: configDir,
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-register-'));
    manifestPath = path.join(tmp, 'manifest.json');
    fs.writeFileSync(manifestPath, '{}');
  });

  afterEach(async () => {
    await fake?.close();
    fake = undefined;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('resolveAppCorePort', () => {
    it('prefers APP_CORE_PORT, then the port file app-core wrote, then 4850', () => {
      const configDir = path.join(tmp, 'cfg');
      fs.mkdirSync(configDir);
      expect(resolveAppCorePort({ APP_CORE_CONFIG_DIR: configDir })).toBe(4850);

      fs.writeFileSync(path.join(configDir, 'server.port.json'), JSON.stringify({ pid: 1, port: 4861 }));
      expect(resolveAppCorePort({ APP_CORE_CONFIG_DIR: configDir })).toBe(4861);

      expect(resolveAppCorePort({ APP_CORE_CONFIG_DIR: configDir, APP_CORE_PORT: '4999' })).toBe(4999);
    });

    it('throws on a malformed APP_CORE_PORT instead of using another source', () => {
      const configDir = path.join(tmp, 'cfg');
      fs.mkdirSync(configDir);
      fs.writeFileSync(path.join(configDir, 'server.port.json'), JSON.stringify({ pid: 1, port: 4861 }));
      for (const bad of ['abc', '0', '-5', '70000', '48.5']) {
        expect(() => resolveAppCorePort({ APP_CORE_CONFIG_DIR: configDir, APP_CORE_PORT: bad }), bad).toThrow(/APP_CORE_PORT/);
      }
    });

    it('ignores an unusable port file and an empty APP_CORE_PORT', () => {
      const configDir = path.join(tmp, 'cfg');
      fs.mkdirSync(configDir);
      fs.writeFileSync(path.join(configDir, 'server.port.json'), 'not json');
      expect(resolveAppCorePort({ APP_CORE_CONFIG_DIR: configDir, APP_CORE_PORT: '' })).toBe(4850);
    });
  });

  describe('registerModule', () => {
    it('posts the id and the absolute manifest path and reports registered', async () => {
      fake = await startFakeAppCore(replyJson(201, { id: 'queue' }));
      const outcome = await registerModule({ id: 'queue', manifestPath, env: envFor(fake.port, path.join(tmp, 'cfg')) });

      expect(outcome).toEqual({ status: 'registered', port: fake.port });
      expect(fake.requests).toHaveLength(1);
      expect(fake.requests[0]?.method).toBe('POST');
      expect(fake.requests[0]?.url).toBe('/api/modules/register');
      expect(fake.requests[0]?.contentType).toBe('application/json');
      expect(JSON.parse(fake.requests[0]?.body ?? '{}')).toEqual({ id: 'queue', source: { type: 'file', path: manifestPath } });
    });

    it('sends an absolute path even when given a relative one', async () => {
      fake = await startFakeAppCore(replyJson(201, {}));
      const relative = path.relative(process.cwd(), manifestPath);
      await registerModule({ id: 'queue', manifestPath: relative, env: envFor(fake.port, path.join(tmp, 'cfg')) });
      const sent: { source: { path: string } } = JSON.parse(fake.requests[0]?.body ?? '{}');
      expect(path.isAbsolute(sent.source.path)).toBe(true);
      expect(sent.source.path).toBe(manifestPath);
    });

    it('reports a refusal with app-core\'s own error text', async () => {
      fake = await startFakeAppCore(replyJson(400, { error: 'module id must start with a letter or digit' }));
      const outcome = await registerModule({ id: 'queue', manifestPath, env: envFor(fake.port, path.join(tmp, 'cfg')) });
      expect(outcome).toEqual({
        status: 'refused',
        port: fake.port,
        httpStatus: 400,
        reason: 'module id must start with a letter or digit',
      });
    });

    it('reports a refusal whose body is not JSON, or empty, without losing the status', async () => {
      fake = await startFakeAppCore((res) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('bad gateway upstream');
      });
      const textual = await registerModule({ id: 'queue', manifestPath, env: envFor(fake.port, path.join(tmp, 'cfg')) });
      expect(textual).toMatchObject({ status: 'refused', httpStatus: 502, reason: 'bad gateway upstream' });
      await fake.close();

      fake = await startFakeAppCore((res) => {
        res.writeHead(500);
        res.end();
      });
      const empty = await registerModule({ id: 'queue', manifestPath, env: envFor(fake.port, path.join(tmp, 'cfg')) });
      expect(empty).toMatchObject({ status: 'refused', httpStatus: 500 });
      expect(empty.status === 'refused' ? empty.reason : '').not.toBe('');
    });

    it('leaves the pickup file when app-core is not running and its config dir exists', async () => {
      const configDir = path.join(tmp, 'cfg');
      fs.mkdirSync(configDir);
      const outcome = await registerModule({ id: 'queue', manifestPath, env: envFor(await unusedPort(), configDir) });

      const file = path.join(configDir, 'modules', 'queue.json');
      expect(outcome).toEqual({ status: 'deferred', file });
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ id: 'queue', source: { type: 'file', path: manifestPath } });
    });

    it('writes nothing when app-core is not running and was never installed', async () => {
      const configDir = path.join(tmp, 'never-installed');
      const outcome = await registerModule({ id: 'queue', manifestPath, env: envFor(await unusedPort(), configDir) });

      expect(outcome.status).toBe('skipped');
      expect(fs.existsSync(configDir)).toBe(false);
    });

    it('treats an app-core that accepts and never answers as not running, after the timeout', async () => {
      const configDir = path.join(tmp, 'cfg');
      fs.mkdirSync(configDir);
      fake = await startFakeAppCore(() => {
        // never answers
      });
      const started = Date.now();
      const outcome = await registerModule({ id: 'queue', manifestPath, env: envFor(fake.port, configDir), timeoutMs: 150 });

      expect(outcome.status).toBe('deferred');
      expect(Date.now() - started).toBeLessThan(2500);
    });

    it('rejects for a manifest that does not exist, naming the path', async () => {
      const missing = path.join(tmp, 'nope', 'manifest.json');
      await expect(registerModule({ id: 'queue', manifestPath: missing, env: envFor(4850, path.join(tmp, 'cfg')) })).rejects.toThrow(
        missing,
      );
    });

    it('rejects an id the server would refuse, before any request', async () => {
      fake = await startFakeAppCore(replyJson(201, {}));
      for (const bad of ['../x', 'a.b', '', 'a b', '-x']) {
        await expect(
          registerModule({ id: bad, manifestPath, env: envFor(fake.port, path.join(tmp, 'cfg')) }),
          bad,
        ).rejects.toThrow(/Invalid app-core module id/);
      }
      expect(fake.requests).toHaveLength(0);
    });

    it('rejects a malformed APP_CORE_PORT instead of registering somewhere else', async () => {
      await expect(
        registerModule({ id: 'queue', manifestPath, env: { APP_CORE_PORT: 'oops', APP_CORE_CONFIG_DIR: path.join(tmp, 'cfg') } }),
      ).rejects.toThrow(/APP_CORE_PORT/);
    });
  });

  describe('unregisterModule', () => {
    it('posts the id and reports unregistered', async () => {
      fake = await startFakeAppCore(replyJson(200, { id: 'queue', removed: true }));
      const outcome = await unregisterModule({ id: 'queue', env: envFor(fake.port, path.join(tmp, 'cfg')) });

      expect(outcome).toEqual({ status: 'unregistered', port: fake.port });
      expect(fake.requests[0]?.url).toBe('/api/modules/unregister');
      expect(JSON.parse(fake.requests[0]?.body ?? '{}')).toEqual({ id: 'queue' });
    });

    it('reports an id app-core does not know as not-registered, with its text', async () => {
      fake = await startFakeAppCore(replyJson(404, { error: 'Module "queue" is not registered.' }));
      const outcome = await unregisterModule({ id: 'queue', env: envFor(fake.port, path.join(tmp, 'cfg')) });
      expect(outcome).toEqual({ status: 'not-registered', port: fake.port, reason: 'Module "queue" is not registered.' });
    });

    it('reports any other refusal with its status and reason', async () => {
      fake = await startFakeAppCore(replyJson(500, { error: 'disk full' }));
      const outcome = await unregisterModule({ id: 'queue', env: envFor(fake.port, path.join(tmp, 'cfg')) });
      expect(outcome).toEqual({ status: 'refused', port: fake.port, httpStatus: 500, reason: 'disk full' });
    });

    it('removes the pending pickup file when app-core is not running', async () => {
      const configDir = path.join(tmp, 'cfg');
      const file = path.join(configDir, 'modules', 'queue.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{}');

      const outcome = await unregisterModule({ id: 'queue', env: envFor(await unusedPort(), configDir) });

      expect(outcome).toEqual({ status: 'cleared', file });
      expect(fs.existsSync(file)).toBe(false);
    });

    it('does nothing, and creates nothing, when app-core is not running and nothing is pending', async () => {
      const configDir = path.join(tmp, 'never-installed');
      const outcome = await unregisterModule({ id: 'queue', env: envFor(await unusedPort(), configDir) });

      expect(outcome.status).toBe('skipped');
      expect(fs.existsSync(configDir)).toBe(false);
    });

    it('rejects an invalid id', async () => {
      await expect(unregisterModule({ id: '../x', env: envFor(4850, path.join(tmp, 'cfg')) })).rejects.toThrow(/Invalid app-core module id/);
    });
  });

  describe('describeRegistration', () => {
    it('writes one distinct line per outcome, and a refusal says what to do', () => {
      const lines = [
        describeRegistration({ status: 'registered', port: 4850 }, 'queue'),
        describeRegistration({ status: 'deferred', file: '/c/modules/queue.json' }, 'queue'),
        describeRegistration({ status: 'skipped', reason: 'app-core is not installed' }, 'queue'),
        describeRegistration({ status: 'refused', port: 4850, httpStatus: 400, reason: 'bad id' }, 'queue'),
        describeRegistration({ status: 'unregistered', port: 4850 }, 'queue'),
        describeRegistration({ status: 'not-registered', port: 4850, reason: 'unknown' }, 'queue'),
        describeRegistration({ status: 'cleared', file: '/c/modules/queue.json' }, 'queue'),
      ];
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines[3]).toContain('HTTP 400');
      expect(lines[3]).toContain('bad id');
      expect(lines[3]).toContain('Fix');
      expect(lines.every((line) => line.startsWith('app-core:'))).toBe(true);
    });

    it('describes a failure as non-fatal for the daemon', () => {
      expect(describeRegistrationFailure(new Error('boom'))).toBe('app-core: registration failed, the daemon runs on without it: boom');
    });
  });
});
