import { describe, expect, it } from 'vitest';
import { orchArguments, parseAutostartArgs, runAutostart, type OrchRun } from './autostart.js';

const ok = (stdout: string): OrchRun => ({ status: 0, stdout, stderr: '' });

describe('parseAutostartArgs', () => {
  it('defaults to the job "app-core", registering', () => {
    expect(parseAutostartArgs([])).toEqual({ ok: true, options: { id: 'app-core', remove: false } });
  });

  it('reads --id and --remove, and ignores --no-update (read for every command)', () => {
    expect(parseAutostartArgs(['--id', 'my-core', '--remove', '--no-update'])).toEqual({ ok: true, options: { id: 'my-core', remove: true } });
  });

  it('refuses an unknown option, a missing id and an id that is not a plain name, each with what to do', () => {
    const unknown = parseAutostartArgs(['--idd', 'x']);
    expect(unknown.ok === false && unknown.error).toContain('Unknown option "--idd". Usage: app-core-cli autostart');
    const missing = parseAutostartArgs(['--id']);
    expect(missing.ok === false && missing.error).toContain('--id needs a job id');
    const bad = parseAutostartArgs(['--id', 'a b"c']);
    expect(bad.ok === false && bad.error).toContain('letters, digits');
  });
});

describe('orchArguments', () => {
  it('ensures a startup job that stays up for weeks: no timeout, one run, liveness on the server port file', () => {
    const args = orchArguments({ id: 'app-core', remove: false });
    expect(args.slice(0, 3)).toEqual(['ensure', 'startup', 'app-core']);
    const valueOf = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
    expect(valueOf('--command')).toBe('app-core-cli serve');
    expect(valueOf('--timeout')).toBe('0');
    expect(valueOf('--max-concurrency')).toBe('1');
    expect(valueOf('--liveness-strategy')).toBe('portFile');
    expect(valueOf('--liveness-port-file')).toBe('~/.config/app-core/server.port.json');
  });

  it('removes with --if-exists, so removing twice is not an error', () => {
    expect(orchArguments({ id: 'app-core', remove: true })).toEqual(['remove', 'app-core', '--if-exists']);
  });
});

describe('runAutostart', () => {
  it('prints what orch said (added|updated|unchanged) and how to undo it', () => {
    const result = runAutostart({ id: 'app-core', remove: false }, () => ok('added app-core\n'));
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('added app-core');
    expect(result.message).toContain('app-core-cli autostart --remove');
  });

  it('says a removal leaves a running server alone', () => {
    const result = runAutostart({ id: 'app-core', remove: true }, () => ok('removed app-core'));
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('a running one is not stopped');
  });

  it('names the fix when orch is not installed', () => {
    const result = runAutostart({ id: 'app-core', remove: false }, () => ({ status: null, stdout: '', stderr: '', spawnError: 'spawn orch ENOENT' }));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('could not run "orch" (spawn orch ENOENT)');
    expect(result.message).toContain('docs/serve.md');
  });

  it('says the Orchestrator is too old when it does not know "ensure"', () => {
    const result = runAutostart({ id: 'app-core', remove: false }, () => ({ status: 1, stdout: '', stderr: 'Unknown command: "ensure"' }));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('2026.11.14-592');
  });

  it('shows orch\'s own message when it refuses', () => {
    const result = runAutostart({ id: 'app-core', remove: false }, () => ({ status: 4, stdout: '', stderr: 'Error: bad flag' }));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('exited 4');
    expect(result.message).toContain('Error: bad flag');
  });
});
