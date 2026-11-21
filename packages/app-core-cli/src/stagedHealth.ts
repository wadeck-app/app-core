// Health test of a staged app-core-cli, used by the background and the explicit updater (updater-entry.ts): the new version is
// refused unless ITS server really runs, with the modules registered on this machine. Bundled into app-core-cli-updater.cjs: it
// must not import the CLI runtime (only node, shared-updater and the tiny config-dir resolvers of the server).
import { spawn as nodeSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { killProcessTree, isProcessRunning } from '@wadeck-app/shared-updater';
import { resolveConfigDir } from '@wadeck-app/app-core-server/configDir';
import { portFilePath } from '@wadeck-app/app-core-server/portFile';

// Same shape as shared-updater's HealthCheckInput / HealthCheckResult (not exported by its index).
export interface StagedHealthInput {
  pkgName: string;
  version: string;
  packageDir: string;
  entry: string;
  configDir: string;
  timeoutMs: number;
}
export interface StagedHealthResult {
  ok: boolean;
  output: string;
}

interface StreamLike {
  setEncoding?(encoding: string): unknown;
  on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
}
// What the check needs from a spawned process (a ChildProcess fits).
export interface ChildLike {
  pid?: number;
  exitCode: number | null;
  stdout?: StreamLike | null;
  stderr?: StreamLike | null;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}
export interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}
export interface FetchedResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchedResponse>;
type FsLike = Pick<typeof fs, 'mkdtempSync' | 'mkdirSync' | 'copyFileSync' | 'readdirSync' | 'readFileSync' | 'rmSync' | 'existsSync' | 'statSync'>;

export interface StagedHealthDeps {
  spawn: (command: string, args: string[], options: SpawnOptions) => ChildLike;
  fetch: FetchLike;
  now: () => number;
  // Wall clock (epoch ms), to age the folders of earlier checks by their mtime.
  epochMs: () => number;
  sleep: (ms: number) => Promise<void>;
  killTree: (pid: number) => void;
  isPidAlive: (pid: number) => boolean;
  fs: FsLike;
  tmpdir: () => string;
  // The config dir of the app-core installed on this machine (its registry is copied, its running server is the baseline).
  realConfigDir: () => string;
  // The environment the updater runs in (the staged server inherits it, home included; only the config dirs and the update switches change).
  env: NodeJS.ProcessEnv;
  // A problem that does not change the verdict (a temp dir that could not be removed).
  warn: (message: string) => void;
}

// A module's /health is asked up to this many times in all, with this pause between two asks: the first answer after a start can be a
// cold start of the module's own connections. The verdict is the last attempt's.
const HEALTH_ATTEMPTS = 3;
const HEALTH_RETRY_PAUSE_MS = 3_000;
const TAIL_LINES = 40;
const OUTPUT_CAP = 64 * 1024;
const POLL_MS = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const CLI_VERSION_TIMEOUT_MS = 15_000;
const TEMP_PREFIX = 'app-core-staged-health-';
const STALE_AFTER_MS = 10 * 60_000;
const REPORT_AFTER_MS = 24 * 60 * 60_000;
// Waits between two attempts to remove the temp folder (about 5.1 s in all): Windows may keep a folder locked for a moment after its processes ended.
const REMOVE_BACKOFF_MS = [100, 200, 400, 800, 1_600, 2_000];

function errorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  return typeof code === 'string' ? `${code}: ${message}` : message;
}

// Removes a folder, retrying while it is locked. Throws the last error when it still cannot be removed.
async function removeWithBackoff(deps: StagedHealthDeps, dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      deps.fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      const wait = REMOVE_BACKOFF_MS[attempt];
      if (wait === undefined) {
        throw err;
      }
      await deps.sleep(wait);
    }
  }
}

// Removes the folders of earlier checks that could not be removed then (older than 10 min by mtime, named like ours, nothing else).
// Never throws. A folder that still cannot be removed is reported in the returned warnings only once it is older than 24 h.
function sweepStaleFolders(deps: StagedHealthDeps): string[] {
  const warnings: string[] = [];
  const base = deps.tmpdir();
  let names: string[];
  try {
    names = deps.fs.readdirSync(base).filter((name) => name.startsWith(TEMP_PREFIX));
  } catch (err) {
    deps.warn(`could not look for stale folders of earlier staged server checks in ${base} (${errorText(err)}).`);
    return warnings;
  }
  for (const name of names) {
    const dir = path.join(base, name);
    try {
      const stat = deps.fs.statSync(dir);
      const age = deps.epochMs() - stat.mtimeMs;
      if (!stat.isDirectory() || age < STALE_AFTER_MS) {
        continue;
      }
      try {
        deps.fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        if (age >= REPORT_AFTER_MS) {
          warnings.push(`warning: the folder ${dir} of an earlier staged server check is older than 24 h and cannot be removed (${errorText(err)}).`);
        }
      }
    } catch {
      // Vanished meanwhile (another check removed it): nothing left to do.
    }
  }
  return warnings;
}

function defaultDeps(): StagedHealthDeps {
  return {
    spawn: (command, args, options) =>
      nodeSpawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        // POSIX: own process group, so killProcessTree reaches the children of the server.
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    fetch: (url, init) => fetch(url, { signal: init.signal }),
    now: () => Date.now(),
    epochMs: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    killTree: (pid) => killProcessTree(pid),
    isPidAlive: (pid) => isProcessRunning(pid),
    fs,
    tmpdir: () => os.tmpdir(),
    realConfigDir: () => resolveConfigDir(),
    env: process.env,
    warn: (message) => process.stderr.write(`[app-core-cli-updater] ${message}\n`),
  };
}

// The last output of a child, kept bounded: a runaway server must not grow the updater.
class OutputTail {
  private text = '';
  push(chunk: string | Buffer): void {
    this.text += chunk.toString();
    if (this.text.length > OUTPUT_CAP) {
      this.text = this.text.slice(this.text.length - OUTPUT_CAP);
    }
  }
  tail(lines = TAIL_LINES): string {
    const all = this.text.split(/\r?\n/);
    if (all[all.length - 1] === '') {
      all.pop();
    }
    return all.slice(-lines).join('\n');
  }
  all(): string {
    return this.text;
  }
}

class CheckFailure extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly moduleId?: string,
  ) {
    super(message);
  }
}

interface Running {
  child: ChildLike;
  output: OutputTail;
  // Set once the process ended.
  exited: { code: number | null; signal: string | null } | undefined;
  spawnError: Error | undefined;
}

function startChild(deps: StagedHealthDeps, args: string[], env: NodeJS.ProcessEnv, cwd: string): Running {
  const child = deps.spawn(process.execPath, args, { cwd, env });
  const running: Running = { child, output: new OutputTail(), exited: undefined, spawnError: undefined };
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding?.('utf8');
    stream?.on('data', (chunk) => running.output.push(chunk));
  }
  child.on('exit', (code, signal) => {
    running.exited = { code, signal };
  });
  child.on('error', (err) => {
    running.spawnError = err;
  });
  return running;
}

function stopChild(deps: StagedHealthDeps, running: Running): void {
  const pid = running.child.pid;
  if (pid !== undefined && running.exited === undefined) {
    deps.killTree(pid);
  }
}

// Environment of the `cli version` step only: nothing of the real profile (as shared-updater's default test), no update.
function isolatedEnv(deps: StagedHealthDeps, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...deps.env,
    UPDATER_DISABLE: '1',
    APP_CORE_CLI_NO_UPDATE: '1',
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  };
  for (const key of ['UPDATER_FORCE', 'UPDATER_MANUAL', 'UPDATER_SELF_CHECK_CMD', 'APP_CORE_PORT']) {
    delete env[key];
  }
  return env;
}

// Environment of the staged server: the REAL home (HOME, USERPROFILE, APPDATA, XDG_*), because modules find the systems they talk to
// (the orchestrator daemon...) through it; only app-core's own config dir and the CLI's config dir are temporary, and no update runs.
function serverEnv(deps: StagedHealthDeps, configDir: string, cliConfigDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...deps.env, UPDATER_DISABLE: '1', APP_CORE_CLI_NO_UPDATE: '1', APP_CORE_CONFIG_DIR: configDir, APP_CORE_CLI_CONFIG_DIR: cliConfigDir };
  for (const key of ['UPDATER_FORCE', 'UPDATER_MANUAL', 'UPDATER_SELF_CHECK_CMD', 'APP_CORE_PORT']) {
    delete env[key];
  }
  return env;
}

// Waits for `done()` until the deadline; returns false on timeout.
async function waitUntil(deps: StagedHealthDeps, deadline: number, done: () => boolean): Promise<boolean> {
  while (!done()) {
    if (deps.now() >= deadline) {
      return false;
    }
    await deps.sleep(POLL_MS);
  }
  return true;
}

// Step 0, the check the updater always had: `<entry> cli version` exits 0 and prints the staged version as a whole word.
async function checkCliVersion(deps: StagedHealthDeps, input: StagedHealthInput, env: NodeJS.ProcessEnv, cwd: string, deadline: number): Promise<void> {
  const running = startChild(deps, [input.entry, 'cli', 'version'], env, cwd);
  const limit = Math.min(deadline, deps.now() + CLI_VERSION_TIMEOUT_MS);
  try {
    const ended = await waitUntil(deps, limit, () => running.exited !== undefined || running.spawnError !== undefined);
    if (running.spawnError !== undefined) {
      throw new CheckFailure('cli version', `could not start ${input.entry}: ${running.spawnError.message}`);
    }
    if (!ended || running.exited === undefined) {
      throw new CheckFailure('cli version', `\`${path.basename(input.entry)} cli version\` did not finish in time (process tree stopped).`);
    }
    if (running.exited.code !== 0) {
      throw new CheckFailure('cli version', `\`${path.basename(input.entry)} cli version\` exited with ${running.exited.code ?? running.exited.signal}.`);
    }
    const words = running.output.all().split(/\s+/);
    if (!words.includes(input.version)) {
      throw new CheckFailure('cli version', `\`cli version\` exited 0 but does not print the staged version ${input.version} as a word.`);
    }
  } catch (err) {
    throw withTail(err, running);
  } finally {
    stopChild(deps, running);
  }
}

// Attaches the child output to a failure (the failure keeps its step and module).
function withTail(err: unknown, running: Running): unknown {
  if (err instanceof CheckFailure) {
    return new CheckFailure(err.step, `${err.message}\n--- last ${TAIL_LINES} lines of the staged process output ---\n${running.output.tail() || '(no output)'}`, err.moduleId);
  }
  return err;
}

interface PortFile {
  pid: number | undefined;
  port: number;
}

function readPortFile(deps: StagedHealthDeps, configDir: string): PortFile | undefined {
  const file = portFilePath(configDir);
  if (!deps.fs.existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(deps.fs.readFileSync(file, 'utf8')) as { pid?: unknown; port?: unknown };
    if (typeof parsed.port !== 'number') {
      return undefined;
    }
    return { pid: typeof parsed.pid === 'number' ? parsed.pid : undefined, port: parsed.port };
  } catch {
    // Being written right now: the next poll reads it whole.
    return undefined;
  }
}

class Http {
  constructor(
    private readonly deps: StagedHealthDeps,
    private readonly base: string,
    private readonly deadline: number,
  ) {}

  async get(pathOrUrl: string, step: string, moduleId?: string): Promise<{ status: number; contentType: string; body: string }> {
    const remaining = this.deadline - this.deps.now();
    if (remaining <= 0) {
      throw new CheckFailure(step, `the time allowed to the check ran out before GET ${pathOrUrl}.`, moduleId);
    }
    const signal = AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining));
    try {
      const response = await this.deps.fetch(new URL(pathOrUrl, this.base).toString(), { signal });
      const body = await response.text();
      return { status: response.status, contentType: response.headers.get('content-type') ?? '', body };
    } catch (err) {
      throw new CheckFailure(step, `GET ${pathOrUrl} failed: ${err instanceof Error ? err.message : String(err)}`, moduleId);
    }
  }
}

// Same-origin references of the shell page: <script src> and <link href>.
export function referencedAssets(html: string, base: string): string[] {
  const found = new Set<string>();
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attribute = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0]);
    const ref = attribute?.[1] ?? attribute?.[2];
    if (ref === undefined || ref === '' || ref.startsWith('#')) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(ref, `${base}/`);
    } catch {
      continue;
    }
    if (url.origin === new URL(base).origin) {
      found.add(`${url.pathname}${url.search}`);
    }
  }
  return [...found];
}

interface ListedModule {
  id: string;
  extensionPoints: Array<{ kind?: string; slot?: string; label?: string; path?: string; view?: unknown; rawYaml?: string }>;
}
interface ModulesAnswer {
  modules: ListedModule[];
  failed: Array<{ id: string; error?: string; cause?: string }>;
}

// Reads the answer of GET /api/modules as server/src/routes/modules.ts sends it: { modules: [...], failed: [...] }.
function parseModulesAnswer(body: string, where: string): ModulesAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new CheckFailure('modules', `${where}: GET /api/modules is not JSON (${err instanceof Error ? err.message : String(err)}).`);
  }
  const record = parsed as { modules?: unknown; failed?: unknown };
  if (!Array.isArray(record.modules) || !Array.isArray(record.failed)) {
    throw new CheckFailure('modules', `${where}: GET /api/modules does not answer { modules: [...], failed: [...] }.`);
  }
  return { modules: record.modules as ListedModule[], failed: record.failed as ModulesAnswer['failed'] };
}

// Ids of the registry entries in <realDir>/modules; the id is the one inside the file, else the file name.
function copyRegistry(deps: StagedHealthDeps, realConfigDir: string, tempConfigDir: string): string[] {
  const source = path.join(realConfigDir, 'modules');
  if (!deps.fs.existsSync(source)) {
    return [];
  }
  const target = path.join(tempConfigDir, 'modules');
  deps.fs.mkdirSync(target, { recursive: true });
  const ids: string[] = [];
  for (const file of deps.fs.readdirSync(source).filter((f) => f.endsWith('.json'))) {
    deps.fs.copyFileSync(path.join(source, file), path.join(target, file));
    let id = file.slice(0, -'.json'.length);
    try {
      const parsed = JSON.parse(deps.fs.readFileSync(path.join(source, file), 'utf8')) as { id?: unknown };
      if (typeof parsed.id === 'string') {
        id = parsed.id;
      }
    } catch {
      // The staged server reads the copy and reports what is wrong with it; the file name stands for the id until then.
    }
    ids.push(id);
  }
  return ids;
}

// The modules the running server of this machine serves, to tell a regression from a module that was already broken.
// undefined: no running server to compare with (the absolute checks apply alone); `note` says why.
async function readBaseline(deps: StagedHealthDeps, realConfigDir: string, deadline: number): Promise<{ answer?: ModulesAnswer; http?: Http; note: string }> {
  const file = readPortFile(deps, realConfigDir);
  if (file === undefined) {
    return { note: `no running app-core server (no usable ${portFilePath(realConfigDir)}): a module that fails to load in the stage fails the update` };
  }
  if (file.pid === undefined || !deps.isPidAlive(file.pid)) {
    return { note: `the server recorded in ${portFilePath(realConfigDir)} is not running: a module that fails to load in the stage fails the update` };
  }
  try {
    const http = new Http(deps, `http://127.0.0.1:${file.port}`, deadline);
    const { status, body } = await http.get('/api/modules', 'baseline');
    if (status !== 200) {
      return { note: `the running server answered ${status} to GET /api/modules: a module that fails to load in the stage fails the update` };
    }
    return { answer: parseModulesAnswer(body, 'running server'), http, note: '' };
  } catch (err) {
    return { note: `the running server on port ${file.port} could not be read (${err instanceof Error ? err.message : String(err)}): a module that fails to load in the stage fails the update` };
  }
}

// (a) the shell: / is HTML and everything it references answers 200; (b) build-info.json parses.
async function checkShell(http: Http, base: string): Promise<void> {
  const index = await http.get('/', 'shell');
  if (index.status !== 200) {
    throw new CheckFailure('shell', `GET / answered ${index.status}, expected 200.`);
  }
  if (!/html/i.test(index.contentType) && !/<html|<!doctype/i.test(index.body)) {
    throw new CheckFailure('shell', `GET / is not HTML (content-type "${index.contentType}").`);
  }
  for (const asset of referencedAssets(index.body, base)) {
    const response = await http.get(asset, 'shell');
    if (response.status !== 200) {
      throw new CheckFailure('shell', `the page references ${asset}, which answers ${response.status} (expected 200): the frontend of this version is incomplete.`);
    }
  }
  const info = await http.get('/build-info.json', 'build-info');
  if (info.status !== 200) {
    throw new CheckFailure('build-info', `GET /build-info.json answered ${info.status}, expected 200.`);
  }
  try {
    JSON.parse(info.body);
  } catch (err) {
    throw new CheckFailure('build-info', `GET /build-info.json is not JSON (${err instanceof Error ? err.message : String(err)}).`);
  }
}

// (c) every module of the registry is loaded; a module that is not loaded fails the update only when the running server serves it.
// Returns the modules the stage serves.
async function checkModules(http: Http, expectedIds: string[], baseline: ModulesAnswer | undefined): Promise<ListedModule[]> {
  const response = await http.get('/api/modules', 'modules');
  if (response.status !== 200) {
    throw new CheckFailure('modules', `GET /api/modules answered ${response.status}, expected 200.`);
  }
  const staged = parseModulesAnswer(response.body, 'staged server');
  const loaded = new Set(staged.modules.map((m) => m.id));
  const inRunning = new Set(baseline?.modules.map((m) => m.id) ?? []);
  const wanted = new Set([...expectedIds, ...staged.failed.map((f) => f.id), ...inRunning]);
  for (const id of [...wanted].sort()) {
    if (loaded.has(id)) {
      continue;
    }
    // Healthy in the running server and not in the stage: a regression. With no running server there is nothing to excuse it.
    if (baseline !== undefined && !inRunning.has(id)) {
      continue;
    }
    const failure = staged.failed.find((f) => f.id === id);
    const why = failure === undefined ? 'it is registered but the staged server does not list it (not loaded, not reported as failed either)' : `the staged server failed to load it (${failure.cause ?? 'error'}): ${failure.error ?? 'no message'}`;
    throw new CheckFailure('modules', `module "${id}" is not loaded: ${why}.`, id);
  }
  return staged.modules;
}

interface ModuleHealth {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

// The format of decision D7; undefined when the body is anything else.
function asModuleHealth(body: string): ModuleHealth | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const record = parsed as { ok?: unknown; checks?: unknown };
  if (typeof record !== 'object' || record === null || typeof record.ok !== 'boolean' || !Array.isArray(record.checks)) {
    return undefined;
  }
  for (const check of record.checks as unknown[]) {
    const c = check as { name?: unknown; ok?: unknown; detail?: unknown };
    if (typeof check !== 'object' || check === null || typeof c.name !== 'string' || typeof c.ok !== 'boolean' || (c.detail !== undefined && typeof c.detail !== 'string')) {
      return undefined;
    }
  }
  return record as ModuleHealth;
}

// What the running server says about the same URL, to tell a regression from something already broken. `warnings` collects what is
// reported without failing the update.
interface Compare {
  running: Http | undefined;
  warnings: string[];
}

const NO_BASELINE = 'The running app-core server was not available to compare with: start it (or fix the module), then retry.';

// The status the running server answers to the same GET, undefined when it cannot be reached.
async function runningStatus(compare: Compare, urlPath: string): Promise<number | undefined> {
  try {
    return (await compare.running!.get(urlPath, 'compare')).status;
  } catch {
    return undefined;
  }
}

// (e) the base pages of a module without /health: every page without a ':param' has its view, and each GET source answers without a 5xx.
// A 5xx (or a network error) in the stage fails only when the running server answers the same URL without a 5xx.
async function checkBasePages(http: Http, mod: ListedModule, compare: Compare): Promise<void> {
  for (const point of mod.extensionPoints) {
    if (point.kind !== 'page' || (point.path !== undefined && point.path.includes(':'))) {
      continue;
    }
    const name = point.path ?? point.label ?? point.slot ?? 'page';
    if (point.view === undefined || point.view === null || point.rawYaml === undefined || point.rawYaml === '') {
      throw new CheckFailure('pages', `page "${name}" of module "${mod.id}" has no resolved view in GET /api/modules.`, mod.id);
    }
    const sources = (point.view as { $sources?: unknown }).$sources;
    if (typeof sources !== 'object' || sources === null) {
      continue;
    }
    for (const [sourceName, source] of Object.entries(sources as Record<string, unknown>)) {
      const url = urlOfReadableSource(source);
      if (url === undefined) {
        continue;
      }
      const label = `page "${name}" of module "${mod.id}": source "${sourceName}" (GET ${url})`;
      let answer: string | undefined;
      try {
        const response = await http.get(url, 'pages', mod.id);
        answer = response.status >= 500 ? `answers ${response.status}` : undefined;
      } catch (err) {
        answer = err instanceof CheckFailure ? err.message : String(err);
      }
      if (answer === undefined) {
        continue;
      }
      if (compare.running === undefined) {
        throw new CheckFailure('pages', `${label} ${answer}. ${NO_BASELINE}`, mod.id);
      }
      const there = await runningStatus(compare, url);
      if (there !== undefined && there < 500) {
        throw new CheckFailure('pages', `${label} ${answer} in the staged server, and ${there} in the running one.`, mod.id);
      }
      compare.warnings.push(`warning: ${label} ${answer} in the staged server, and ${there === undefined ? 'cannot be reached' : `answers ${there}`} in the running one too: not counted.`);
    }
  }
}

// The path of a `$sources` entry that can be fetched as it is: `url: GET /path` with no {placeholder} and no $route / $urlParam parameter.
function urlOfReadableSource(source: unknown): string | undefined {
  const entry = source as { url?: unknown; params?: unknown };
  if (typeof source !== 'object' || source === null || typeof entry.url !== 'string') {
    return undefined;
  }
  const match = /^GET\s+(\/\S*)$/.exec(entry.url.trim());
  if (match === null || /\{[^}]*\}/.test(match[1]!)) {
    return undefined;
  }
  if (typeof entry.params === 'object' && entry.params !== null) {
    for (const value of Object.values(entry.params as Record<string, unknown>)) {
      if (typeof value === 'string' && /\$(?:route|urlParam)\b/.test(value)) {
        return undefined;
      }
    }
  }
  return match[1];
}

// One ask of GET /health: the answer is final (`done`), or an attempt that failed (`failed`, worth asking again after a pause).
// A malformed 200 throws at once: it is a bug of the module, not a cold start.
type HealthAttempt = { kind: 'no-check' } | { kind: 'healthy' } | { kind: 'failed'; detail: string; failure: CheckFailure; unhealthy: boolean };

async function askHealth(http: Http, mod: ListedModule, url: string): Promise<HealthAttempt> {
  let response: Awaited<ReturnType<Http['get']>>;
  try {
    response = await http.get(url, 'health', mod.id);
  } catch (err) {
    if (err instanceof CheckFailure) {
      return { kind: 'failed', detail: err.message, failure: err, unhealthy: false };
    }
    throw err;
  }
  if (response.status === 404) {
    return { kind: 'no-check' };
  }
  if (response.status !== 200) {
    const detail = `module "${mod.id}": GET ${url} answered ${response.status}; it must answer 200 with { ok, checks } or 404 when it proposes no check.`;
    return { kind: 'failed', detail, failure: new CheckFailure('health', detail, mod.id), unhealthy: false };
  }
  const health = asModuleHealth(response.body);
  if (health === undefined) {
    throw new CheckFailure('health', `module "${mod.id}" answers ${url} but not in the health format { ok: boolean, checks: [{ name: string, ok: boolean, detail?: string }] }. Fix the route, or rename it if it means something else.`, mod.id);
  }
  if (health.ok) {
    return { kind: 'healthy' };
  }
  const failed = health.checks.filter((c) => !c.ok);
  const listed = failed.length === 0 ? 'no check is listed as failed' : failed.map((c) => `${c.name}${c.detail === undefined ? '' : ` (${c.detail})`}`).join('; ');
  const message = `module "${mod.id}" reports it is not healthy: ${listed}.`;
  return { kind: 'failed', detail: listed, failure: new CheckFailure('health', message, mod.id), unhealthy: true };
}

// (d) the module's own check (D7), else (e) its base pages. A check that fails is asked again (a cold start of the module's connections
// makes the first answer fail): the verdict is the last attempt's, and every attempt is named in the failure.
async function checkModule(deps: StagedHealthDeps, http: Http, mod: ListedModule, compare: Compare): Promise<void> {
  const url = `/api/modules/${encodeURIComponent(mod.id)}/health`;
  const failedAttempts: string[] = [];
  let last: HealthAttempt;
  for (let attempt = 1; ; attempt += 1) {
    last = await askHealth(http, mod, url);
    if (last.kind !== 'failed' || attempt >= HEALTH_ATTEMPTS) {
      break;
    }
    failedAttempts.push(last.detail);
    await deps.sleep(HEALTH_RETRY_PAUSE_MS);
  }
  if (last.kind === 'failed') {
    failedAttempts.push(last.detail);
  } else if (failedAttempts.length > 0) {
    const earlier = failedAttempts.length === 1 ? `first attempt: ${failedAttempts[0]}` : `earlier attempts: ${failedAttempts.map((d, i) => `${i + 1}: ${d}`).join('; ')}`;
    compare.warnings.push(`module ${mod.id}: healthy on attempt ${failedAttempts.length + 1} (${earlier})`);
  }
  if (last.kind === 'no-check') {
    await checkBasePages(http, mod, compare);
    return;
  }
  if (last.kind === 'failed') {
    const attempts = ` Failed after ${failedAttempts.length} attempts (${HEALTH_RETRY_PAUSE_MS} ms apart), the first ones failed too: ${failedAttempts.map((d, i) => `attempt ${i + 1}: ${d}`).join(' | ')}.`;
    const message = `${last.failure.message}${attempts}`;
    if (!last.unhealthy) {
      throw new CheckFailure('health', message, mod.id);
    }
    if (compare.running === undefined) {
      throw new CheckFailure('health', `${message} ${NO_BASELINE}`, mod.id);
    }
    // Healthy (or no answer in the format) in the running server: the stage made it worse.
    let there: ModuleHealth | undefined;
    try {
      const answer = await compare.running.get(url, 'compare', mod.id);
      there = answer.status === 200 ? asModuleHealth(answer.body) : undefined;
    } catch {
      there = undefined;
    }
    if (there === undefined || there.ok) {
      throw new CheckFailure('health', `${message} The running server does not report it as unhealthy.`, mod.id);
    }
    compare.warnings.push(`warning: ${message} The running server reports it as unhealthy too: not counted.`);
  }
}

function describeFailure(err: unknown, running: Running | undefined): string {
  if (err instanceof CheckFailure) {
    const where = err.moduleId === undefined ? `step "${err.step}"` : `step "${err.step}", module "${err.moduleId}"`;
    const tail = running === undefined || err.message.includes('--- last ') ? '' : `\n--- last ${TAIL_LINES} lines of the staged server output ---\n${running.output.tail() || '(no output)'}`;
    return `staged server check failed at ${where}: ${err.message}${tail}`;
  }
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const tail = running === undefined ? '' : `\n--- last ${TAIL_LINES} lines of the staged server output ---\n${running.output.tail() || '(no output)'}`;
  return `staged server check crashed: ${message}${tail}`;
}

// Runs the staged server on a copy of the registry and checks it. Usable as shared-updater's `healthCheck`.
export async function stagedServerHealthCheck(input: StagedHealthInput, overrides: Partial<StagedHealthDeps> = {}): Promise<StagedHealthResult> {
  const deps: StagedHealthDeps = { ...defaultDeps(), ...overrides };
  const deadline = deps.now() + input.timeoutMs;
  let root: string | undefined;
  let server: Running | undefined;
  const sweepWarnings = sweepStaleFolders(deps);
  const withWarnings = (text: string): string => (sweepWarnings.length === 0 ? text : [text, ...sweepWarnings].join('\n'));
  try {
    root = deps.fs.mkdtempSync(path.join(deps.tmpdir(), TEMP_PREFIX));
    const home = path.join(root, 'home');
    const tempConfig = path.join(root, 'config');
    deps.fs.mkdirSync(home, { recursive: true });
    deps.fs.mkdirSync(tempConfig, { recursive: true });
    const versionEnv = isolatedEnv(deps, home);
    const serveEnv = serverEnv(deps, tempConfig, path.join(root, 'cli-config'));

    // The step the updater always ran, first: an old-style failure keeps its message.
    await checkCliVersion(deps, input, versionEnv, root, deadline);

    const realConfigDir = deps.realConfigDir();
    const expectedIds = copyRegistry(deps, realConfigDir, tempConfig);
    const baseline = await readBaseline(deps, realConfigDir, deadline);

    server = startChild(deps, [input.entry, 'serve', '--port', '0', '--no-tray', '--no-update'], serveEnv, root);
    const started = server;
    let portFile: PortFile | undefined;
    const ready = await waitUntil(deps, deadline, () => {
      portFile = readPortFile(deps, tempConfig);
      return portFile !== undefined || started.exited !== undefined || started.spawnError !== undefined;
    });
    if (started.spawnError !== undefined) {
      throw new CheckFailure('start', `could not start ${input.entry}: ${started.spawnError.message}`);
    }
    if (portFile === undefined && started.exited !== undefined) {
      throw new CheckFailure('start', `the staged server exited (${started.exited.code ?? started.exited.signal}) before it listened.`);
    }
    if (!ready || portFile === undefined) {
      throw new CheckFailure('start', `the staged server wrote no ${portFilePath(tempConfig)} within ${input.timeoutMs} ms (it never listened, or loading a module blocks it).`);
    }
    if (!Number.isInteger(portFile.port) || portFile.port <= 0 || portFile.port > 65535) {
      throw new CheckFailure('start', `the staged server wrote the port ${portFile.port} in its port file, not a port it listens on.`);
    }

    const base = `http://127.0.0.1:${portFile.port}`;
    const http = new Http(deps, base, deadline);
    await checkShell(http, base);
    const modules = await checkModules(http, expectedIds, baseline.answer);
    const compare: Compare = { running: baseline.http, warnings: [] };
    for (const mod of modules) {
      await checkModule(deps, http, mod, compare);
    }
    const warned = compare.warnings.length === 0 ? '' : `\n${compare.warnings.join('\n')}`;
    return { ok: true, output: withWarnings(`staged server answered on port ${portFile.port}; ${modules.length} module(s) checked${baseline.note === '' ? '' : `; ${baseline.note}`}${warned}`) };
  } catch (err) {
    // The last lines of a process that just exited may still be in the pipe.
    if (server?.exited !== undefined) {
      await deps.sleep(150);
    }
    return { ok: false, output: withWarnings(describeFailure(err, server)) };
  } finally {
    if (server !== undefined) {
      stopChild(deps, server);
    }
    if (root !== undefined) {
      try {
        await removeWithBackoff(deps, root);
      } catch (err) {
        deps.warn(`the temporary folder ${root} of the staged server check could not be removed (${errorText(err)}); the next update check removes it.`);
      }
    }
  }
}
