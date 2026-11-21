// Reads one line from a terminal without echoing it (a PIN). Raw mode: nothing is written back, not even stars.

export interface PromptInput {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  on(event: 'end' | 'close', listener: () => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: 'end' | 'close', listener: () => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

const STDIN_CLOSED = 'The input was closed before Enter (Ctrl-D or the terminal went away): no PIN was set. Run the command again in a terminal.';

export function readHidden(question: string, input: PromptInput, output: { write(text: string): unknown }): Promise<string> {
  if (input.isTTY !== true || input.setRawMode === undefined) {
    return Promise.reject(new Error('A hidden prompt needs an interactive terminal: the input is not one, and the PIN would be echoed or taken from a pipe. Run this command in a terminal.'));
  }
  const setRawMode = input.setRawMode.bind(input);
  return new Promise((resolve, reject) => {
    let typed = '';
    // Escape sequences (arrow keys, Home, Delete...) are not part of the PIN: 'esc' after ESC, 'csi' inside "ESC [" until its final
    // byte, 'ss3' for the one character after "ESC O".
    let escape: 'none' | 'esc' | 'csi' | 'ss3' = 'none';
    let done = false;
    const finish = (settle: () => void): void => {
      // 'end' and 'close' both fire on a closed stream: the terminal is given back once.
      if (done) {
        return;
      }
      done = true;
      input.removeListener('data', onData);
      input.removeListener('end', onClosed);
      input.removeListener('close', onClosed);
      setRawMode(false);
      input.pause();
      output.write('\n');
      settle();
    };
    const onClosed = (): void => finish(() => reject(new Error(STDIN_CLOSED)));
    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString('utf8')) {
        if (escape === 'esc') {
          escape = char === '[' ? 'csi' : char === 'O' ? 'ss3' : 'none';
          continue;
        }
        if (escape === 'csi') {
          if (char >= '@' && char <= '~') {
            escape = 'none';
          }
          continue;
        }
        if (escape === 'ss3') {
          escape = 'none';
          continue;
        }
        if (char === '\u001b') {
          escape = 'esc';
          continue;
        }
        if (char === '\r' || char === '\n') {
          finish(() => resolve(typed));
          return;
        }
        if (char === '\u0003') {
          finish(() => reject(new Error('Cancelled (Ctrl-C): no PIN was set.')));
          return;
        }
        if (char === '\u0004') {
          onClosed();
          return;
        }
        if (char === '\u007f' || char === '\b') {
          typed = Array.from(typed).slice(0, -1).join('');
        } else if (char >= ' ') {
          typed += char;
        }
      }
    };
    output.write(question);
    setRawMode(true);
    input.resume();
    input.on('data', onData);
    input.on('end', onClosed);
    input.on('close', onClosed);
  });
}
