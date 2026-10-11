import { describe, it, expect } from 'vitest';
import { ManifestSchema, parseManifest, createModuleContext, UnsupportedSourceTypeError, parseRegistrationPayload } from './index.js';

// app-core-sdk is a types/schemas-only package -- these tests prove the
// re-exports actually work end to end, not just compile.
describe('app-core-sdk re-exports', () => {
  it('ManifestSchema/parseManifest validate a real manifest shape', () => {
    const manifest = parseManifest({
      version: '1.0.0',
      backendEntryPath: './api-backend/index.js',
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } }],
    });
    expect(manifest.version).toBe('1.0.0');
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('createModuleContext produces a usable ModuleContext', () => {
    const ctx = createModuleContext('test-module', { register: () => {}, unregisterAllForModule: () => {}, find: () => undefined } as any);
    expect(typeof ctx.setInterval).toBe('function');
    expect(typeof ctx.registerRoute).toBe('function');
    ctx.dispose();
  });

  it('parseRegistrationPayload rejects npm source (deferred to v2) via UnsupportedSourceTypeError', () => {
    expect(() => parseRegistrationPayload({ id: 'x', source: { type: 'npm', package: 'y', version: '1.0.0' } })).toThrow(
      UnsupportedSourceTypeError,
    );
  });
});
