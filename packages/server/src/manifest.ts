import { z } from 'zod';
import { INDICATOR_ICONS, INDICATOR_TONES } from './indicator.js';
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

// How many cells of the dashboard grid (square cells of 100px) a widget takes, in width and in height. Absent: 3 wide, and
// as tall as its content (at least 1 row). The grid has 10 columns or so on a wide screen; a wider widget takes all of them.
export const WIDGET_MAX_SPAN = 12;
const SpanSchema = z.number().int().min(1, 'must be between 1 and ' + WIDGET_MAX_SPAN).max(WIDGET_MAX_SPAN, 'must be between 1 and ' + WIDGET_MAX_SPAN).optional();

// A group is `name` (the module's own) or `<providerId>:name`: this page joins the group `name` of the module `providerId`, which
// has to be required (or optionally required) like for any contribution.
// An indicator next to a menu entry or a tab: a number (open items, alerts), or an icon in place of it, in a tone (color). It comes
// from a route of the module itself, `GET /api/modules/<id><route>`, which answers JSON: a whole number, or an object
// {count?, tone?, icon?, label?} (at `field` when given: "total", "counts.open"). `tone`, `icon` and `label` here are the defaults
// when the answer does not say. Read again every `refreshSeconds` (default 60; 0: once), not while the browser tab is hidden;
// -1: nothing is read, a component of the page sets it (the SDK's setEntryIndicator), `route` is then absent.
// On a tab, `route` may use the ":params" of the page it is on ("/tasks/:id/history/count").
const CountSchema = z
  .object({
    route: z.string().regex(PAGE_PATH_PATTERN, 'count.route must look like "/jobs/count" or "/jobs/:id/count": segments of letters, digits, "_" or "-", or ":param"').optional(),
    field: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/, 'count.field must be a path of names separated by ".", for example "total" or "counts.open"')
      .optional(),
    refreshSeconds: z.number().int().min(-1, 'count.refreshSeconds must be -1 (set by the page), 0 (read once) or 1 to 3600').max(3600, 'count.refreshSeconds must be -1 (set by the page), 0 (read once) or 1 to 3600').optional(),
    tone: z.enum(INDICATOR_TONES).optional(),
    icon: z.enum(INDICATOR_ICONS).optional(),
    label: z.string().trim().min(1, 'count.label must not be empty').optional(),
  })
  .strict()
  .superRefine((count, ctx) => {
    if (count.refreshSeconds === -1) {
      if (count.route !== undefined || count.field !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['route'], message: 'count.refreshSeconds -1 means nothing is read from the server (a component of the page sets the indicator): remove "route" and "field", or give a refreshSeconds of 0 or more.' });
      }
    } else if (count.route === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['route'], message: 'count.route is required: it is the route of the module that answers the figure (for example "/dlq/count"). A figure that only the page sets takes "refreshSeconds": -1 and no route.' });
    }
  });

const TAB_GROUP_PATTERN = /^(?:[A-Za-z0-9][A-Za-z0-9_-]*:)?[a-z][a-z0-9-]*$/;

export function splitTabGroup(group: string): { providerId: string | undefined; name: string } {
  const at = group.indexOf(':');
  return at < 0 ? { providerId: undefined, name: group } : { providerId: group.slice(0, at), name: group.slice(at + 1) };
}

const paramsOfPath = (pagePath: string): string[] =>
  pagePath
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1))
    .sort();

type TabbedPoint = { path?: string; tab?: { group: string; label: string } };

// The tab groups a module declares itself (the unqualified ones): name -> the ":params" of its pages, as a key.
export function tabGroupsOf(extensionPoints: readonly TabbedPoint[]): Record<string, string> {
  const groups: Record<string, string> = {};
  for (const ep of extensionPoints) {
    if (ep.tab !== undefined && ep.path !== undefined && splitTabGroup(ep.tab.group).providerId === undefined && groups[ep.tab.group] === undefined) {
      groups[ep.tab.group] = paramsOfPath(ep.path).join(',');
    }
  }
  return groups;
}

// The pages a module adds to the tab group of another module: index in extensionPoints, provider, group name, ":params" key.
export function tabContributionsOf(extensionPoints: readonly TabbedPoint[]): Array<{ index: number; providerId: string; group: string; params: string }> {
  return extensionPoints.flatMap((ep, index) => {
    if (ep.tab === undefined || ep.path === undefined) {
      return [];
    }
    const { providerId, name } = splitTabGroup(ep.tab.group);
    return providerId === undefined ? [] : [{ index, providerId, group: name, params: paramsOfPath(ep.path).join(',') }];
  });
}
const TabSchema = z
  .object({
    group: z.string().regex(TAB_GROUP_PATTERN, 'tab.group must be a name of lower case letters, digits or "-", starting with a letter (for example "task"), or "<moduleId>:<name>" to join the group of another module (for example "flow:execution")'),
    label: z.string().trim().min(1, 'tab.label must not be empty: it is the text of the tab (for example "History")'),
    order: z.number().optional(),
    // The figure next to the tab (see CountSchema); the route may use the ":params" of the page.
    count: CountSchema.optional(),
  })
  .strict();

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
    // Size of a dashboard widget, in grid cells (see WIDGET_MAX_SPAN).
    width: SpanSchema,
    height: SpanSchema,
    // A rule above this entry of the side menu, to set groups of pages apart; `groupLabel` is the caption of the group that follows.
    separatorBefore: z.boolean().optional(),
    groupLabel: z.string().trim().min(1, 'groupLabel must not be empty').optional(),
    // A figure next to this page's entry in the side menu (see CountSchema); the route has no ":params", the entry has none.
    count: CountSchema.optional(),
    // This page is a tab of the third level of navigation: the pages of the module that share a `group` are shown as tabs under the
    // trail, on each of them. `label` is the text of the tab (`History`, not the page label `Task history`), `order` sorts the tabs
    // (declaration order when absent).
    tab: TabSchema.optional(),
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
  .superRefine((ep, ctx) => {
    const problem = slotIdProblem(ep.slot);
    if (problem !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slot'], message: problem });
    }
  })
  // `width` and `height` size a widget on the dashboard grid; anywhere else they would be silently ignored.
  .superRefine((ep, ctx) => {
    for (const field of ['width', 'height'] as const) {
      if (ep[field] !== undefined && (ep.kind !== 'widget' || ep.slot !== 'dashboard')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `"${field}" only sizes a widget on the dashboard (kind "widget", slot "dashboard"); this is kind "${ep.kind}" on slot "${ep.slot}". Remove it, or move the widget to the dashboard slot.` });
      }
    }
  })
  // `separatorBefore` and `groupLabel` shape the side menu: on a page of the menu (slot `nav` or `<providerId>:nav`) only.
  .superRefine((ep, ctx) => {
    const inMenu = ep.kind === 'page' && (ep.slot === MENU_SLOT_LOCAL || menuSlotProvider(ep.slot) !== undefined);
    for (const field of ['separatorBefore', 'groupLabel'] as const) {
      if (ep[field] !== undefined && !inMenu) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `"${field}" only shapes the side menu (kind "page", slot "nav" or "<module>:nav"); this is kind "${ep.kind}" on slot "${ep.slot}". Remove it, or make this a page of the menu.` });
      }
    }
    if (ep.groupLabel !== undefined && ep.separatorBefore !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groupLabel'], message: '"groupLabel" is the caption of the separator: add "separatorBefore": true, or remove "groupLabel".' });
    }
  })
  // `count` on a page is the figure of its entry in the side menu: a page of the menu (slot `nav` or `<providerId>:nav`) only, and the
  // entry has no ":params" to give the route. On a tab (`tab.count`) the route may use the page's own ":params", no others.
  .superRefine((ep, ctx) => {
    const inMenu = ep.kind === 'page' && (ep.slot === MENU_SLOT_LOCAL || menuSlotProvider(ep.slot) !== undefined);
    if (ep.count !== undefined) {
      if (!inMenu) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['count'], message: `"count" is the figure of an entry of the side menu (kind "page", slot "nav" or "<module>:nav"); this is kind "${ep.kind}" on slot "${ep.slot}". Remove it, or use "tab.count" for a tab.` });
      } else if (ep.count.route?.includes(':')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['count', 'route'], message: `count.route "${ep.count.route ?? ''}" has a ":param", but a menu entry has no parameters to give it. Use a fixed route.` });
      }
    }
    if (ep.tab?.count !== undefined && ep.path !== undefined) {
      const own = paramsOfPath(ep.path);
      for (const param of paramsOfPath(ep.tab.count.route ?? '')) {
        if (!own.includes(param)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tab', 'count', 'route'], message: `tab.count.route "${ep.tab.count.route}" uses ":${param}" but the page "${ep.path}" has no such parameter (it has [${own.join(', ')}]).` });
        }
      }
    }
  })
  // `tab` makes a page a tab of the third level: a page of the module (slot `nav` or `route`) that has an address.
  .superRefine((ep, ctx) => {
    if (ep.tab === undefined) {
      return;
    }
    if (ep.kind !== 'page' || (ep.slot !== MENU_SLOT_LOCAL && ep.slot !== 'route')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tab'], message: `"tab" makes a page of this module a tab of the third level (kind "page", slot "nav" or "route"); this is kind "${ep.kind}" on slot "${ep.slot}". Remove it.` });
    } else if (ep.path === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tab'], message: '"tab" needs the page to have a "path": a tab links to a page by its address.' });
    }
  })
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
// zod 4 reports a key of a record that fails its schema as "Invalid key in record", without why: the keys of the records below are checked
// here, each problem under the path of its key and with its own message.
function checkedKeys(keyProblem: (key: string) => string | undefined) {
  return (record: Record<string, unknown>, ctx: z.RefinementCtx): void => {
    for (const key of Object.keys(record)) {
      const problem = keyProblem(key);
      if (problem !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: problem });
      }
    }
  };
}

const RequiresSchema = z
  .record(z.string(), z.string().min(1))
  .superRefine(checkedKeys((id) => (MODULE_ID_PATTERN.test(id) ? undefined : `module id must ${MODULE_ID_RULE}`)));

// What a module offers to others (decision 82). `types` is a path to its types-only file (a source path in
// the source manifest, `./types/index.d.ts` in the packaged one); each slot lists the `$type`s it accepts.
const ExposeSchema = z
  .object({
    types: z.string().min(1).optional(),
    slots: z
      .record(z.string(), z.object({ accepts: z.array(z.string().min(1)).min(1, 'accepts must list at least one $type') }).strict())
      .superRefine(
        checkedKeys((name) => {
          if (!SLOT_LOCAL_PATTERN.test(name)) {
            return `slot name must ${SLOT_LOCAL_RULE} (no ":", the module id is added as the prefix)`;
          }
          return name === MENU_SLOT_LOCAL
            ? `slot name "${MENU_SLOT_LOCAL}" is reserved: every module's side menu is "<id>:${MENU_SLOT_LOCAL}" and accepts pages from the modules that require it, no declaration needed`
            : undefined;
        }),
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

// The name the shell shows for the module (tab, side menu heading, dashboard shortcut). Absent means it is derived from
// the id ("billing-reports" -> "Billing reports"). Blank is rejected: it would give an empty tab.
const TitleSchema = z.string().trim().min(1, 'title must not be blank: give the module a display name, or remove the field to derive it from the id').optional();

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
  shared: z.record(z.string(), z.string().min(1)).default({}),
});

// Modules this one can do without: same shape as `requires`. A contribution to a slot of such a module is used when the module
// is loaded and its contract holds, and left inactive (with a warning, never silently) when it is not. Not part of the load
// order, of the cycle check or of the cascade: two modules may list each other here.
function checkOptionalRequires(manifest: { id: string; requires?: Record<string, string>; optionalRequires?: Record<string, string> }, ctx: z.RefinementCtx): void {
  for (const id of Object.keys(manifest.optionalRequires ?? {})) {
    if (manifest.requires?.[id] !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['optionalRequires', id], message: `"${id}" is in both "requires" and "optionalRequires": keep it in one. "requires" if the module cannot work without it, "optionalRequires" if it can.` });
    }
    if (id === manifest.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['optionalRequires', id], message: `a module cannot list itself in "optionalRequires": its own slots need no declaration.` });
    }
  }
}

// The pages that share a tab group are the tabs of one thing (a task, a job): on each of them the shell links the others, filling the
// ":params" of their address from the current page. So they must have the same parameters, be at least two, and not repeat a label.
function checkTabGroups(manifest: { id: string; extensionPoints: TabbedPoint[] }, ctx: z.RefinementCtx): void {
  const groups = new Map<string, Array<{ index: number; path: string; label: string }>>();
  manifest.extensionPoints.forEach((ep, index) => {
    if (ep.tab !== undefined && ep.path !== undefined) {
      groups.set(ep.tab.group, [...(groups.get(ep.tab.group) ?? []), { index, path: ep.path, label: ep.tab.label }]);
    }
  });
  for (const [group, members] of groups) {
    const at = (member: { index: number }): (string | number)[] => ['extensionPoints', member.index, 'tab'];
    const { providerId } = splitTabGroup(group);
    if (providerId === manifest.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at(members[0]!), message: `tab group "${group}" names this very module: use \`"group": "${splitTabGroup(group).name}"\` for the tabs of your own pages; "<moduleId>:<name>" is for joining the group of another module.` });
      continue;
    }
    // A page that joins the group of another module can be alone: the tabs are the other module's pages and this one.
    if (providerId === undefined && members.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at(members[0]!), message: `tab group "${group}" has one page ("${members[0]!.path}"): tabs need at least two. Add the other page(s) to the group, or remove "tab".` });
      continue;
    }
    const expected = paramsOfPath(members[0]!.path).join(',');
    for (const member of members.slice(1)) {
      if (paramsOfPath(member.path).join(',') !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at(member),
          message: `tab group "${group}": "${member.path}" has the parameters [${paramsOfPath(member.path).join(', ')}] but "${members[0]!.path}" has [${expected.split(',').filter(Boolean).join(', ')}]. The tabs of a group are pages of the same thing, so they take the same ":params"; use the same names.`,
        });
      }
    }
    const seen = new Set<string>();
    for (const member of members) {
      if (seen.has(member.label)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: at(member), message: `tab group "${group}" has two tabs labelled "${member.label}": give each tab its own label.` });
      }
      seen.add(member.label);
    }
  }
}

// The manifest a running app-core loads (what `package` writes into dist-module/).
export const ManifestSchema = z.object({
  // Must equal the id the module is registered under (decision 83); the loader refuses a mismatch.
  id: ModuleIdSchema,
  version: z.string().min(1),
  backendEntryPath: z.string().min(1),
  extensionPoints: z.array(ExtensionPointSchema).min(1),
  dslLib: DslLibSchema.optional(),
  requires: RequiresSchema.optional(),
  optionalRequires: RequiresSchema.optional(),
  expose: ExposeSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  showInNav: ShowInNavSchema,
  title: TitleSchema,
}).superRefine(checkOptionalRequires).superRefine(checkTabGroups);

// The manifest an author writes at the module root (decision 81). It never names what `package`
// produces: no version (stamped at package time), no backendEntryPath (src/backend/index.ts by
// convention), no dslLib entry/css (built from src/dsl-components). Unknown keys are rejected so an
// output-only key is reported instead of silently ignored.
export const SourceManifestSchema = z
  .object({
    id: ModuleIdSchema,
    extensionPoints: z.array(ExtensionPointSchema).min(1),
    dslLib: z.object({ shared: z.record(z.string(), z.string().min(1)).default({}) }).strict().optional(),
    requires: RequiresSchema.optional(),
    optionalRequires: RequiresSchema.optional(),
    expose: ExposeSchema.optional(),
    lifecycle: LifecycleSchema.optional(),
    showInNav: ShowInNavSchema,
    title: TitleSchema,
  })
  .strict()
  .superRefine(checkOptionalRequires)
  .superRefine(checkTabGroups);

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
