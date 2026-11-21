// What `npm run dev:all` tells its server about the app-core-cli installed on this machine (see test/installedCli.test.ts).
// A run from sources has no version of its own to compare: the update indicator follows the installed CLI, which updates itself.
// Plain .mjs: scripts/dev-all.mjs runs under node without a build.
import { join } from 'node:path';

// `isReadable(file)` tells whether the file exists; injected so the test needs no real global folder.
// Returns the env to give the server child (empty when nothing is known) and the line dev-all logs, which always says which case it is.
export function installedCliEnv({ globalNodeModules, isReadable }) {
  if (globalNodeModules === undefined || globalNodeModules === '') {
    return { env: {}, message: '[dev-all] WARNING: APP_CORE_INSTALLED_CLI_DIR not set ("npm root -g" gave no folder): the update indicator of the app shows nothing about the installed app-core-cli.' };
  }
  const dir = join(globalNodeModules, '@wadeck-app', 'app-core-cli');
  const manifest = join(dir, 'package.json');
  if (!isReadable(manifest)) {
    return { env: {}, message: `[dev-all] WARNING: APP_CORE_INSTALLED_CLI_DIR not set: ${manifest} is missing or unreadable (npm install -g @wadeck-app/app-core-cli): the update indicator of the app shows nothing about the installed app-core-cli.` };
  }
  return { env: { APP_CORE_INSTALLED_CLI_DIR: dir }, message: `[dev-all] APP_CORE_INSTALLED_CLI_DIR=${dir}: the update indicator follows the installed app-core-cli` };
}
