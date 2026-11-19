#!/usr/bin/env node
// Runs the server watcher and the frontend dev server together (one command, one Orchestrator job).
// Children are spawned as plain `node <bin>` (no npm/cmd.exe layer) and stopped by killing their whole tree.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverWatchExcludes } from '../packages/server/dev/watchExcludes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// tsx watch holds a handle on the folder of every file the server loads, and Windows refuses to rename a folder that is watched: the
// modules installed by `<cli> cli update` (global npm packages, swapped in by rename) and the ones registered from a build folder must
// stay out of the watch, or every such update fails with EPERM while dev:all runs. A module registered after this start is not covered:
// restart dev:all if its update fails with EPERM.
function watchExcludes() {
  const npmRoot = spawnSync('npm root -g', { encoding: 'utf8', shell: true });
  const globalNodeModules = npmRoot.status === 0 ? npmRoot.stdout.trim() : undefined;
  if (globalNodeModules === undefined) {
    console.warn(`[dev-all] WARNING: "npm root -g" failed (${(npmRoot.stderr || npmRoot.error?.message || 'no output').trim()}): the installed CLIs are not kept out of the server watch, so "<cli> cli update" may fail with EPERM on Windows while dev:all runs.`);
  }
  const modulesDir = join(process.env.APP_CORE_CONFIG_DIR ?? join(homedir(), '.config', 'app-core'), 'modules');
  const registryEntries = [];
  if (existsSync(modulesDir)) {
    for (const file of readdirSync(modulesDir).filter((f) => f.endsWith('.json'))) {
      try {
        registryEntries.push(JSON.parse(readFileSync(join(modulesDir, file), 'utf8')));
      } catch (err) {
        console.warn(`[dev-all] WARNING: ${join(modulesDir, file)} is not readable JSON (${err.message}); its module is not kept out of the server watch.`);
      }
    }
  }
  const globs = serverWatchExcludes({ globalNodeModules, registryEntries });
  console.log(`[dev-all] server watch excludes ${globs.length} installed folder(s)${globs.length > 0 ? `: ${globs.join(', ')}` : ''}`);
  return globs.flatMap((glob) => ['--exclude', glob]);
}

const services = [
  {
    name: 'server',
    port: 4850,
    cwd: resolve(root, 'packages/server'),
    bin: resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    args: ['watch', ...watchExcludes(), 'src/index.ts'],
  },
  {
    name: 'frontend',
    port: 5173,
    cwd: resolve(root, 'packages/frontend-shell'),
    bin: resolve(root, 'node_modules/vite/bin/vite.js'),
    // strictPort: fail instead of silently moving to 5174 (the API proxy and docs assume 5173).
    // force: Vite reused a stale pre-bundled dsl-ui after a dependency upgrade and the page broke;
    // re-optimizing on every start trades a few seconds for never serving outdated dependencies.
    args: ['--strictPort', '--force'],
  },
];

function fail(message) {
  console.error(`[dev-all] ERROR: ${message}`);
  process.exit(1);
}

function isPortInUse(port) {
  const probe = (host) =>
    new Promise((done) => {
      const socket = net.connect({ port, host });
      socket.once('connect', () => { socket.destroy(); done(true); });
      socket.once('error', () => done(false));
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function pipeWithPrefix(stream, target, prefix) {
  let pending = '';
  stream.on('data', (buf) => {
    const lines = (pending + buf.toString()).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) target.write(`${prefix}${line}\n`);
  });
  stream.on('end', () => { if (pending) target.write(`${prefix}${pending}\n`); });
}

for (const s of services) {
  if (!existsSync(s.bin)) {
    fail(`${s.bin} not found. Run "npm install" at the repo root first.`);
  }
  if (await isPortInUse(s.port)) {
    fail(`port ${s.port} (${s.name}) is already in use. A previous dev server is probably still running -- stop it, then retry.`);
  }
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of running) killTree(child);
}

// The output goes to a log file and a web log page that do not interpret ANSI codes. Vite colors it
// anyway on Windows even when piped (picocolors only checks the platform there), and the codes cut its
// URL in pieces ("http://localhost:" + bold port), so the link is unusable. NO_COLOR is honored by Vite
// and tsx; FORCE_COLOR is removed because some libraries give it priority over NO_COLOR.
const { FORCE_COLOR: _forceColor, ...inheritedEnv } = process.env;
const childEnv = { ...inheritedEnv, NO_COLOR: '1' };

const running = services.map((s) => {
  const child = spawn(process.execPath, [s.bin, ...s.args], { cwd: s.cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${s.name}] `;
  pipeWithPrefix(child.stdout, process.stdout, prefix);
  pipeWithPrefix(child.stderr, process.stderr, prefix);
  child.on('error', (err) => { console.error(`[dev-all] ERROR: failed to start "${s.name}": ${err.message}`); shutdown(); process.exitCode = 1; });
  child.on('exit', (code) => {
    if (!shuttingDown) console.error(`[dev-all] "${s.name}" exited with code ${code} -- stopping the other process.`);
    process.exitCode ||= code ?? 1;
    shutdown();
  });
  return { name: s.name, child };
});

// The tray icon (blue: a dev server) lives and dies with this script. It is optional: without the CLI build or the
// tray binary the servers still run, and the reason is printed. "Quit" in its menu (exit 0) stops everything.
const cliBundle = resolve(root, 'packages/app-core-cli/dist/cli.bundle.js');
if (!existsSync(cliBundle)) {
  console.warn(`[dev-all] WARNING: no tray icon: ${cliBundle} not found. Build it with: npm run build --workspace=packages/app-core-cli`);
} else {
  const tray = spawn(process.execPath, [cliBundle, 'tray', '--url', `http://localhost:${services.find((s) => s.name === 'frontend').port}/`], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pipeWithPrefix(tray.stdout, process.stdout, '[tray] ');
  pipeWithPrefix(tray.stderr, process.stderr, '[tray] ');
  tray.on('error', (err) => console.warn(`[dev-all] WARNING: no tray icon: ${err.message}`));
  tray.on('exit', (code) => {
    if (shuttingDown) return;
    if (code === 0) {
      console.log('[dev-all] "Quit" chosen in the tray menu -- stopping.');
      shutdown();
    } else {
      console.warn(`[dev-all] WARNING: the tray exited with code ${code} (see the [tray] lines above); the servers keep running.`);
    }
  });
  running.push({ name: 'tray', child: tray });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// One plain line with both URLs once the services answer: the server only logs {"type":"ready"} (no URL)
// and Vite needs a while (--force re-optimizes dependencies, ~25 s was measured).
const READY_TIMEOUT_MS = 120_000;
const deadline = Date.now() + READY_TIMEOUT_MS;
const pending = new Set(services.map((s) => s.name));
while (pending.size > 0 && !shuttingDown && Date.now() < deadline) {
  for (const s of services) {
    if (pending.has(s.name) && (await isPortInUse(s.port))) pending.delete(s.name);
  }
  if (pending.size > 0) await new Promise((done) => setTimeout(done, 500));
}
if (!shuttingDown) {
  if (pending.size > 0) {
    console.error(`[dev-all] WARNING: ${[...pending].join(', ')} not listening after ${READY_TIMEOUT_MS / 1000} s; check the [${[...pending][0]}] lines above.`);
  } else {
    const portOf = (name) => services.find((s) => s.name === name).port;
    console.log(`[dev-all] ready: app http://localhost:${portOf('frontend')}/  api http://127.0.0.1:${portOf('server')}/`);
  }
}
