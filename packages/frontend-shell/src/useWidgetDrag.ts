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

// Moves a widget with the pointer (mouse, pen or finger). `onFinish` is called once, with `completed` false when the user
// gave up (Escape, or the pointer was taken away).
export function useWidgetDrag(onFinish: (drag: WidgetDrag, completed: boolean) => void): {
  drag: WidgetDrag | undefined;
  start: (key: string, event: { clientX: number; clientY: number; preventDefault: () => void }, cell: HTMLElement) => void;
} {
  const [drag, setDrag] = useState<WidgetDrag | undefined>(undefined);
  const latest = useRef<WidgetDrag | undefined>(undefined);
  const finish = useRef(onFinish);
  finish.current = onFinish;

  const start = useCallback((key: string, event: { clientX: number; clientY: number; preventDefault: () => void }, cell: HTMLElement): void => {
    // No text selection, no native drag image: the widget itself follows the pointer.
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const next = { key, x: event.clientX, y: event.clientY, grabX: event.clientX - box.left, grabY: event.clientY - box.top };
    latest.current = next;
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
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.cursor = cursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return { drag, start };
}
