import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { getErrorMessage } from './errors.js';
import { refuseUnlessElevated } from './auth/guard.js';

// What the server knows about itself as an installed program; given by `app-core-cli serve`, absent from a run from sources (dev:all).
export interface AppUpdateOptions {
  // The version this process booted with. Absent: not an installed release, the update state is not tracked.
  runningVersion?: string;
  // The folder of the installed app-core-cli package holding the running bundle: its package.json is the installed version.
  packageDir?: string;
  // The CLI config dir where the updater writes update-state.json and update-cache.json (APP_CORE_CLI_CONFIG_DIR, else ~/.config/app-core-cli).
  updaterDir?: string;
  // Starts a new server once this one is down. Absent: this run cannot restart itself.
  restart?: () => void;
}

export type AppUpdateStateName = 'up-to-date' | 'restart-needed' | 'update-failed' | 'update-available' | 'applying' | 'unknown';

export interface AppUpdateAnswer {
  state: AppUpdateStateName;
  // Why the state is unknown (what to look at); only with `unknown`.
  reason?: string;
  running: string | null;
  installed: string | null;
  latest: string | null;
  // The status the updater recorded (success, failed, rolled-back, applying...).
  status: string | null;
  previousVersion: string | null;
  failure?: { message: string; step?: string; logFile?: string };
  canRestart: boolean;
}

interface UpdaterState {
  status?: string;
  targetVersion?: string;
  previousVersion?: string;
  error?: string;
  phase?: string;
  timestamp?: number;
}

type Read<T> = { ok: true; value: T | null } | { ok: false; reason: string };

// A missing file is `null` (the updater has not written it); a file that exists and cannot be read as a JSON object is an error.
function readJsonFile<T>(file: string): Read<T> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, value: null };
    }
    return { ok: false, reason: `${file} cannot be read (${getErrorMessage(err)})` };
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, reason: `${file} is not a JSON object` };
    }
    return { ok: true, value: value as T };
  } catch (err) {
    return { ok: false, reason: `${file} is not valid JSON (${getErrorMessage(err)})` };
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// The updater logs into logs/<UTC day>.ndjson (shared-updater's appendLog); the state records no log file, so name the one of the day it ended.
function logFileOf(updaterDir: string, timestamp: number | undefined): string | undefined {
  if (typeof timestamp !== 'number') {
    return undefined;
  }
  const file = path.join(updaterDir, 'logs', `${new Date(timestamp).toISOString().slice(0, 10)}.ndjson`);
  return fs.existsSync(file) ? file : undefined;
}

const unknown = (reason: string, base: Partial<AppUpdateAnswer>, canRestart: boolean): AppUpdateAnswer => ({
  state: 'unknown',
  reason,
  running: null,
  installed: null,
  latest: null,
  status: null,
  previousVersion: null,
  ...base,
  canRestart,
});

// Reads two small files and one package.json, never the network: cheap enough for the shell to ask every few minutes.
export function describeAppUpdate(opts: AppUpdateOptions): AppUpdateAnswer {
  const canRestart = opts.restart !== undefined;
  const { runningVersion: running, packageDir, updaterDir } = opts;
  if (running === undefined || packageDir === undefined || updaterDir === undefined) {
    return unknown('This server is not run from an installed app-core-cli (a run from sources, npm run dev:all): its updates are not tracked. Install the package (npm install -g @wadeck-app/app-core-cli) and start it with "app-core-cli serve" to see them here.', { running }, canRestart);
  }
  const manifest = path.join(packageDir, 'package.json');
  const pkg = readJsonFile<{ version?: unknown }>(manifest);
  if (!pkg.ok) {
    return unknown(`${pkg.reason}: the installed version is unknown. An update may be in progress; if it persists, reinstall with "npm install -g @wadeck-app/app-core-cli".`, { running }, canRestart);
  }
  const installed = text(pkg.value?.version);
  if (installed === null) {
    return unknown(`${manifest} has no "version": the installed version is unknown. Reinstall with "npm install -g @wadeck-app/app-core-cli".`, { running }, canRestart);
  }
  const stateFile = path.join(updaterDir, 'update-state.json');
  const cacheFile = path.join(updaterDir, 'update-cache.json');
  const state = readJsonFile<UpdaterState & Record<string, unknown>>(stateFile);
  const cache = readJsonFile<{ latestVersion?: unknown }>(cacheFile);
  const broken = [state, cache].find((read) => !read.ok);
  if (broken !== undefined && !broken.ok) {
    return unknown(`${broken.reason}. Delete that file: the next update check writes it again.`, { running, installed }, canRestart);
  }
  const updater = state.ok ? state.value : null;
  const latest = text(cache.ok ? cache.value?.latestVersion : null) ?? text(updater?.targetVersion);
  if (updater === null && latest === null) {
    return unknown(`The updater has written no ${stateFile} nor ${cacheFile} yet: it has not run on this machine (is it disabled, or is this server started with --no-update?).`, { running, installed }, canRestart);
  }
  const status = text(updater?.status);
  const failed = status === 'failed' || status === 'rolled-back';
  const answer: AppUpdateAnswer = { state: 'up-to-date', running, installed, latest, status, previousVersion: text(updater?.previousVersion), canRestart };
  if (status === 'applying') {
    answer.state = 'applying';
  } else if (installed !== running) {
    answer.state = 'restart-needed';
  } else if (failed) {
    answer.state = 'update-failed';
    const logFile = logFileOf(updaterDir, updater?.timestamp);
    answer.failure = {
      message: text(updater?.error) ?? `The update to ${latest ?? 'a newer version'} failed (status "${status}") and the updater recorded no message.`,
      ...(text(updater?.phase) === null ? {} : { step: text(updater?.phase) as string }),
      ...(logFile === undefined ? {} : { logFile }),
    };
  } else if (latest !== null && latest !== running) {
    answer.state = 'update-available';
  }
  return answer;
}

// GET /api/app-update (read only) and POST /api/app-update/restart (sensitive: the PIN of auth/ unlocks it, like a module route
// declared `sensitive`).
export const appUpdateRoutes: FastifyPluginAsync<{ update: AppUpdateOptions; configDir: string; now?: () => number }> = async (server, { update, configDir, now }) => {
  server.get('/api/app-update', async (_req, reply) => reply.header('Cache-Control', 'no-store').send(describeAppUpdate(update)));
  server.post('/api/app-update/restart', async (req, reply) => {
    // Checked first: nothing to unlock when this run cannot restart itself.
    if (update.restart === undefined) {
      return reply.code(409).send({ error: 'restart-unavailable', message: 'This server cannot restart itself (it is not started by "app-core-cli serve"): restart it yourself, then reload the page.' });
    }
    const refusal = refuseUnlessElevated(configDir, req.headers.authorization, now);
    if (refusal !== undefined) {
      return reply.code(refusal.status).send(refusal.body);
    }
    const restart = update.restart;
    // After the answer left: the restart closes this server.
    reply.raw.once('finish', () => setTimeout(restart, 100));
    return reply.code(202).send({ restarting: true });
  });
};
