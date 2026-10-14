// Writes <destDir>/build-info.json: asset filenames are fixed (no content hash), so this file is how
// anyone can tell from outside which dsl-ui / dsl-renderer the served frontend was built with.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function installedVersion(repoRoot, pkg) {
  const file = resolve(repoRoot, 'node_modules', pkg, 'package.json');
  if (!existsSync(file)) {
    throw new Error(`${file} not found: run "npm install" before building the frontend.`);
  }
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

export function writeBuildInfo(destDir, repoRoot) {
  const buildInfo = {
    builtAt: new Date().toISOString(),
    dslUi: installedVersion(repoRoot, '@wadeck-app/dsl-ui'),
    dslRenderer: installedVersion(repoRoot, '@wadeck-app/dsl-renderer'),
  };
  writeFileSync(resolve(destDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
  return buildInfo;
}
