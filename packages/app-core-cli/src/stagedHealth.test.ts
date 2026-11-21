import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { referencedAssets, stagedServerHealthCheck, type ChildLike, type FetchedResponse, type StagedHealthDeps, type StagedHealthInput } from './stagedHealth.js';

const STAGED_PORT = 51_000;
const RUNNING_PORT = 4850;
const REAL_HOME = '/the/real/home';

interface Reply {
  status: number;
  body?: unknown;
  type?: string;
}
type Routes = Record<string, Reply | (() => Reply)>;
type ServeMode = 'listens' | 'never' | 'exits' | 'port-zero';

const HTML = '<!doctype html><html><head><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"><link rel="icon" href="https://cdn.example.com/x.png"></head><body></body></html>';

function page(pathOfPage: string | undefined, sources: Record<string, unknown> | undefined): { kind: string; slot: string; path?: string; view: unknown; rawYaml: string } {
  return { kind: 'page', slot: pathOfPage === undefined ? 'nav' : 'route', ...(pathOfPage === undefined ? {} : { path: pathOfPage }), view: { $type: 'Badge', ...(sources === undefined ? {} : { $sources: sources }) }, rawYaml: '$type: Badge\n' };
}

function modulesAnswer(modules: Array<{ id: string; extensionPoints?: unknown[] }>, failed: Array<{ id: string; error: string; cause?: string }> = []): Reply {
  return { status: 200, body: { modules: modules.map((m) => ({ extensionPoints: [page(undefined, undefined)], ...m })), failed } };
}

// The routes of a healthy stage with one module "alpha" that proposes no /health.
function healthyRoutes(): Routes {
  return {
    '/': { status: 200, body: HTML, type: 'text/html' },
    '/assets/app.js': { status: 200, body: 'x' },
    '/assets/app.css': { status: 200, body: 'x' },
    '/build-info.json': { status: 200, body: { version: '1.2.3' } },
    '/api/modules': modulesAnswer([{ id: 'alpha' }]),
    '/api/modules/alpha/health': { status: 404, body: { error: 'no route' } },
  };
}

describe('stagedServerHealthCheck', () => {
  let work: string;
  let realConfig: string;
  let killed: number[];
  let spawned: Array<{ args: string[]; env: NodeJS.ProcessEnv }>;
  let requested: string[];
  let madeRoots: string[];
  let warnings: string[];

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-health-test-'));
    realConfig = path.join(work, 'real-config');
    fs.mkdirSync(path.join(realConfig, 'modules'), { recursive: true });
    fs.writeFileSync(path.join(realConfig, 'modules', 'alpha.json'), JSON.stringify({ id: 'alpha', source: { type: 'file', path: '/x/manifest.json' } }));
    // Data and state of the real install must never reach the stage.
    fs.mkdirSync(path.join(realConfig, 'data'), { recursive: true });
    fs.writeFileSync(path.join(realConfig, 'data', 'secret.txt'), 'data');
    killed = [];
    spawned = [];
    requested = [];
    madeRoots = [];
    warnings = [];
  });

  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  const input = (): StagedHealthInput => ({ pkgName: '@wadeck-app/app-core-cli', version: '1.2.3', packageDir: '/stage/pkg', entry: '/stage/pkg/dist/cli.bundle.js', configDir: path.join(work, 'cli-config'), timeoutMs: 60_000 });

  // Everything the check touches, faked, except the file system (real temp folders).
  function deps(options: { routes?: Routes; runningRoutes?: Routes | undefined; serve?: ServeMode; cliVersion?: 'ok' | 'fails' | 'wrong-version'; alive?: boolean; serveLog?: string }): Partial<StagedHealthDeps> {
    const routes = options.routes ?? healthyRoutes();
    let clock = 0;
    const serve = options.serve ?? 'listens';
    if (options.runningRoutes !== undefined) {
      fs.writeFileSync(path.join(realConfig, 'server.port.json'), JSON.stringify({ pid: 4242, port: RUNNING_PORT }));
    }
    const wrapped = {
      ...fs,
      mkdtempSync: (prefix: string): string => {
        const made = fs.mkdtempSync(prefix);
        madeRoots.push(made);
        return made;
      },
    };
    return {
      fs: wrapped as unknown as StagedHealthDeps['fs'],
      tmpdir: () => work,
      realConfigDir: () => realConfig,
      env: { PATH: process.env['PATH'], APP_CORE_PORT: '4850', UPDATER_FORCE: '1', HOME: REAL_HOME, USERPROFILE: REAL_HOME, APPDATA: REAL_HOME + '/AppData', XDG_CONFIG_HOME: REAL_HOME + '/.config' },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      killTree: (pid) => {
        killed.push(pid);
      },
      isPidAlive: () => options.alive ?? true,
      warn: (message) => warnings.push(message),
      spawn: (_command, args, spawnOptions) => {
        spawned.push({ args, env: spawnOptions.env });
        const child = new EventEmitter() as EventEmitter & ChildLike;
        child.pid = 1000 + spawned.length;
        child.exitCode = null;
        const stdout = new EventEmitter() as EventEmitter & { setEncoding(): void };
        stdout.setEncoding = () => undefined;
        child.stdout = stdout;
        child.stderr = new EventEmitter() as never;
        // Runs once the caller has attached its listeners.
        queueMicrotask(() => {
          if (args[1] === 'cli') {
            const failed = options.cliVersion === 'fails';
            stdout.emit('data', failed ? 'boom: cannot start\n' : options.cliVersion === 'wrong-version' ? 'app-core-cli 9.9.9\n' : 'app-core-cli 1.2.3\n');
            child.emit('exit', failed ? 1 : 0, null);
            return;
          }
          const lines = options.serveLog ?? 'app-core-cli serve: starting\n';
          stdout.emit('data', lines);
          if (serve === 'exits') {
            stdout.emit('data', Array.from({ length: 60 }, (_v, i) => `crash line ${i + 1}\n`).join(''));
            child.emit('exit', 1, null);
          } else if (serve === 'listens' || serve === 'port-zero') {
            fs.writeFileSync(path.join(spawnOptions.env['APP_CORE_CONFIG_DIR']!, 'server.port.json'), JSON.stringify({ pid: child.pid, port: serve === 'port-zero' ? 0 : STAGED_PORT }));
          }
        });
        return child;
      },
      fetch: async (url, init): Promise<FetchedResponse> => {
        // The check hands fetch only a signal: no method, no body, so nothing but GET can be sent.
        expect(Object.keys(init)).toEqual(['signal']);
        const parsed = new URL(url);
        requested.push(`${parsed.port}${parsed.pathname}`);
        const table = Number(parsed.port) === RUNNING_PORT ? options.runningRoutes : routes;
        const entry = table?.[parsed.pathname + parsed.search];
        if (entry === undefined) {
          return { status: 404, headers: { get: () => 'application/json' }, text: async () => '{"error":"not found"}' };
        }
        const reply = typeof entry === 'function' ? entry() : entry;
        const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
        return { status: reply.status, headers: { get: (name) => (name.toLowerCase() === 'content-type' ? (reply.type ?? 'application/json') : null) }, text: async () => text };
      },
    };
  }

  // The child is always stopped (the serve child, plus the one of `cli version`) and every temp folder is gone.
  function expectCleanedUp(serverStarted: boolean): void {
    expect(madeRoots.length).toBe(1);
    expect(fs.existsSync(madeRoots[0]!)).toBe(false);
    expect(warnings).toEqual([]);
    if (serverStarted) {
      expect(killed).toContain(1000 + spawned.length);
    }
  }

  it('passes when the staged server serves the shell and every registered module', async () => {
    const result = await stagedServerHealthCheck(input(), deps({}));
    expect(result.ok, result.output).toBe(true);
    expect(spawned.map((s) => s.args.slice(1))).toEqual([['cli', 'version'], ['serve', '--port', '0', '--no-tray', '--no-update']]);
    // Every request went to the stage, none to a real server.
    expect(requested.every((r) => r.startsWith(String(STAGED_PORT)))).toBe(true);
    expectCleanedUp(true);
  });

  it('isolates the stage: temp config with the registry entries only, no inherited port, nothing of the real profile', async () => {
    let seenModules: string[] = [];
    let seenEntries: string[] = [];
    const base = deps({});
    const spawnFn = base.spawn!;
    base.spawn = (command, args, options) => {
      if (args[1] === 'serve') {
        const configDir = options.env['APP_CORE_CONFIG_DIR']!;
        seenEntries = fs.readdirSync(configDir).filter((f) => f !== 'server.port.json');
        seenModules = fs.readdirSync(path.join(configDir, 'modules'));
        expect(configDir.startsWith(madeRoots[0]!)).toBe(true);
        expect(options.env['UPDATER_DISABLE']).toBe('1');
        expect(options.env['APP_CORE_CLI_NO_UPDATE']).toBe('1');
        expect(options.env['APP_CORE_PORT']).toBeUndefined();
        expect(options.env['UPDATER_FORCE']).toBeUndefined();
        // The staged server keeps the real home (modules find their systems through it); only the two config dirs are temporary.
        expect(options.env['HOME']).toBe(REAL_HOME);
        expect(options.env['USERPROFILE']).toBe(REAL_HOME);
        expect(options.env['APPDATA']).toBe(`${REAL_HOME}/AppData`);
        expect(options.env['XDG_CONFIG_HOME']).toBe(`${REAL_HOME}/.config`);
        expect(options.env['APP_CORE_CLI_CONFIG_DIR']!.startsWith(madeRoots[0]!)).toBe(true);
      } else {
        // `cli version` stays isolated, as shared-updater's default test.
        for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'APPDATA']) {
          expect(options.env[key]!.startsWith(madeRoots[0]!)).toBe(true);
        }
      }
      return spawnFn(command, args, options);
    };
    const result = await stagedServerHealthCheck(input(), base);
    expect(result.ok, result.output).toBe(true);
    expect(seenModules).toEqual(['alpha.json']);
    expect(seenEntries).toEqual(['modules']);
    // The real registry and data are untouched.
    expect(fs.readdirSync(realConfig).sort()).toEqual(['data', 'modules']);
  });

  it('keeps the old failure message when `cli version` fails, and never starts the server', async () => {
    const result = await stagedServerHealthCheck(input(), deps({ cliVersion: 'fails' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "cli version"');
    expect(result.output).toContain('exited with 1');
    expect(result.output).toContain('boom: cannot start');
    expect(spawned).toHaveLength(1);
    expect(madeRoots).toHaveLength(1);
    expect(fs.existsSync(madeRoots[0]!)).toBe(false);
  });

  it('fails when `cli version` does not print the staged version', async () => {
    const result = await stagedServerHealthCheck(input(), deps({ cliVersion: 'wrong-version' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('does not print the staged version 1.2.3');
  });

  it('fails with the log tail (last 40 lines) when the stage exits at once', async () => {
    const result = await stagedServerHealthCheck(input(), deps({ serve: 'exits' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "start"');
    expect(result.output).toContain('exited (1) before it listened');
    expect(result.output).toContain('crash line 60');
    expect(result.output).toContain('crash line 21');
    expect(result.output).not.toContain('crash line 20\n');
    expectCleanedUp(false);
  });

  it('fails and kills the child when the port file never appears (time allowed exhausted)', async () => {
    const result = await stagedServerHealthCheck({ ...input(), timeoutMs: 5_000 }, deps({ serve: 'never' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "start"');
    expect(result.output).toContain('wrote no');
    expect(result.output).toContain('app-core-cli serve: starting');
    expectCleanedUp(true);
  });

  it('fails when the port file holds port 0 (a server that does not report the port it bound)', async () => {
    const result = await stagedServerHealthCheck(input(), deps({ serve: 'port-zero' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('wrote the port 0');
    expectCleanedUp(true);
  });

  it('fails when an asset of the shell answers 404, naming it', async () => {
    const routes = healthyRoutes();
    delete routes['/assets/app.css'];
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "shell"');
    expect(result.output).toContain('/assets/app.css, which answers 404');
    expect(result.output).toContain('last 40 lines');
    expectCleanedUp(true);
  });

  it('fails when / is not HTML', async () => {
    const routes = { ...healthyRoutes(), '/': { status: 200, body: { hello: 1 } } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('GET / is not HTML');
  });

  it('fails when build-info.json is not JSON', async () => {
    const routes = { ...healthyRoutes(), '/build-info.json': { status: 200, body: 'not json' } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "build-info"');
  });

  it('fails when a registered module is not listed by the stage, naming the module', async () => {
    const routes = { ...healthyRoutes(), '/api/modules': modulesAnswer([]) };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "modules", module "alpha"');
    expect(result.output).toContain('does not list it');
    expectCleanedUp(true);
  });

  it('fails with the load error when the stage reports the module as failed', async () => {
    const routes = { ...healthyRoutes(), '/api/modules': modulesAnswer([], [{ id: 'alpha', error: 'Cannot find module x', cause: 'error' }]) };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('module "alpha"');
    expect(result.output).toContain('Cannot find module x');
  });

  it('does not fail on a module the running server fails to load too', async () => {
    const routes = { ...healthyRoutes(), '/api/modules': modulesAnswer([], [{ id: 'alpha', error: 'broken', cause: 'error' }]) };
    const runningRoutes: Routes = { '/api/modules': modulesAnswer([], [{ id: 'alpha', error: 'broken', cause: 'error' }]) };
    const result = await stagedServerHealthCheck(input(), deps({ routes, runningRoutes }));
    expect(result.ok, result.output).toBe(true);
    expect(requested).toContain(`${RUNNING_PORT}/api/modules`);
    expectCleanedUp(true);
  });

  it('fails on a module that is healthy in the running server and not in the stage', async () => {
    const routes = { ...healthyRoutes(), '/api/modules': modulesAnswer([], [{ id: 'alpha', error: 'now broken' }]) };
    const runningRoutes: Routes = { '/api/modules': modulesAnswer([{ id: 'alpha' }]) };
    const result = await stagedServerHealthCheck(input(), deps({ routes, runningRoutes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('module "alpha" is not loaded');
    expect(result.output).toContain('now broken');
  });

  it('applies the absolute checks alone when the recorded server is not alive', async () => {
    const routes = { ...healthyRoutes(), '/api/modules': modulesAnswer([], [{ id: 'alpha', error: 'broken' }]) };
    const result = await stagedServerHealthCheck(input(), deps({ routes, runningRoutes: {}, alive: false }));
    expect(result.ok).toBe(false);
    expect(requested).not.toContain(`${RUNNING_PORT}/api/modules`);
  });

  it('fails when /health answers ok:false, listing the failed checks with their detail', async () => {
    const routes = { ...healthyRoutes(), '/api/modules/alpha/health': { status: 200, body: { ok: false, checks: [{ name: 'db', ok: false, detail: 'connection refused' }, { name: 'disk', ok: true }] } } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('step "health", module "alpha"');
    expect(result.output).toContain('db (connection refused)');
    expect(result.output).not.toContain('disk');
    expectCleanedUp(true);
  });

  it('passes when /health answers ok:true', async () => {
    const routes = { ...healthyRoutes(), '/api/modules/alpha/health': { status: 200, body: { ok: true, checks: [{ name: 'db', ok: true }] } } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok, result.output).toBe(true);
  });

  it.each([
    ['not JSON', 'plain text'],
    ['no checks array', { ok: true }],
    ['ok is a string', { ok: 'yes', checks: [] }],
    ['a check without a name', { ok: true, checks: [{ ok: true }] }],
    ['a detail that is not a string', { ok: true, checks: [{ name: 'a', ok: true, detail: 3 }] }],
  ])('fails when /health answers 200 but not in the health format (%s)', async (_label, body) => {
    const routes = { ...healthyRoutes(), '/api/modules/alpha/health': { status: 200, body } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('answers /api/modules/alpha/health but not in the health format');
  });

  it('fails when /health answers something else than 200 or 404', async () => {
    const routes = { ...healthyRoutes(), '/api/modules/alpha/health': { status: 500, body: { error: 'x' } } };
    const result = await stagedServerHealthCheck(input(), deps({ routes }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('answered 500');
  });

  describe('retry of the module health after a cold start', () => {
    const notHealthy = (detail: string): Reply => ({ status: 200, body: { ok: false, checks: [{ name: 'daemon', ok: false, detail }] } });
    const healthy: Reply = { status: 200, body: { ok: true, checks: [{ name: 'daemon', ok: true }] } };
    const HEALTH = '/api/modules/alpha/health';

    // A route that answers the given replies in turn (a function throws: the request fails like a timeout); counts the calls.
    function sequence(steps: Array<Reply | Error>): { route: () => Reply; calls: () => number } {
      let calls = 0;
      return {
        route: () => {
          const step = steps[Math.min(calls, steps.length - 1)]!;
          calls += 1;
          if (step instanceof Error) {
            throw step;
          }
          return step;
        },
        calls: () => calls,
      };
    }

    // The pauses between attempts: the fake sleep of the deps records them (no real wait).
    function withPauses(routes: Routes): { overrides: Partial<StagedHealthDeps>; pauses: number[] } {
      const overrides = deps({ routes });
      const pauses: number[] = [];
      const fakeSleep = overrides.sleep!;
      overrides.sleep = async (ms) => {
        if (ms >= 1_000) {
          pauses.push(ms);
        }
        await fakeSleep(ms);
      };
      return { overrides, pauses };
    }

    it('recovers on attempt 2', async () => {
      const seq = sequence([notHealthy('the daemon check did not answer within 2000 ms'), healthy]);
      const { overrides, pauses } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok, result.output).toBe(true);
      expect(seq.calls()).toBe(2);
      expect(pauses).toEqual([3_000]);
      expect(result.output).toContain('module alpha: healthy on attempt 2 (first attempt: daemon (the daemon check did not answer within 2000 ms))');
    });

    it('recovers on attempt 3', async () => {
      const seq = sequence([notHealthy('cold one'), notHealthy('cold two'), healthy]);
      const { overrides, pauses } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok, result.output).toBe(true);
      expect(seq.calls()).toBe(3);
      expect(pauses).toEqual([3_000, 3_000]);
      expect(result.output).toContain('module alpha: healthy on attempt 3');
      expect(result.output).toContain('cold one');
      expect(result.output).toContain('cold two');
    });

    it('fails after 3 attempts with all attempts listed', async () => {
      const seq = sequence([notHealthy('first detail'), notHealthy('second detail'), notHealthy('third detail')]);
      const { overrides } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok).toBe(false);
      expect(seq.calls()).toBe(3);
      expect(result.output).toContain('step "health", module "alpha"');
      expect(result.output).toContain('3 attempts');
      expect(result.output).toContain('the first ones failed too');
      expect(result.output).toContain('1: daemon (first detail)');
      expect(result.output).toContain('2: daemon (second detail)');
      expect(result.output).toContain('3: daemon (third detail)');
      expectCleanedUp(true);
    });

    it('does not retry a 404 (no check proposed)', async () => {
      const { overrides, pauses } = withPauses(healthyRoutes());
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok, result.output).toBe(true);
      expect(requested.filter((r) => r.endsWith(HEALTH))).toHaveLength(1);
      expect(pauses).toEqual([]);
    });

    it('does not retry an ok:true answer', async () => {
      const seq = sequence([healthy]);
      const { overrides, pauses } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok, result.output).toBe(true);
      expect(seq.calls()).toBe(1);
      expect(pauses).toEqual([]);
      expect(result.output).not.toContain('healthy on attempt');
    });

    it('does not retry a malformed answer', async () => {
      const seq = sequence([{ status: 200, body: { ok: true } }]);
      const { overrides, pauses } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok).toBe(false);
      expect(result.output).toContain('not in the health format');
      expect(seq.calls()).toBe(1);
      expect(pauses).toEqual([]);
    });

    it('counts the timeout of one attempt as a failed attempt', async () => {
      const seq = sequence([new Error('The operation was aborted due to timeout'), healthy]);
      const { overrides, pauses } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok, result.output).toBe(true);
      expect(seq.calls()).toBe(2);
      expect(pauses).toEqual([3_000]);
      expect(result.output).toContain('healthy on attempt 2 (first attempt: ');
      expect(result.output).toContain('aborted due to timeout');
    });

    it('lists a persistent timeout on every attempt', async () => {
      const seq = sequence([new Error('timeout A'), new Error('timeout B'), new Error('timeout C')]);
      const { overrides } = withPauses({ ...healthyRoutes(), [HEALTH]: seq.route });
      const result = await stagedServerHealthCheck(input(), overrides);
      expect(result.ok).toBe(false);
      expect(seq.calls()).toBe(3);
      for (const label of ['timeout A', 'timeout B', 'timeout C']) {
        expect(result.output).toContain(label);
      }
    });
  });

  describe('base pages (/health answers 404)', () => {
    const withPages = (extensionPoints: unknown[], more: Routes = {}): Routes => ({ ...healthyRoutes(), '/api/modules': modulesAnswer([{ id: 'alpha', extensionPoints }]), ...more });

    it('requests the GET sources that can be fetched as they are, and only those', async () => {
      const routes = withPages(
        [
          page(undefined, {
            list: { url: 'GET /api/modules/alpha/items' },
            one: { url: 'GET /api/modules/alpha/items/{id}', params: { id: '$route.id' } },
            fromRoute: { url: 'GET /api/modules/alpha/by', params: { q: '$urlParam.q' } },
            write: { url: 'POST /api/modules/alpha/items' },
            noUrl: { type: 'slot' },
          }),
          page('/items/:id', { never: { url: 'GET /api/modules/alpha/never' } }),
        ],
        { '/api/modules/alpha/items': { status: 200, body: [] } },
      );
      const result = await stagedServerHealthCheck(input(), deps({ routes }));
      expect(result.ok, result.output).toBe(true);
      const sourceRequests = requested.filter((r) => r.includes('/api/modules/alpha/') && !r.endsWith('/health'));
      expect(sourceRequests).toEqual([`${STAGED_PORT}/api/modules/alpha/items`]);
    });

    it('accepts a 4xx source and fails on a 5xx one, naming the page and the source', async () => {
      const ok = withPages([page(undefined, { a: { url: 'GET /api/modules/alpha/a' } })], { '/api/modules/alpha/a': { status: 403 } });
      expect((await stagedServerHealthCheck(input(), deps({ routes: ok }))).ok).toBe(true);
      const bad = withPages([page(undefined, { a: { url: 'GET /api/modules/alpha/a' } })], { '/api/modules/alpha/a': { status: 502 } });
      const result = await stagedServerHealthCheck(input(), deps({ routes: bad }));
      expect(result.ok).toBe(false);
      expect(result.output).toContain('step "pages", module "alpha"');
      expect(result.output).toContain('source "a" (GET /api/modules/alpha/a) answers 502');
    });

    it('fails when a page has no resolved view', async () => {
      const routes = withPages([{ kind: 'page', slot: 'nav', label: 'Home', view: null, rawYaml: '' }]);
      const result = await stagedServerHealthCheck(input(), deps({ routes }));
      expect(result.ok).toBe(false);
      expect(result.output).toContain('has no resolved view');
    });
  });

  describe('comparison with the running server', () => {
    const source = { a: { url: 'GET /api/modules/alpha/a' } };
    const pagesStage = (status: number): Routes => ({
      ...healthyRoutes(),
      '/api/modules': modulesAnswer([{ id: 'alpha', extensionPoints: [page(undefined, source)] }]),
      '/api/modules/alpha/a': { status },
    });
    const running = (extra: Routes): Routes => ({ '/api/modules': modulesAnswer([{ id: 'alpha' }]), ...extra });

    it('a source that answers 5xx in the stage fails when the running server answers it without a 5xx', async () => {
      const result = await stagedServerHealthCheck(input(), deps({ routes: pagesStage(503), runningRoutes: running({ '/api/modules/alpha/a': { status: 200 } }) }));
      expect(result.ok).toBe(false);
      expect(result.output).toContain('answers 503 in the staged server, and 200 in the running one');
      expect(requested).toContain(`${RUNNING_PORT}/api/modules/alpha/a`);
    });

    it('a source that also answers 5xx in the running server is a warning, not a failure', async () => {
      const result = await stagedServerHealthCheck(input(), deps({ routes: pagesStage(503), runningRoutes: running({ '/api/modules/alpha/a': { status: 500 } }) }));
      expect(result.ok, result.output).toBe(true);
      expect(result.output).toContain('warning: page');
      expect(result.output).toContain('answers 500 in the running one too: not counted');
    });

    it('a network error of the stage fails when the running server answers, with no running server it says nothing could be compared', async () => {
      const stage = pagesStage(200);
      stage['/api/modules/alpha/a'] = () => {
        throw new Error('socket hang up');
      };
      const compared = await stagedServerHealthCheck(input(), deps({ routes: stage, runningRoutes: running({ '/api/modules/alpha/a': { status: 200 } }) }));
      expect(compared.ok).toBe(false);
      expect(compared.output).toContain('socket hang up');
      const alone = await stagedServerHealthCheck(input(), deps({ routes: pagesStage(503) }));
      expect(alone.ok).toBe(false);
      expect(alone.output).toContain('running app-core server was not available to compare with');
    });

    const unhealthy = { status: 200, body: { ok: false, checks: [{ name: 'db', ok: false, detail: 'down' }] } };
    const stageHealth = (): Routes => ({ ...healthyRoutes(), '/api/modules/alpha/health': unhealthy });

    it('/health ok:false in the stage fails when the running server is healthy, warns when it is unhealthy too', async () => {
      const healthy = await stagedServerHealthCheck(input(), deps({ routes: stageHealth(), runningRoutes: running({ '/api/modules/alpha/health': { status: 200, body: { ok: true, checks: [] } } }) }));
      expect(healthy.ok).toBe(false);
      expect(healthy.output).toContain('The running server does not report it as unhealthy');
      const alsoDown = await stagedServerHealthCheck(input(), deps({ routes: stageHealth(), runningRoutes: running({ '/api/modules/alpha/health': unhealthy }) }));
      expect(alsoDown.ok, alsoDown.output).toBe(true);
      expect(alsoDown.output).toContain('The running server reports it as unhealthy too: not counted');
    });

    it('/health ok:false with no running server says nothing could be compared', async () => {
      const result = await stagedServerHealthCheck(input(), deps({ routes: stageHealth() }));
      expect(result.ok).toBe(false);
      expect(result.output).toContain('not available to compare with');
    });
  });

  describe('removal of the temp folder', () => {
    const busy = (): Error => Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });

    it('retries with a backoff and removes the folder once the lock is gone, without a warning', async () => {
      const base = deps({});
      const real = base.fs!;
      let calls = 0;
      base.fs = {
        ...real,
        rmSync: (target: fs.PathLike, options?: fs.RmOptions) => {
          calls += 1;
          if (calls <= 3) {
            throw busy();
          }
          real.rmSync(target, options);
        },
      } as unknown as StagedHealthDeps['fs'];
      const result = await stagedServerHealthCheck(input(), base);
      expect(result.ok, result.output).toBe(true);
      expect(calls).toBe(4);
      expect(fs.existsSync(madeRoots[0]!)).toBe(false);
      expect(warnings).toEqual([]);
    });

    it('keeps trying for about 5 s, then warns that the next update check removes it (folder and error code named); the verdict is unchanged', async () => {
      const base = deps({});
      const real = base.fs!;
      const slept: number[] = [];
      const sleep = base.sleep!;
      base.sleep = async (ms) => {
        slept.push(ms);
        await sleep(ms);
      };
      let calls = 0;
      base.fs = {
        ...real,
        rmSync: () => {
          calls += 1;
          throw busy();
        },
      } as unknown as StagedHealthDeps['fs'];
      const result = await stagedServerHealthCheck(input(), base);
      expect(result.ok, result.output).toBe(true);
      expect(calls).toBeGreaterThan(3);
      // The sleeps of the removal come last, after those of the polling of the check.
      const removalSleeps = slept.slice(-(calls - 1));
      const total = removalSleeps.reduce((sum, ms) => sum + ms, 0);
      expect(total).toBeGreaterThanOrEqual(4_500);
      expect(total).toBeLessThanOrEqual(6_000);
      expect(removalSleeps).toEqual([...removalSleeps].sort((x, y) => x - y));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(madeRoots[0]!);
      expect(warnings[0]).toContain('EBUSY');
      expect(warnings[0]).toContain('next update check');
      expect(warnings[0]).not.toContain('by hand');
      fs.rmSync(madeRoots[0]!, { recursive: true, force: true });
    });
  });

  describe('sweep of stale folders at the start', () => {
    const ago = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);
    const makeFolder = (name: string, minutesOld: number): string => {
      const dir = path.join(work, name);
      fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'config', 'x.json'), '{}');
      fs.utimesSync(dir, ago(minutesOld), ago(minutesOld));
      return dir;
    };

    it('removes an old matching folder, keeps a young one and anything that does not match', async () => {
      const old = makeFolder('app-core-staged-health-OLD', 11);
      const young = makeFolder('app-core-staged-health-YOUNG', 2);
      const other = makeFolder('some-other-folder', 600);
      const lookalike = makeFolder('not-app-core-staged-health-x', 600);
      const result = await stagedServerHealthCheck(input(), deps({}));
      expect(result.ok, result.output).toBe(true);
      expect(fs.existsSync(old)).toBe(false);
      expect(fs.existsSync(young)).toBe(true);
      expect(fs.existsSync(other)).toBe(true);
      expect(fs.existsSync(lookalike)).toBe(true);
      expect(result.output).not.toContain('warning');
    });

    it('stays silent about an old folder that cannot be removed while it is under 24 h, and warns with its path after', async () => {
      const day = makeFolder('app-core-staged-health-DAY', 23 * 60);
      const ancient = makeFolder('app-core-staged-health-ANCIENT', 25 * 60);
      const base = deps({});
      const real = base.fs!;
      base.fs = {
        ...real,
        rmSync: (target: fs.PathLike, options?: fs.RmOptions) => {
          if (target === day || target === ancient) {
            throw busy2();
          }
          real.rmSync(target, options);
        },
      } as unknown as StagedHealthDeps['fs'];
      const result = await stagedServerHealthCheck(input(), base);
      expect(result.ok, result.output).toBe(true);
      expect(result.output).toContain(ancient);
      expect(result.output).toContain('EPERM');
      expect(result.output).not.toContain(day);
    });

    it('never throws: a folder that cannot be listed is reported on stderr and the check goes on', async () => {
      const base = deps({});
      const real = base.fs!;
      base.fs = {
        ...real,
        readdirSync: (target: fs.PathLike, ...rest: unknown[]) => {
          if (target === work) {
            throw new Error('EACCES');
          }
          return (real.readdirSync as (...args: unknown[]) => unknown)(target, ...rest);
        },
      } as unknown as StagedHealthDeps['fs'];
      const result = await stagedServerHealthCheck(input(), base);
      expect(result.ok, result.output).toBe(true);
      expect(warnings.some((w) => w.includes('could not look for stale'))).toBe(true);
    });
  });
});

function busy2(): Error {
  return Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
}

describe('referencedAssets', () => {
  it('lists the same-origin script and link references once, without external ones', () => {
    expect(referencedAssets(HTML, 'http://127.0.0.1:1')).toEqual(['/assets/app.js', '/assets/app.css']);
    expect(referencedAssets('<script src="/a.js"></script><script src="/a.js"></script><link href="http://127.0.0.1:1/b.css">', 'http://127.0.0.1:1')).toEqual(['/a.js', '/b.css']);
  });
});
