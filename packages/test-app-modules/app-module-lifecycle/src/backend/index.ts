import { record } from '../commons/record.js';

// Fixture B v1: uses moduleContext.setInterval to validate cleanup-on-unload, and logs its setup.
export default function register(ctx: { setInterval: (fn: () => void, ms: number) => void; dataDir: string }): void {
  record('setup', { tag: 'v1', dataDir: ctx.dataDir });
  const ticks = ((globalThis as { __fixtureBTicks?: Record<string, number> }).__fixtureBTicks ??= {});
  ticks['v1'] = 0;
  ctx.setInterval(() => {
    ticks['v1']!++;
  }, 10);
}
