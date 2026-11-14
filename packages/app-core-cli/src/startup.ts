import { spawnSync } from 'node:child_process';

// Same surface as `machine startup enable | disable | status`: the name says it is about what starts at login.
// The job id Orchestrator knows the installed server by. The repository's own dev job is "app-core-dev": another id.
export const DEFAULT_STARTUP_ID = 'app-core';
export const STARTUP_USAGE = 'app-core-cli startup enable | disable | status [--id <job-id>]';
// Where the server publishes its pid and port (packages/server/src/portFile.ts); Orchestrator reads it to skip a start while the server is alive.
const PORT_FILE = '~/.config/app-core/server.port.json';
const COMMAND = 'app-core-cli serve';
// `orch install` is never run from here: it changes the login behaviour of Orchestrator itself, for every job.
export const ORCH_INSTALL_HINT = 'if orch does not start at login, run: orch install';

export type StartupAction = 'enable' | 'disable' | 'status';

export interface StartupOptions {
  action: StartupAction;
  // Only when --id is given. Without it, the job already using the server's port file is the one, else "app-core".
  id?: string;
}

export type StartupParse = { ok: true; options: StartupOptions } | { ok: false; error: string };

export function parseStartupArgs(args: readonly string[]): StartupParse {
  let action: StartupAction | undefined;
  let id: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === 'enable' || arg === 'disable' || arg === 'status') {
      if (action !== undefined) {
        return { ok: false, error: `one subcommand only ("${action}" and "${arg}" given). Usage: ${STARTUP_USAGE}` };
      }
      action = arg;
    } else if (arg === '--id') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { ok: false, error: `--id needs a job id, e.g. "app-core-cli startup enable --id ${DEFAULT_STARTUP_ID}".` };
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
        return { ok: false, error: `--id "${value}" is not a usable job id: use letters, digits, ".", "_" and "-" only.` };
      }
      id = value;
      i++;
    } else if (arg === '--no-update') {
      // Read by the entry point for every command: nothing to do here.
    } else {
      return { ok: false, error: `unknown argument "${arg}". Usage: ${STARTUP_USAGE}` };
    }
  }
  if (action === undefined) {
    return { ok: false, error: `startup needs a subcommand. Usage: ${STARTUP_USAGE}` };
  }
  return { ok: true, options: id === undefined ? { action } : { action, id } };
}

// The flags a server that must stay up for weeks needs. Orchestrator compares only the flags given, so a field edited by hand and
// not listed here is kept; its default 300 s timeout would stop the server after five minutes. For a job that exists, `command` is
// its own and no label is passed: only the missing settings are completed.
export function enableArguments(id: string, existing?: { command: string }): string[] {
  const own = existing === undefined ? ['--command', COMMAND, '--label', 'app-core (installed server)'] : ['--command', existing.command];
  // @formatter:off
  return [
    'ensure', 'startup', id,
    ...own,
    '--timeout', '0',
    '--max-concurrency', '1',
    '--trigger-mode', 'fire-and-forget',
    '--missed-firing', 'skip',
    '--liveness-strategy', 'portFile',
    '--liveness-port-file', PORT_FILE,
  ];
  // @formatter:on
}

export interface OrchRun {
  status: number | null;
  stdout: string;
  stderr: string;
  // Set when `orch` could not be started at all.
  spawnError?: string;
}

export type OrchRunner = (args: string[]) => OrchRun;

// `orch` is an npm .cmd shim on Windows, which only cmd.exe runs; an argument with a space or a parenthesis is quoted (ids are
// restricted to safe characters by parseStartupArgs, and the other arguments hold no quote). cmd.exe is started directly, not
// through `shell: true`, which Node flags as DEP0190.
const realRunner: OrchRunner = (args) => {
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `orch ${args.map((a) => (/[\s()]/.test(a) ? `"${a}"` : a)).join(' ')}`], { encoding: 'utf8', windowsVerbatimArguments: true })
      : spawnSync('orch', args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error === undefined ? {} : { spawnError: result.error.message }) };
};

export interface StartupResult {
  exitCode: number;
  // On stdout when exitCode is 0, on stderr otherwise.
  message: string;
}

function failure(args: string[], run: OrchRun): StartupResult {
  const command = `orch ${args.join(' ')}`;
  if (run.spawnError !== undefined || run.status === null) {
    return {
      exitCode: 1,
      message: `app-core-cli startup failed: could not run "orch" (${run.spawnError ?? 'no exit status'}). Install Orchestrator (npm i -g @wadeck-app/orchestrator-cli) and make sure "orch" is on the PATH, or register the job by hand: see docs/serve.md, "Start it with Orchestrator".`,
    };
  }
  const said = `${run.stdout}${run.stderr}`.trim();
  const old = /unknown command/i.test(said) ? ' This Orchestrator does not know "ensure" or "remove --if-exists": update it to 2026.11.14-592 or later.' : '';
  return { exitCode: 1, message: `app-core-cli startup failed: "${command}" exited ${run.status}.${said === '' ? '' : `\n${said}`}${old}` };
}

interface ShownJob {
  command?: unknown;
  timeoutSeconds?: unknown;
  maxConcurrency?: unknown;
  liveness?: { strategy?: unknown; portFile?: unknown };
}

// What differs between the job in Orchestrator and the settings `enable` writes: the reason a status says "outdated". The command
// is not compared: it is the user's (the repository's own job runs `npm run dev:all`), `enable` keeps it as it is.
export function outdatedFields(job: ShownJob): string[] {
  const differing: string[] = [];
  if (job.timeoutSeconds !== 0) differing.push(`timeout is ${job.timeoutSeconds === undefined ? 'not set (Orchestrator stops the job after 300 s)' : String(job.timeoutSeconds)}, expected 0 (no timeout)`);
  if (job.maxConcurrency !== 1) differing.push(`max concurrency is ${job.maxConcurrency === undefined ? 'not set' : String(job.maxConcurrency)}, expected 1`);
  if (job.liveness?.strategy !== 'portFile' || job.liveness.portFile !== PORT_FILE) differing.push(`liveness is not the portFile ${PORT_FILE}`);
  return differing;
}


interface ListedJob extends ShownJob {
  id?: unknown;
  type?: unknown;
}

type Target =
  | { ok: true; id: string; existing?: { command: string }; adopted: boolean; sameFileJobs: string[] }
  | { ok: false; result: StartupResult };

// Which job is meant. --id wins. Without it, the job that already starts this server (it uses the server's port file) is the one:
// creating a second one would make two jobs fight for the port. Several of them: the user says which.
function resolveTarget(explicitId: string | undefined, run: OrchRunner): Target {
  const args = ['list', '--json'];
  const listed = run(args);
  if (listed.spawnError !== undefined || listed.status !== 0) return { ok: false, result: failure(args, listed) };
  let jobs: ListedJob[];
  try {
    jobs = JSON.parse(listed.stdout) as ListedJob[];
  } catch {
    return { ok: false, result: { exitCode: 1, message: `app-core-cli startup failed: "orch list --json" did not answer JSON:\n${`${listed.stdout}${listed.stderr}`.trim()}` } };
  }
  const usingPortFile = jobs.filter((j) => j.type === 'startup' && j.liveness?.portFile === PORT_FILE && typeof j.id === 'string').map((j) => j.id as string);
  const asExisting = (id: string): { command: string } | undefined => {
    const found = jobs.find((j) => j.id === id);
    return found === undefined ? undefined : { command: typeof found.command === 'string' ? found.command : COMMAND };
  };
  if (explicitId !== undefined) {
    const existing = asExisting(explicitId);
    return { ok: true, id: explicitId, ...(existing === undefined ? {} : { existing }), adopted: false, sameFileJobs: usingPortFile.filter((id) => id !== explicitId) };
  }
  if (usingPortFile.length > 1) {
    return {
      ok: false,
      result: { exitCode: 1, message: `app-core-cli startup: ${usingPortFile.length} jobs already use the server's port file (${usingPortFile.join(', ')}): say which one with --id <job-id>.` },
    };
  }
  if (usingPortFile.length === 1) {
    const id = usingPortFile[0]!;
    return { ok: true, id, existing: asExisting(id)!, adopted: true, sameFileJobs: [] };
  }
  return { ok: true, id: DEFAULT_STARTUP_ID, adopted: false, sameFileJobs: [] };
}

function competing(target: Extract<Target, { ok: true }>): string {
  return target.sameFileJobs.length === 0 ? '' : `\nwarning: ${target.sameFileJobs.join(', ')} also starts a server with this port file: two jobs would fight for the port. Keep one (app-core-cli startup disable --id <job-id> removes the other).`;
}

export function runStartup(options: StartupOptions, run: OrchRunner = realRunner): StartupResult {
  const target = resolveTarget(options.id, run);
  if (!target.ok) return target.result;
  const { id } = target;
  const adoption = target.adopted ? `Using the job "${id}" that already starts the server (its command "${target.existing?.command}" is kept).\n` : '';
  if (options.action === 'enable') {
    const args = enableArguments(id, target.existing);
    const result = run(args);
    if (result.spawnError !== undefined || result.status !== 0) return failure(args, result);
    const said = `${result.stdout}${result.stderr}`.trim();
    const undo = target.existing !== undefined && target.existing.command !== COMMAND ? '' : '\nUndo with: app-core-cli startup disable';
    return {
      exitCode: 0,
      message: `${adoption}[ok] startup job "${id}": ${said === '' ? 'done' : said}\ncommand: ${target.existing?.command ?? COMMAND}\nport file: ${PORT_FILE}\n${ORCH_INSTALL_HINT}${undo}${competing(target)}`,
    };
  }
  if (options.action === 'disable') {
    // A job that is not the one `enable` creates (the repository's own "app-core-dev", for instance) is never removed by a bare
    // `disable`: only an explicit --id says the user means it.
    if (options.id === undefined && target.existing !== undefined && target.existing.command !== COMMAND) {
      return {
        exitCode: 1,
        message: `app-core-cli startup: the job "${id}" runs "${target.existing.command}", not "${COMMAND}": it is not one startup enable created, so it is left alone. To remove it anyway: app-core-cli startup disable --id ${id}`,
      };
    }
    const args = ['remove', id, '--if-exists'];
    const result = run(args);
    if (result.spawnError !== undefined || result.status !== 0) return failure(args, result);
    const said = `${result.stdout}${result.stderr}`.trim();
    return { exitCode: 0, message: `[ok] startup job "${id}": ${said === '' ? 'removed' : said}\nThe server no longer starts with Orchestrator; a running one is not stopped.` };
  }
  if (target.existing === undefined) {
    return { exitCode: 0, message: `startup job "${id}": absent (run: app-core-cli startup enable)${competing(target)}` };
  }
  const args = ['show', id, '--json'];
  const shown = run(args);
  if (shown.spawnError !== undefined || shown.status !== 0) return failure(args, shown);
  let job: ShownJob;
  try {
    job = JSON.parse(shown.stdout) as ShownJob;
  } catch {
    return { exitCode: 1, message: `app-core-cli startup failed: "orch ${args.join(' ')}" did not answer JSON:\n${`${shown.stdout}${shown.stderr}`.trim()}` };
  }
  const differing = outdatedFields(job);
  return {
    exitCode: 0,
    message: `${adoption}startup job "${id}": present\ncommand: ${String(job.command)}\n${differing.length === 0 ? 'up to date' : `outdated (run: app-core-cli startup enable):\n${differing.map((d) => `  - ${d}`).join('\n')}`}${competing(target)}`,
  };
}
