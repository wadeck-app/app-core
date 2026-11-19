import { describe, expect, it } from 'vitest';
import { readHidden, type PromptInput } from './hiddenPrompt.js';

class FakeInput implements PromptInput {
  isTTY = true;
  raw: boolean[] = [];
  private listener: ((chunk: Buffer | string) => void) | undefined;
  paused = true;
  setRawMode(mode: boolean): void {
    this.raw.push(mode);
  }
  on(_event: 'data', fn: (chunk: Buffer | string) => void): void {
    this.listener = fn;
  }
  removeListener(_event: 'data', fn: (chunk: Buffer | string) => void): void {
    if (this.listener === fn) {
      this.listener = undefined;
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

  it('refuses an input that is not a terminal instead of echoing the PIN', async () => {
    const input = new FakeInput();
    input.isTTY = false;
    await expect(readHidden('PIN: ', input, { write: () => undefined })).rejects.toThrow(/terminal/);
  });
});
