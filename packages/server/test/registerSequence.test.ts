import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Contract: registering a module again over HTTP after each update (new version, same path, a new route each time)
// serves the backend of THAT update, never an older one. Reported against an old build: the route added by an update
// only answered after the next update.
//
// Native Node caches a CJS file by path whatever the import query, and vitest's own module graph bypasses that cache,
// so this runs the COMPILED server (packages/server/dist, `npm run build`) in a child `node` process, like production.
const serverDist = path.join(import.meta.dirname, '..', 'dist');

// Runs in the child: three updates at the same path, each registered over HTTP, probing every route after each one.
const CHILD_SCRIPT = `
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const [distDir, dir, configDir, linkDir] = process.argv.slice(2);
const { buildServer } = await import(pathToFileURL(path.join(distDir, 'server.js')).href);

fs.mkdirSync(path.join(dir, 'api-backend'), { recursive: true });
const manifestPath = path.join(dir, 'manifest.json');
// Files are written at the real place; the register request names the manifest through the link when there is one.
const registeredPath = linkDir ? path.join(linkDir, 'manifest.json') : manifestPath;
const writeVersion = (n) => {
  fs.writeFileSync(manifestPath, JSON.stringify({
    id: 'seq',
    version: '1.0.' + n,
    backendEntryPath: './api-backend/backend.cjs',
    extensionPoints: [{ kind: 'widget', slot: 'dashboard', label: 'W', view: { type: 'inline', value: { $type: 'Badge', label: 'v' + n } } }],
  }));
  // Version n answers /r1 .. /rn with n.
  const routes = Array.from({ length: n }, (_, i) => "ctx.registerRoute('GET', '/r" + (i + 1) + "', (req, reply) => reply.send({ from: " + n + " }));").join('\\n');
  fs.writeFileSync(path.join(dir, 'api-backend', 'backend.cjs'), 'module.exports = function (ctx) {\\n' + routes + '\\n};\\n');
};

const { server } = await buildServer({ configDir });
const rows = [];
for (let n = 1; n <= 3; n++) {
  writeVersion(n);
  const registered = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'seq', source: { type: 'file', path: registeredPath } } });
  const answers = [];
  for (let r = 1; r <= 3; r++) {
    const res = await server.inject({ method: 'GET', url: '/api/modules/seq/r' + r });
    answers.push(res.statusCode === 200 ? res.json().from : res.statusCode);
  }
  rows.push({ registered: registered.statusCode, answers });
}
await server.close();
console.log(JSON.stringify(rows));
`;

describe('registering an updated module again over HTTP (compiled server, real Node)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-seq-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Runs the sequence in a child node process; `linked` registers through a link to the module folder, like a global npm
  // prefix that is a junction to the real folder (nvm) does.
  function runSequence(linked: boolean): unknown {
    if (!fs.existsSync(path.join(serverDist, 'server.js'))) {
      throw new Error(`${serverDist}/server.js not found: this test runs the compiled server. Run "npm run build" from the repository root first.`);
    }
    // The script lives apart from the module folder it rewrites, which is named "dist-module" like a packaged module.
    const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-seq-script-'));
    try {
      const script = path.join(scriptDir, 'run.mjs');
      fs.writeFileSync(script, CHILD_SCRIPT);
      const real = path.join(dir, 'dist-module');
      const args = [script, serverDist, real, path.join(dir, 'cfg')];
      if (linked) {
        fs.mkdirSync(real, { recursive: true });
        const link = path.join(dir, 'link');
        // A junction needs no privilege on Windows; on other systems the type is ignored and it is a plain symlink.
        fs.symlinkSync(real, link, 'junction');
        args.push(link);
      }
      let stdout: string;
      try {
        stdout = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
      } catch (err) {
        const failure = err as { stdout?: string; stderr?: string };
        throw new Error(`child node process failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
      }
      return JSON.parse(stdout.trim().split('\n').at(-1)!);
    } finally {
      fs.rmSync(scriptDir, { recursive: true, force: true });
    }
  }

  const EXPECTED = [
    { registered: 201, answers: [1, 404, 404] },
    { registered: 201, answers: [2, 2, 404] },
    { registered: 201, answers: [3, 3, 3] },
  ];

  it('serves the routes of the latest update after each register: 404 only for routes it does not have yet', () => {
    expect(runSequence(false)).toEqual(EXPECTED);
  });

  it('does the same when the manifest path goes through a link (a junction): Node keys its cache by the real path', () => {
    expect(runSequence(true)).toEqual(EXPECTED);
  });
});
