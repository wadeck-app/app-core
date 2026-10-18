import { record } from '../commons/record.js';

// Fixture B v1 migrate: logs the context app-core hands it.
export default function migrate(ctx: { id: string; version: string; previousVersion: string | null; dataDir: string }): void {
  record('migrate', { tag: 'v1', ...ctx });
}
