import React, { useEffect, useMemo, useState } from 'react';
import { PageContent, PageSection } from '@wadeck-app/dsl-ui';
import { DashboardBar } from './DashboardBar.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useHiddenWidgets, useRefreshTick, useWidgetOrder, type RefreshInterval } from './useDashboardState.js';
import { useGridColumns } from './useGridColumns.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// The dashboard takes 85% of the space beside the menu, centered (the page layout would cap it at 1152px: it is asked for
// the full width and the dashboard sets its own). It is a lattice of square cells of 100px, 16px apart, as many columns as
// fit. A widget asks for its size in cells (width x height in its manifest); without a width it takes 2 cells, and its
// height is at least what it asks for (1 row by default) and grows by whole rows to fit its content.
const SHARE = '85%';
const CELL_PX = 100;
const GAP_PX = 16;
const DEFAULT_WIDTH_CELLS = 2;

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

  const { ref: gridRef, columns: columnCount } = useGridColumns<HTMLDivElement>(CELL_PX, GAP_PX);

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

  // A widget N cells wide takes at most the columns that exist; M cells high is at least M rows.
  const layoutOf = (w: DashboardWidget) => ({
    span: Math.min(w.width ?? DEFAULT_WIDTH_CELLS, columnCount),
    rows: w.height ?? 1,
    gapPx: GAP_PX,
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
                    // Fixed-size cells do not fill the width: the lattice is centered in it.
                    style={{ gridTemplateColumns: `repeat(${columnCount}, ${CELL_PX}px)`, gridAutoRows: `${CELL_PX}px`, justifyContent: 'center', gap: GAP_PX }}
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
