import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

const WATCHED = ['@wadeck-app/dsl-ui', '@wadeck-app/dsl-renderer'] as const;

// The versions of the dsl packages installed under `root` (their package.json), "missing" when one cannot be read.
export function installedDslVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const name of WATCHED) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string };
      versions[name] = pkg.version ?? 'missing';
    } catch {
      versions[name] = 'missing';
    }
  }
  return versions;
}

export const sameVersions = (a: Record<string, string>, b: Record<string, string>): boolean => WATCHED.every((name) => a[name] === b[name]);

// Vite generates the component registry from dsl-ui at start and pre-bundles dsl-ui, and does not watch node_modules, so after
// `npm install` of a new dsl the running dev server keeps the old one (blank page). `npm install` rewrites the lockfile last: when
// it changes and the installed dsl versions are not those the server started with, the server restarts itself (config reloaded,
// registry regenerated, dependencies pre-bundled again) instead of someone having to restart the dev job.
export function restartOnDslUpdate(options: { root: string; lockfile: string; settleMs?: number }): Plugin {
  return {
    name: 'app-core:restart-on-dsl-update',
    apply: 'serve',
    configureServer(server) {
      const started = installedDslVersions(options.root);
      let timer: NodeJS.Timeout | undefined;
      server.watcher.add(options.lockfile);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) !== path.resolve(options.lockfile)) {
          return;
        }
        clearTimeout(timer);
        // Waits for npm to finish writing node_modules (the lockfile is written last, but not atomically with the rest).
        timer = setTimeout(() => {
          const now = installedDslVersions(options.root);
          if (sameVersions(started, now)) {
            return;
          }
          server.config.logger.info(
            `[app-core] dsl changed (${WATCHED.map((n) => `${n.split('/')[1]} ${started[n]} -> ${now[n]}`).join(', ')}): restarting the dev server so it serves the new one`,
            { timestamp: true },
          );
          void server.restart();
        }, options.settleMs ?? 1500);
      });
    },
  };
}
