// Runs when this version stops serving, before its context is disposed. `ctx.reason` says why
// (update, unregister, unload, shutdown, dependency) and `ctx.instance` is what setup returned: the running
// state, so it can be saved here instead of continuously.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModuleTeardownContext } from '@wadeck-app/app-core-sdk';
import { RUNNING_FILE, TEARDOWNS_LOG, TICKS_FILE } from './files.js';
import type { ExampleInstance } from './instance.js';

export default function teardown(ctx: ModuleTeardownContext<ExampleInstance>): void {
  fs.writeFileSync(path.join(ctx.dataDir, TICKS_FILE), JSON.stringify({ ticks: ctx.instance.ticks() }));
  // `force` only tolerates a file that is already gone (the hook may run twice); other errors still surface.
  fs.rmSync(path.join(ctx.dataDir, RUNNING_FILE), { force: true });
  // The data folder is kept whatever the reason: app-core never deletes it. A module that wants it gone on
  // `unregister` can remove it here (ctx.reason === 'unregister'); this one keeps its counter.
  fs.appendFileSync(path.join(ctx.dataDir, TEARDOWNS_LOG), `${ctx.reason}\n`);
}
