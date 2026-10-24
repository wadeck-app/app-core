import { useLayoutEffect, useState, type RefObject } from 'react';

// How many grid rows (cells of `cellPx` with `gapPx` between them) it takes to show `contentPx` of content.
export function rowsToFit(contentPx: number, cellPx: number, gapPx: number): number {
  if (contentPx <= 0 || cellPx <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil((contentPx + gapPx) / (cellPx + gapPx)));
}

// For a dashboard widget that has no room to scroll: the number of rows its content needs. The cell is a grid item of
// fixed-height rows (`grid-auto-rows` of the grid it sits in, read from there: the cell's own height depends on the rows
// this computes), so its size says nothing about the content; what is measured is the widget's own content (the article
// in the tile) plus what the tile adds around it (header, border, padding), and again whenever that content changes size
// (a list loads or grows, a chart redraws) or the grid is laid out.
export function useRowsToFit(cell: RefObject<HTMLElement | null>, enabled: boolean, gapPx: number): number {
  const [needed, setNeeded] = useState(1);

  useLayoutEffect(() => {
    const element = cell.current;
    const frame = element?.firstElementChild;
    const article = frame?.querySelector('[role="article"]');
    const grid = element?.parentElement;
    if (!enabled || !element || !grid || !(frame instanceof HTMLElement) || !(article instanceof HTMLElement)) {
      return undefined;
    }
    const body = article.parentElement;
    if (body === null) {
      return undefined;
    }
    const measure = (): void => {
      // "144px": the grid resolves its row height to pixels.
      const cellPx = parseFloat(getComputedStyle(grid).gridAutoRows);
      if (Number.isNaN(cellPx)) {
        return;
      }
      const style = getComputedStyle(body);
      const bodyPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      // What the tile adds around the content: its header, its borders and the padding of the body. (Not the tile's own
      // height minus the body's: a body whose content overflows the tile is as tall as the content, not as the tile.)
      const header = frame.querySelector('header');
      const borders = frame.offsetHeight - frame.clientHeight;
      const chrome = (header?.offsetHeight ?? 0) + borders + bodyPadding;
      setNeeded(rowsToFit(chrome + article.offsetHeight, cellPx, gapPx));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      console.warn('[dashboard] ResizeObserver is not available in this browser: widgets keep the height measured at load.');
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(article);
    // And the grid: at mount it can still have no layout, and nothing in the content changes when it gets one.
    observer.observe(grid);
    return () => observer.disconnect();
  }, [cell, enabled, gapPx]);

  return needed;
}
