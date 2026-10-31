import * as fs from 'node:fs';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

export interface LoadedCommonJs {
  // What `require(file)` returned (module.exports).
  exports: unknown;
  // Lets go of this copy: out of Node's cache and out of the list of modules the loader keeps. Safe to call twice, and safe
  // after a newer copy of the same file replaced this one (that copy is left alone).
  release: () => void;
}

function cacheKeys(file: string): string[] {
  // Node keys its cache by the REAL path, which differs from `file` when a folder on the way is a link (a global npm prefix
  // that is a junction, nvm): both are looked at.
  const real = fs.realpathSync(file);
  return real === file ? [file] : [file, real];
}

// Node adds every module it loads to `children` of the module that required it. That list is never trimmed, so a module taken
// out of `require.cache` stays reachable from there, with everything its closures hold. Measured: 10 loads of an 8 MB backend
// kept 77 MB with the cache entry deleted, and 7 MB (the live copy) with the module also taken out of `children`.
function detach(module: NodeJS.Module): void {
  const siblings = module.parent?.children;
  const at = siblings?.indexOf(module) ?? -1;
  if (siblings !== undefined && at !== -1) {
    siblings.splice(at, 1);
  }
}

// Loads a CommonJS file afresh, letting go of the copy a previous call loaded. An ES module cannot get this treatment: Node
// keeps every ES module it has loaded until the process ends (see `isUnloadable`).
export function loadCommonJs(file: string): LoadedCommonJs {
  const keys = cacheKeys(file);
  for (const key of keys) {
    const previous = nodeRequire.cache[key];
    if (previous !== undefined) {
      detach(previous);
      delete nodeRequire.cache[key];
    }
  }
  const exports: unknown = nodeRequire(file);
  const loaded = keys.map((key) => nodeRequire.cache[key]).find((m): m is NodeJS.Module => m !== undefined);
  return {
    exports,
    release: () => {
      if (loaded === undefined) {
        return;
      }
      detach(loaded);
      for (const key of keys) {
        if (nodeRequire.cache[key] === loaded) {
          delete nodeRequire.cache[key];
        }
      }
    },
  };
}

// Only a CommonJS file (.cjs, what `app-core-cli package` writes) can be released again.
export function isUnloadable(file: string): boolean {
  return file.endsWith('.cjs');
}
