#!/usr/bin/env node
// Copies packages/frontend-shell/dist (the frontend shell, Decision #24/#25)
// into app-core's own repo-root public/ folder, served statically by
// packages/server/src/server.ts. Mirrors orchestrator/packages/orch-server/scripts/copy-app.mjs.
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = resolve(__dirname, '../packages/frontend-shell/dist');
const dest = resolve(__dirname, '../public');

if (!existsSync(src)) {
  console.error(`packages/frontend-shell/dist not found at ${src}. Run "npm run build --workspace=packages/frontend-shell" first.`);
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied packages/frontend-shell/dist -> public (${dest})`);

// Asset filenames are fixed (no content hash), so this file is how anyone can tell from outside
// which dsl-ui / dsl-renderer the served frontend was built with: GET /build-info.json.
function installedVersion(pkg) {
  const file = resolve(__dirname, '../node_modules', pkg, 'package.json');
  if (!existsSync(file)) {
    throw new Error(`${file} not found: run "npm install" before building the frontend.`);
  }
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

const buildInfo = {
  builtAt: new Date().toISOString(),
  dslUi: installedVersion('@wadeck-app/dsl-ui'),
  dslRenderer: installedVersion('@wadeck-app/dsl-renderer'),
};
writeFileSync(resolve(dest, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
console.log(`Wrote public/build-info.json ${JSON.stringify(buildInfo)}`);
