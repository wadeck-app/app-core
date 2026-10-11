import * as fs from 'node:fs';
import { ZodError } from 'zod';
import { parseManifest, type Manifest } from '@wadeck-app/app-core-sdk';

// Runs the exact same zod schema app-core's server uses, so a module author
// catches a malformed manifest before ever starting app-core. On success,
// returns the parsed manifest too -- so a caller (e.g. --json, or another
// tool shelling out to this CLI) gets the one authoritative parsed shape
// instead of hand-rolling its own field extraction.
export function validateManifestFile(manifestPath: string): { ok: true; manifest: Manifest } | { ok: false; message: string } {
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, message: `No manifest found at ${manifestPath}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { ok: false, message: `${manifestPath} is not valid JSON: ${(err as Error).message}` };
  }
  try {
    const manifest = parseManifest(raw);
    return { ok: true, manifest };
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
      return { ok: false, message: `${manifestPath} failed manifest validation:\n${details}` };
    }
    return { ok: false, message: `${manifestPath} failed manifest validation: ${(err as Error).message}` };
  }
}
