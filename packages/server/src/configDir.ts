import * as path from 'node:path';
import * as os from 'node:os';

// The module registry lives under app-core's own config dir.
// APP_CORE_CONFIG_DIR override exists so tests never touch the real user profile.
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  // violations-suppress: shared/no-out-of-repo-path the registry is per-user state by design (like other daemons); APP_CORE_CONFIG_DIR overrides it
  return env['APP_CORE_CONFIG_DIR'] ?? path.join(os.homedir(), '.config', 'app-core');
}

export function resolveModulesDir(configDir = resolveConfigDir()): string {
  return path.join(configDir, 'modules');
}

// Where the updater of app-core-cli writes update-state.json and update-cache.json: APP_CORE_CLI_CONFIG_DIR, else
// <XDG_CONFIG_HOME or ~/.config>/app-core-cli. The same rule as the CLI's (shared-cli ConfigDir.get('app-core-cli')); the server
// cannot import it, so a run from sources resolves it here.
export function resolveUpdaterDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env['APP_CORE_CLI_CONFIG_DIR'];
  if (override !== undefined && override !== '') {
    return override;
  }
  const xdg = env['XDG_CONFIG_HOME'];
  // violations-suppress: shared/no-out-of-repo-path the updater state is per-user, written by app-core-cli itself
  return path.join(xdg !== undefined && xdg !== '' ? xdg : path.join(os.homedir(), '.config'), 'app-core-cli');
}
