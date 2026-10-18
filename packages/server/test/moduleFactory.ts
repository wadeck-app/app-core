import * as fs from 'node:fs';
import * as path from 'node:path';

// Hand-written packaged modules for the tests that need many small modules with controllable hooks.
// Setup and hooks append to a call log on globalThis, so a test can assert the order of the calls.

declare global {
  var __moduleLog: string[] | undefined;
}

export function resetModuleLog(): void {
  globalThis.__moduleLog = [];
}

export function readModuleLog(): string[] {
  const log = globalThis.__moduleLog;
  if (!log) {
    throw new Error('__moduleLog is not set: call resetModuleLog() in beforeEach, or no module wrote to it.');
  }
  return log;
}

export interface TestModuleSpec {
  version?: string;
  requires?: Record<string, string>;
  expose?: unknown;
  // One widget per entry; default: a single dashboard Badge.
  points?: Array<{ slot: string; view: Record<string, unknown> }>;
  // Full source of the backend file (ESM, default export); default: logs "setup:<id>".
  backend?: string;
  // Full source of the hook files (ESM, default export); `true` logs "teardown:<id>:<reason>" / "migrate:<id>".
  teardown?: string | true;
  migrate?: string | true;
}

const DEFAULT_TEARDOWN = "export default function (ctx) { (globalThis.__moduleLog ??= []).push('teardown:' + ctx.id + ':' + ctx.reason); }\n";
const DEFAULT_MIGRATE = "export default function (ctx) { (globalThis.__moduleLog ??= []).push('migrate:' + ctx.id); }\n";

// Writes (or rewrites in place) <root>/<id>/manifest.json and its files; returns the manifest path.
export function writeTestModule(root: string, id: string, spec: TestModuleSpec = {}): string {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'backend.mjs'), spec.backend ?? `export default function () { (globalThis.__moduleLog ??= []).push('setup:${id}'); }\n`);
  const lifecycle: Record<string, string> = {};
  if (spec.teardown !== undefined) {
    fs.writeFileSync(path.join(dir, 'teardown.mjs'), spec.teardown === true ? DEFAULT_TEARDOWN : spec.teardown);
    lifecycle['teardown'] = './teardown.mjs';
  }
  if (spec.migrate !== undefined) {
    fs.writeFileSync(path.join(dir, 'migrate.mjs'), spec.migrate === true ? DEFAULT_MIGRATE : spec.migrate);
    lifecycle['migrate'] = './migrate.mjs';
  }
  const points = spec.points ?? [{ slot: 'dashboard', view: { $type: 'Badge', label: id } }];
  const manifest = {
    id,
    version: spec.version ?? '1.0.0',
    backendEntryPath: './backend.mjs',
    ...(spec.requires === undefined ? {} : { requires: spec.requires }),
    ...(spec.expose === undefined ? {} : { expose: spec.expose }),
    ...(Object.keys(lifecycle).length === 0 ? {} : { lifecycle }),
    extensionPoints: points.map((p) => ({ kind: 'widget', slot: p.slot, view: { type: 'inline', value: p.view } })),
  };
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}
