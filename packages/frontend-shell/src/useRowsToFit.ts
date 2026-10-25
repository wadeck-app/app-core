import { useLayoutEffect, useState, type RefObject } from 'react';

// How many grid rows or columns (cells of `cellPx` with `gapPx` between them) it takes to show `contentPx` of content.
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
export function useRowsToFit(cell: RefObject<HTMLElement | null>, gapPx: number): { rows: number; cols: number } {
  const [needed, setNeeded] = useState(1);
  // Columns only ever grow: once widened, the content fits and no longer overflows, which would take the demand back and
  // bring the overflow again.
  const [neededCols, setNeededCols] = useState(1);

  useLayoutEffect(() => {
    const element = cell.current;
    const frame = element?.firstElementChild;
    const article = frame?.querySelector('[role="article"]');
    const grid = element?.parentElement;
    if (!element || !grid || !(frame instanceof HTMLElement) || !(article instanceof HTMLElement)) {
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
      // The article stretches to the room of the tile (so a widget can fill it): its natural height, the one the content
      // needs, is read with the stretch released for a moment (no paint in between).
      const stretch = article.style.flex;
      article.style.flex = 'none';
      const naturalHeight = article.offsetHeight;
      article.style.flex = stretch;
      setNeeded(rowsToFit(chrome + naturalHeight, cellPx, gapPx));
      // A content wider than the tile (a row of figures cut at the border, text that cannot wrap): the columns it needs.
      if (article.scrollWidth > article.clientWidth + 1) {
        const bodyPaddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const chromeX = frame.offsetWidth - frame.clientWidth + bodyPaddingX;
        setNeededCols((was) => Math.max(was, rowsToFit(chromeX + article.scrollWidth, cellPx, gapPx)));
      }
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
    // The article keeps the size of the tile while its content shrinks, so its size says nothing then: a change of the
    // content itself asks for a new measure.
    const mutations = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(measure);
    mutations?.observe(article, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations?.disconnect();
    };
  }, [cell, gapPx]);

  return { rows: needed, cols: neededCols };
}
