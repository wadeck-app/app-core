import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, type RunningServer } from '@wadeck-app/app-core-server/start';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServeOptions {
  publicDir?: string;
  abTests?: boolean;
}

// Runs the real app-core server in the foreground with the frontend bundled next to this file
// (dist/public, copied by scripts/bundle.mjs). Port, config dir and the server.port.json file
// follow the server's own rules (APP_CORE_PORT, APP_CORE_CONFIG_DIR).
export async function runServe(opts: ServeOptions = {}): Promise<RunningServer> {
  const publicDir = opts.publicDir ?? path.join(__dirname, 'public');
  if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
    throw new Error(
      `Bundled frontend not found at ${publicDir} (no index.html). ` +
        'Reinstall the package (npm install -g @wadeck-app/app-core-cli) or, from the repo, run "npm run build".',
    );
  }
  return startServer({ publicDir, abTests: opts.abTests });
}
