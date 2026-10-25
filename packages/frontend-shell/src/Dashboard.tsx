import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageContent, PageSection } from '@wadeck-app/dsl-ui';
import { DashboardBar } from './DashboardBar.js';
import { DragGuides } from './DragGuides.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import { readingOrder, resolveLayout, rowsUsed, snapToCell, type LayoutItem, type Pin } from './dashboardLayout.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useHiddenWidgets, useRefreshTick, useWidgetLayout, type RefreshInterval } from './useDashboardState.js';
import { useGridColumns } from './useGridColumns.js';
import { useWidgetDrag, type WidgetDrag } from './useWidgetDrag.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// The dashboard takes 85% of the space beside the menu, centered (the page layout would cap it at 1152px: it is asked for
// the full width and the dashboard sets its own). It is a lattice of square cells of 100px, 16px apart, as many columns as
// fit. A widget asks for its size in cells (width x height in its manifest); without a width it takes 2 cells and
// more when its content is wider, and its height is at least what it asks for (1 row by default) and grows by whole rows to
// fit its content. The user drops a widget on any cell, empty cells above it included; only a widget in the way goes down
// (see dashboardLayout.ts). While one is held, the cells are drawn under the widgets and a target shows where it lands.
const SHARE = '85%';
const CELL_PX = 100;
const GAP_PX = 16;
const STRIDE_PX = CELL_PX + GAP_PX;
const DEFAULT_WIDTH_CELLS = 2;
// Rows drawn under the last widget while one is dragged, to drop below it.
const SPARE_ROWS = 3;

interface Size {
  span: number;
  rows: number;
}

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
  const arrangement = useWidgetLayout(widgets);
  const [interval, setIntervalChoice] = useState<RefreshInterval>('off');
  const { tick, refresh } = useRefreshTick(interval);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  useEffect(() => setRefreshedAt(Date.now()), [tick]);
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const { ref: gridRef, columns: columnCount } = useGridColumns<HTMLDivElement>(CELL_PX, GAP_PX);
  const latticeRef = useRef<HTMLDivElement>(null);

  // What each widget takes once its content is measured (the widget reports it); until then, what it asks for.
  const [sizes, setSizes] = useState<Readonly<Record<string, Size>>>({});
  const reportSize = useCallback(
    (key: string, span: number, rows: number): void =>
      setSizes((was) => (was[key]?.span === span && was[key]?.rows === rows ? was : { ...was, [key]: { span, rows } })),
    [],
  );

  const visibleWidgets = arrangement.ordered.filter((w) => !hidden.has(w.key) && (filter === undefined || w.moduleId === filter));
  const filterOptions = [...new Set(widgets.map((w) => w.moduleId))].map((id) => ({
    id,
    title: widgets.find((w) => w.moduleId === id)?.moduleTitle ?? id,
    count: widgets.filter((w) => w.moduleId === id && !hidden.has(w.key)).length,
  }));

  // A widget N cells wide takes at most the columns that exist; M cells high is at least M rows.
  const layoutOf = (w: DashboardWidget) => ({
    span: Math.min(w.width ?? DEFAULT_WIDTH_CELLS, columnCount),
    autoWidth: w.width === undefined,
    maxSpan: columnCount,
    rows: w.height ?? 1,
    gapPx: GAP_PX,
  });

  const items: LayoutItem[] = visibleWidgets.map((w) => {
    const asked = layoutOf(w);
    const saved = arrangement.positions[w.key];
    return { key: w.key, col: saved?.col, row: saved?.row, width: sizes[w.key]?.span ?? asked.span, height: sizes[w.key]?.rows ?? asked.rows };
  });

  // The widget held by the pointer, the cell its top left corner is over, and whether it is over the grid at all (dropped
  // outside, it goes back).
  const finishDrag = (done: WidgetDrag, completed: boolean): void => {
    const pin = pinOf(done);
    if (completed && pin !== undefined) {
      commit(pin);
    }
  };
  const { drag, start } = useWidgetDrag(finishDrag);

  // Pixels of the held widget from the top left of the lattice element, and where the first column starts (the tracks are
  // centered in the element).
  const geometry = (held: WidgetDrag): { left: number; top: number; trackLeft: number; inside: boolean } | undefined => {
    const lattice = latticeRef.current;
    if (lattice === null) {
      return undefined;
    }
    const box = lattice.getBoundingClientRect();
    const tracksWidth = columnCount * CELL_PX + (columnCount - 1) * GAP_PX;
    // The held widget is positioned inside the grid, so it counts in the height of the page: it is kept within the rows of the
    // grid, or the page would grow under it as the page scrolls under the pointer.
    return {
      left: Math.max(0, Math.min(held.x - held.grabX - box.left, box.width - STRIDE_PX)),
      top: Math.min(held.y - held.grabY - box.top, (gridRows - 1) * STRIDE_PX),
      trackLeft: Math.max(0, (lattice.clientWidth - tracksWidth) / 2),
      inside: held.x >= box.left && held.x <= box.right && held.y >= box.top - STRIDE_PX && held.y <= box.bottom + SPARE_ROWS * STRIDE_PX,
    };
  };
  const pinOf = (held: WidgetDrag): Pin | undefined => {
    const where = geometry(held);
    if (where === undefined || !where.inside) {
      return undefined;
    }
    const cell = snapToCell(where.left, where.top, where.trackLeft, CELL_PX, GAP_PX);
    return { key: held.key, col: cell.col, row: Math.min(cell.row, gridRows - 1) };
  };

  // The places the widgets have now. A widget nobody moved is where an automatic grid puts it, and stays there when another
  // one is dropped: only the widgets in the way move, so every widget is taken where it is before the dropped one is applied.
  const current = resolveLayout(items, columnCount);
  const settled = items.map((item) => ({ ...item, col: current.get(item.key)?.col, row: current.get(item.key)?.row }));
  // The grid has the rows of the widgets and a few spare ones under them to drop below the last; not more, or the grid would
  // grow under a widget held low and the page with it.
  const gridRows = rowsUsed(items, current) + SPARE_ROWS;
  // And, when one is held, the places they would have if it were dropped here.
  const pin = drag === undefined ? undefined : pinOf(drag);
  const dropLayout = pin === undefined ? undefined : resolveLayout(settled, columnCount, pin);
  const layout = dropLayout ?? current;
  const byKey = new Map(visibleWidgets.map((w) => [w.key, w]));
  const shown = readingOrder(layout).flatMap((key) => byKey.get(key) ?? []);

  // Remembers where every widget shown is once `pin` is dropped (the widgets hidden or filtered out keep their place).
  // `swapWith` takes the place the pinned widget leaves, instead of making room under it.
  function commit(held: Pin, swapWith?: { key: string; col: number; row: number }): void {
    const placed = swapWith === undefined ? settled : settled.map((item) => (item.key === swapWith.key ? { ...item, col: swapWith.col, row: swapWith.row } : item));
    const next = resolveLayout(placed, columnCount, held);
    arrangement.place(Object.fromEntries([...next.entries()]));
  }
  const move = (key: string, delta: -1 | 1): (() => void) | undefined => {
    const order = readingOrder(layout);
    const neighbour = order[order.indexOf(key) + delta];
    const where = neighbour === undefined ? undefined : layout.get(neighbour);
    const mine = layout.get(key);
    // The two swap places.
    return where === undefined || mine === undefined || neighbour === undefined ? undefined : () => commit({ key, col: where.col, row: where.row }, { key: neighbour, col: mine.col, row: mine.row });
  };

  const cell = (w: DashboardWidget): React.ReactElement => {
    const place = layout.get(w.key) ?? { col: 0, row: 0 };
    const size = items.find((item) => item.key === w.key);
    const where = drag?.key === w.key ? geometry(drag) : undefined;
    return (
      <WidgetCell
        key={w.key}
        widget={w}
        layout={layoutOf(w)}
        place={place}
        onSize={(span, rows) => reportSize(w.key, span, rows)}
        tick={tick}
        moduleHref={moduleHref.get(w.moduleId)}
        onHide={() => hide(w.key)}
        onMoveEarlier={move(w.key, -1)}
        onMoveLater={move(w.key, 1)}
        drag={{
          float:
            where === undefined || size === undefined
              ? undefined
              : {
                  left: where.left,
                  top: where.top,
                  width: size.width * CELL_PX + (size.width - 1) * GAP_PX,
                  height: size.height * CELL_PX + (size.height - 1) * GAP_PX,
                },
          onStart: (event, element) => start(w.key, event, element),
        }}
      />
    );
  };

  // The target: where the held widget lands, drawn over the widgets (it may sit on one that has not moved yet).
  const target = (): React.ReactElement | null => {
    if (drag === undefined) {
      return null;
    }
    const held = items.find((item) => item.key === drag.key);
    const where = geometry(drag);
    if (held === undefined || where === undefined) {
      return null;
    }
    const landing = dropLayout?.get(drag.key);
    const valid = landing !== undefined;
    // Outside the grid the target stays where the widget would be if it were let go on the nearest cell, in red.
    const spot = landing ?? snapToCell(where.left, where.top, where.trackLeft, CELL_PX, GAP_PX);
    const col = Math.max(0, Math.min(spot.col, columnCount - held.width));
    const row = Math.max(0, spot.row);
    return (
      <div
        aria-hidden="true"
        data-testid="drop-target"
        data-valid={valid}
        className={`pointer-events-none absolute z-20 rounded-md border-2 border-dashed ${valid ? 'border-primary bg-primary-light' : 'border-danger bg-danger-bg'} opacity-70`}
        style={{
          left: where.trackLeft + col * STRIDE_PX,
          top: row * STRIDE_PX,
          width: held.width * CELL_PX + (held.width - 1) * GAP_PX,
          height: held.height * CELL_PX + (held.height - 1) * GAP_PX,
        }}
      />
    );
  };

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
                  layoutCustomized={arrangement.customized}
                  onResetLayout={arrangement.reset}
                  modules={filterOptions}
                  filter={filter}
                  onFilter={setFilter}
                  interval={interval}
                  onInterval={setIntervalChoice}
                />
                {visibleWidgets.length === 0 ? (
                  <p className="text-muted">Every widget is hidden or filtered out.</p>
                ) : (
                  <div
                    ref={latticeRef}
                    // While a widget is held the others ignore the pointer (no tooltip of a chart, no hover under the held widget).
                    className={`relative grid ${drag === undefined ? '' : 'pointer-events-none select-none'}`}
                    // Fixed-size cells do not fill the width: the lattice is centered in it. While a widget is held the
                    // grid has spare rows under the last one, to drop below it.
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, ${CELL_PX}px)`,
                      gridAutoRows: `${CELL_PX}px`,
                      justifyContent: 'center',
                      gap: GAP_PX,
                      minHeight: drag === undefined ? undefined : gridRows * STRIDE_PX,
                    }}
                  >
                    {drag === undefined ? null : <DragGuides columns={columnCount} rows={gridRows} cellPx={CELL_PX} gapPx={GAP_PX} />}
                    {target()}
                    {shown.map(cell)}
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
