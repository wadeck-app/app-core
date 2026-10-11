#!/usr/bin/env node
// Copies packages/frontend-shell/dist (the frontend shell, Decision #24/#25)
// into app-core's own repo-root public/ folder, served statically by
// packages/server/src/server.ts. Mirrors orchestrator/packages/orch-server/scripts/copy-app.mjs.
import { cpSync, rmSync, existsSync } from 'node:fs';
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
