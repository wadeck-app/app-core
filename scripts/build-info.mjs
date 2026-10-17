// Writes <destDir>/build-info.json: asset filenames are fixed (no content hash), so this file is how
// anyone can tell from outside which dsl-ui / dsl-renderer / react the served frontend was built with.
// The server also reads it to verify the `dslLib.shared` ranges a module declares.
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
    react: installedVersion(repoRoot, 'react'),
    reactDom: installedVersion(repoRoot, 'react-dom'),
    reactRouterDom: installedVersion(repoRoot, 'react-router-dom'),
  };
  writeFileSync(resolve(destDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
  return buildInfo;
}
