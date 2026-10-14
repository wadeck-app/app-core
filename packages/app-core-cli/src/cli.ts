#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { validateManifestFile } from './validate.js';
import { runDev } from './dev.js';
import { runServe } from './serve.js';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { UpdateManager } from '@wadeck-app/shared-cli/UpdateManager';
import { cliVersionCommand, cliUpdateCommand } from '@wadeck-app/shared-cli/CliMetaCommands';
import { readChannelFromConfig } from '@wadeck-app/shared-cli/ChannelConfig';
import { runSelfCheck } from '@wadeck-app/shared-cli';

// Injected by esbuild at bundle time via define; falls back to dev placeholder.
declare const __APP_CORE_CLI_VERSION__: string;
const VERSION = typeof __APP_CORE_CLI_VERSION__ !== 'undefined' ? __APP_CORE_CLI_VERSION__ : '0.0.0-dev';
const PKG_NAME = '@wadeck-app/app-core-cli';
const configDir = process.env['APP_CORE_CLI_CONFIG_DIR'] ?? ConfigDir.get('app-core-cli');
const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);

async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);

  // Check for an update in the background on every real invocation (not
  // `self-check`, to avoid recursing into the just-installed binary
  // mid-verification). In dev mode (no bundled updater file) this is a
  // silent no-op, per UpdateManager's own documented behavior.
  if (command !== 'self-check') {
    try {
      new UpdateManager(PKG_NAME).scheduleBackgroundUpdate(bundlePath, 'app-core-cli-updater.cjs');
    } catch {
      // Never let a background-update scheduling failure block the actual command.
    }
  }

  if (command === 'validate') {
    if (!target) {
      console.error('Usage: app-core-cli validate <path-to-manifest.json>');
      process.exitCode = 1;
      return;
    }
    const json = rest.includes('--json');
    const result = validateManifestFile(target);
    if (result.ok) {
      if (json) {
        console.log(JSON.stringify(result.manifest));
      } else {
        console.log(`OK: ${target} is a valid manifest.`);
      }
    } else {
      if (json) {
        console.log(JSON.stringify({ error: result.message }));
      } else {
        console.error(result.message);
      }
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'dev') {
    if (!target) {
      console.error('Usage: app-core-cli dev <path-to-app-module-dir>');
      process.exitCode = 1;
      return;
    }
    const { port, close } = await runDev(target);
    console.log(`app-core-cli dev: serving ${target} at http://127.0.0.1:${port}`);
    process.on('SIGINT', () => void close().then(() => process.exit(0)));
    process.on('SIGTERM', () => void close().then(() => process.exit(0)));
    return;
  }

  if (command === 'serve') {
    try {
      const { port, stop } = await runServe();
      console.log(`app-core-cli serve: listening on http://127.0.0.1:${port}`);
      const shutdown = (): void => void stop().finally(() => process.exit(0));
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err) {
      console.error(`app-core-cli serve failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'self-check') {
    await runSelfCheck([
      async () => ({ name: `version: ${VERSION}`, ok: VERSION !== 'undefined' && !VERSION.startsWith('0.0.0-dev') }),
      async () => ({ name: 'config-dir', ok: true, detail: configDir }),
    ]);
    process.exit(0);
  }

  if (command === 'version') {
    const channel = readChannelFromConfig(configDir);
    await cliVersionCommand(PKG_NAME, VERSION, channel);
    return;
  }

  if (command === 'update') {
    const updaterPath = join(dirname(bundlePath), 'app-core-cli-updater.cjs');
    if (!existsSync(updaterPath)) {
      process.stderr.write(`[fail] updater not found at: ${updaterPath}\n`);
      process.exitCode = 1;
      return;
    }
    await cliUpdateCommand(updaterPath, PKG_NAME, { rawArgs: rest });
    return;
  }

  console.error('Usage: app-core-cli <validate|dev|serve|version|update|self-check> [path]');
  process.exitCode = 1;
}

void main();
