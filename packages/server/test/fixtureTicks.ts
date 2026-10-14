// The lifecycle fixture modules (test-app-modules/app-module-lifecycle) publish their interval
// counters on globalThis; this gives tests typed access instead of casting globalThis.
export interface FixtureBTicks {
  v1?: number;
  v2?: number;
}

declare global {
  var __fixtureBTicks: FixtureBTicks | undefined;
}

export function resetFixtureBTicks(): void {
  globalThis.__fixtureBTicks = undefined;
}

export function readFixtureBTicks(): FixtureBTicks {
  const ticks = globalThis.__fixtureBTicks;
  if (!ticks) {
    throw new Error('__fixtureBTicks is not set: the lifecycle fixture module has not run its backend yet.');
  }
  return ticks;
}
