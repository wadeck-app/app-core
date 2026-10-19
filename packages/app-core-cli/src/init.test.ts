import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { checkModule } from './check.js';
import { defaultIdFor, initModule, parseInitArgs } from './init.js';
import { packageModule } from './package.js';
import { removeModule } from './test-helpers/makeModule.js';

const dirs: string[] = [];

// A path that does not exist yet inside a fresh temp folder, like the argument a user gives to init.
function newModuleDir(name: string): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-init-'));
  dirs.push(parent);
  return path.join(parent, name);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

describe('parseInitArgs', () => {
  it('reads --id and --title, in any order', () => {
    expect(parseInitArgs(['--title', 'Flow charts', '--id', 'flow-chart'])).toEqual({ id: 'flow-chart', title: 'Flow charts' });
    expect(parseInitArgs([])).toEqual({ id: undefined, title: undefined });
  });

  it('rejects an unknown option and a missing value, naming the usage', () => {
    expect(() => parseInitArgs(['--idd', 'x'])).toThrow(/Unknown option "--idd".*Usage: app-core-cli init/s);
    expect(() => parseInitArgs(['--id'])).toThrow(/--id needs a value/);
    expect(() => parseInitArgs(['--id', '--title', 'x'])).toThrow(/--id needs a value/);
  });
});

describe('defaultIdFor', () => {
  it('drops the app-module- folder prefix, and keeps any other name', () => {
    expect(defaultIdFor('/x/app-module-billing')).toBe('billing');
    expect(defaultIdFor('/x/billing')).toBe('billing');
  });
});

describe('initModule', () => {
  it('creates a module that passes check as is', async () => {
    const dir = newModuleDir('app-module-hello');
    const { id } = initModule(dir, { id: undefined, title: undefined });
    expect(id).toBe('hello');
    expect((await checkModule(dir)).issues).toEqual([]);
  });

  it('puts the title in the manifest and uses it as the page label', () => {
    const dir = newModuleDir('app-module-hello');
    initModule(dir, { id: 'flow-chart', title: 'Flow charts' });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ id: 'flow-chart', title: 'Flow charts', extensionPoints: [{ label: 'Flow charts' }] });
  });

  it('packages, and a real server serves its page and its route', async () => {
    const dir = newModuleDir('app-module-hello');
    initModule(dir, { id: 'hello', title: undefined });
    // The folder is named "dist-module": the server loads the CJS backend natively only from such a path.
    const out = path.join(dir, 'dist-module');
    await packageModule({ moduleDir: dir, outDir: out, version: '1.0.0' });
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-init-cfg-'));
    dirs.push(configDir);
    const { server } = await buildServer({ configDir });
    const registered = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'hello', source: { type: 'file', path: path.join(out, 'manifest.json') } } });
    expect(registered.statusCode, registered.body).toBe(201);
    const ping = await server.inject({ method: 'GET', url: '/api/modules/hello/ping' });
    expect(ping.json()).toEqual({ message: 'hello from hello' });
    await server.close();
  });

  it('refuses a folder that already has content, and leaves it untouched', () => {
    const dir = newModuleDir('app-module-hello');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'mine.txt'), 'keep');
    expect(() => initModule(dir, { id: undefined, title: undefined })).toThrow(/already has content/);
    expect(fs.readdirSync(dir)).toEqual(['mine.txt']);
  });

  it('accepts an existing empty folder', () => {
    const dir = newModuleDir('app-module-hello');
    fs.mkdirSync(dir, { recursive: true });
    expect(() => initModule(dir, { id: undefined, title: undefined })).not.toThrow();
  });

  it('refuses an invalid id, with the rule and how to give another', () => {
    const dir = newModuleDir('my.module');
    expect(() => initModule(dir, { id: undefined, title: undefined })).toThrow(/"my\.module" is not a valid module id.*Pass one with --id/s);
    expect(() => initModule(dir, { id: 'a/b', title: undefined })).toThrow(/not a valid module id.*Pick another with --id/s);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
