// Fixture B v1: uses moduleContext.setInterval to validate cleanup-on-unload.
export default function register(ctx) {
  const ticks = (globalThis.__fixtureBTicks ??= {});
  ticks.v1 = 0;
  ctx.setInterval(() => {
    ticks.v1++;
  }, 10);
}
