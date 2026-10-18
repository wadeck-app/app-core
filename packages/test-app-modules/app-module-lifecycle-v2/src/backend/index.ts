import { record } from '../commons/record.js';

// Fixture B v2: distinct tick counter key so tests can tell v1's interval
// stopped firing after swap while v2's interval is the only one still running. Logs its setup.
export default function register(ctx: { setInterval: (fn: () => void, ms: number) => void; dataDir: string }): void {
  record('setup', { tag: 'v2', dataDir: ctx.dataDir });
  const ticks = ((globalThis as { __fixtureBTicks?: Record<string, number> }).__fixtureBTicks ??= {});
  ticks['v2'] = 0;
  ctx.setInterval(() => {
    ticks['v2']!++;
  }, 10);
}
