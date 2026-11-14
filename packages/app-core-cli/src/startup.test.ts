import { describe, expect, it } from 'vitest';
import { enableArguments, outdatedFields, parseStartupArgs, runStartup, type OrchRun, type OrchRunner } from './startup.js';

const ok = (stdout: string): OrchRun => ({ status: 0, stdout, stderr: '' });
const PORT_FILE = '~/.config/app-core/server.port.json';
const ours = { id: 'app-core', type: 'startup', command: 'app-core-cli serve', timeoutSeconds: 0, maxConcurrency: 1, liveness: { strategy: 'portFile', portFile: PORT_FILE } };
// The job that exists on the author's machine: the repository's own dev server.
const dev = { ...ours, id: 'app-core-dev', command: 'npm run dev:all', cwd: 'C:/Workspace_Tooling/app-core', label: 'app-core (server+frontend dev)' };

// An orch that knows these jobs; every call is recorded, `ensure` and `remove` answer with `answer`.
function orch(jobs: object[], answer = 'unchanged'): { run: OrchRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: OrchRunner = (args) => {
    calls.push(args);
    if (args[0] === 'list') return ok(JSON.stringify(jobs));
    if (args[0] === 'show') {
      const found = jobs.find((j) => (j as { id: string }).id === args[1]);
      return found === undefined ? { status: 1, stdout: '', stderr: `Job not found: "${args[1]}"` } : ok(JSON.stringify(found));
    }
    return ok(answer);
  };
  return { run, calls };
}

describe('parseStartupArgs', () => {
  it('reads the subcommand; the id is only set when --id is given', () => {
    expect(parseStartupArgs(['enable'])).toEqual({ ok: true, options: { action: 'enable' } });
    expect(parseStartupArgs(['status', '--id', 'my-core', '--no-update'])).toEqual({ ok: true, options: { action: 'status', id: 'my-core' } });
  });

  it('refuses a missing or doubled subcommand, an unknown argument, a missing id and an id that is not a plain name, each with the usage or the fix', () => {
    const none = parseStartupArgs([]);
    expect(none.ok === false && none.error).toContain('startup needs a subcommand. Usage: app-core-cli startup enable | disable | status');
    const twice = parseStartupArgs(['enable', 'disable']);
    expect(twice.ok === false && twice.error).toContain('one subcommand only');
    const unknown = parseStartupArgs(['enable', '--remove']);
    expect(unknown.ok === false && unknown.error).toContain('unknown argument "--remove"');
    const missing = parseStartupArgs(['enable', '--id']);
    expect(missing.ok === false && missing.error).toContain('--id needs a job id');
    const bad = parseStartupArgs(['enable', '--id', 'a b"c']);
    expect(bad.ok === false && bad.error).toContain('letters, digits');
  });
});

describe('enableArguments', () => {
  const valueOf = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

  it('ensures a startup job that stays up for weeks: no timeout, one run, liveness on the server port file', () => {
    const args = enableArguments('app-core');
    expect(args.slice(0, 3)).toEqual(['ensure', 'startup', 'app-core']);
    expect(valueOf(args, '--command')).toBe('app-core-cli serve');
    expect(valueOf(args, '--label')).toBe('app-core (installed server)');
    expect(valueOf(args, '--timeout')).toBe('0');
    expect(valueOf(args, '--max-concurrency')).toBe('1');
    expect(valueOf(args, '--liveness-strategy')).toBe('portFile');
    expect(valueOf(args, '--liveness-port-file')).toBe(PORT_FILE);
  });

  it('keeps the command of a job that exists and passes no label', () => {
    const args = enableArguments('app-core-dev', { command: 'npm run dev:all' });
    expect(valueOf(args, '--command')).toBe('npm run dev:all');
    expect(args).not.toContain('--label');
  });
});

describe('runStartup enable', () => {
  it('creates the job "app-core" when no job starts the server yet, and says how to undo it', () => {
    const { run, calls } = orch([], 'added app-core');
    const result = runStartup({ action: 'enable' }, run);
    expect(result.exitCode).toBe(0);
    expect(calls[1]![0]).toBe('ensure');
    expect(calls[1]![2]).toBe('app-core');
    expect(result.message).toContain('startup job "app-core": added app-core');
    expect(result.message).toContain('orch install');
    expect(result.message).toContain('app-core-cli startup disable');
  });

  it('adopts the job that already starts the server: no second job, its command kept, only settings completed', () => {
    const { run, calls } = orch([dev]);
    const result = runStartup({ action: 'enable' }, run);
    const ensure = calls.find((c) => c[0] === 'ensure')!;
    expect(ensure[2]).toBe('app-core-dev');
    expect(ensure[ensure.indexOf('--command') + 1]).toBe('npm run dev:all');
    expect(ensure).not.toContain('--label');
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('Using the job "app-core-dev" that already starts the server (its command "npm run dev:all" is kept)');
    expect(result.message).not.toContain('Undo with');
  });

  it('with --id, uses that job and warns that another one uses the same port file', () => {
    const { run, calls } = orch([dev]);
    const result = runStartup({ action: 'enable', id: 'app-core' }, run);
    expect(calls.find((c) => c[0] === 'ensure')![2]).toBe('app-core');
    expect(result.message).toContain('warning: app-core-dev also starts a server with this port file');
  });

  it('asks which job when several already use the port file', () => {
    const result = runStartup({ action: 'enable' }, orch([dev, ours]).run);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('2 jobs already use');
    expect(result.message).toContain('--id <job-id>');
  });
});

describe('runStartup disable', () => {
  it('removes our own job with --if-exists, so doing it twice is not an error, and says a running server is left alone', () => {
    const { run, calls } = orch([ours], 'removed app-core');
    const result = runStartup({ action: 'disable' }, run);
    expect(calls.find((c) => c[0] === 'remove')).toEqual(['remove', 'app-core', '--if-exists']);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('a running one is not stopped');
  });

  it('never removes the job of the repository (not created by enable) unless --id names it', () => {
    const refused = orch([dev]);
    const result = runStartup({ action: 'disable' }, refused.run);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('left alone');
    expect(result.message).toContain('startup disable --id app-core-dev');
    expect(refused.calls.some((c) => c[0] === 'remove')).toBe(false);
    const asked = orch([dev]);
    expect(runStartup({ action: 'disable', id: 'app-core-dev' }, asked.run).exitCode).toBe(0);
    expect(asked.calls.some((c) => c[0] === 'remove')).toBe(true);
  });
});

describe('runStartup status', () => {
  it('says absent, with the command that creates it, exit 0', () => {
    expect(runStartup({ action: 'status' }, orch([]).run)).toEqual({ exitCode: 0, message: 'startup job "app-core": absent (run: app-core-cli startup enable)' });
  });

  it('says up to date for the job that exists on this machine (app-core-dev), command shown and not compared', () => {
    const result = runStartup({ action: 'status' }, orch([dev]).run);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('startup job "app-core-dev": present');
    expect(result.message).toContain('command: npm run dev:all');
    expect(result.message).toContain('up to date');
  });

  it('lists what is missing when a setting is outdated', () => {
    const { run } = orch([{ ...dev, timeoutSeconds: 300, maxConcurrency: undefined }]);
    const result = runStartup({ action: 'status' }, run);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('outdated (run: app-core-cli startup enable)');
    expect(result.message).toContain('timeout is 300');
    expect(result.message).toContain('max concurrency is not set');
  });
});

describe('runStartup errors', () => {
  it('names the fix when orch is not installed', () => {
    const result = runStartup({ action: 'enable' }, () => ({ status: null, stdout: '', stderr: '', spawnError: 'spawn orch ENOENT' }));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('could not run "orch" (spawn orch ENOENT)');
    expect(result.message).toContain('npm i -g @wadeck-app/orchestrator-cli');
  });

  it('says the Orchestrator is too old when it does not know "ensure"', () => {
    const base = orch([]).run;
    const result = runStartup({ action: 'enable' }, (args) => (args[0] === 'ensure' ? { status: 1, stdout: '', stderr: 'Unknown command: "ensure"' } : base(args)));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('2026.11.14-592');
  });

  it("shows orch's own message when it refuses", () => {
    const base = orch([]).run;
    const result = runStartup({ action: 'enable' }, (args) => (args[0] === 'ensure' ? { status: 4, stdout: '', stderr: 'Error: bad flag' } : base(args)));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('exited 4');
    expect(result.message).toContain('Error: bad flag');
  });

  it('fails loudly on a list that is not JSON', () => {
    const result = runStartup({ action: 'status' }, () => ok('<html>'));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('did not answer JSON');
  });
});

describe('outdatedFields', () => {
  it('is empty for the settings enable writes', () => {
    expect(outdatedFields(ours)).toEqual([]);
  });
});
