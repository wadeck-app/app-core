import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { writeRegistryEntry } from '@wadeck-app/app-core-server/registry';
import { resolveModulesDir } from '@wadeck-app/app-core-server/configDir';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DevOptions {
  moduleId?: string;
  port?: number;
}

// Decision #31: boots the REAL server (buildServer, same code app-core's own
// index.ts uses) against a scratch config dir pre-populated with a registry
// entry for the given local module -- reuses the real loading logic rather
// than reimplementing it, so there's no drift between `dev` and production.
export async function runDev(appModuleDir: string, opts: DevOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const manifestPath = path.resolve(appModuleDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json found at ${manifestPath}`);
  }
  const moduleId = opts.moduleId ?? path.basename(path.resolve(appModuleDir));

  const scratchConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-dev-'));
  writeRegistryEntry(resolveModulesDir(scratchConfigDir), {
    id: moduleId,
    source: { type: 'file', path: manifestPath },
  });

  // dev's own bundled copy of the built frontend (packages/frontend-shell/dist,
  // copied here by scripts/bundle.mjs at build time) -- the server's own default
  // publicDir resolution assumes app-core's monorepo layout, which does not exist
  // once this package is installed standalone. See server.ts's `publicDir` option.
  const publicDir = path.join(__dirname, 'public');
  const { server } = await buildServer({ configDir: scratchConfigDir, publicDir });
  // Decision #7: port is hardcoded but overridable via env, specifically to support
  // testing -- the main server (packages/server/src/port.ts) already does this,
  // `dev` needs the same so it doesn't collide with an already-running instance.
  const envPort = process.env['APP_CORE_PORT'];
  const requestedPort = opts.port ?? (envPort ? Number(envPort) : 4850);
  await server.listen({ port: requestedPort, host: '127.0.0.1' });
  const address = server.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : requestedPort;

  return {
    port: actualPort,
    close: async () => {
      await server.close();
    },
  };
}
