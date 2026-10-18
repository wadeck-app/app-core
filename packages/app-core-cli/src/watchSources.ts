import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

export const POLL_INTERVAL_MS = 500;
const MANIFEST = 'manifest.json';

export interface SourceWatcher {
  mode: 'fs.watch' | 'polling';
  // One sentence for the startup banner: what is watched and how, including why polling was chosen.
  description: string;
  close: () => void;
}

export interface WatchOptions {
  // 'poll' skips fs.watch (network drives, tools that miss recursive events).
  mode?: 'auto' | 'poll';
  // Called for every change of src/ or manifest.json, without debounce.
  onChange: () => void;
  // Called when the watcher itself fails; the watcher is then unreliable and the message says how to recover.
  onError: (message: string) => void;
}

// A snapshot "file -> mtime:size" of src/ and manifest.json, to detect changes by polling.
function snapshot(moduleDir: string): Map<string, string> {
  const files = new Map<string, string>();
  const add = (file: string): void => {
    try {
      const stat = fs.statSync(file);
      files.set(file, `${stat.mtimeMs}:${stat.size}`);
    } catch (err) {
      // A file that vanished between the listing and the stat is a change the next snapshot will show.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  };
  add(path.join(moduleDir, MANIFEST));
  const src = path.join(moduleDir, 'src');
  if (fs.existsSync(src)) {
    for (const entry of fs.readdirSync(src, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        add(path.join(entry.parentPath, entry.name));
      }
    }
  }
  return files;
}

function sameSnapshot(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([file, stamp]) => b.get(file) === stamp);
}

function startPolling(moduleDir: string, options: WatchOptions, why: string): SourceWatcher {
  let previous = snapshot(moduleDir);
  const timer = setInterval(() => {
    try {
      const next = snapshot(moduleDir);
      if (!sameSnapshot(previous, next)) {
        previous = next;
        options.onChange();
      }
    } catch (err) {
      options.onError(`polling src/ failed: ${getErrorMessage(err)}. Restart dev once the folder is readable.`);
    }
  }, POLL_INTERVAL_MS);
  return {
    mode: 'polling',
    description: `polling the mtimes of src/ and manifest.json every ${POLL_INTERVAL_MS} ms (${why})`,
    close: () => clearInterval(timer),
  };
}

// Watches src/ (recursively) and manifest.json of the module. fs.watch recursive is used where the platform
// supports it; otherwise (or on request) mtimes are polled, and the returned description says so.
export function watchSources(moduleDir: string, options: WatchOptions): SourceWatcher {
  if (options.mode === 'poll') {
    return startPolling(moduleDir, options, 'requested with --poll');
  }
  const watchers: fs.FSWatcher[] = [];
  const close = (): void => watchers.forEach((w) => w.close());
  const fail = (what: string) => (err: Error) =>
    options.onError(`the ${what} watcher failed: ${getErrorMessage(err)}. Restart dev, or use --poll if this keeps happening.`);
  try {
    watchers.push(fs.watch(path.join(moduleDir, 'src'), { recursive: true }, () => options.onChange()).on('error', fail('src/')));
    // The root is watched without recursion and filtered, so dist-module/ (rewritten on every rebuild) never triggers.
    watchers.push(
      fs
        .watch(moduleDir, (_event, filename) => {
          if (filename === MANIFEST) {
            options.onChange();
          }
        })
        .on('error', fail('manifest.json')),
    );
  } catch (err) {
    close();
    return startPolling(moduleDir, options, `fs.watch recursive is unavailable here: ${getErrorMessage(err)}`);
  }
  return {
    mode: 'fs.watch',
    description: 'watching src/ (fs.watch, recursive) and manifest.json',
    close,
  };
}
