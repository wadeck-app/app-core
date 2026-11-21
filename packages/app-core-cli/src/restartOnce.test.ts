import { describe, expect, it } from 'vitest';
import { createRestartOnce, requireRestart } from './restartOnce.js';

describe('createRestartOnce', () => {
  it('runs the restart once however many times it is asked, then exits', async () => {
    let runs = 0;
    let exits = 0;
    const reports: string[] = [];
    const restart = createRestartOnce({
      run: async () => {
        runs += 1;
      },
      report: (message) => reports.push(message),
      exit: () => {
        exits += 1;
      },
      manualCommand: 'app-core-cli serve',
    });
    restart();
    restart();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restart();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs).toBe(1);
    expect(exits).toBe(1);
    expect(reports).toEqual([]);
  });

  it('logs the reason and the manual command when the restart fails, and still exits', async () => {
    const reports: string[] = [];
    let exits = 0;
    const restart = createRestartOnce({
      run: async () => {
        throw new Error('spawn EACCES');
      },
      report: (message) => reports.push(message),
      exit: () => {
        exits += 1;
      },
      manualCommand: 'app-core-cli serve --port 4850',
    });
    restart();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reports).toEqual(['app-core-cli serve: restart failed: spawn EACCES; start it by hand with app-core-cli serve --port 4850']);
    expect(exits).toBe(1);
  });
});

describe('requireRestart', () => {
  it('throws a clear error while the restart is not wired yet', () => {
    expect(() => requireRestart(undefined)).toThrow(/restart is not available yet.*try again/i);
  });

  it('calls the restart once it exists', () => {
    let called = 0;
    requireRestart(() => {
      called += 1;
    });
    expect(called).toBe(1);
  });
});
