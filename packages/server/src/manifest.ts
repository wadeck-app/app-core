import { z } from 'zod';
import { MODULE_ID_PATTERN, MODULE_ID_RULE } from './moduleId.js';
import { MENU_SLOT_LOCAL, SLOT_LOCAL_PATTERN, SLOT_LOCAL_RULE, menuSlotProvider, slotIdProblem } from './slotIds.js';

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
  })
  // A custom slot is always `<providerId>:<local>` (decision 82).
  .refine((ep) => slotIdProblem(ep.slot) === undefined, (ep) => ({ message: slotIdProblem(ep.slot) ?? '', path: ['slot'] }))
  // A contribution to `<providerId>:nav` is an entry in that module's side menu: it needs what a menu entry needs.
  .superRefine((ep, ctx) => {
    const provider = menuSlotProvider(ep.slot);
    if (provider === undefined) {
      return;
    }
    const what = `an entry in the side menu of "${provider}"`;
    if (ep.kind !== 'page') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kind'], message: `a contribution to "${ep.slot}" is ${what}, so its kind must be "page" (got "${ep.kind}")` });
    }
    if (ep.label === undefined || ep.label.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: `a contribution to "${ep.slot}" is ${what}: add a "label", it is the text of the entry` });
    }
    if (ep.path === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['path'], message: `a contribution to "${ep.slot}" is ${what}: add a "path" (for example "/chart"), it is the page's address under /modules/<your id>` });
    } else if (ep.path.includes(':')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['path'], message: `a contribution to "${ep.slot}" is ${what}: its path "${ep.path}" has a ":param" segment, but a menu entry needs a fixed address` });
    }
  });

export const ModuleIdSchema = z.string().regex(MODULE_ID_PATTERN, `module id must ${MODULE_ID_RULE}`);

// Modules this one needs loaded first: module id -> semver range of the version it accepts. The range
// is validated where semver is available (contributions.ts), not here, to keep the SDK free of it.
const RequiresSchema = z.record(ModuleIdSchema, z.string().min(1));

// What a module offers to others (decision 82). `types` is a path to its types-only file (a source path in
// the source manifest, `./types/index.d.ts` in the packaged one); each slot lists the `$type`s it accepts.
const ExposeSchema = z
  .object({
    types: z.string().min(1).optional(),
    slots: z
      .record(
        z
          .string()
          .regex(SLOT_LOCAL_PATTERN, `slot name must ${SLOT_LOCAL_RULE} (no ":", the module id is added as the prefix)`)
          .refine((name) => name !== MENU_SLOT_LOCAL, {
            message: `slot name "${MENU_SLOT_LOCAL}" is reserved: every module's side menu is "<id>:${MENU_SLOT_LOCAL}" and accepts pages from the modules that require it, no declaration needed`,
          }),
        z.object({ accepts: z.array(z.string().min(1)).min(1, 'accepts must list at least one $type') }).strict(),
      )
      .optional(),
  })
  .strict();

// Optional hooks, each a path to a file whose default export is the function: a source path
// under src/backend in the source manifest, `./api-backend/<hook>.cjs` in the packaged one (decision 84).
const LifecycleSchema = z
  .object({
    teardown: z.string().min(1).optional(),
    migrate: z.string().min(1).optional(),
  })
  .strict();

// Whether the shell lists the module in its navigation (a tab in the top bar and a shortcut on the dashboard menu).
// Absent means true. `false` is for a module whose pages are reached by link, or that offers widgets only: its pages
// stay mounted and routable, and when one is open the side menu still lists the module's pages. A module without any
// `page` / `nav` extension point is never listed, whatever this says. Must be a boolean: a string like "false" is rejected.
const ShowInNavSchema = z.boolean().optional();

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

// The manifest a running app-core loads (what `package` writes into dist-module/).
export const ManifestSchema = z.object({
  // Must equal the id the module is registered under (decision 83); the loader refuses a mismatch.
  id: ModuleIdSchema,
  version: z.string().min(1),
  backendEntryPath: z.string().min(1),
  extensionPoints: z.array(ExtensionPointSchema).min(1),
  dslLib: DslLibSchema.optional(),
  requires: RequiresSchema.optional(),
  expose: ExposeSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  showInNav: ShowInNavSchema,
});

// The manifest an author writes at the module root (decision 81). It never names what `package`
// produces: no version (stamped at package time), no backendEntryPath (src/backend/index.ts by
// convention), no dslLib entry/css (built from src/dsl-components). Unknown keys are rejected so an
// output-only key is reported instead of silently ignored.
export const SourceManifestSchema = z
  .object({
    id: ModuleIdSchema,
    extensionPoints: z.array(ExtensionPointSchema).min(1),
    dslLib: z.object({ shared: z.record(z.string().min(1)).default({}) }).strict().optional(),
    requires: RequiresSchema.optional(),
    expose: ExposeSchema.optional(),
    lifecycle: LifecycleSchema.optional(),
    showInNav: ShowInNavSchema,
  })
  .strict();

export type Manifest = z.infer<typeof ManifestSchema>;
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
export type ExtensionPoint = z.infer<typeof ExtensionPointSchema>;
export type ModuleExpose = z.infer<typeof ExposeSchema>;
export type ModuleRequires = z.infer<typeof RequiresSchema>;
export type ModuleLifecycle = z.infer<typeof LifecycleSchema>;

// v1 only supports a `file` source. `npm` is deferred to v2 and must be
// rejected with a clear error, not silently ignored.
const FileSourceSchema = z.object({
  type: z.literal('file'),
  path: z.string().min(1),
});

export { MODULE_ID_PATTERN };

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

export function parseSourceManifest(input: unknown): SourceManifest {
  return SourceManifestSchema.parse(input);
}

// Thrown when a module is registered under an id other than the one its manifest declares.
export class ManifestIdMismatchError extends Error {
  constructor(registeredId: string, manifestId: string, manifestPath: string) {
    super(
      `Module registered as "${registeredId}" but its manifest ${manifestPath} declares "id": "${manifestId}". Register it as "${manifestId}", or change the manifest "id".`,
    );
    this.name = 'ManifestIdMismatchError';
  }
}
