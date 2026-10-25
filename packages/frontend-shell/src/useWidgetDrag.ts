import { useCallback, useEffect, useRef, useState } from 'react';

// A widget held by the pointer: where the pointer is, and where in the widget it took hold (so the widget follows the
// pointer without jumping).
export interface WidgetDrag {
  key: string;
  // Pointer position (viewport pixels).
  x: number;
  y: number;
  // Pointer offset from the top left corner of the widget when it took hold.
  grabX: number;
  grabY: number;
}

// Distance from the top or the bottom of the window at which holding a widget scrolls the page, and the fastest scroll.
const EDGE_PX = 80;
const MAX_SCROLL_PX = 18;

// How far to scroll per frame (negative: up) for a pointer at `y` in a window `height` high: nothing away from the edges,
// faster the closer to an edge (and the same beyond it).
export function edgeScrollSpeed(y: number, height: number): number {
  if (y < EDGE_PX) {
    return -Math.ceil((MAX_SCROLL_PX * (EDGE_PX - Math.max(y, 0))) / EDGE_PX);
  }
  if (y > height - EDGE_PX) {
    return Math.ceil((MAX_SCROLL_PX * (Math.min(y, height) - (height - EDGE_PX))) / EDGE_PX);
  }
  return 0;
}

// The closest ancestor that scrolls vertically (the page of the app shell is not always the window), or the window.
function scrollerOf(element: HTMLElement): HTMLElement | Window {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return window;
}

// Moves a widget with the pointer (mouse, pen or finger). `onFinish` is called once, with `completed` false when the user
// gave up (Escape, or the pointer was taken away).
export function useWidgetDrag(onFinish: (drag: WidgetDrag, completed: boolean) => void): {
  drag: WidgetDrag | undefined;
  start: (key: string, event: { clientX: number; clientY: number; preventDefault: () => void }, cell: HTMLElement) => void;
} {
  const [drag, setDrag] = useState<WidgetDrag | undefined>(undefined);
  const latest = useRef<WidgetDrag | undefined>(undefined);
  const scroller = useRef<HTMLElement | Window>(window);
  const finish = useRef(onFinish);
  finish.current = onFinish;

  const start = useCallback((key: string, event: { clientX: number; clientY: number; preventDefault: () => void }, cell: HTMLElement): void => {
    // No text selection, no native drag image: the widget itself follows the pointer.
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const next = { key, x: event.clientX, y: event.clientY, grabX: event.clientX - box.left, grabY: event.clientY - box.top };
    latest.current = next;
    scroller.current = scrollerOf(cell);
    setDrag(next);
  }, []);

  const active = drag !== undefined;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const end = (completed: boolean): void => {
      const done = latest.current;
      latest.current = undefined;
      setDrag(undefined);
      if (done !== undefined) {
        finish.current(done, completed);
      }
    };
    const onMove = (event: PointerEvent): void => {
      if (latest.current === undefined) {
        return;
      }
      latest.current = { ...latest.current, x: event.clientX, y: event.clientY };
      setDrag(latest.current);
    };
    const onUp = (): void => end(true);
    const onCancel = (): void => end(false);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        end(false);
      }
    };
    // The cursor stays a closed hand wherever the pointer goes, over anything.
    const cursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    // The page scrolls by itself while the widget is held near the top or the bottom, so a place out of sight can be reached.
    let frame = 0;
    const scrollStep = (): void => {
      const held = latest.current;
      const speed = held === undefined ? 0 : edgeScrollSpeed(held.y, window.innerHeight);
      if (held !== undefined && speed !== 0) {
        const target = scroller.current;
        if (target instanceof Window) {
          target.scrollBy(0, speed);
        } else {
          target.scrollTop += speed;
        }
        // The pointer has not moved but the grid under it has: the target is computed again.
        latest.current = { ...held };
        setDrag(latest.current);
      }
      frame = window.requestAnimationFrame(scrollStep);
    };
    frame = window.requestAnimationFrame(scrollStep);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.cursor = cursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return { drag, start };
}
