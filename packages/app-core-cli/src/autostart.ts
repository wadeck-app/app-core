import { spawnSync } from 'node:child_process';

// The job id Orchestrator knows the installed server by. The repository's own dev job is "app-core-dev": another id.
export const DEFAULT_AUTOSTART_ID = 'app-core';
export const AUTOSTART_USAGE = 'app-core-cli autostart [--id <job-id>] [--remove]';
// Where the server publishes its pid and port (packages/server/src/portFile.ts); Orchestrator reads it to skip a start while the server is alive.
const PORT_FILE = '~/.config/app-core/server.port.json';

export interface AutostartOptions {
  id: string;
  remove: boolean;
}

export type AutostartParse = { ok: true; options: AutostartOptions } | { ok: false; error: string };

export function parseAutostartArgs(args: readonly string[]): AutostartParse {
  const options: AutostartOptions = { id: DEFAULT_AUTOSTART_ID, remove: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--remove') {
      options.remove = true;
    } else if (arg === '--id') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { ok: false, error: `--id needs a job id, e.g. "app-core-cli autostart --id ${DEFAULT_AUTOSTART_ID}".` };
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
        return { ok: false, error: `--id "${value}" is not a usable job id: use letters, digits, ".", "_" and "-" only.` };
      }
      options.id = value;
      i++;
    } else if (arg === '--no-update') {
      // Read by the entry point for every command: nothing to do here.
    } else {
      return { ok: false, error: `Unknown option "${arg}". Usage: ${AUTOSTART_USAGE}` };
    }
  }
  return { ok: true, options };
}

// The `orch` arguments: the flags a server that must stay up for weeks needs. Orchestrator compares only the flags given, so a
// field edited by hand and not listed here is kept; the default 300 s timeout would stop the server after five minutes.
export function orchArguments(options: AutostartOptions): string[] {
  if (options.remove) {
    return ['remove', options.id, '--if-exists'];
  }
  return [
    'ensure',
    'startup',
    options.id,
    '--command',
    'app-core-cli serve',
    '--label',
    'app-core (installed server)',
    '--timeout',
    '0',
    '--max-concurrency',
    '1',
    '--trigger-mode',
    'fire-and-forget',
    '--missed-firing',
    'skip',
    '--liveness-strategy',
    'portFile',
    '--liveness-port-file',
    PORT_FILE,
  ];
}

export interface OrchRun {
  status: number | null;
  stdout: string;
  stderr: string;
  // Set when `orch` could not be started at all.
  spawnError?: string;
}

export type OrchRunner = (args: string[]) => OrchRun;

// `orch` is an npm .cmd shim on Windows, which only a shell runs; the shell splits on spaces, so an argument with one is quoted (ids are
// restricted to safe characters by parseAutostartArgs, and the other arguments hold no quote).
const realRunner: OrchRunner = (args) => {
  const windows = process.platform === 'win32';
  // cmd.exe is started directly (not through `shell: true`, which Node flags as DEP0190).
  const result = windows
    ? spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `orch ${args.map((a) => (/[\s()]/.test(a) ? `"${a}"` : a)).join(' ')}`], { encoding: 'utf8', windowsVerbatimArguments: true })
    : spawnSync('orch', args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error === undefined ? {} : { spawnError: result.error.message }) };
};

export interface AutostartResult {
  exitCode: number;
  // What to print on stdout (success) or stderr (failure).
  message: string;
}

// `ensure` needs Orchestrator 2026.11.14-592 or later; an older one answers "Unknown command", which is said as such.
export function runAutostart(options: AutostartOptions, run: OrchRunner = realRunner): AutostartResult {
  const args = orchArguments(options);
  const result = run(args);
  const command = `orch ${args.join(' ')}`;
  if (result.spawnError !== undefined || result.status === null) {
    return {
      exitCode: 1,
      message: `app-core-cli autostart failed: could not run "orch" (${result.spawnError ?? 'no exit status'}). Install Orchestrator and make sure "orch" is on the PATH, or register the job by hand: see docs/serve.md, "Start it with Orchestrator".`,
    };
  }
  const said = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0) {
    const old = /unknown command/i.test(said) ? ' This Orchestrator does not know "ensure"/"remove --if-exists": update it (orch update) to 2026.11.14-592 or later.' : '';
    return { exitCode: 1, message: `app-core-cli autostart failed: "${command}" exited ${result.status}.${said === '' ? '' : `\n${said}`}${old}` };
  }
  const outcome = said === '' ? `${options.remove ? 'removed' : 'done'} ${options.id}` : said;
  return {
    exitCode: 0,
    message: options.remove
      ? `${outcome}\nThe server no longer starts with Orchestrator; a running one is not stopped.`
      : `${outcome}\nOrchestrator now starts "app-core-cli serve" with its own startup; the next start is the next login or "orch trigger ${options.id}". Undo with: app-core-cli autostart --remove`,
  };
}
