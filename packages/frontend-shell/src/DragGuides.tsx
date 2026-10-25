import React from 'react';

export type GuideStyle = 'cells' | 'dots' | 'none';

export interface DragGuidesProps {
  style: GuideStyle;
  columns: number;
  rows: number;
  cellPx: number;
  gapPx: number;
}

// The lattice drawn under the widgets while one is dragged, so the cells it can be dropped on can be seen. It has the
// template of the dashboard grid, and ignores the pointer.
export function DragGuides({ style, columns, rows, cellPx, gapPx }: DragGuidesProps): React.ReactElement | null {
  if (style === 'none') {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      data-testid="drag-guides"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 grid"
      style={{ gridTemplateColumns: `repeat(${columns}, ${cellPx}px)`, gridAutoRows: `${cellPx}px`, justifyContent: 'center', gap: gapPx }}
    >
      {Array.from({ length: columns * rows }, (_, i) =>
        style === 'cells' ? (
          <div key={i} className="rounded-md border border-dashed border-border bg-bg-secondary" />
        ) : (
          <div key={i} className="flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-muted" />
          </div>
        ),
      )}
    </div>
  );
}
