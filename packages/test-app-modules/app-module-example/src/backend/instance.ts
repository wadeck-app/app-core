// What setup returns and teardown receives as `ctx.instance`. A type-only file: both bundles import it for
// the type and nothing of it ends up in the output.
export interface ExampleInstance {
  // The number of ticks counted so far, resumed from the previous run.
  ticks(): number;
}
