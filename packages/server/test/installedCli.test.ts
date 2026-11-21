import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installedCliEnv } from '../dev/installedCli.mjs';

// `npm run dev:all` runs the server from sources, but the machine has an installed app-core-cli that updates itself: the server learns
// where it is through APP_CORE_INSTALLED_CLI_DIR, so its update indicator is about that CLI.
describe('installedCliEnv', () => {
  const root = path.join('G:', 'nvm', 'node_modules');
  const dir = path.join(root, '@wadeck-app', 'app-core-cli');

  it('sets APP_CORE_INSTALLED_CLI_DIR to <global node_modules>/@wadeck-app/app-core-cli when its package.json is there', () => {
    const seen: string[] = [];
    const { env, message } = installedCliEnv({ globalNodeModules: root, isReadable: (file) => (seen.push(file), true) });
    expect(env).toEqual({ APP_CORE_INSTALLED_CLI_DIR: dir });
    expect(seen).toEqual([path.join(dir, 'package.json')]);
    expect(message).toContain(dir);
  });

  it('sets nothing, and says why, when the CLI is not installed globally', () => {
    const { env, message } = installedCliEnv({ globalNodeModules: root, isReadable: () => false });
    expect(env).toEqual({});
    expect(message).toMatch(/WARNING: APP_CORE_INSTALLED_CLI_DIR not set/);
    expect(message).toContain(path.join(dir, 'package.json'));
    expect(message).toContain('npm install -g @wadeck-app/app-core-cli');
  });

  it('sets nothing, and says why, when "npm root -g" gave no folder', () => {
    for (const globalNodeModules of [undefined, '']) {
      const { env, message } = installedCliEnv({ globalNodeModules, isReadable: () => true });
      expect(env).toEqual({});
      expect(message).toMatch(/npm root -g/);
    }
  });
});
