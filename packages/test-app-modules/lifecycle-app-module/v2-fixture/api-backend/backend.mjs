// Fixture B v2: distinct tick counter key so tests can tell v1's interval
// stopped firing after swap while v2's interval is the only one still running.
export default function register(ctx) {
  const ticks = (globalThis.__fixtureBTicks ??= {});
  ticks.v2 = 0;
  ctx.setInterval(() => {
    ticks.v2++;
  }, 10);
}
