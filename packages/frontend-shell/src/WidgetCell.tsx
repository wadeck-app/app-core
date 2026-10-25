import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GripVertical } from 'lucide-react';
import { Dialog } from '@wadeck-app/dsl-ui';
import { ModuleView } from './ModuleView.js';
import { ModuleLibGate } from './useModuleLibs.js';
import { WidgetFrame } from './WidgetFrame.js';
import { WidgetToolbar } from './WidgetToolbar.js';
import { useRowsToFit } from './useRowsToFit.js';

export interface DashboardWidget {
  key: string;
  moduleId: string;
  moduleTitle: string;
  label: string | undefined;
  rawYaml: string;
  width: number | undefined;
  height: number | undefined;
}

// Where the dashboard puts the cell in its grid.
export interface CellLayout {
  // Columns the cell takes (already limited to the columns that exist).
  span: number;
  // Rows the cell takes at least; it takes more whole rows when its content needs more room.
  rows: number;
  // The cell may take more columns when its content is wider than its tile, up to `maxSpan`: only when the manifest did
  // not say a width (`autoWidth`), since a declared width is the module's choice.
  autoWidth: boolean;
  maxSpan: number;
  // Space between two cells, to compute how many a content needs.
  gapPx: number;
}

// Where the dashboard puts the cell: its top left cell in the grid.
export interface CellPlace {
  col: number;
  row: number;
}

// What the dashboard gives each cell to let the user drag it anywhere in the grid (pointer events).
export interface CellDrag {
  // The cell is held by the pointer: it then floats at `float` (pixels from the top left of the grid), above the others.
  float: { left: number; top: number; width: number; height: number } | undefined;
  // The grip took hold of the cell.
  onStart: (event: React.PointerEvent<HTMLElement>, cell: HTMLElement) => void;
}

export interface WidgetCellProps {
  widget: DashboardWidget;
  layout: CellLayout;
  place: CellPlace;
  // The columns and rows the cell takes, once its content is measured, so the dashboard can place the others around it.
  onSize: (span: number, rows: number) => void;
  // Bumped by the dashboard to refresh every widget at once.
  tick: number;
  // Where the module's pages start; undefined when it has none.
  moduleHref: string | undefined;
  onHide: () => void;
  onMoveEarlier: (() => void) | undefined;
  onMoveLater: (() => void) | undefined;
  drag: CellDrag;
}

export function WidgetCell({ widget, layout, place, onSize, tick, moduleHref, onHide, onMoveEarlier, onMoveLater, drag }: WidgetCellProps): React.ReactElement {
  const navigate = useNavigate();
  const cellRef = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const title = widget.label ?? widget.moduleTitle;
  const fit = useRowsToFit(cellRef, layout.gapPx);
  const rows = Math.max(layout.rows, fit.rows);
  const span = layout.autoWidth ? Math.min(Math.max(layout.span, fit.cols), layout.maxSpan) : layout.span;
  useEffect(() => onSize(span, rows), [onSize, span, rows]);

  const handle = (
    <span
      role="img"
      aria-label={`Drag ${title} to move`}
      title="Drag to move anywhere in the grid (or use the menu)"
      // touch-none: a finger on the grip moves the widget instead of scrolling the page.
      className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted hover:text-content active:cursor-grabbing"
      onPointerDown={(e) => {
        // Only the main button (or a finger / pen).
        if (e.button === 0 && cellRef.current !== null) {
          drag.onStart(e, cellRef.current);
        }
      }}
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </span>
  );
  const toolbar = (
    <WidgetToolbar
      widgetTitle={title}
      moduleTitle={widget.moduleTitle}
      onRefresh={() => setNonce((n) => n + 1)}
      onExpand={() => setExpanded(true)}
      onHide={onHide}
      onOpenModule={moduleHref === undefined ? undefined : () => navigate(moduleHref)}
      onMoveEarlier={onMoveEarlier}
      onMoveLater={onMoveLater}
    />
  );
  const view = (
    <ModuleLibGate moduleId={widget.moduleId}>
      <ModuleView key={`${nonce}-${tick}`} rawYaml={widget.rawYaml} />
    </ModuleLibGate>
  );

  const float = drag.float;
  return (
    <div
      ref={cellRef}
      // z-[1]: above the guides drawn under the widgets while one is dragged. The held widget floats above everything and
      // lets the pointer through.
      className={`relative rounded-md ${float === undefined ? 'z-[1]' : 'pointer-events-none z-30 cursor-grabbing opacity-90 shadow-2xl ring-2 ring-primary'}`}
      style={
        float === undefined
          ? { gridColumn: `${place.col + 1} / span ${span}`, gridRow: `${place.row + 1} / span ${rows}` }
          : { position: 'absolute', left: float.left, top: float.top, width: float.width, height: float.height }
      }
    >
      <WidgetFrame moduleTitle={widget.moduleTitle} label={widget.label} bare handle={handle} toolbar={toolbar}>
        {view}
      </WidgetFrame>
      <Dialog title={title} open={expanded} onOpenChange={setExpanded} size="xl">
        {expanded ? view : null}
      </Dialog>
    </div>
  );
}
