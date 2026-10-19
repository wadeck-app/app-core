import { useCallback, useEffect, useState } from 'react';

const HIDDEN_KEY = 'app-core.dashboard.hidden';

function readHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch (err) {
    // A broken value or a blocked storage must not hide the dashboard, but the user has to know why hidden widgets came back.
    console.warn(`[dashboard] cannot read the hidden widgets from localStorage "${HIDDEN_KEY}": ${String(err)}. Showing every widget.`);
    return [];
  }
}

// The widgets the user hid, kept in this browser (localStorage) so they stay hidden after a reload.
export function useHiddenWidgets(): { hidden: ReadonlySet<string>; hide: (key: string) => void; restoreAll: () => void } {
  const [keys, setKeys] = useState<string[]>(readHidden);

  const write = useCallback((next: string[]) => {
    setKeys(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn(`[dashboard] cannot save the hidden widgets to localStorage "${HIDDEN_KEY}": ${String(err)}. They come back after a reload.`);
    }
  }, []);

  const hide = useCallback((key: string) => write(keys.includes(key) ? keys : [...keys, key]), [keys, write]);
  const restoreAll = useCallback(() => write([]), [write]);
  return { hidden: new Set(keys), hide, restoreAll };
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
