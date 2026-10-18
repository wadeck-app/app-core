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

export type RegistrationOutcome =
  /** app-core took the module (a module it already knew is reloaded). */
  | { status: 'registered'; port: number }
  /** app-core is running and said no; `reason` is its own `error` text and names what to fix. */
  | { status: 'refused'; port: number; httpStatus: number; reason: string }
  /** app-core is installed but not running: the pickup file it reads at its next start was written. */
  | { status: 'deferred'; file: string }
  /** app-core is not installed here: nothing was written. */
  | { status: 'skipped'; reason: string };

export type UnregistrationOutcome =
  /** app-core removed the module, its routes and its registry file. */
  | { status: 'unregistered'; port: number }
  /** app-core is running and did not know that id. */
  | { status: 'not-registered'; port: number; reason: string }
  | { status: 'refused'; port: number; httpStatus: number; reason: string }
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
  /** How long to wait for app-core before treating it as not running. Default 3000. */
  timeoutMs?: number;
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

// Undefined means app-core is not serving: connection refused, or it accepted and never answered.
async function postJson(port: number, endpoint: string, body: object, timeoutMs: number): Promise<Response | undefined> {
  try {
    return await fetch(`http://127.0.0.1:${port}/api/modules/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return undefined;
  }
}

async function refusalReason(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const { error } = JSON.parse(text) as { error?: unknown };
    if (typeof error === 'string' && error.trim() !== '') {
      return error;
    }
  } catch {
    // Not JSON: report what was actually said.
  }
  return text.trim() === '' ? response.statusText || 'no reason given' : text.trim();
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
 * When app-core is not running, the registration is left in <configDir>/modules/<id>.json, which
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
  const response = await postJson(port, 'register', payload, timeoutMs);

  if (response === undefined) {
    const configDir = resolveConfigDir(env);
    if (!fs.existsSync(configDir)) {
      return { status: 'skipped', reason: `app-core is not installed (${configDir} does not exist)` };
    }
    const file = pickupFile(configDir, id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
    return { status: 'deferred', file };
  }
  if (response.ok) {
    return { status: 'registered', port };
  }
  return { status: 'refused', port, httpStatus: response.status, reason: await refusalReason(response) };
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
  const reason = await refusalReason(response);
  if (response.status === 404) {
    return { status: 'not-registered', port, reason };
  }
  return { status: 'refused', port, httpStatus: response.status, reason };
}

/** One log line per outcome. A refusal says what to do, since nobody is watching when it happens. */
export function describeRegistration(outcome: RegistrationOutcome | UnregistrationOutcome, id: string): string {
  switch (outcome.status) {
    case 'registered':
      return `app-core: module "${id}" registered (app-core on port ${outcome.port})`;
    case 'deferred':
      return `app-core: not running, left ${outcome.file} for its next start`;
    case 'skipped':
      return `app-core: module "${id}" not registered, ${outcome.reason}`;
    case 'refused':
      return `app-core: refused module "${id}" (HTTP ${outcome.httpStatus}): ${outcome.reason}. Fix what it names, then register again. app-core was on port ${outcome.port}.`;
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
