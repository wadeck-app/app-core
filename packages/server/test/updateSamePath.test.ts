import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Contract: an update that rewrites the same CJS backend file (what `dev --watch` does) serves the new code.
//
// Native Node caches a CJS file by path and ignores the query string on the import URL, so the loader drops
// the require-cache entry before importing. Vitest has its own module graph that bypasses that cache, so an
// in-process test passes with or without the fix. This one therefore runs the COMPILED loader
// (packages/server/dist, `npm run build`) in a child `node` process, like production.
const loaderDist = path.join(import.meta.dirname, '..', 'dist', 'loader.js');

// Runs in the child: loads a module, rewrites its backend.cjs at the same path, loads it again, and prints
// what the route answered after each load.
const CHILD_SCRIPT = `
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const [loaderPath, dir] = process.argv.slice(2);
const { ModuleManager } = await import(pathToFileURL(loaderPath).href);

const backend = path.join(dir, 'api-backend', 'backend.cjs');
const manifest = path.join(dir, 'manifest.json');
fs.mkdirSync(path.dirname(backend), { recursive: true });
fs.writeFileSync(manifest, JSON.stringify({
  id: 'same-path',
  version: '0.0.0-dev',
  backendEntryPath: './api-backend/backend.cjs',
  extensionPoints: [{ kind: 'widget', slot: 'dashboard', label: 'W', view: { type: 'inline', value: { $type: 'Badge', label: 'w' } } }],
}));
const writeBackend = (answer) => fs.writeFileSync(backend,
  "module.exports = function (ctx) { ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({ answer: '" + answer + "' })); };\\n");

const manager = new ModuleManager({ configDir: path.join(dir, 'cfg') });
const entry = { id: 'same-path', source: { type: 'file', path: manifest } };
const ask = () => {
  const found = manager.routeRegistry.find('same-path', 'GET', '/ping');
  if (found === undefined) {
    throw new Error('route /ping is not registered');
  }
  let sent;
  found.handler({ params: {} }, { send: (value) => { sent = value; } });
  return sent.answer;
};

const answers = [];
writeBackend('first');
await manager.loadFromEntry(entry);
answers.push(ask());
// Same path, same version, different size: only the cache drop makes the new code visible.
writeBackend('second, longer');
await manager.loadFromEntry(entry);
answers.push(ask());
await manager.shutdown();
console.log(JSON.stringify(answers));
`;

describe('an update that rewrites the same CJS backend file serves the new code (compiled loader, real Node)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-same-path-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers with the first code, then with the rewritten code', () => {
    if (!fs.existsSync(loaderDist)) {
      throw new Error(`${loaderDist} not found: this test runs the compiled server. Run "npm run build" from the repository root first.`);
    }
    // The script lives apart from the module folder it rewrites.
    const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-same-path-script-'));
    try {
      const script = path.join(scriptDir, 'run.mjs');
      fs.writeFileSync(script, CHILD_SCRIPT);
      let stdout: string;
      try {
        stdout = execFileSync(process.execPath, [script, loaderDist, path.join(dir, 'module')], { encoding: 'utf8', stdio: 'pipe' });
      } catch (err) {
        const failure = err as { stdout?: string; stderr?: string };
        throw new Error(`child node process failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
      }
      expect(JSON.parse(stdout.trim().split('\n').at(-1)!)).toEqual(['first', 'second, longer']);
    } finally {
      fs.rmSync(scriptDir, { recursive: true, force: true });
    }
  });
});
