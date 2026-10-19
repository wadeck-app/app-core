import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GripVertical } from 'lucide-react';
import { Dialog, RelativeDate } from '@wadeck-app/dsl-ui';
import { ModuleView } from './ModuleView.js';
import { ModuleLibGate } from './useModuleLibs.js';
import { WidgetFrame, type WidgetFrameVariant } from './WidgetFrame.js';
import { WidgetToolbar } from './WidgetToolbar.js';

export interface DashboardWidget {
  key: string;
  moduleId: string;
  moduleTitle: string;
  label: string | undefined;
  rawYaml: string;
  width: number | undefined;
  height: number | undefined;
}

// The grid has 1 column on a narrow screen, 2 from lg and 4 from xl; a widget wider than the columns available takes them all.
// The class names are written out in full so that Tailwind finds them.
const WIDTH_CLASS: Record<number, string> = {
  1: '',
  2: 'lg:col-span-2',
  3: 'lg:col-span-2 xl:col-span-3',
  4: 'lg:col-span-2 xl:col-span-4',
};
const widthClass = (width: number | undefined): string => WIDTH_CLASS[width ?? 1] ?? '';

// One cell is 9rem high and cells are 1rem apart (the grid gap): a widget N cells high is at least N cells and the gaps
// between them, and grows when its content needs more room. Without a height it is as tall as its content.
const CELL = '9rem';
const heightStyle = (height: number | undefined): React.CSSProperties | undefined =>
  height === undefined ? undefined : { minHeight: `calc(${height} * ${CELL} + ${height - 1} * 1rem)` };

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
  variant: WidgetFrameVariant;
  // Bumped by the dashboard to refresh every widget at once.
  tick: number;
  // Where the module's pages start; undefined when it has none.
  moduleHref: string | undefined;
  onHide: () => void;
  onMoveEarlier: (() => void) | undefined;
  onMoveLater: (() => void) | undefined;
  drag: CellDrag;
}

export function WidgetCell({ widget, variant, tick, moduleHref, onHide, onMoveEarlier, onMoveLater, drag }: WidgetCellProps): React.ReactElement {
  const navigate = useNavigate();
  const cellRef = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // When this widget last ran: it starts over on its own refresh and on the dashboard's.
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  useEffect(() => setRefreshedAt(Date.now()), [nonce, tick]);
  const title = widget.label ?? widget.moduleTitle;

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
  const footer = (
    <>
      {moduleHref === undefined ? (
        <span>{widget.moduleTitle}</span>
      ) : (
        <Link to={moduleHref} className="inline-flex items-center gap-1 hover:text-content hover:underline">
          {`Open ${widget.moduleTitle}`}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
      <span>
        Updated <RelativeDate date={refreshedAt} live tooltip />
      </span>
    </>
  );
  const view = (
    <ModuleLibGate moduleId={widget.moduleId}>
      <ModuleView key={`${nonce}-${tick}`} rawYaml={widget.rawYaml} />
    </ModuleLibGate>
  );

  return (
    <div
      ref={cellRef}
      className={`${widthClass(widget.width)} rounded-md transition-opacity ${drag.dragging ? 'opacity-40' : ''} ${drag.over ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      style={heightStyle(widget.height)}
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
      <WidgetFrame variant={variant} moduleId={widget.moduleId} moduleTitle={widget.moduleTitle} label={widget.label} bare handle={handle} toolbar={toolbar} footer={footer}>
        {view}
      </WidgetFrame>
      <Dialog title={title} open={expanded} onOpenChange={setExpanded} size="xl">
        {expanded ? view : null}
      </Dialog>
    </div>
  );
}
