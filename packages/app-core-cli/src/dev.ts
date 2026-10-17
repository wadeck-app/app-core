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

const MODULE_DIR_PREFIX = 'app-module-';

// A module folder named `app-module-<name>` registers as `<name>` in production (queue registers as
// "queue"), and the module's own `$type: <name>:<Component>` references depend on that id.
export function defaultModuleId(appModuleDir: string): string {
  const dirName = path.basename(path.resolve(appModuleDir));
  return dirName.startsWith(MODULE_DIR_PREFIX) && dirName.length > MODULE_DIR_PREFIX.length
    ? dirName.slice(MODULE_DIR_PREFIX.length)
    : dirName;
}

// `--id <id>` overrides the default id; returns undefined when the flag is absent.
export function parseIdFlag(args: string[]): string | undefined {
  const index = args.indexOf('--id');
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--id needs a value, e.g. "app-core-cli dev ./app-module-orchestrator --id orchestrator".');
  }
  return value;
}

// Boots the REAL server (buildServer, same code app-core's own index.ts uses)
// against a scratch config dir pre-populated with a registry entry for the
// given local module -- reuses the real loading logic rather than
// reimplementing it, so there's no drift between `dev` and production.
export async function runDev(
  appModuleDir: string,
  opts: DevOptions = {},
): Promise<{ port: number; moduleId: string; close: () => Promise<void> }> {
  // Accept the module folder, or its manifest.json directly.
  const resolved = path.resolve(appModuleDir);
  const moduleDir = path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
  const manifestPath = path.join(moduleDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${moduleDir}. Pass the module folder (the one containing manifest.json).`);
  }
  const moduleId = opts.moduleId ?? defaultModuleId(moduleDir);

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
  // Port is hardcoded but overridable via env, same as the main server
  // (packages/server/src/port.ts), so `dev` doesn't collide with an
  // already-running instance.
  const envPort = process.env['APP_CORE_PORT'];
  const requestedPort = opts.port ?? (envPort ? Number(envPort) : 4850);
  await server.listen({ port: requestedPort, host: '127.0.0.1' });
  const address = server.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : requestedPort;

  return {
    port: actualPort,
    moduleId,
    close: async () => {
      await server.close();
    },
  };
}
