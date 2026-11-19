// Which folders `npm run dev:all` keeps out of the server's `tsx watch` (see test/watchExcludes.test.ts for why).
// Plain .mjs: scripts/dev-all.mjs runs under node without a build. Globs are absolute with forward slashes, the form tsx matches.

const toGlobPath = (p) => p.replaceAll('\\', '/');
const folderOf = (p) => toGlobPath(p).replace(/\/[^/]*$/, '');

export function serverWatchExcludes({ globalNodeModules, registryEntries }) {
  const globs = [];
  if (globalNodeModules !== undefined && globalNodeModules !== '') {
    globs.push(`${toGlobPath(globalNodeModules)}/**`);
  }
  for (const entry of registryEntries) {
    const source = entry.source;
    if (source?.type === 'file' && typeof source.path === 'string' && source.path !== '') {
      globs.push(`${folderOf(source.path)}/**`);
    }
  }
  return [...new Set(globs)];
}
