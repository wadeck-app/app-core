import * as path from 'node:path';
import * as os from 'node:os';

// The module registry lives under app-core's own config dir.
// APP_CORE_CONFIG_DIR override exists so tests never touch the real user profile.
export function resolveConfigDir(): string {
  // violations-suppress: shared/no-out-of-repo-path the registry is per-user state by design (like other daemons); APP_CORE_CONFIG_DIR overrides it
  return process.env['APP_CORE_CONFIG_DIR'] ?? path.join(os.homedir(), '.config', 'app-core');
}

export function resolveModulesDir(configDir = resolveConfigDir()): string {
  return path.join(configDir, 'modules');
}
