import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Contract: updating a module does not add a copy of its backend to the memory of the server.
//
// What keeps a copy is Node itself (its CommonJS cache, the `children` of the module that required the file, its ES module
// map), none of which exists inside vitest's own module graph. This test therefore runs the COMPILED loader
// (packages/server/dist, `npm run build`) in a child `node` process, like production, with garbage collection exposed.
const loaderDist = path.join(import.meta.dirname, '..', 'dist', 'loader.js');

const UPDATES = 12;
// What the backend holds, in megabytes: a stand-in for a bundle and the caches it fills.
const HOLD_MB = 8;

const CHILD_SCRIPT = `
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const [loaderPath, dir, extension, updates, holdMb, forceGc] = process.argv.slice(2);
const { ModuleManager } = await import(pathToFileURL(loaderPath).href);

const backend = path.join(dir, 'api-backend', 'backend.' + extension);
const manifest = path.join(dir, 'manifest.json');
fs.mkdirSync(path.dirname(backend), { recursive: true });
fs.writeFileSync(manifest, JSON.stringify({
  id: 'leaky',
  version: '0.0.0-dev',
  backendEntryPath: './api-backend/backend.' + extension,
  extensionPoints: [{ kind: 'widget', slot: 'dashboard', label: 'W', view: { type: 'inline', value: { $type: 'Badge', label: 'w' } } }],
}));
const hold = 'const keep = new Array(' + (Number(holdMb) * 125000) + ').fill("payload-" + Math.random());\\n';
// The text differs on every write (size and mtime): each load is a new file, as for a real update.
const writeBackend = (n) => fs.writeFileSync(backend, hold + (extension === 'cjs'
  ? "module.exports = function (ctx) { return keep.length + " + n + "; };\\n"
  : "export default function (ctx) { return keep.length + " + n + "; }\\n") + '// ' + 'x'.repeat(n) + '\\n');

const manager = new ModuleManager({ configDir: path.join(dir, 'cfg') });
const entry = { id: 'leaky', source: { type: 'file', path: manifest } };
const mb = () => { if (forceGc === 'yes') { global.gc(); global.gc(); } return Math.round(process.memoryUsage().heapUsed / 1048576); };
// A turn of the event loop, as between two requests: the loader's own collection runs then.
const turn = () => new Promise((resolve) => setTimeout(resolve, 30));

writeBackend(0);
const first = await manager.loadFromEntry(entry);
const afterFirst = mb();
let lastHeld = first.held;
let peakMb = 0;
for (let n = 1; n <= Number(updates); n++) {
  writeBackend(n);
  lastHeld = (await manager.loadFromEntry(entry)).held;
  await turn();
  peakMb = Math.max(peakMb, Math.round(process.memoryUsage().heapUsed / 1048576));
}
const afterUpdates = mb();
await manager.shutdown();
console.log(JSON.stringify({ firstHeld: first.held, lastHeld, grewMb: afterUpdates - afterFirst, peakMb: peakMb - afterFirst }));
`;

function run(dir: string, extension: 'cjs' | 'mjs', forceGc: 'yes' | 'no' = 'yes', updates = UPDATES): { firstHeld: string[]; lastHeld: string[]; grewMb: number; peakMb: number } {
  if (!fs.existsSync(loaderDist)) {
    throw new Error(`${loaderDist} not found: this test runs the compiled server. Run "npm run build" from the repository root first.`);
  }
  // The script lives apart from the module folder it rewrites.
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-update-memory-script-'));
  try {
    const script = path.join(scriptDir, 'run.mjs');
    fs.writeFileSync(script, CHILD_SCRIPT);
    let stdout: string;
    try {
      stdout = execFileSync(process.execPath, ['--expose-gc', script, loaderDist, path.join(dir, 'module'), extension, String(updates), String(HOLD_MB), forceGc], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      const failure = err as { stdout?: string; stderr?: string };
      throw new Error(`child node process failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
    }
    return JSON.parse(stdout.trim().split('\n').at(-1)!) as { firstHeld: string[]; lastHeld: string[]; grewMb: number; peakMb: number };
  } finally {
    fs.rmSync(scriptDir, { recursive: true, force: true });
  }
}

describe('updating a module does not keep the previous copy of its backend (compiled loader, real Node)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-update-memory-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it(`a CommonJS backend of ${HOLD_MB} MB updated ${UPDATES} times grows the heap by less than three copies, not ${UPDATES}`, () => {
    const result = run(dir, 'cjs');
    // Before the fix this was about HOLD_MB * UPDATES; the live copy is the first one, replaced each time.
    expect(result.grewMb, `the heap grew by ${result.grewMb} MB over ${UPDATES} updates`).toBeLessThan(HOLD_MB * 3);
    expect(result.lastHeld).toEqual([]);
  });

  it('the loader takes back the memory of the replaced copy by itself: no collection forced by the test, the heap does not climb', () => {
    // Enough updates to pass the point where V8 collects by itself (about 200 MB of heap here): without the loader's own collection
    // the peak is that large; with it the peak is a few copies.
    const result = run(dir, 'cjs', 'no', 40);
    expect(result.peakMb, `the heap peaked ${result.peakMb} MB above its first value over 40 updates with no collection forced`).toBeLessThan(HOLD_MB * 4);
  });

  it('an ES module backend cannot be let go of: the update says so, naming the file and the way out', () => {
    const result = run(dir, 'mjs');
    expect(result.firstHeld).toEqual([]);
    expect(result.lastHeld).toHaveLength(1);
    expect(result.lastHeld[0]).toContain('is an ES module: Node cannot unload it');
    expect(result.lastHeld[0]).toContain('backend.mjs');
    expect(result.lastHeld[0]).toContain('app-core-cli package writes api-backend/backend.cjs');
  });
});
