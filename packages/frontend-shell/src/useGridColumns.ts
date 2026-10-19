import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// How many columns of at least `minColumnPx` fit in the element (with `gapPx` between them), following its width as the
// window or the sidebar changes. Measured on the element itself, not on the window: a wide screen with a narrow
// dashboard gets few columns, and a widget wider than the columns available can be clamped to them.
export function useGridColumns<T extends HTMLElement>(minColumnPx: number, gapPx: number): { ref: RefObject<T | null>; columns: number } {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      console.warn('[dashboard] ResizeObserver is not available in this browser: the grid keeps the width measured at load.');
      return undefined;
    }
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Before the first measure (and when the element has no width yet) one column is the safe answer.
  const columns = width === undefined || width <= 0 ? 1 : Math.max(1, Math.floor((width + gapPx) / (minColumnPx + gapPx)));
  return { ref, columns };
}
