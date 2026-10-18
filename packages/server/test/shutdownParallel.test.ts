import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleManager } from '../src/loader.js';
import { readModuleLog, resetModuleLog, writeTestModule, type TestModuleSpec } from './moduleFactory.js';

// Decision 96: shutdown tears down level by level (nobody-requires-it first), the modules of one level at the
// same time, each under its own timeout.

const DELAY_MS = 400;

// A teardown that logs when it starts and ends, after `ms` of work.
const slowTeardown = (ms: number): string =>
  `export default async function (ctx) {
  const log = (globalThis.__moduleLog ??= []);
  log.push('start:' + ctx.id);
  await new Promise((resolve) => setTimeout(resolve, ${ms}));
  log.push('end:' + ctx.id);
}\n`;

describe('shutdown teardowns run in parallel per dependency level', () => {
  let configDir: string;
  let scratch: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-shutdown-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-shutdown-mods-'));
    resetModuleLog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  async function load(manager: ModuleManager, id: string, spec: TestModuleSpec): Promise<void> {
    const manifest = writeTestModule(scratch, id, spec);
    await manager.loadFromEntry({ id, source: { type: 'file', path: manifest } });
  }

  it('two independent slow hooks take about the longest one, not the sum', async () => {
    const manager = new ModuleManager({ configDir, hookTimeoutMs: 5_000 });
    await load(manager, 'one', { teardown: slowTeardown(DELAY_MS) });
    await load(manager, 'two', { teardown: slowTeardown(DELAY_MS) });

    resetModuleLog();
    const started = performance.now();
    await manager.shutdown();
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(DELAY_MS - 20);
    // Sequential would take at least 2 x DELAY_MS.
    expect(elapsed).toBeLessThan(DELAY_MS * 1.75);
    // Both started before either ended.
    expect(readModuleLog().slice(0, 2).sort()).toEqual(['start:one', 'start:two']);
    expect(manager.list()).toEqual([]);
  });

  it('a dependent is torn down completely before its provider starts; the modules of one level overlap', async () => {
    const manager = new ModuleManager({ configDir, hookTimeoutMs: 5_000 });
    await load(manager, 'provider', { teardown: slowTeardown(50) });
    await load(manager, 'b', { requires: { provider: '*' }, teardown: slowTeardown(150) });
    await load(manager, 'c', { requires: { provider: '*' }, teardown: slowTeardown(150) });
    await load(manager, 'loner', { teardown: slowTeardown(50) });
    resetModuleLog();

    await manager.shutdown();

    const log = readModuleLog();
    const at = (line: string): number => log.indexOf(line);
    expect(log).toHaveLength(8);
    // Level 0 (nobody requires them): b, c, loner start together.
    expect(log.slice(0, 3).sort()).toEqual(['start:b', 'start:c', 'start:loner']);
    // Level 1: the provider only starts when both its dependents are done.
    expect(at('start:provider')).toBeGreaterThan(at('end:b'));
    expect(at('start:provider')).toBeGreaterThan(at('end:c'));
    expect(log[log.length - 1]).toBe('end:provider');
  });

  it('each hook has its own timeout: a hanging hook is reported and does not delay the others', async () => {
    const warnings: string[] = [];
    const manager = new ModuleManager({ configDir, hookTimeoutMs: 150, onWarning: (m) => warnings.push(m) });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await load(manager, 'hangs', { teardown: 'export default function () { return new Promise(() => {}); }\n' });
    await load(manager, 'quick', { teardown: slowTeardown(20) });
    await load(manager, 'hangs-too', { teardown: 'export default function () { return new Promise(() => {}); }\n' });

    const started = performance.now();
    await manager.shutdown();
    const elapsed = performance.now() - started;

    // One timeout for the whole level, not one per hanging module (that would be 300 ms or more).
    expect(elapsed).toBeLessThan(290);
    expect(warnings.filter((w) => w.includes('timed out')).map((w) => w.split(':')[0]).sort()).toEqual(['module "hangs"', 'module "hangs-too"']);
    expect(readModuleLog()).toContain('end:quick');
    expect(manager.list()).toEqual([]);
  });

  it('is idempotent and records no failure', async () => {
    const manager = new ModuleManager({ configDir });
    await load(manager, 'one', { teardown: slowTeardown(10) });
    resetModuleLog();
    await manager.shutdown();
    await manager.shutdown();

    expect(readModuleLog()).toEqual(['start:one', 'end:one']);
    expect(manager.listFailed()).toEqual([]);
  });
});
