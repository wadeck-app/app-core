import { describe, expect, it } from 'vitest';
import { serverWatchExcludes } from '../dev/watchExcludes.mjs';

// `npm run dev:all` runs the server under `tsx watch`. tsx watches the folder of every file the server loads, and on Windows a watched folder
// cannot be renamed: a module installed by `<cli> cli update` (swapped in by renaming its folder) made that update fail with EPERM for as long as
// dev:all ran. The installed modules must stay out of the watch.
describe('serverWatchExcludes', () => {
  it('excludes the folder of the global npm packages, where `<cli> cli update` installs modules', () => {
    expect(serverWatchExcludes({ globalNodeModules: 'C:\\App\\nvm\\v24.22.1\\node_modules', registryEntries: [] })).toEqual(['C:/App/nvm/v24.22.1/node_modules/**']);
  });

  it('excludes the folder of every module registered from a file, whatever the slashes, once', () => {
    const entries = [
      { id: 'flow', source: { type: 'file', path: 'C:\\Dev\\flow\\dist-module\\manifest.json' } },
      { id: 'flow-chart', source: { type: 'file', path: 'C:/Dev/flow/dist-module/manifest.json' } },
      { id: 'queue', source: { type: 'file', path: '/home/me/queue/dist/manifest.json' } },
    ];
    expect(serverWatchExcludes({ registryEntries: entries })).toEqual(['C:/Dev/flow/dist-module/**', '/home/me/queue/dist/**']);
  });

  it('ignores a registry entry that has no file source, and a missing global folder', () => {
    expect(serverWatchExcludes({ globalNodeModules: undefined, registryEntries: [{ id: 'x', source: { type: 'url', path: 'https://x' } }, { id: 'y' }] })).toEqual([]);
  });
});
