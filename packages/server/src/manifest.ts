import { z } from 'zod';

// Manifest shape: a module declares any number of UI contributions
// (widgets, pages) in a single manifest/version.
const ViewSchema = z.object({
  type: z.enum(['inline', 'path']),
  value: z.unknown(),
});

const ExtensionPointSchema = z.object({
  kind: z.string().min(1),
  slot: z.string().min(1),
  label: z.string().optional(),
  view: ViewSchema,
  // Generic, slot-agnostic sort key for ExtensionSlot aggregation (GET
  // /api/slots/:slotId). Purely structural -- app-core sorts by this number,
  // it never interprets what it means. Entries without `order` sort last, in
  // registration order.
  order: z.number().optional(),
});

export const ManifestSchema = z.object({
  version: z.string().min(1),
  backendEntryPath: z.string().min(1),
  extensionPoints: z.array(ExtensionPointSchema).min(1),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ExtensionPoint = z.infer<typeof ExtensionPointSchema>;

// v1 only supports a `file` source. `npm` is deferred to v2 and must be
// rejected with a clear error, not silently ignored.
const FileSourceSchema = z.object({
  type: z.literal('file'),
  path: z.string().min(1),
});

// The id names the registry file (`<modules-dir>/<id>.json`) and the URL prefix
// `/api/modules/<id>/`, so it must never contain a path separator or dots.
export const MODULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const ModuleIdSchema = z
  .string()
  .regex(MODULE_ID_PATTERN, 'module id must start with a letter or digit and contain only letters, digits, "_" and "-"');

export const UnregisterPayloadSchema = z.object({ id: ModuleIdSchema });

export function parseUnregisterPayload(input: unknown): { id: string } {
  return UnregisterPayloadSchema.parse(input);
}

export const RegistrationPayloadSchema = z.object({
  id: ModuleIdSchema,
  source: z.discriminatedUnion('type', [
    FileSourceSchema,
    z.object({ type: z.literal('npm'), package: z.string(), version: z.string() }),
  ]),
});

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;

export class UnsupportedSourceTypeError extends Error {
  constructor(sourceType: string) {
    super(`Source type "${sourceType}" is not supported in v1 (npm sourcing is deferred to v2). Only { type: 'file', path } is accepted.`);
    this.name = 'UnsupportedSourceTypeError';
  }
}

export function parseRegistrationPayload(input: unknown): RegistrationPayload & { source: { type: 'file'; path: string } } {
  const payload = RegistrationPayloadSchema.parse(input);
  if (payload.source.type !== 'file') {
    throw new UnsupportedSourceTypeError(payload.source.type);
  }
  return payload as RegistrationPayload & { source: { type: 'file'; path: string } };
}

export function parseManifest(input: unknown): Manifest {
  return ManifestSchema.parse(input);
}
