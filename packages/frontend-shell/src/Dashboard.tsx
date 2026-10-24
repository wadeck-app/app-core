import React, { useEffect, useMemo, useState } from 'react';
import { PageContent, PageSection, useAbTest } from '@wadeck-app/dsl-ui';
import { DashboardBar } from './DashboardBar.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useHiddenWidgets, useRefreshTick, useWidgetOrder, type RefreshInterval } from './useDashboardState.js';
import { useDockTests } from './useDockTests.js';
import { useGridColumns } from './useGridColumns.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// The dashboard takes 85% of the space beside the menu, centered (the page layout would cap it at 1152px: it is asked for
// the full width and the dashboard sets its own). Columns are at least 260px wide, 16px apart (both open to A/B tests); a widget N cells high is
// at least N cells of 9rem and the gaps between them.
const SHARE = '85%';
const MIN_COLUMN_PX = 260;
const CELL_REM = 9;

// Base slot: widget/dashboard -> rendered into a grid (frontend-shell.md "Base slots").
// Widgets use the same GenericPageRunner + fetcher path as pages (ModulePage.tsx)
// -- widget/page is a placement distinction only, not a capability tier, so a
// widget's view can declare $sources just like a page's.
type GridMode = 'flow' | 'cells' | 'grow' | 'sq100' | 'sq150' | 'sq200';
type GapMode = 'g8' | 'g16' | 'g24';

// The square-cell modes: a lattice of cells of this many pixels (Datadog style). A widget asks for its size in these cells;
// the sizes the manifests give today (1 to 4) were counted in columns of 260px and rows of 9rem, so for this prototype a
// declared width counts double (2 cells for a "1") and a declared height is rows as it was. Without a width, 2 cells; without
// a height, as many rows as the content needs.
const SQUARE_PX: Partial<Record<GridMode, number>> = { sq100: 100, sq150: 150, sq200: 200 };
const SQUARE_DEFAULT_WIDTH = 2;
const GAP_PX_BY_MODE: Record<GapMode, number> = { g8: 8, g16: 16, g24: 24 };

export function Dashboard({ modules }: DashboardProps): React.ReactElement {
  // Open A/B test: how a widget's size is asked for and kept.
  const gridTest = useAbTest<GridMode>({
    id: 'dashboard-grid',
    label: 'Dashboard grid',
    initial: 'flow',
    options: {
      flow: { label: 'Flow', hint: 'Today: width in columns, height is a minimum, rows follow the tallest widget.' },
      cells: { label: 'Cells', hint: 'A lattice of 9rem cells: a widget takes exactly width x height cells (1 x 1 when it says nothing); a longer content scrolls inside.' },
      grow: { label: 'Cells, grow', hint: 'The same lattice, but a widget whose content needs more room than its cells takes more whole cells.' },
      sq100: { label: 'Square 100', hint: 'Square cells of 100x100 px, as many columns as fit; a widget asks for width x height cells (2 wide by default) and grows to fit its content.' },
      sq150: { label: 'Square 150', hint: 'The same with cells of 150x150 px.' },
      sq200: { label: 'Square 200', hint: 'The same with cells of 200x200 px.' },
    },
  });
  const gapTest = useAbTest<GapMode>({
    id: 'dashboard-gap',
    label: 'Dashboard gap',
    initial: 'g16',
    options: {
      g8: { label: '8 px', hint: 'Tight, like Datadog.' },
      g16: { label: '16 px', hint: 'Today.' },
      g24: { label: '24 px', hint: 'Airy.' },
    },
  });
  useDockTests([gridTest, gapTest]);
  const gridMode = gridTest.value;
  const gapPx = GAP_PX_BY_MODE[gapTest.value];
  const squarePx = SQUARE_PX[gridMode];
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

  const { ref: gridRef, columns: columnCount } = useGridColumns<HTMLDivElement>(squarePx ?? MIN_COLUMN_PX, gapPx);

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
  const layoutOf = (w: DashboardWidget) => {
    if (squarePx !== undefined) {
      const span = Math.min(w.width === undefined ? SQUARE_DEFAULT_WIDTH : w.width * 2, columnCount);
      // No height asked: 1 row, and the cell grows with the content (rows is a minimum).
      return { span, minHeight: undefined, rows: w.height ?? 1, overflow: 'grow' as const, gapPx };
    }
    const span = Math.min(w.width ?? 1, columnCount);
    if (gridMode !== 'flow') {
      return { span, minHeight: undefined, rows: w.height ?? 1, overflow: gridMode === 'grow' ? ('grow' as const) : ('scroll' as const), gapPx };
    }
    return { span, minHeight: w.height === undefined ? undefined : `calc(${w.height} * ${CELL_REM}rem + ${w.height - 1} * ${gapPx}px)` };
  };

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
    <PageContent
      maxWidth="full"
      sections={
        <PageSection title="Dashboard">
          {/* The section around it is a flex column: without w-full, mx-auto would shrink this to its content. */}
          <div ref={gridRef} className="mx-auto w-full" style={{ maxWidth: SHARE }}>
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
                  <div
                    className="grid grid-flow-dense"
                    style={{
                      gridTemplateColumns: squarePx === undefined ? `repeat(${columnCount}, minmax(0, 1fr))` : `repeat(${columnCount}, ${squarePx}px)`,
                      gridAutoRows: squarePx !== undefined ? `${squarePx}px` : gridMode === 'flow' ? undefined : `${CELL_REM}rem`,
                      // Fixed-size cells do not fill the width: the lattice is centered in it.
                      justifyContent: squarePx === undefined ? undefined : 'center',
                      gap: gapPx,
                    }}
                  >
                    {visible.map(cell)}
                  </div>
                )}
              </>
            )}
          </div>
        </PageSection>
      }
    />
  );
}
