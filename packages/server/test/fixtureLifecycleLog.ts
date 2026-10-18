// The lifecycle fixture modules (test-app-modules/app-module-lifecycle*) append every setup/migrate/teardown
// call to a log on globalThis; this gives tests typed access instead of casting globalThis.
export interface LifecycleLogEntry {
  event: 'setup' | 'migrate' | 'teardown';
  // 'v1' or 'v2': which fixture folder wrote the entry.
  tag: string;
  id?: string;
  version?: string;
  previousVersion?: string | null;
  dataDir?: string;
}

declare global {
  var __fixtureLifecycleLog: LifecycleLogEntry[] | undefined;
}

export function resetLifecycleLog(): void {
  globalThis.__fixtureLifecycleLog = [];
}

export function readLifecycleLog(): LifecycleLogEntry[] {
  const log = globalThis.__fixtureLifecycleLog;
  if (!log) {
    throw new Error('__fixtureLifecycleLog is not set: call resetLifecycleLog() first, or the lifecycle fixture has not run.');
  }
  return log;
}
