import * as fs from 'node:fs';
import { ZodError } from 'zod';
import { parseManifest, parseSourceManifest, type Manifest, type SourceManifest } from '@wadeck-app/app-core-sdk';

// `message` is the full text for a terminal (it names the file); `reason` is the same text without the
// file path, for callers that already print the path themselves (check).
export type ManifestValidation<T> = { ok: true; manifest: T } | { ok: false; message: string; reason: string };

function validateWith<T>(manifestPath: string, parse: (raw: unknown) => T): ManifestValidation<T> {
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, message: `No manifest found at ${manifestPath}`, reason: 'No manifest found' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    const reason = `is not valid JSON: ${(err as Error).message}`;
    return { ok: false, message: `${manifestPath} ${reason}`, reason };
  }
  try {
    return { ok: true, manifest: parse(raw) };
  } catch (err) {
    const reason =
      err instanceof ZodError
        ? `failed manifest validation:\n${err.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`
        : `failed manifest validation: ${(err as Error).message}`;
    return { ok: false, message: `${manifestPath} ${reason}`, reason };
  }
}

// Runs the exact same zod schema app-core's server uses, so a module author
// catches a malformed manifest before ever starting app-core. On success,
// returns the parsed manifest too -- so a caller (e.g. --json, or another
// tool shelling out to this CLI) gets the one authoritative parsed shape
// instead of hand-rolling its own field extraction.
export function validateManifestFile(manifestPath: string): ManifestValidation<Manifest> {
  return validateWith(manifestPath, parseManifest);
}

// Same, for the manifest an author writes at the module root (id, extensionPoints, dslLib.shared).
export function validateSourceManifestFile(manifestPath: string): ManifestValidation<SourceManifest> {
  return validateWith(manifestPath, parseSourceManifest);
}
