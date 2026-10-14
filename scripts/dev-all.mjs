#!/usr/bin/env node
// Runs the server watcher and the frontend dev server together (one command, one Orchestrator job).
// Children are spawned as plain `node <bin>` (no npm/cmd.exe layer) and stopped by killing their whole tree.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const services = [
  {
    name: 'server',
    port: 4850,
    cwd: resolve(root, 'packages/server'),
    bin: resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    args: ['watch', 'src/index.ts'],
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

const running = services.map((s) => {
  const child = spawn(process.execPath, [s.bin, ...s.args], { cwd: s.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
