import { useCallback, useEffect, useState } from 'react';

const HIDDEN_KEY = 'app-core.dashboard.hidden';
const ORDER_KEY = 'app-core.dashboard.order';
const POSITIONS_KEY = 'app-core.dashboard.layout';

function readKeys(storageKey: string, consequence: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch (err) {
    // A broken value or a blocked storage must not break the dashboard, but the user has to know why the choice is gone.
    console.warn(`[dashboard] cannot read "${storageKey}" from localStorage: ${String(err)}. ${consequence}`);
    return [];
  }
}

// A list of widget keys kept in this browser (localStorage) so a choice survives a reload.
function useStoredKeys(storageKey: string, readConsequence: string, writeConsequence: string): [string[], (next: string[]) => void] {
  const [keys, setKeys] = useState<string[]>(() => readKeys(storageKey, readConsequence));
  const write = useCallback(
    (next: string[]) => {
      setKeys(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (err) {
        console.warn(`[dashboard] cannot save "${storageKey}" to localStorage: ${String(err)}. ${writeConsequence}`);
      }
    },
    [storageKey, writeConsequence],
  );
  return [keys, write];
}

// The widgets the user hid.
export function useHiddenWidgets(): { hidden: ReadonlySet<string>; hide: (key: string) => void; restoreAll: () => void } {
  const [keys, write] = useStoredKeys(HIDDEN_KEY, 'Showing every widget.', 'They come back after a reload.');
  const hide = useCallback((key: string) => write(keys.includes(key) ? keys : [...keys, key]), [keys, write]);
  const restoreAll = useCallback(() => write([]), [write]);
  return { hidden: new Set(keys), hide, restoreAll };
}

export interface WidgetLayoutState<T extends { key: string }> {
  // Every widget, in the order of the list the user saved before widgets could be placed anywhere (new widgets, unknown to it,
  // come last in their natural order). Widgets nobody placed fill the grid in this order.
  ordered: T[];
  // Where the user put widgets (cells from the top left of the grid), by widget key.
  positions: Readonly<Record<string, Place>>;
  // Whether the user changed the layout.
  customized: boolean;
  // Remembers these places, next to the ones already saved.
  place: (next: Readonly<Record<string, Place>>) => void;
  reset: () => void;
}

export interface Place {
  col: number;
  row: number;
}

const isPlace = (value: unknown): value is Place => {
  const place = value as Place | null;
  return typeof place === 'object' && place !== null && Number.isInteger(place.col) && Number.isInteger(place.row) && place.col >= 0 && place.row >= 0;
};

function readPositions(): Record<string, Place> {
  try {
    const raw = window.localStorage.getItem(POSITIONS_KEY);
    if (raw === null) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isPlace(value))) as Record<string, Place>;
  } catch (err) {
    // A broken value or a blocked storage must not break the dashboard, but the user has to know why the layout is gone.
    console.warn(`[dashboard] cannot read "${POSITIONS_KEY}" from localStorage: ${String(err)}. Using the default layout.`);
    return {};
  }
}

// The layout of the dashboard widgets, chosen by dragging them anywhere in the grid or with the widget menu, kept in this
// browser. The list of keys saved by the earlier version (an order, no places) still decides the order of the widgets
// nobody placed.
export function useWidgetLayout<T extends { key: string }>(widgets: readonly T[]): WidgetLayoutState<T> {
  const [saved, writeOrder] = useStoredKeys(ORDER_KEY, 'Using the default order.', 'The order comes back to the default after a reload.');
  const [positions, setPositions] = useState<Record<string, Place>>(readPositions);
  const persist = useCallback((next: Record<string, Place>): void => {
    setPositions(next);
    try {
      window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn(`[dashboard] cannot save "${POSITIONS_KEY}" to localStorage: ${String(err)}. The layout comes back to the default after a reload.`);
    }
  }, []);

  const rank = (key: string): number => {
    const at = saved.indexOf(key);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  // Array.sort is stable, so widgets without a saved rank keep their natural order.
  const ordered = [...widgets].sort((a, b) => rank(a.key) - rank(b.key));

  const place = useCallback((next: Readonly<Record<string, Place>>): void => persist({ ...positions, ...next }), [persist, positions]);
  const reset = useCallback((): void => {
    persist({});
    writeOrder([]);
  }, [persist, writeOrder]);

  return { ordered, positions, customized: saved.length > 0 || Object.keys(positions).length > 0, place, reset };
}

export type RefreshInterval = 'off' | '30s' | '1m' | '5m';
const INTERVAL_MS: Record<Exclude<RefreshInterval, 'off'>, number> = { '30s': 30_000, '1m': 60_000, '5m': 300_000 };

// A counter that goes up on `refresh()` and, when an interval is chosen, by itself; widgets re-run when it changes.
export function useRefreshTick(interval: RefreshInterval): { tick: number; refresh: () => void } {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (interval === 'off') {
      return undefined;
    }
    const timer = window.setInterval(refresh, INTERVAL_MS[interval]);
    return () => window.clearInterval(timer);
  }, [interval, refresh]);
  return { tick, refresh };
}
