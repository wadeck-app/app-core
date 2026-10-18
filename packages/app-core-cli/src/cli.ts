#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { validateManifestFile } from './validate.js';
import { DEV_USAGE, parseDevArgs, runDev } from './dev.js';
import { runServe } from './serve.js';
import { checkModule, formatCheckIssues } from './check.js';
import { DEFAULT_OUT_DIR, packageModule, parsePackageArgs, resolveVersion } from './package.js';
import { parseLinkArgs } from './providers.js';
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

  if (command === 'check') {
    if (!target) {
      console.error('Usage: app-core-cli check <module-dir> [--link <package>=<folder>]...');
      process.exitCode = 1;
      return;
    }
    try {
      const { issues } = await checkModule(target, { links: parseLinkArgs(rest) });
      if (issues.length > 0) {
        console.error(formatCheckIssues(target, issues));
        process.exitCode = 1;
        return;
      }
      console.log(`OK: ${target} follows the module layout and its manifest is valid.`);
    } catch (err) {
      console.error(`app-core-cli check failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'package') {
    if (!target) {
      console.error('Usage: app-core-cli package <module-dir> [--out <dir>] [--version <v>] [--link <package>=<folder>]...');
      process.exitCode = 1;
      return;
    }
    try {
      const args = parsePackageArgs(rest);
      const version = resolveVersion(args.version, process.env);
      const outDir = args.out ?? join(target, DEFAULT_OUT_DIR);
      const result = await packageModule({ moduleDir: target, outDir, version, links: args.links });
      for (const warning of result.warnings) {
        console.error(`warning: ${warning}`);
      }
      console.log(`OK: packaged ${target} (version ${version}) into ${result.outDir}`);
    } catch (err) {
      console.error(`app-core-cli package failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'dev') {
    if (!target) {
      console.error(`Usage: ${DEV_USAGE}`);
      process.exitCode = 1;
      return;
    }
    try {
      const args = parseDevArgs(rest);
      const handle = await runDev(target, {
        moduleId: args.moduleId,
        port: args.port,
        watch: args.watch,
        poll: args.poll,
        links: args.links,
        reset: args.reset,
        previousVersion: args.previousVersion,
        onRebuild: (result) => {
          if (result.ok) {
            console.log(`rebuild ok in ${Math.round(result.durationMs)} ms (${result.version})`);
            for (const warning of result.warnings) {
              console.error(`warning: ${warning}`);
            }
          } else {
            console.error(`rebuild failed after ${Math.round(result.durationMs)} ms, the previous version keeps serving unless noted below:\n${result.error}`);
          }
        },
        onWatchError: (message) => console.error(`watch error: ${message}`),
      });
      console.log(`app-core-cli dev: ${handle.url} (config dir ${handle.configDir}, kept between runs; --reset wipes it)`);
      if (handle.resetPerformed) {
        console.log(`  --reset: wiped ${handle.configDir} before starting`);
      }
      for (const mod of handle.modules) {
        console.log(`  ${mod.id} ${mod.version} [${mod.role}] ${mod.origin}`);
      }
      for (const warning of handle.warnings) {
        console.error(`warning: ${warning}`);
      }
      if (handle.startupFailure !== undefined) {
        console.error(`${handle.startupFailure}\nThe next successful rebuild replaces it.`);
      }
      if (handle.watch !== undefined) {
        console.log(`  ${handle.watch.description}; dependencies are not watched. Ctrl+C to stop.`);
      }
      const shutdown = (): void => {
        handle.close().then(
          () => process.exit(0),
          (err: unknown) => {
            console.error(`app-core-cli dev: shutdown failed: ${getErrorMessage(err)}`);
            process.exit(1);
          },
        );
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err) {
      console.error(`app-core-cli dev failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
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

  console.error('Usage: app-core-cli <validate|check|package|dev|serve|version|update|self-check> [path]');
  process.exitCode = 1;
}

void main();
