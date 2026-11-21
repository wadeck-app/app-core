import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { authFilePath, isPinSet, verifyPin } from '@wadeck-app/app-core-server/auth/pin';
import { SessionStore } from '@wadeck-app/app-core-server/auth/tokens';
import { runPin, type PinDeps } from './pin.js';

describe('app-core-cli pin', () => {
  let dir: string;
  let out: string[];
  let err: string[];
  let answers: string[];
  let prompts: string[];

  const deps = (over: Partial<PinDeps> = {}): PinDeps => ({
    configDir: dir,
    interactive: true,
    readHidden: async (question) => {
      prompts.push(question);
      const next = answers.shift();
      if (next === undefined) {
        throw new Error('the test gave no answer for this prompt');
      }
      return next;
    },
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s) },
    ...over,
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-pin-'));
    out = [];
    err = [];
    answers = [];
    prompts = [];
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sets the PIN after two identical hidden entries, saying it is per machine and where it is stored', async () => {
    answers = ['482915', '482915'];
    expect(await runPin(['set'], deps())).toBe(0);
    expect(prompts).toHaveLength(2);
    expect(await verifyPin(dir, '482915')).toBe(true);
    const text = out.join('');
    expect(text).toContain('per machine');
    expect(text).toContain(authFilePath(dir));
    expect(text).not.toContain('482915');
  });

  it('writes nothing and says why when the two entries differ', async () => {
    answers = ['482915', '482916'];
    expect(await runPin(['set'], deps())).toBe(1);
    expect(err.join('')).toMatch(/do not match/);
    expect(isPinSet(dir)).toBe(false);
  });

  it('refuses a PIN of fewer than 4 characters before asking twice', async () => {
    answers = ['123'];
    expect(await runPin(['set'], deps())).toBe(1);
    expect(err.join('')).toMatch(/at least 4 characters/);
    expect(prompts).toHaveLength(1);
    expect(isPinSet(dir)).toBe(false);
  });

  it('closes every session already open (new generation, refresh tokens gone) and says so', async () => {
    const store = new SessionStore(dir);
    const token = store.createRefresh();
    answers = ['482915', '482915'];
    await runPin(['set'], deps());
    expect(new SessionStore(dir).findRefresh(token)).toBe(false);
    expect(new SessionStore(dir).generation()).toBe(1);
    expect(out.join('')).toMatch(/session.*is closed/i);
  });

  it('refuses a stdin that is not a terminal and explains the alternative is none: the PIN is never taken from the command line', async () => {
    expect(await runPin(['set'], deps({ interactive: false }))).toBe(1);
    expect(err.join('')).toMatch(/interactive terminal/);
    expect(err.join('')).toMatch(/never.*command line|not taken from/i);
    expect(prompts).toHaveLength(0);
    expect(isPinSet(dir)).toBe(false);
  });

  it('refuses a PIN given as an argument, without echoing it', async () => {
    expect(await runPin(['set', '482915'], deps())).toBe(1);
    expect(err.join('')).toMatch(/command line/);
    expect(err.join('')).not.toContain('482915');
    expect(prompts).toHaveLength(0);
  });

  it('reports a cancelled prompt (Ctrl-C) without writing', async () => {
    expect(await runPin(['set'], deps({ readHidden: async () => { throw new Error('Cancelled (Ctrl-C).'); } }))).toBe(1);
    expect(err.join('')).toContain('Cancelled');
    expect(isPinSet(dir)).toBe(false);
  });

  it('status says whether a PIN is set, and never prints the hash', async () => {
    expect(await runPin(['status'], deps())).toBe(0);
    expect(out.join('')).toMatch(/no PIN is set.*app-core-cli pin set/is);
    answers = ['482915', '482915'];
    await runPin(['set'], deps());
    out.length = 0;
    expect(await runPin(['status'], deps({ interactive: false }))).toBe(0);
    expect(out.join('')).toMatch(/PIN is set/);
    const record = JSON.parse(fs.readFileSync(authFilePath(dir), 'utf8')) as { pin: { hash: string; salt: string } };
    expect(out.join('')).not.toContain(record.pin.hash);
    expect(out.join('')).not.toContain(record.pin.salt);
  });

  it('names the valid subcommands when none or an unknown one is given', async () => {
    expect(await runPin([], deps())).toBe(1);
    expect(err.join('')).toContain('app-core-cli pin set');
    err.length = 0;
    expect(await runPin(['reset'], deps())).toBe(1);
    expect(err.join('')).toMatch(/unknown.*"reset"/i);
  });
});
