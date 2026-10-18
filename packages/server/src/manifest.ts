import { z } from 'zod';
import { MODULE_ID_PATTERN, MODULE_ID_RULE } from './moduleId.js';

// Manifest shape: a module declares any number of UI contributions
// (widgets, pages) in a single manifest/version.
const ViewSchema = z.object({
  type: z.enum(['inline', 'path']),
  value: z.unknown(),
});

// A page `path` is mounted by the shell at /modules/<moduleId><path> as a react-router route:
// static segments are letters, digits, "_" and "-"; a segment starting with ":" is a route
// parameter that reaches the view as `$route.<name>`. "/" alone is the module home page (/modules/<moduleId>).
const PAGE_PATH_PATTERN = /^(?:\/|(?:\/(?:[A-Za-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*))+)$/;

const ExtensionPointSchema = z
  .object({
    kind: z.string().min(1),
    // `nav` lists a page in the navbar; `route` makes it reachable only by link.
    slot: z.string().min(1),
    label: z.string().optional(),
    view: ViewSchema,
    // Generic, slot-agnostic sort key for ExtensionSlot aggregation (GET
    // /api/slots/:slotId). Purely structural -- app-core sorts by this number,
    // it never interprets what it means. Entries without `order` sort last, in
    // registration order.
    order: z.number().optional(),
    path: z
      .string()
      .regex(PAGE_PATH_PATTERN, 'path must look like "/jobs/:id": segments of letters, digits, "_" or "-", or ":param"')
      .optional(),
  })
  .refine((ep) => ep.path === undefined || ep.kind === 'page', {
    message: 'path is only valid on extension points of kind "page"',
    path: ['path'],
  });

export const DSL_LIB_DIR = 'dsl-lib';

// entry and css are paths inside the module's dsl-lib/ folder; the loader additionally checks
// that the files exist and that their real path stays inside it.
const DslLibFileSchema = z
  .string()
  .min(1)
  .refine((p) => !p.includes('\\') && !p.split('/').includes('..') && new RegExp(`^(?:\\./)?${DSL_LIB_DIR}/.+`).test(p), {
    message: `must be a path inside ${DSL_LIB_DIR}/ (e.g. "./${DSL_LIB_DIR}/entries.mjs")`,
  });

const DslLibSchema = z.object({
  entry: DslLibFileSchema,
  css: DslLibFileSchema.optional(),
  // Shared singletons the bundle was built against: package name -> semver range.
  shared: z.record(z.string().min(1)).default({}),
});

export const ManifestSchema = z.object({
  version: z.string().min(1),
  backendEntryPath: z.string().min(1),
  extensionPoints: z.array(ExtensionPointSchema).min(1),
  dslLib: DslLibSchema.optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ExtensionPoint = z.infer<typeof ExtensionPointSchema>;

// v1 only supports a `file` source. `npm` is deferred to v2 and must be
// rejected with a clear error, not silently ignored.
const FileSourceSchema = z.object({
  type: z.literal('file'),
  path: z.string().min(1),
});

export { MODULE_ID_PATTERN };

export const ModuleIdSchema = z.string().regex(MODULE_ID_PATTERN, `module id must ${MODULE_ID_RULE}`);

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
