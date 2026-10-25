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
import { INIT_USAGE, initModule, parseInitArgs } from './init.js';
import { shellWarningsForModule } from './shellPreflight.js';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { UpdateManager } from '@wadeck-app/shared-cli/UpdateManager';
import { cliVersionCommand, cliUpdateCommand, warnUnknownArgs } from '@wadeck-app/shared-cli/CliMetaCommands';
import { readChannelFromConfig } from '@wadeck-app/shared-cli/ChannelConfig';
import { runSelfCheck } from '@wadeck-app/shared-cli';
import { startTray } from './tray/trayCommand.js';
import { readTrayBuildInfo } from './tray/buildInfo.js';
import { devBuildRefusalMessage, isReleaseBuild } from './devBuildGuard.js';
import { spawn } from 'node:child_process';

// Injected by esbuild at bundle time via define; falls back to dev placeholder.
declare const __APP_CORE_CLI_VERSION__: string;
const VERSION = typeof __APP_CORE_CLI_VERSION__ !== 'undefined' ? __APP_CORE_CLI_VERSION__ : '0.0.0-dev';
const PKG_NAME = '@wadeck-app/app-core-cli';
const configDir = process.env['APP_CORE_CLI_CONFIG_DIR'] ?? ConfigDir.get('app-core-cli');
const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
// Where this very file is. Not `dirname(bundlePath)`: a job started by the orchestrator inherits the orchestrator's own
// LAUNCHER_BUNDLE_OVERRIDE, which names the orchestrator's bundle, and the files next to it are not ours (the tray looked
// for build-info.json there).
const ownDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);

  // Check for an update in the background on every real invocation (not
  // `self-check`, to avoid recursing into the just-installed binary
  // mid-verification). In dev mode (no bundled updater file) this is a
  // silent no-op, per UpdateManager's own documented behavior. A bundle built from the repository (not a CalVer release)
  // has its updater file too, and must never start an `npm install -g`.
  if (command !== 'self-check' && isReleaseBuild(VERSION)) {
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

  if (command === 'init') {
    if (!target) {
      console.error(`Usage: ${INIT_USAGE}`);
      process.exitCode = 1;
      return;
    }
    try {
      const { id } = initModule(target, parseInitArgs(rest));
      console.log(`OK: created module "${id}" in ${target}. Next: app-core-cli check ${target}, then app-core-cli dev ${target} --watch.`);
    } catch (err) {
      console.error(`app-core-cli init failed: ${getErrorMessage(err)}`);
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
      for (const warning of await shellWarningsForModule(target)) {
        console.error(`warning: ${warning}`);
      }
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
      for (const warning of [...result.warnings, ...(await shellWarningsForModule(target))]) {
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
      let tray: Awaited<ReturnType<typeof startTray>> | null = null;
      const shutdown = (): void => {
        void (tray?.ok ? tray.companion.stop() : Promise.resolve())
          .then(() => handle.close())
          .then(
            () => process.exit(0),
            (err: unknown) => {
              console.error(`app-core-cli dev: shutdown failed: ${getErrorMessage(err)}`);
              process.exit(1);
            },
          );
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      // Blue icon: a dev server. No update or restart entries, a module author restarts it from the terminal.
      if (!args.noTray) {
        tray = await startTray({ mode: 'dev', version: readTrayBuildInfo(ownDir).builtLabel, dslVersion: readTrayBuildInfo(ownDir).dslLabel, cliConfigDir: configDir, pkgName: PKG_NAME, updaterPath: '', getUrl: () => handle.url, onQuit: shutdown });
        if (!tray.ok) {
          console.warn(`app-core-cli dev: no tray icon: ${tray.reason}. Hide this warning with --no-tray.`);
        }
      }
    } catch (err) {
      console.error(`app-core-cli dev failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'serve') {
    const args = [target, ...rest].filter((arg): arg is string => arg !== undefined);
    warnUnknownArgs(args, ['--no-tray'], 'serve');
    try {
      const { port, stop } = await runServe();
      console.log(`app-core-cli serve: listening on http://127.0.0.1:${port}`);
      let tray: Awaited<ReturnType<typeof startTray>> | null = null;
      const shutdown = (): void => {
        void (tray?.ok ? tray.companion.stop() : Promise.resolve()).then(stop).finally(() => process.exit(0));
      };
      // Starts a new serve once this one is down: the tray's Restart, and the end of "Update to vX and restart".
      const restart = (): void => {
        void (tray?.ok ? tray.companion.stop() : Promise.resolve())
          .then(stop)
          .then(() => {
            spawn(process.execPath, [bundlePath, 'serve', ...args], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
          })
          .finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      if (args.includes('--no-tray')) {
        console.log('app-core-cli serve: no tray icon (--no-tray)');
      } else {
        // Green icon: the installed server.
        tray = await startTray({ mode: 'prod', version: VERSION, dslVersion: readTrayBuildInfo(ownDir).dslLabel, cliConfigDir: configDir, pkgName: PKG_NAME, updaterPath: isReleaseBuild(VERSION) ? join(ownDir, 'app-core-cli-updater.cjs') : '', getUrl: () => `http://127.0.0.1:${port}/`, onQuit: shutdown, onRestart: restart });
        if (!tray.ok) {
          // The server keeps running; the icon is the part that is missing, and the reason says how to get it back.
          console.warn(`app-core-cli serve: no tray icon: ${tray.reason}. Hide this warning with --no-tray.`);
        }
      }
    } catch (err) {
      console.error(`app-core-cli serve failed: ${getErrorMessage(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'tray') {
    // Not for users: `npm run dev:all` (scripts/dev-all.mjs) starts it next to the server it runs from sources, which has
    // no `app-core-cli` process of its own to hold the icon. It lives and dies with dev-all.
    const trayArgs = [target, ...rest];
    const valueOf = (flag: string): string | undefined => (trayArgs.includes(flag) ? trayArgs[trayArgs.indexOf(flag) + 1] : undefined);
    const url = valueOf('--url');
    const build = readTrayBuildInfo(ownDir);
    if (url === undefined) {
      console.error('Usage: app-core-cli tray --url <address "Open app-core" goes to> (started by scripts/dev-all.mjs, not meant to be run by hand)');
      process.exitCode = 1;
      return;
    }
    const quit = (): void => process.exit(0);
    const tray = await startTray({ mode: 'dev', version: build.builtLabel, dslVersion: build.dslLabel, cliConfigDir: configDir, pkgName: PKG_NAME, updaterPath: '', getUrl: () => url, onQuit: quit });
    if (!tray.ok) {
      console.error(`app-core-cli tray failed: ${tray.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log('app-core-cli tray: running (Quit from its menu, or Ctrl+C)');
    process.on('SIGINT', () => void tray.companion.stop().finally(quit));
    process.on('SIGTERM', () => void tray.companion.stop().finally(quit));
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
    if (!isReleaseBuild(VERSION)) {
      process.stderr.write(`[fail] ${devBuildRefusalMessage('app-core-cli', VERSION)}\n`);
      process.exitCode = 1;
      return;
    }
    const updaterPath = join(dirname(bundlePath), 'app-core-cli-updater.cjs');
    if (!existsSync(updaterPath)) {
      process.stderr.write(`[fail] updater not found at: ${updaterPath}\n`);
      process.exitCode = 1;
      return;
    }
    await cliUpdateCommand(updaterPath, PKG_NAME, { rawArgs: rest });
    return;
  }

  console.error('Usage: app-core-cli <validate|init|check|package|dev|serve|tray|version|update|self-check> [path]');
  process.exitCode = 1;
}

void main();
