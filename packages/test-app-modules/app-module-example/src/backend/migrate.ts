// Runs when a version loads and the last version that loaded was another one (ctx.previousVersion, never null
// here). Not on first install, not on a restart. If it fails the module stays failed and it runs again on the
// next load, so it must be safe to run twice.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModuleHookContext } from '@wadeck-app/app-core-sdk';
import { LEGACY_TICKS_FILE, MIGRATIONS_LOG, TICKS_FILE } from './files.js';

export default function migrate(ctx: ModuleHookContext): void {
  const legacy = path.join(ctx.dataDir, LEGACY_TICKS_FILE);
  // Only when the old name is there: a second run finds nothing to do.
  if (fs.existsSync(legacy)) {
    fs.renameSync(legacy, path.join(ctx.dataDir, TICKS_FILE));
  }
  fs.appendFileSync(path.join(ctx.dataDir, MIGRATIONS_LOG), `${ctx.previousVersion} -> ${ctx.version}\n`);
}
