// Reads one line from a terminal without echoing it (a PIN). Raw mode: nothing is written back, not even stars.

export interface PromptInput {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export function readHidden(question: string, input: PromptInput, output: { write(text: string): unknown }): Promise<string> {
  if (input.isTTY !== true || input.setRawMode === undefined) {
    return Promise.reject(new Error('A hidden prompt needs an interactive terminal: the input is not one, and the PIN would be echoed or taken from a pipe. Run this command in a terminal.'));
  }
  const setRawMode = input.setRawMode.bind(input);
  return new Promise((resolve, reject) => {
    let typed = '';
    const finish = (settle: () => void): void => {
      input.removeListener('data', onData);
      setRawMode(false);
      input.pause();
      output.write('\n');
      settle();
    };
    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          finish(() => resolve(typed));
          return;
        }
        if (char === '\u0003') {
          finish(() => reject(new Error('Cancelled (Ctrl-C): no PIN was set.')));
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
  });
}
