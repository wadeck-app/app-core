import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

// The Modules page, written like the pages of the modules (see ShellPage): same components, data from the shell.
export const MODULES_YAML = `
$sources:
  view:
    url: GET shell:modules
$type: PageContent
sections:
  - $type: VerticalStack
    gap: gap-4
    items:
      - $type: PageHeader
        title: Modules
        subtitle: What is installed in this app-core, what each module needs, can do without and offers, and what is not as it should be. Read-only.
      - $type: HorizontalStack
        gap: gap-3
        items:
          - $type: StatTile
            label: Loaded
            value: $sources.view.loaded
          - $type: StatTile
            label: Failed
            value: $sources.view.failedCount
          - $type: StatTile
            label: With warnings
            value: $sources.view.warningCount
      - $type: Section
        $if: $sources.view.hasFailed
        title: Failed to load
        items:
          - $type: DataTable
            rows: $sources.view.failedRows
            columns:
              - { key: module, label: Module, mono: true, nowrap: true }
              - { key: cause, label: What happens next, badge: { Retried by itself: warning, Needs a fix: danger } }
              - { key: since, label: Since, format: datetime, dateStyle: short, nowrap: true }
              - { key: error, label: Why }
              - { key: source, label: Manifest, mono: true, truncate: true }
      - $type: Section
        $if: $sources.view.hasWarnings
        title: Warnings
        items:
          - $type: DataTable
            rows: $sources.view.warningRows
            columns:
              - { key: module, label: Module, mono: true, nowrap: true, href: '{href}' }
              - { key: warning, label: Warning }
      - $type: Section
        title: Installed modules
        items:
          - $type: DataTable
            rows: $sources.view.installedRows
            emptyMessage: No module is loaded.
            columns:
              - { key: title, label: Module, href: '{href}', nowrap: true }
              - { key: version, label: Version, mono: true, nowrap: true }
              - { key: needs, label: Needs }
              - { key: optional, label: Can do without }
              - { key: offers, label: Offers (slots) }
              - { key: neededBy, label: Needed by }
              - { key: brings, label: Brings, nowrap: true }
`;

export interface ModulesViewData {
  loaded: number;
  failedCount: number;
  warningCount: number;
  hasFailed: boolean;
  hasWarnings: boolean;
  failedRows: Array<{ module: string; cause: string; since: string; error: string; source: string }>;
  warningRows: Array<{ module: string; href: string; warning: string }>;
  installedRows: Array<{ title: string; href: string; version: string; needs: string; optional: string; offers: string; neededBy: string; brings: string }>;
}

const NOTHING = '—';

// How many components a module's bundle registered, or why that is not known: still loading, or failed to load.
export type ComponentCount = number | 'loading' | 'error' | undefined;

function components(count: ComponentCount): string {
  if (count === 'loading') return 'components (loading)';
  if (count === 'error') return 'components (failed to load)';
  return count === undefined ? 'components' : `${count} component${count === 1 ? '' : 's'}`;
}

function parts(module: LoadedModuleSummary, libCount: ComponentCount): string {
  const count = (kind: string): number => module.extensionPoints.filter((ep) => ep.kind === kind).length;
  const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;
  const others = module.extensionPoints.length - count('page') - count('widget');
  return (
    [count('page') > 0 ? plural(count('page'), 'page') : '', count('widget') > 0 ? plural(count('widget'), 'widget') : '', others > 0 ? `${others} other` : '', module.dslLib === undefined ? '' : components(libCount)]
      .filter(Boolean)
      .join(', ') || NOTHING
  );
}

// What the Modules page shows, from the list the server gave the shell.
export function modulesViewData(
  modules: readonly LoadedModuleSummary[],
  failed: readonly FailedModuleSummary[],
  componentCount: (moduleId: string) => ComponentCount = () => undefined,
): ModulesViewData {
  const installed = new Set(modules.map((m) => m.id));
  const needed = (id: string): string[] => modules.filter((m) => m.requires?.[id] !== undefined || m.optionalRequires?.[id] !== undefined).map((m) => m.id);
  const withWarnings = modules.filter((m) => (m.warnings ?? []).length > 0);
  const listed = (record: Record<string, string> | undefined): string =>
    Object.entries(record ?? {})
      .map(([id, range]) => `${id} ${range}${installed.has(id) ? '' : ' (not loaded)'}`)
      .join(', ') || NOTHING;

  return {
    loaded: modules.length,
    failedCount: failed.length,
    warningCount: withWarnings.length,
    hasFailed: failed.length > 0,
    hasWarnings: withWarnings.length > 0,
    failedRows: failed.map((f) => ({
      module: f.id,
      cause: f.cause === 'requirement' ? 'Retried by itself' : 'Needs a fix',
      since: f.failedAt,
      error: `${f.error}${installed.has(f.id) ? ' The previous version is still running.' : ''}`,
      source: f.source,
    })),
    warningRows: withWarnings.flatMap((m) => (m.warnings ?? []).map((warning) => ({ module: m.id, href: `/modules/${m.id}`, warning }))),
    installedRows: modules.map((m) => ({
      title: m.title ?? m.id,
      href: `/modules/${m.id}`,
      version: m.version,
      needs: listed(m.requires),
      optional: listed(m.optionalRequires),
      offers: (m.exposedSlots ?? []).map((slot) => `${m.id}:${slot}`).join(', ') || NOTHING,
      neededBy: needed(m.id).join(', ') || NOTHING,
      brings: parts(m, componentCount(m.id)),
    })),
  };
}
