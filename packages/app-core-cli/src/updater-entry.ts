// Background auto-update entry point, bundled SEPARATELY as
// app-core-cli-updater.cjs (see scripts/bundle.mjs). Must not import any of
// this package's own CLI runtime -- mirrors the queue-updater-entry.ts
// convention every other @wadeck-app CLI in this workspace uses.
import { runUpdater, execNpm } from '@wadeck-app/shared-updater';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { join } from 'node:path';

// Injected by esbuild at bundle time via define; falls back to dev placeholder.
declare const __APP_CORE_CLI_VERSION__: string;

const PKG_NAME = '@wadeck-app/app-core-cli';
const configDir = process.env['APP_CORE_CLI_CONFIG_DIR'] ?? ConfigDir.get('app-core-cli');
const currentVersion = typeof __APP_CORE_CLI_VERSION__ !== 'undefined' ? __APP_CORE_CLI_VERSION__ : '0.0.0-dev';

// Compute self-check command so shared-updater can verify the install after upgrade.
try {
  const npmRoot = execNpm(['root', '-g'], { timeout: 10_000 }).trim();
  const selfCheckCmd = `${process.execPath} ${join(npmRoot, PKG_NAME, 'dist', 'cli.bundle.js')} self-check`;
  if (!process.env['UPDATER_SELF_CHECK_CMD']) {
    process.env['UPDATER_SELF_CHECK_CMD'] = selfCheckCmd;
  }
} catch {
  // Skip self-check if npm root is unavailable -- update proceeds without verification.
}

runUpdater({
  pkgName: PKG_NAME,
  configDir,
  currentVersion,
  strategy: 'without-daemon',
  onUpdateAvailable: async (_newVersion: string) => 'apply-now' as const,
}).catch((err) => {
  process.stderr.write(`[app-core-cli-updater] fatal: ${err}\n`);
  process.exit(1);
});
