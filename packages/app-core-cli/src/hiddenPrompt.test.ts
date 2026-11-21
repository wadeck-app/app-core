import { describe, expect, it } from 'vitest';
import { readHidden, type PromptInput } from './hiddenPrompt.js';

class FakeInput implements PromptInput {
  isTTY = true;
  raw: boolean[] = [];
  private listener: ((chunk: Buffer | string) => void) | undefined;
  private closers: Array<() => void> = [];
  paused = true;
  setRawMode(mode: boolean): void {
    this.raw.push(mode);
  }
  on(event: 'data', fn: (chunk: Buffer | string) => void): void;
  on(event: 'end' | 'close', fn: () => void): void;
  on(event: 'data' | 'end' | 'close', fn: ((chunk: Buffer | string) => void) | (() => void)): void {
    if (event === 'data') {
      this.listener = fn as (chunk: Buffer | string) => void;
    } else {
      this.closers.push(fn as () => void);
    }
  }
  removeListener(event: 'data', fn: (chunk: Buffer | string) => void): void;
  removeListener(event: 'end' | 'close', fn: () => void): void;
  removeListener(event: 'data' | 'end' | 'close', fn: ((chunk: Buffer | string) => void) | (() => void)): void {
    if (event === 'data') {
      if (this.listener === fn) {
        this.listener = undefined;
      }
    } else {
      this.closers = this.closers.filter((closer) => closer !== fn);
    }
  }
  end(): void {
    for (const closer of [...this.closers]) {
      closer();
    }
  }
  resume(): void {
    this.paused = false;
  }
  pause(): void {
    this.paused = true;
  }
  type(text: string): void {
    this.listener?.(Buffer.from(text));
  }
  get listening(): boolean {
    return this.listener !== undefined;
  }
}

describe('readHidden', () => {
  it('returns what was typed up to Enter and never writes it back', async () => {
    const input = new FakeInput();
    const out: string[] = [];
    const answer = readHidden('PIN: ', input, { write: (s) => out.push(s) });
    input.type('12');
    input.type('3456\r');
    expect(await answer).toBe('123456');
    expect(out.join('')).not.toContain('1');
    expect(out[0]).toBe('PIN: ');
    expect(input.raw).toEqual([true, false]);
    expect(input.paused).toBe(true);
    expect(input.listening).toBe(false);
  });

  it('handles a paste with the Enter in the same chunk, and Backspace', async () => {
    const input = new FakeInput();
    const answer = readHidden('PIN: ', input, { write: () => undefined });
    input.type('12x\u007f34\nignored');
    expect(await answer).toBe('1234');
  });

  it('rejects on Ctrl-C and gives the terminal back', async () => {
    const input = new FakeInput();
    const answer = readHidden('PIN: ', input, { write: () => undefined });
    input.type('12\u0003');
    await expect(answer).rejects.toThrow(/cancelled/i);
    expect(input.raw).toEqual([true, false]);
    expect(input.listening).toBe(false);
  });

  it('swallows escape sequences (arrow keys, Delete), even split across chunks', async () => {
    const input = new FakeInput();
    const answer = readHidden('PIN: ', input, { write: () => undefined });
    input.type('12\u001b[A\u001b[3~3\u001bOP');
    input.type('\u001b');
    input.type('[D4\r');
    expect(await answer).toBe('1234');
  });

  it('rejects with a clear error on Ctrl-D and gives the terminal back', async () => {
    const input = new FakeInput();
    const answer = readHidden('PIN: ', input, { write: () => undefined });
    input.type('12\u0004');
    await expect(answer).rejects.toThrow(/closed before Enter/);
    expect(input.raw).toEqual([true, false]);
    expect(input.listening).toBe(false);
  });

  it('rejects with a clear error when the input ends, instead of hanging', async () => {
    const input = new FakeInput();
    const answer = readHidden('PIN: ', input, { write: () => undefined });
    input.end();
    await expect(answer).rejects.toThrow(/closed before Enter/);
    expect(input.raw).toEqual([true, false]);
  });

  it('refuses an input that is not a terminal instead of echoing the PIN', async () => {
    const input = new FakeInput();
    input.isTTY = false;
    await expect(readHidden('PIN: ', input, { write: () => undefined })).rejects.toThrow(/terminal/);
  });
});
