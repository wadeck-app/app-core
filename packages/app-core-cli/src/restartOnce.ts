import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

export interface RestartOnceDeps {
  // Stops this server and starts the next one.
  run(): Promise<void>;
  report(message: string): void;
  exit(): void;
  // What the user types to start the server again when `run` failed.
  manualCommand: string;
}

// A restart can be asked twice (two requests, or a request and the tray): only the first one runs, because a second would start a
// second server. Whatever happens, this process exits afterwards; a failure is said with the command to start it by hand.
export function createRestartOnce(deps: RestartOnceDeps): () => void {
  let started = false;
  return () => {
    if (started) {
      return;
    }
    started = true;
    void deps
      .run()
      .catch((err: unknown) => {
        deps.report(`app-core-cli serve: restart failed: ${getErrorMessage(err)}; start it by hand with ${deps.manualCommand}`);
      })
      .finally(deps.exit);
  };
}

// The restart is wired after the server exists; a call before that must fail loudly, not do nothing.
export function requireRestart(restart: (() => void) | undefined): void {
  if (restart === undefined) {
    throw new Error('The restart is not available yet: the server is still starting. Try again in a few seconds.');
  }
  restart();
}
