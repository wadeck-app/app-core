import { describe, it, expect } from 'vitest';
import { parseManifest, parseRegistrationPayload, UnsupportedSourceTypeError } from '../src/manifest.js';

describe('parseManifest', () => {
  it('accepts a well-formed manifest with one extension point', () => {
    const manifest = parseManifest({
      version: '1.0.0',
      backendEntryPath: './backend.mjs',
      extensionPoints: [
        { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'TextBox' } } },
      ],
    });
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.extensionPoints).toHaveLength(1);
  });

  it('rejects a manifest with zero extension points', () => {
    expect(() =>
      parseManifest({ version: '1.0.0', backendEntryPath: './backend.mjs', extensionPoints: [] }),
    ).toThrow();
  });

  it('rejects a manifest missing backendEntryPath', () => {
    expect(() =>
      parseManifest({
        version: '1.0.0',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: {} } }],
      }),
    ).toThrow();
  });

  it('rejects an extension point with an invalid view.type', () => {
    expect(() =>
      parseManifest({
        version: '1.0.0',
        backendEntryPath: './backend.mjs',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'react', value: {} } }],
      }),
    ).toThrow();
  });
});

describe('parseRegistrationPayload', () => {
  it('accepts a file source', () => {
    const payload = parseRegistrationPayload({ id: 'queue', source: { type: 'file', path: '/tmp/manifest.json' } });
    expect(payload.source.type).toBe('file');
  });

  it('rejects an npm source in v1 with UnsupportedSourceTypeError (Decision #11)', () => {
    expect(() =>
      parseRegistrationPayload({ id: 'queue', source: { type: 'npm', package: '@wadeck-app/queue-module', version: '1.0.0' } }),
    ).toThrow(UnsupportedSourceTypeError);
  });

  it('rejects a payload missing id', () => {
    expect(() => parseRegistrationPayload({ source: { type: 'file', path: '/tmp/manifest.json' } })).toThrow();
  });
});
