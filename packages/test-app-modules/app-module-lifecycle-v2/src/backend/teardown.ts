import { record } from '../commons/record.js';

// Fixture B v2 teardown: logs the context app-core hands it.
export default function teardown(ctx: { id: string; version: string; previousVersion: string | null; dataDir: string }): void {
  record('teardown', { tag: 'v2', ...ctx });
}
