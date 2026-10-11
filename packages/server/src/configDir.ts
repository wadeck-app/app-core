import * as path from 'node:path';
import * as os from 'node:os';

// Decision #14: the module registry lives under app-core's own config dir.
// APP_CORE_CONFIG_DIR override exists so tests never touch the real user profile.
export function resolveConfigDir(): string {
  return process.env['APP_CORE_CONFIG_DIR'] ?? path.join(os.homedir(), '.config', 'app-core');
}

export function resolveModulesDir(configDir = resolveConfigDir()): string {
  return path.join(configDir, 'modules');
}
