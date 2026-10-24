import React, { useRef, useState } from 'react';
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

// What the dashboard gives each cell to let the user drag it to another place (native HTML drag and drop).
export interface CellDrag {
  // This cell is the one being dragged / the one the dragged cell is over.
  dragging: boolean;
  over: boolean;
  onStart: () => void;
  onEnd: () => void;
  onOver: () => void;
  onDrop: () => void;
}

export interface WidgetCellProps {
  widget: DashboardWidget;
  layout: CellLayout;
  // Bumped by the dashboard to refresh every widget at once.
  tick: number;
  // Where the module's pages start; undefined when it has none.
  moduleHref: string | undefined;
  onHide: () => void;
  onMoveEarlier: (() => void) | undefined;
  onMoveLater: (() => void) | undefined;
  drag: CellDrag;
}

export function WidgetCell({ widget, layout, tick, moduleHref, onHide, onMoveEarlier, onMoveLater, drag }: WidgetCellProps): React.ReactElement {
  const navigate = useNavigate();
  const cellRef = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const title = widget.label ?? widget.moduleTitle;
  const fit = useRowsToFit(cellRef, layout.gapPx);
  const rows = Math.max(layout.rows, fit.rows);
  const span = layout.autoWidth ? Math.min(Math.max(layout.span, fit.cols), layout.maxSpan) : layout.span;

  const handle = (
    <span
      draggable
      role="img"
      aria-label={`Drag ${title} to reorder`}
      title="Drag to reorder (or use the menu)"
      className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted hover:text-content active:cursor-grabbing"
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox starts a drag only when data is set; the whole widget, not just the grip, is the drag image.
        e.dataTransfer.setData('text/plain', widget.key);
        if (cellRef.current !== null) {
          e.dataTransfer.setDragImage(cellRef.current, 16, 16);
        }
        drag.onStart();
      }}
      onDragEnd={drag.onEnd}
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

  return (
    <div
      ref={cellRef}
      className={`rounded-md transition-opacity ${drag.dragging ? 'opacity-40' : ''} ${drag.over ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      style={{ gridColumn: `span ${span}`, gridRow: `span ${rows}` }}
      onDragOver={(e) => {
        // Only a dashboard widget being dragged may be dropped here.
        e.preventDefault();
        drag.onOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop();
      }}
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
