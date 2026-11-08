import * as inspector from 'node:inspector';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';

// V8 runs a full collection of the old generation when the heap gets near a limit it computes from the heap limit (4.3 GB on a machine
// with 32 GB of RAM), not on a timer. The copy of a backend that an update just replaced stays in memory until then: measured,
// 0.7 MB per update of an 800 KB module, 270 MB after 400 updates, all of it collectable.
//
// Two collections, because neither alone did it in both measurements:
// - `gc()`, synchronous, freed the copies of a backend that holds a lot of data (8 MB per update) at once, and nothing for an 800 KB one;
// - the inspector's `HeapProfiler.collectGarbage` (what a debugger sends, on a session of this very process: no port is opened) kept
//   the 800 KB case flat over 400 updates (82 MB for the process, 363 MB without), but runs on a later turn of the event loop and,
//   measured, not after every update (the 8 MB case peaked at 77 MB between two of its collections).
// The cause of the difference was not looked into.
let session: inspector.Session | undefined;
let gc: (() => void) | undefined | null;

// `gc` is a global when the process started with --expose-gc; otherwise V8 hands it out once that flag is set at run time (documented
// by Node as unsafe on a running VM; this flag only exposes a function). null: not available, only the inspector collects.
function findGc(): (() => void) | null {
  const exposed: unknown = Reflect.get(globalThis, 'gc');
  if (typeof exposed === 'function') {
    return () => {
      exposed();
    };
  }
  v8.setFlagsFromString('--expose-gc');
  const fromVm: unknown = vm.runInNewContext('gc');
  return typeof fromVm === 'function'
    ? () => {
        fromVm();
      }
    : null;
}

// Takes back the memory of what was let go of: a collection now and one on the next turn of the event loop. `onFailure` gets the error
// when neither can run (this Node gives no gc and no inspector session). Carrying on without costs memory, not the update.
export function collectGarbage(onFailure: (err: Error) => void): void {
  let collected = false;
  try {
    gc ??= findGc();
    if (gc !== null) {
      gc();
      collected = true;
    }
  } catch {
    gc = null;
  }
  try {
    if (session === undefined) {
      const opened = new inspector.Session();
      opened.connect();
      session = opened;
    }
    session.post('HeapProfiler.collectGarbage', (err) => {
      if (err !== null && !collected) {
        onFailure(err);
      }
    });
  } catch (err) {
    if (!collected) {
      onFailure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
