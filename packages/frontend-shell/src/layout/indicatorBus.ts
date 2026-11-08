import { useEffect, useState } from 'react';
import { ENTRY_HIDDEN_EVENT, ENTRY_HIDDEN_STORE, ENTRY_INDICATOR_EVENT, ENTRY_INDICATORS_STORE, parseIndicator, type Indicator } from './indicator.js';

// A component of a page sets the indicator of an entry (a menu entry or a tab, by its id `<moduleId><path>`) without going through the
// server: the SDK's setEntryIndicator(id, indicator | null) writes it in a map on globalThis and fires a window event. A module's bundle
// and the shell share no app-core code, only the window, so the window is the bus.

type PushedStore = Map<string, unknown>;

const storeOf = (): PushedStore | undefined => {
  const store: unknown = Reflect.get(globalThis, ENTRY_INDICATORS_STORE);
  return store instanceof Map ? store : undefined;
};

// One warning per entry and problem: a component that pushes a wrong value on every render must not flood the console.
const warned = new Set<string>();
function accept(id: string, raw: unknown): Indicator | undefined {
  const read = parseIndicator(raw);
  if ('problem' in read) {
    const key = `${id}|${read.problem}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[app-core] the indicator set for the entry "${id}" is refused: ${read.problem}. Fix the component that calls setEntryIndicator.`);
    }
    return undefined;
  }
  return read.indicator;
}

// The tabs that page components hide, by entry id. Whatever was hidden before the shell listened is read from the store.
export function useHiddenEntries(): ReadonlySet<string> {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => {
    const store: unknown = Reflect.get(globalThis, ENTRY_HIDDEN_STORE);
    return new Set(store instanceof Set ? [...store].filter((id): id is string => typeof id === 'string') : []);
  });
  useEffect(() => {
    const onHide = (event: Event): void => {
      const detail = (event as CustomEvent<{ id?: unknown; hidden?: unknown }>).detail;
      if (typeof detail?.id !== 'string' || detail.id === '' || typeof detail.hidden !== 'boolean') {
        console.warn('[app-core] an entry hidden event without an entry id and a boolean was ignored. setEntryHidden(id, hidden) needs the id of the tab: "<moduleId><path>".');
        return;
      }
      const { id, hidden: isHidden } = detail;
      setHidden((prev) => {
        if (prev.has(id) === isHidden) {
          return prev;
        }
        const next = new Set(prev);
        if (isHidden) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    };
    window.addEventListener(ENTRY_HIDDEN_EVENT, onHide);
    return () => window.removeEventListener(ENTRY_HIDDEN_EVENT, onHide);
  }, []);
  return hidden;
}

// The indicators set by page components, by entry id. Whatever was set before the shell listened is read from the store.
export function usePushedIndicators(): Record<string, Indicator> {
  const [pushed, setPushed] = useState<Record<string, Indicator>>(() => {
    const initial: Record<string, Indicator> = {};
    for (const [id, raw] of storeOf() ?? []) {
      const indicator = raw === null ? undefined : accept(id, raw);
      if (indicator !== undefined) {
        initial[id] = indicator;
      }
    }
    return initial;
  });
  useEffect(() => {
    const onPush = (event: Event): void => {
      const detail = (event as CustomEvent<{ id?: unknown; indicator?: unknown }>).detail;
      if (typeof detail?.id !== 'string' || detail.id === '') {
        console.warn('[app-core] an entry indicator event without an entry id was ignored. setEntryIndicator(id, indicator) needs the id of the entry: "<moduleId><path>".');
        return;
      }
      const id = detail.id;
      const indicator = detail.indicator === null || detail.indicator === undefined ? undefined : accept(id, detail.indicator);
      setPushed((prev) => {
        if (indicator === undefined) {
          if (!(id in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return JSON.stringify(prev[id]) === JSON.stringify(indicator) ? prev : { ...prev, [id]: indicator };
      });
    };
    window.addEventListener(ENTRY_INDICATOR_EVENT, onPush);
    return () => window.removeEventListener(ENTRY_INDICATOR_EVENT, onPush);
  }, []);
  return pushed;
}
