import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, type RunningServer } from '@wadeck-app/app-core-server/start';
import { prepareStandalone, writeStandaloneRegistry } from './standalone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServeOptions {
  publicDir?: string;
  abTests?: boolean;
  // An application made of one module (`--module`): its manifest or built folder. No dashboard, only this module and what it requires.
  module?: string;
  // Where a standalone application keeps its registry and data (`--config-dir`).
  configDir?: string;
  // Where it listens (`--port`); else APP_CORE_PORT, else 4850.
  port?: number;
  // The folder used when a standalone application is given no `configDir`: one per module id.
  defaultStandaloneConfigDir?: (moduleId: string) => string;
}

export interface ServedApp extends RunningServer {
  // The config dir of a standalone application; undefined for the global app-core (the server's own rules apply).
  configDir?: string;
  moduleId?: string;
}

// Runs the real app-core server in the foreground with the frontend bundled next to this file
// (dist/public, copied by scripts/bundle.mjs). Port, config dir and the server.port.json file
// follow the server's own rules (APP_CORE_PORT, APP_CORE_CONFIG_DIR).
export async function runServe(opts: ServeOptions = {}): Promise<ServedApp> {
  const publicDir = opts.publicDir ?? path.join(__dirname, 'public');
  if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
    throw new Error(
      `Bundled frontend not found at ${publicDir} (no index.html). ` +
        'Reinstall the package (npm install -g @wadeck-app/app-core-cli) or, from the repo, run "npm run build".',
    );
  }
  if (opts.module === undefined) {
    if (opts.configDir !== undefined) {
      throw new Error('--config-dir only applies to --module: the global app-core keeps its state in APP_CORE_CONFIG_DIR (or ~/.config/app-core).');
    }
    return startServer({ publicDir, abTests: opts.abTests, port: opts.port });
  }
  const defaultConfigDir = opts.defaultStandaloneConfigDir;
  const plan = prepareStandalone(opts.module, {
    configDir: opts.configDir,
    defaultConfigDir:
      defaultConfigDir ??
      ((id) => {
        throw new Error(`--module ${id}: no config dir to keep its data in. Pass --config-dir <folder>.`);
      }),
  });
  writeStandaloneRegistry(plan);
  const running = await startServer({ publicDir, abTests: opts.abTests, configDir: plan.configDir, standalone: { moduleId: plan.moduleId }, port: opts.port });
  return { ...running, configDir: plan.configDir, moduleId: plan.moduleId };
}
