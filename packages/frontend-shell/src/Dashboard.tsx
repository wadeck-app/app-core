import React, { useEffect, useMemo, useState } from 'react';
import { AbDock, PageContent, PageSection, useAbTest } from '@wadeck-app/dsl-ui';
import { DashboardBar } from './DashboardBar.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import type { WidgetFrameVariant } from './WidgetFrame.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useDockTests } from './useDockTests.js';
import { useHiddenWidgets, useRefreshTick, useWidgetOrder, type RefreshInterval } from './useDashboardState.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

type GridWidth = 'fill' | 'wide' | 'medium' | 'narrow';
// How much of the page the dashboard takes. The class names are written out in full so that Tailwind finds them.
const WIDTH_CLASS: Record<GridWidth, string> = {
  fill: '',
  wide: 'mx-auto max-w-[1600px]',
  medium: 'mx-auto max-w-[1280px]',
  narrow: 'mx-auto max-w-[1024px]',
};

// Base slot: widget/dashboard -> rendered into a grid (frontend-shell.md "Base slots").
// Widgets use the same GenericPageRunner + fetcher path as pages (ModulePage.tsx)
// -- widget/page is a placement distinction only, not a capability tier, so a
// widget's view can declare $sources just like a page's.
export function Dashboard({ modules }: DashboardProps): React.ReactElement {
  const widgets: DashboardWidget[] = modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'widget' && ep.slot === 'dashboard')
      .map((ep, i) => ({ moduleId: m.id, moduleTitle: m.title ?? titleFromId(m.id), key: `${m.id}-${i}`, label: ep.label, rawYaml: ep.rawYaml, width: ep.width, height: ep.height })),
  );
  const moduleHref = useMemo(() => new Map(navModulesFor(modules).map((m) => [m.id, m.pages[0]?.routePath])), [modules]);

  const { hidden, hide, restoreAll } = useHiddenWidgets();
  const order = useWidgetOrder(widgets);
  const [interval, setIntervalChoice] = useState<RefreshInterval>('off');
  const { tick, refresh } = useRefreshTick(interval);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  useEffect(() => setRefreshedAt(Date.now()), [tick]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  // The widget being dragged and the one it is over.
  const [dragKey, setDragKey] = useState<string | undefined>(undefined);
  const [overKey, setOverKey] = useState<string | undefined>(undefined);

  // A/B tests open on the dashboard (see the A/B testing rule in the project CLAUDE.md).
  const frame = useAbTest<WidgetFrameVariant>({
    id: 'widget-frame',
    label: 'Widget frame',
    initial: 'datadog',
    options: {
      datadog: { label: 'Datadog', hint: 'Slim header: grip to drag, color dot, title, module name, and the tools (refresh, expand, menu) always visible.' },
      'datadog-compact': { label: 'Compact', hint: 'Denser: 32px header, tighter body; the module name only shows as a tooltip.' },
      'datadog-accent': { label: 'Accent', hint: 'A bar of the module color down the left edge and a faint wash of it in the header.' },
      'datadog-footer': { label: 'Footer', hint: 'Datadog + a footer: link to the module and when the widget was last refreshed.' },
      'datadog-logo': { label: 'Logo', hint: 'The module logo instead of the dot (says which module it is without the name).' },
    },
  });
  const width = useAbTest<GridWidth>({
    id: 'dashboard-width',
    label: 'Dashboard width',
    initial: 'fill',
    options: {
      fill: { label: 'Fill', hint: 'Today: the grid takes the whole width of the page.' },
      wide: { label: 'Wide', hint: 'At most 1600px, centered: keeps widgets from stretching on very wide screens.' },
      medium: { label: 'Medium', hint: 'At most 1280px, centered: three or four widgets per row on a laptop.' },
      narrow: { label: 'Narrow', hint: 'At most 1024px, centered: a reading column, two widgets per row.' },
    },
  });

  // In the one dock of the app-wide host when there is one, else in a dock of its own.
  const hosted = useDockTests([frame, width]);

  const visible = order.ordered.filter((w) => !hidden.has(w.key) && (filter === undefined || w.moduleId === filter));
  const visibleKeys = visible.map((w) => w.key);
  const filterOptions = [...new Set(widgets.map((w) => w.moduleId))].map((id) => ({
    id,
    title: widgets.find((w) => w.moduleId === id)?.moduleTitle ?? id,
    count: widgets.filter((w) => w.moduleId === id && !hidden.has(w.key)).length,
  }));
  const stopDrag = (): void => {
    setDragKey(undefined);
    setOverKey(undefined);
  };

  const cell = (w: DashboardWidget): React.ReactElement => (
    <WidgetCell
      key={w.key}
      widget={w}
      variant={frame.value}
      tick={tick}
      moduleHref={moduleHref.get(w.moduleId)}
      onHide={() => hide(w.key)}
      onMoveEarlier={visibleKeys.indexOf(w.key) > 0 ? () => order.step(w.key, -1, visibleKeys) : undefined}
      onMoveLater={visibleKeys.indexOf(w.key) < visibleKeys.length - 1 ? () => order.step(w.key, 1, visibleKeys) : undefined}
      drag={{
        dragging: dragKey === w.key,
        over: dragKey !== undefined && dragKey !== w.key && overKey === w.key,
        onStart: () => setDragKey(w.key),
        onEnd: stopDrag,
        // Only a widget of this dashboard being dragged counts (not a file or a link dragged over the page).
        onOver: () => dragKey !== undefined && setOverKey(w.key),
        onDrop: () => {
          if (dragKey !== undefined) {
            order.moveTo(dragKey, w.key);
          }
          stopDrag();
        },
      }}
    />
  );

  return (
    <>
      <PageContent
        sections={
          <PageSection title="Dashboard">
            <div className={WIDTH_CLASS[width.value]}>
              {widgets.length === 0 ? (
                <p className="text-muted">No widgets registered yet.</p>
              ) : (
                <>
                  <DashboardBar
                    refreshedAt={refreshedAt}
                    onRefresh={refresh}
                    hiddenCount={widgets.filter((w) => hidden.has(w.key)).length}
                    onRestore={restoreAll}
                    orderCustomized={order.customized}
                    onResetOrder={order.reset}
                    modules={filterOptions}
                    filter={filter}
                    onFilter={setFilter}
                    interval={interval}
                    onInterval={setIntervalChoice}
                  />
                  {visible.length === 0 ? (
                    <p className="text-muted">Every widget is hidden or filtered out.</p>
                  ) : (
                    <div className="grid grid-flow-dense grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">{visible.map(cell)}</div>
                  )}
                </>
              )}
            </div>
          </PageSection>
        }
      />
      {hosted ? null : <AbDock tests={[frame, width]} />}
    </>
  );
}
