#!/usr/bin/env node
import { validateManifestFile } from './validate.js';
import { runDev } from './dev.js';

async function main(): Promise<void> {
  const [command, target] = process.argv.slice(2);

  if (command === 'validate') {
    if (!target) {
      console.error('Usage: app-core-sdk validate <path-to-manifest.json>');
      process.exitCode = 1;
      return;
    }
    const result = validateManifestFile(target);
    if (result.ok) {
      console.log(`OK: ${target} is a valid manifest.`);
    } else {
      console.error(result.message);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'dev') {
    if (!target) {
      console.error('Usage: app-core-sdk dev <path-to-app-module-dir>');
      process.exitCode = 1;
      return;
    }
    const { port, close } = await runDev(target);
    console.log(`app-core-sdk dev: serving ${target} at http://127.0.0.1:${port}`);
    process.on('SIGINT', () => void close().then(() => process.exit(0)));
    process.on('SIGTERM', () => void close().then(() => process.exit(0)));
    return;
  }

  console.error('Usage: app-core-sdk <validate|dev> <path>');
  process.exitCode = 1;
}

void main();
