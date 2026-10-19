import React, { useEffect, useMemo, useState } from 'react';
import { AbDock, PageContent, PageSection, useAbTest } from '@wadeck-app/dsl-ui';
import { DashboardBar, type DashboardBarStyle, type DashboardChipStyle } from './DashboardBar.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useDockTests } from './useDockTests.js';
import { useHiddenWidgets, useRefreshTick, useWidgetOrder, type RefreshInterval } from './useDashboardState.js';
import { useGridColumns } from './useGridColumns.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// Options of the A/B tests below, as numbers the grid computes with.
// The page layout (PageContent) caps its content at 1152px unless told otherwise; the dashboard takes the full width it is
// given and caps itself, so these options are the only limit.
const MAX_WIDTH: Record<'today' | 'w1440' | 'w1920' | 'p85' | 'fill', string | undefined> = { today: '1152px', w1440: '1440px', w1920: '1920px', p85: '85%', fill: undefined };
const MIN_COLUMN: Record<'c220' | 'c260' | 'c320' | 'c400', number> = { c220: 220, c260: 260, c320: 320, c400: 400 };
const GAP_PX: Record<'tight' | 'normal' | 'roomy', number> = { tight: 8, normal: 16, roomy: 24 };
const ROW_REM: Record<'short' | 'normal' | 'tall', number> = { short: 7, normal: 9, tall: 12 };

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
  const share = useAbTest<keyof typeof MAX_WIDTH>({
    id: 'dashboard-width',
    label: 'Dashboard width',
    initial: 'today',
    options: {
      today: { label: '1152px', hint: 'Today: the page layout caps the dashboard at 1152px, whatever the screen.' },
      w1440: { label: '1440px', hint: 'Up to 1440px, centered: the same on a laptop, more room on a big screen.' },
      w1920: { label: '1920px', hint: 'Up to 1920px, centered: five or six columns on a 1440p screen.' },
      p85: { label: '85%', hint: 'Takes 85% of the space beside the menu, centered, whatever the screen.' },
      fill: { label: 'Fill', hint: 'The whole space beside the menu, edge to edge.' },
    },
  });
  const columns = useAbTest<keyof typeof MIN_COLUMN>({
    id: 'dashboard-columns',
    label: 'Columns',
    initial: 'c260',
    options: {
      c220: { label: '220px', hint: 'Columns at least 220px wide: the most columns, small widgets.' },
      c260: { label: '260px', hint: 'Columns at least 260px wide (about today).' },
      c320: { label: '320px', hint: 'Columns at least 320px wide: fewer, roomier widgets.' },
      c400: { label: '400px', hint: 'Columns at least 400px wide: two or three big widgets per row.' },
    },
  });
  const gap = useAbTest<keyof typeof GAP_PX>({
    id: 'dashboard-gap',
    label: 'Gap',
    initial: 'normal',
    options: {
      tight: { label: 'Tight', hint: '8px between widgets: more on screen, a denser look.' },
      normal: { label: 'Normal', hint: '16px between widgets (today).' },
      roomy: { label: 'Roomy', hint: '24px between widgets: airy, each widget stands on its own.' },
    },
  });
  const row = useAbTest<keyof typeof ROW_REM>({
    id: 'dashboard-row',
    label: 'Cell height',
    initial: 'normal',
    options: {
      short: { label: '7rem', hint: 'A cell is 7rem high: a widget of height 2 is 14rem and a gap.' },
      normal: { label: '9rem', hint: 'A cell is 9rem high (today).' },
      tall: { label: '12rem', hint: 'A cell is 12rem high: big widgets get a lot of room.' },
    },
  });
  const barStyle = useAbTest<DashboardBarStyle>({
    id: 'dashboard-bar',
    label: 'Bar',
    initial: 'inline',
    options: {
      inline: { label: 'Inline', hint: 'Today: the bar scrolls away with the page.' },
      sticky: { label: 'Sticky', hint: 'The bar stays at the top while the widgets scroll under it (blurred background).' },
      segmented: { label: 'Segmented', hint: 'The module filter is one connected control instead of separate pills.' },
    },
  });
  const chipStyle = useAbTest<DashboardChipStyle>({
    id: 'dashboard-chips',
    label: 'Filter chips',
    initial: 'plain',
    options: {
      plain: { label: 'Plain', hint: 'The module name and its count.' },
      dots: { label: 'Dots', hint: 'A dot in the color of the module before its name, like in the widget header.' },
    },
  });
  const tests = [share, columns, gap, row, barStyle, chipStyle];
  // In the one dock of the app-wide host when there is one, else in a dock of its own.
  const hosted = useDockTests(tests);

  const gapPx = GAP_PX[gap.value];
  const { ref: gridRef, columns: columnCount } = useGridColumns<HTMLDivElement>(MIN_COLUMN[columns.value], gapPx);

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

  // A widget N columns wide takes at most the columns that exist; N cells high is N rows of the cell height and the gaps.
  const layoutOf = (w: DashboardWidget) => ({
    span: Math.min(w.width ?? 1, columnCount),
    minHeight: w.height === undefined ? undefined : `calc(${w.height} * ${ROW_REM[row.value]}rem + ${w.height - 1} * ${gapPx}px)`,
  });

  const cell = (w: DashboardWidget): React.ReactElement => (
    <WidgetCell
      key={w.key}
      widget={w}
      layout={layoutOf(w)}
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
        maxWidth="full"
        sections={
          <PageSection title="Dashboard">
            {/* The section around it is a flex column: without w-full, mx-auto would shrink this to its content. */}
            <div ref={gridRef} className="mx-auto w-full" style={{ maxWidth: MAX_WIDTH[share.value] }}>
              {widgets.length === 0 ? (
                <p className="text-muted">No widgets registered yet.</p>
              ) : (
                <>
                  <DashboardBar
                    barStyle={barStyle.value}
                    chipStyle={chipStyle.value}
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
                    <div className="grid grid-flow-dense" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, gap: gapPx }}>
                      {visible.map(cell)}
                    </div>
                  )}
                </>
              )}
            </div>
          </PageSection>
        }
      />
      {hosted ? null : <AbDock tests={tests} />}
    </>
  );
}
