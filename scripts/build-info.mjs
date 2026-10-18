// Writes <destDir>/build-info.json: asset filenames are fixed (no content hash), so this file is how
// anyone can tell from outside which app-core / dsl-ui / dsl-renderer / react the served frontend was
// built with. The server also reads it to verify the `dslLib.shared` ranges a module declares, and
// the shell shows it in its versions menu.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function versionOf(file) {
  if (!existsSync(file)) {
    throw new Error(`${file} not found: run "npm install" before building the frontend.`);
  }
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

function installedVersion(repoRoot, pkg) {
  return versionOf(resolve(repoRoot, 'node_modules', pkg, 'package.json'));
}

// Short commit of the checkout the frontend was built from; absent when git or the repository is not
// there (a build from a source archive), never a made-up value.
function currentCommit(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function writeBuildInfo(destDir, repoRoot) {
  const buildInfo = {
    builtAt: new Date().toISOString(),
    // The CI injects the published calver into app-core-cli before building; a local build reads 0.0.1.
    appCore: versionOf(resolve(repoRoot, 'packages/app-core-cli/package.json')),
    commit: currentCommit(repoRoot),
    dslUi: installedVersion(repoRoot, '@wadeck-app/dsl-ui'),
    dslRenderer: installedVersion(repoRoot, '@wadeck-app/dsl-renderer'),
    react: installedVersion(repoRoot, 'react'),
    reactDom: installedVersion(repoRoot, 'react-dom'),
    reactRouterDom: installedVersion(repoRoot, 'react-router-dom'),
  };
  writeFileSync(resolve(destDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
  return buildInfo;
}
