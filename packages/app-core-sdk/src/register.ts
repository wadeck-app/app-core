// Node-only: lets a daemon (Queue, Orchestrator, Flow...) tell app-core where its module lives, and
// remove it. Published as the `@wadeck-app/app-core-sdk/register` subpath, never from the main
// entry, which stays free of node: imports so browser code can import the types and schemas.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveConfigDir } from '@wadeck-app/app-core-server/configDir';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { MODULE_ID_PATTERN, MODULE_ID_RULE } from '@wadeck-app/app-core-server/moduleId';
import { DEFAULT_PORT, parsePortEnv } from '@wadeck-app/app-core-server/port';
import { readServerPort } from '@wadeck-app/app-core-server/portFile';

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_PROBE_TIMEOUT_MS = 1000;

export type RegistrationOutcome =
  /**
   * app-core took the module (a module it already knew is reloaded). `note` is set when the answer to
   * the registration was missed but app-core was then seen serving the manifest's version.
   */
  | { status: 'registered'; port: number; note?: string }
  /**
   * app-core is reachable but did not confirm: no answer within `timeoutMs` (`failure: 'timeout'`, typically a
   * module whose setup or migrate is slow, the registration may still be applying) or the connection broke
   * (`failure: 'reset'`, `detail` says how). Nothing was written: the registration may well have been applied.
   * `loadedVersion` / `expectedVersion` are set when GET /api/modules showed the module at another version.
   */
  | {
      status: 'unconfirmed';
      port: number;
      failure: 'timeout' | 'reset';
      timeoutMs?: number;
      detail?: string;
      loadedVersion?: string;
      expectedVersion?: string;
    }
  /** app-core is running and said no; `reason` is its own `error` text and names what to fix. */
  | { status: 'refused'; port: number; httpStatus: number; reason: string; code?: string; retained?: boolean }
  /** app-core is installed but not running: the pickup file it reads at its next start was written. */
  | { status: 'deferred'; file: string }
  /** app-core is not installed here: nothing was written. */
  | { status: 'skipped'; reason: string };

export type UnregistrationOutcome =
  /** app-core removed the module, its routes and its registry file. */
  | { status: 'unregistered'; port: number }
  /** app-core is running and did not know that id. */
  | { status: 'not-registered'; port: number; reason: string }
  | { status: 'refused'; port: number; httpStatus: number; reason: string; code?: string; retained?: boolean }
  /** app-core is not running: the pending pickup file for that id was removed. */
  | { status: 'cleared'; file: string }
  /** app-core is not running and there was nothing pending to remove. */
  | { status: 'skipped'; reason: string };

export interface RegisterModuleOptions {
  /** The module id: the prefix of its components (`<id>:Name`) and routes in app-core. */
  id: string;
  /** Path to the module's manifest.json; resolved against the caller's working directory. */
  manifestPath: string;
  /** Defaults to process.env. APP_CORE_PORT and APP_CORE_CONFIG_DIR are read from it. */
  env?: NodeJS.ProcessEnv;
  /** How long to wait for app-core's answer before checking what it did (outcome `unconfirmed`). Default 3000. */
  timeoutMs?: number;
  /** How long the check of GET /api/modules after a missing answer may take. Default 1000. */
  probeTimeoutMs?: number;
}

export interface UnregisterModuleOptions {
  id: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * The port app-core listens on: APP_CORE_PORT, else the one app-core wrote for itself (the port it
 * really bound, which differs from the default when that one was taken), else 4850.
 * A malformed APP_CORE_PORT throws instead of falling through to another source.
 */
export function resolveAppCorePort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePortEnv(env) ?? readServerPort(resolveConfigDir(env)) ?? DEFAULT_PORT;
}

function assertValidId(id: string): void {
  if (!MODULE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid app-core module id "${id}": it must ${MODULE_ID_RULE}.`);
  }
}

// Why a request got no HTTP answer. Only 'unreachable' proves nothing listens (connection refused, unknown host);
// a timeout or a broken connection says nothing about whether app-core received and applied the request.
type RequestFailure = { kind: 'unreachable' | 'timeout' | 'reset'; detail: string };

function classifyFailure(err: unknown): RequestFailure {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  const detail = typeof code === 'string' ? `${getErrorMessage(err)} (${code})` : getErrorMessage(err);
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { kind: 'timeout', detail };
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return { kind: 'unreachable', detail };
  }
  return { kind: 'reset', detail };
}

async function request(port: number, endpoint: string, init: RequestInit, timeoutMs: number): Promise<Response | RequestFailure> {
  try {
    return await fetch(`http://127.0.0.1:${port}/api/modules${endpoint}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return classifyFailure(err);
  }
}

function postRequest(port: number, endpoint: string, body: object, timeoutMs: number): Promise<Response | RequestFailure> {
  return request(port, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);
}

// Unregistration keeps the coarse reading: undefined means no answer, whatever the reason.
async function postJson(port: number, endpoint: string, body: object, timeoutMs: number): Promise<Response | undefined> {
  const result = await postRequest(port, `/${endpoint}`, body, timeoutMs);
  return result instanceof Response ? result : undefined;
}

// The version of the module as the manifest declares it, undefined when it cannot be read (app-core would refuse it anyway).
function readManifestVersion(manifestPath: string): string | undefined {
  try {
    const { version } = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

// After a registration that got no answer: what does app-core serve now? `undefined` means the check itself failed.
async function loadedVersionOf(port: number, id: string, timeoutMs: number): Promise<{ version: string | undefined } | RequestFailure> {
  const response = await request(port, '', { method: 'GET' }, timeoutMs);
  if (!(response instanceof Response)) {
    return response;
  }
  try {
    const { modules } = (await response.json()) as { modules?: Array<{ id?: unknown; version?: unknown }> };
    const found = modules?.find((m) => m.id === id);
    return { version: typeof found?.version === 'string' ? found.version : undefined };
  } catch {
    return { kind: 'reset', detail: 'GET /api/modules did not return a module list' };
  }
}

interface Refusal {
  reason: string;
  code?: string;
  retained?: boolean;
}

// What app-core said when it refused: its own text, and the fields that tell an automatic caller what kind of refusal it is.
async function refusalOf(response: Response): Promise<Refusal> {
  const text = await response.text().catch(() => '');
  try {
    const { error, code, retained } = JSON.parse(text) as { error?: unknown; code?: unknown; retained?: unknown };
    if (typeof error === 'string' && error.trim() !== '') {
      return { reason: error, ...(typeof code === 'string' ? { code } : {}), ...(typeof retained === 'boolean' ? { retained } : {}) };
    }
  } catch {
    // Not JSON: report what was actually said.
  }
  return { reason: text.trim() === '' ? response.statusText || 'no reason given' : text.trim() };
}

function pickupFile(configDir: string, id: string): string {
  return path.join(configDir, 'modules', `${id}.json`);
}

/**
 * Tells app-core where this daemon's module lives (POST /api/modules/register, which also reloads a
 * module it already knows). Never rejects because app-core is down: that is the normal state of a
 * machine without app-core, and the daemon must start the same either way. It rejects for what the
 * caller must fix: an invalid id, a malformed APP_CORE_PORT, or a manifest that does not exist.
 *
 * A missing answer (timeout, broken connection) is not "not running": app-core applies a registration while it
 * answers slowly. GET /api/modules is then checked, giving `registered` (with a note) or `unconfirmed`.
 *
 * When nothing listens on the port (refused / unknown host), the registration is left in <configDir>/modules/<id>.json, which
 * app-core loads at its next start, but only if app-core's config dir already exists: a user who
 * never installed app-core gets no app-core folder.
 */
export async function registerModule(options: RegisterModuleOptions): Promise<RegistrationOutcome> {
  const { id, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  assertValidId(id);
  const manifestPath = path.resolve(options.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `app-core module manifest not found at ${manifestPath}. The package was probably built without its app-module: rebuild it, or skip registering.`,
    );
  }

  const port = resolveAppCorePort(env);
  const payload = { id, source: { type: 'file', path: manifestPath } };
  const result = await postRequest(port, '/register', payload, timeoutMs);

  let failure: RequestFailure | undefined;
  let response: Response | undefined;
  if (result instanceof Response) {
    response = result;
  } else {
    failure = result;
  }

  // No answer is not "not running": app-core serves the request while its load (teardown, migrate, setup)
  // runs, and may have applied it. Look at what it serves before saying anything.
  if (failure !== undefined && failure.kind !== 'unreachable') {
    const expectedVersion = readManifestVersion(manifestPath);
    const seen = await loadedVersionOf(port, id, options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
    if ('kind' in seen && seen.kind === 'unreachable') {
      // app-core went away between the two requests: it is not running after all.
      failure = seen;
    } else {
      const loadedVersion = 'version' in seen ? seen.version : undefined;
      if (loadedVersion !== undefined && loadedVersion === expectedVersion) {
        return {
          status: 'registered',
          port,
          note: `app-core did not answer the registration (${failure.kind}: ${failure.detail}), but it serves version ${loadedVersion} of "${id}"`,
        };
      }
      return {
        status: 'unconfirmed',
        port,
        failure: failure.kind,
        ...(failure.kind === 'timeout' ? { timeoutMs } : {}),
        detail: failure.detail,
        ...(loadedVersion !== undefined ? { loadedVersion } : {}),
        ...(loadedVersion !== undefined && expectedVersion !== undefined ? { expectedVersion } : {}),
      };
    }
  }

  if (failure !== undefined) {
    const configDir = resolveConfigDir(env);
    if (!fs.existsSync(configDir)) {
      return { status: 'skipped', reason: `app-core is not installed (${configDir} does not exist)` };
    }
    const file = pickupFile(configDir, id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
    return { status: 'deferred', file };
  }
  if (response === undefined) {
    throw new Error('unreachable: a registration without an answer or a failure');
  }
  if (response.ok) {
    return { status: 'registered', port };
  }
  return { status: 'refused', port, httpStatus: response.status, ...(await refusalOf(response)) };
}

/**
 * Removes the module (POST /api/modules/unregister): for a daemon that is uninstalling. Same port
 * logic and same "never rejects because app-core is down" rule as registerModule; when app-core is
 * not running, a pending pickup file for that id is removed so the module does not come back.
 */
export async function unregisterModule(options: UnregisterModuleOptions): Promise<UnregistrationOutcome> {
  const { id, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  assertValidId(id);

  const port = resolveAppCorePort(env);
  const response = await postJson(port, 'unregister', { id }, timeoutMs);

  if (response === undefined) {
    const file = pickupFile(resolveConfigDir(env), id);
    if (!fs.existsSync(file)) {
      return { status: 'skipped', reason: `app-core is not running and no pending registration exists for "${id}"` };
    }
    fs.rmSync(file);
    return { status: 'cleared', file };
  }
  if (response.ok) {
    return { status: 'unregistered', port };
  }
  const refusal = await refusalOf(response);
  if (response.status === 404) {
    return { status: 'not-registered', port, reason: refusal.reason };
  }
  return { status: 'refused', port, httpStatus: response.status, ...refusal };
}

/** One log line per outcome. A refusal says what to do, since nobody is watching when it happens. */
export function describeRegistration(outcome: RegistrationOutcome | UnregistrationOutcome, id: string): string {
  switch (outcome.status) {
    case 'registered':
      return `app-core: module "${id}" registered (app-core on port ${outcome.port})${outcome.note === undefined ? '' : `. ${outcome.note}`}`;
    case 'unconfirmed': {
      const cause =
        outcome.failure === 'timeout'
          ? `app-core on port ${outcome.port} did not answer within ${outcome.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`
          : `the connection to app-core on port ${outcome.port} broke (${outcome.detail ?? 'no detail'})`;
      const seen =
        outcome.loadedVersion === undefined
          ? ''
          : ` It serves version ${outcome.loadedVersion} of "${id}"${outcome.expectedVersion === undefined ? '' : `, the manifest is ${outcome.expectedVersion}`}.`;
      return (
        `app-core: registration of module "${id}" not confirmed: ${cause}. app-core is running and may still be applying it (a slow setup or migrate hook).${seen} ` +
        `Nothing was written for its next start. Check GET http://127.0.0.1:${outcome.port}/api/modules, or register again.`
      );
    }
    case 'deferred':
      return `app-core: not running, left ${outcome.file} for its next start`;
    case 'skipped':
      return `app-core: module "${id}" not registered, ${outcome.reason}`;
    case 'refused': {
      const kept = outcome.retained === true ? ' The previous version of the module keeps running.' : '';
      const fix =
        outcome.code === 'shared-version-mismatch'
          ? " This module's components do not match the versions of the shared packages that app-core's shell provides: rebuild the module's dsl-lib against them, or update app-core's shell, and register again. Registering the same files again changes nothing."
          : ' Fix what it names, then register again.';
      return `app-core: refused module "${id}" (HTTP ${outcome.httpStatus}): ${outcome.reason}.${kept}${fix} app-core was on port ${outcome.port}.`;
    }
    case 'unregistered':
      return `app-core: module "${id}" removed (app-core on port ${outcome.port})`;
    case 'not-registered':
      return `app-core: module "${id}" was not registered (${outcome.reason})`;
    case 'cleared':
      return `app-core: not running, removed the pending registration ${outcome.file}`;
  }
}

/** For the daemon's catch: an error while registering must never be mistaken for a crash. */
export function describeRegistrationFailure(err: unknown): string {
  return `app-core: registration failed, the daemon runs on without it: ${getErrorMessage(err)}`;
}
