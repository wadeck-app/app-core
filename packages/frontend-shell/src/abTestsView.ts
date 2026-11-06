import { placeOf } from './abTestPlaces.js';
import type { SeenTests } from './abTestsSeen.js';
import type { LoadedModuleSummary } from './types.js';
import type { AbTestInventory } from './useAbTestInventory.js';

// The A/B tests page, written like the pages of the modules (see ShellPage): same components, data from the shell.
export const AB_TESTS_YAML = `
$sources:
  view:
    url: GET shell:abTests
$type: PageContent
sections:
  - $type: VerticalStack
    gap: gap-4
    items:
      - $type: PageHeader
        title: A/B tests
        subtitle: The tests the installed modules declare, over all their pages, and where to go to see them. The dock (bottom of the page) shows the ones of the page you are on.
      - $type: HorizontalStack
        gap: gap-3
        items:
          - $type: StatTile
            label: Declared
            value: $sources.view.total
          - $type: StatTile
            label: In views (exact)
            value: $sources.view.exact
          - $type: StatTile
            label: In code (estimated)
            value: $sources.view.estimated
      - $type: Section
        $if: $sources.view.dockOff
        title: The dock is off
        items:
          - $type: Markdown
            text: $sources.view.dockOffText
      - $type: Section
        $if: $sources.view.hasUnreadable
        title: Modules that could not be read
        items:
          - $type: DataTable
            rows: $sources.view.unreadableRows
            columns:
              - { key: module, label: Module, mono: true, nowrap: true }
              - { key: reason, label: Why their code tests are not counted }
      - $type: Section
        title: Declared in views
        items:
          - $type: DataTable
            rows: $sources.view.viewRows
            emptyMessage: No view declares a test.
            columns:
              - { key: label, label: Test, nowrap: true }
              - { key: id, label: Id, mono: true, nowrap: true }
              - { key: module, label: Module, mono: true, nowrap: true }
              - { key: where, label: Where it is, href: '{href}' }
              - { key: note, label: Note }
              - { key: seen, label: Seen in this browser, mono: true }
      - $type: Section
        title: Written in module code
        items:
          - $type: DataTable
            rows: $sources.view.codeRows
            emptyMessage: No module ships a test in its code.
            columns:
              - { key: label, label: Test }
              - { key: module, label: Module, mono: true, nowrap: true }
              - { key: seen, label: Seen in this browser, mono: true }
      - $type: Section
        $if: $sources.view.hasUse
        title: Pages that probably show them
        items:
          - $type: Markdown
            text: The code does not say which page a test is on. These pages use a component of the module; once you have visited one with the dock on, the test is listed above with its exact address.
          - $type: DataTable
            rows: $sources.view.useRows
            columns:
              - { key: module, label: Module, mono: true, nowrap: true }
              - { key: where, label: Page, href: '{href}' }
              - { key: note, label: Note }
      - $type: Section
        $if: $sources.view.hasUnmatched
        title: Seen, but not found by the scan
        items:
          - $type: Markdown
            text: The dock showed these and the count above does not include them (a module of another version, or code the scan cannot read).
          - $type: DataTable
            rows: $sources.view.unmatchedRows
            columns:
              - { key: label, label: Test }
              - { key: id, label: Id, mono: true, nowrap: true }
              - { key: seen, label: Seen in this browser, mono: true }
`;

export interface AbTestsViewData {
  total: number;
  exact: number;
  estimated: number;
  dockOff: boolean;
  dockOffText: string;
  hasUnreadable: boolean;
  hasUse: boolean;
  hasUnmatched: boolean;
  unreadableRows: Array<{ module: string; reason: string }>;
  viewRows: Array<{ label: string; id: string; module: string; where: string; href: string; note: string; seen: string }>;
  codeRows: Array<{ label: string; module: string; seen: string }>;
  useRows: Array<{ module: string; where: string; href: string; note: string }>;
  unmatchedRows: Array<{ label: string; id: string; seen: string }>;
}

const NOT_SEEN = 'not seen yet';
const seenText = (paths: readonly string[] | undefined): string => (paths === undefined || paths.length === 0 ? NOT_SEEN : paths.join(', '));

const DOCK_OFF_TEXT =
  'The tests show only their reference variant and nothing is noted as seen. Start the server with `app-core-cli serve --ab-tests` (or `dev --ab-tests`), or use the dev server.';

export function abTestsViewData(inventory: AbTestInventory, modules: readonly LoadedModuleSummary[], seen: SeenTests, dockOn: boolean): AbTestsViewData {
  const viewIds = new Set(inventory.views.map((v) => v.id));
  const codeLabels = new Set(inventory.components.map((c) => c.label).filter((l): l is string => l !== undefined));
  const unmatched = Object.entries(seen).filter(([id, test]) => !viewIds.has(id) && !codeLabels.has(test.label));
  const useRows = Object.entries(inventory.componentUse).flatMap(([moduleId, points]) =>
    points.map((point) => {
      const place = placeOf(modules, point);
      return { module: moduleId, where: place.text, href: place.href, note: place.note ?? '' };
    }),
  );

  return {
    total: inventory.total,
    exact: inventory.exact,
    estimated: inventory.estimated,
    dockOff: !dockOn,
    dockOffText: DOCK_OFF_TEXT,
    hasUnreadable: inventory.unreadable.length > 0,
    hasUse: useRows.length > 0,
    hasUnmatched: unmatched.length > 0,
    unreadableRows: inventory.unreadable.map((u) => ({ module: u.moduleId, reason: u.reason })),
    viewRows: inventory.views.map((test) => {
      const place = placeOf(modules, test.point);
      return { label: test.label ?? test.id, id: test.id, module: test.moduleId, where: place.text, href: place.href, note: place.note ?? '', seen: seenText(seen[test.id]?.paths) };
    }),
    codeRows: inventory.components.map((test) => ({
      label: test.label ?? '(label built by the code)',
      module: test.moduleId,
      seen: test.label === undefined ? NOT_SEEN : seenText(Object.values(seen).find((s) => s.label === test.label)?.paths),
    })),
    useRows,
    unmatchedRows: unmatched.map(([id, test]) => ({ label: test.label, id, seen: seenText(test.paths) })),
  };
}
