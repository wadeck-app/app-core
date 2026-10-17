import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkSharedRanges, libContentType, resolveLibRequest, sharedVersionsFromBuildInfo } from '../src/dslLib.js';
import { parseManifest } from '../src/manifest.js';
import { ModuleRouteRegistry } from '../src/moduleRoutes.js';

const baseManifest = {
  version: '1.0.0',
  backendEntryPath: './api-backend/backend.mjs',
  extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }],
};

describe('manifest: page path and dslLib', () => {
  const page = (extra: Record<string, unknown>) => ({
    ...baseManifest,
    extensionPoints: [{ kind: 'page', slot: 'route', view: { type: 'inline', value: {} }, ...extra }],
  });

  it('accepts a parameterised page path and a dslLib block', () => {
    const manifest = parseManifest({
      ...page({ path: '/jobs/:id/edit' }),
      dslLib: { entry: './dsl-lib/entries.mjs', css: './dsl-lib/style.css', shared: { react: '^19' } },
    });
    expect(manifest.extensionPoints[0]?.path).toBe('/jobs/:id/edit');
    expect(manifest.dslLib?.entry).toBe('./dsl-lib/entries.mjs');
  });

  it.each(['jobs', '/', '/jobs/', '/../x', '/jobs/..', '/a b', '/jobs\\x', '/jobs/:1x'])('rejects the page path %s', (bad) => {
    expect(() => parseManifest(page({ path: bad }))).toThrow();
  });

  it('rejects a path on a widget', () => {
    expect(() => parseManifest({ ...baseManifest, extensionPoints: [{ ...baseManifest.extensionPoints[0], path: '/x' }] })).toThrow(
      /only valid on extension points of kind/,
    );
  });

  it.each(['./api-backend/entries.mjs', './dsl-lib/../manifest.json', '../dsl-lib/x.mjs', './dsl-lib\\x.mjs', '/dsl-lib/x.mjs', './dsl-lib/'])(
    'rejects a dslLib entry outside dsl-lib/: %s',
    (bad) => {
      expect(() => parseManifest({ ...baseManifest, dslLib: { entry: bad, shared: {} } })).toThrow();
    },
  );
});

describe('checkSharedRanges', () => {
  const versions = {
    react: '19.3.0',
    'react-router-dom': '7.18.4',
    '@wadeck-app/dsl-ui': '2026.10.17-095-7b2c28f1',
  };

  it('accepts ranges satisfied by the shell versions, including calver prereleases', () => {
    const result = checkSharedRanges(
      { react: '^19', 'react-router-dom': '^7', '@wadeck-app/dsl-ui': '>=2026.10.14-0' },
      versions,
    );
    expect(result.unverified).toEqual([]);
  });

  it('rejects a range the shell does not satisfy, naming both versions', () => {
    expect(() => checkSharedRanges({ react: '^18' }, versions)).toThrow(/react "\^18".*provides 19\.3\.0/);
    expect(() => checkSharedRanges({ '@wadeck-app/dsl-ui': '>=2026.11.0-0' }, versions)).toThrow(/dsl-ui/);
  });

  it('rejects a package the shell does not share', () => {
    expect(() => checkSharedRanges({ zod: '^3' }, versions)).toThrow(/not provided by the app-core shell/);
  });

  it('rejects an invalid range', () => {
    expect(() => checkSharedRanges({ react: 'not a range' }, versions)).toThrow(/invalid version range/);
  });

  it('reports packages it cannot compare instead of passing silently', () => {
    expect(checkSharedRanges({ react: '^19' }, undefined).unverified).toEqual(['react']);
    expect(checkSharedRanges({ 'react-dom': '^19' }, versions).unverified).toEqual(['react-dom']);
  });

  it('maps build-info fields to package names', () => {
    expect(sharedVersionsFromBuildInfo({ react: '19.3.0', reactDom: '19.3.0', dslUi: '1', other: 'x' })).toEqual({
      react: '19.3.0',
      'react-dom': '19.3.0',
      '@wadeck-app/dsl-ui': '1',
    });
  });
});

describe('resolveLibRequest', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-lib-'));
    fs.mkdirSync(path.join(dir, 'dsl-lib', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dsl-lib', 'entries.mjs'), 'export default [];\n');
    fs.writeFileSync(path.join(dir, 'dsl-lib', 'sub', 'a.css'), 'a{}\n');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves files inside dsl-lib/, including subfolders', () => {
    expect(resolveLibRequest(dir, 'entries.mjs')).toBe(fs.realpathSync(path.join(dir, 'dsl-lib', 'entries.mjs')));
    expect(resolveLibRequest(dir, 'sub/a.css')).toBeDefined();
  });

  it.each(['../manifest.json', 'sub/../../manifest.json', '..\\manifest.json', '/etc/passwd', `${path.parse(os.tmpdir()).root}outside.txt`, '', 'missing.mjs', 'sub', 'a\0b'])(
    'refuses %j',
    (bad) => {
      expect(resolveLibRequest(dir, bad)).toBeUndefined();
    },
  );

  it('answers undefined when the module has no dsl-lib folder', () => {
    expect(resolveLibRequest(path.join(dir, 'dsl-lib', 'sub'), 'a.css')).toBeUndefined();
  });
});

describe('libContentType', () => {
  it.each([
    ['x.mjs', 'text/javascript'],
    ['x.js', 'text/javascript'],
    ['x.css', 'text/css'],
    ['x.js.map', 'application/json'],
    ['x.bin', 'application/octet-stream'],
  ])('%s -> %s', (file, type) => {
    expect(libContentType(file)).toBe(type);
  });
});

describe('registerRoute reserves _lib', () => {
  it.each(['/_lib', '/_lib/x', '_lib/y.mjs'])('rejects %s', (subPath) => {
    expect(() => new ModuleRouteRegistry().register('m', 'GET', subPath, () => undefined)).toThrow(/reserved/);
  });

  it('still accepts similarly named paths', () => {
    expect(() => new ModuleRouteRegistry().register('m', 'GET', '/_library', () => undefined)).not.toThrow();
  });
});
