// Appends to the call log the server tests read (test/fixtureLifecycleLog.ts): proves which hook ran, in
// which order and with which context.
export function record(event: string, detail: Record<string, unknown>): void {
  const holder = globalThis as { __fixtureLifecycleLog?: Array<Record<string, unknown>> };
  (holder.__fixtureLifecycleLog ??= []).push({ event, ...detail });
}
