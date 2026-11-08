// For the components of a page (the dsl-lib of a module, running in the shell's page): set what sits next to a menu entry or a tab
// from the page itself, without going through the server. Browser code; React is the shell's (a module's bundle leaves it external).
//
//   useEntryIndicator('task/tasks/p/:project/:id/history', { count: rows.length, tone: 'warning' });
//
// The entry is named by its id: `<moduleId><path>` as in the manifest ("queue/dlq", "task/tasks/p/:project/:id/history"; the module
// home is "<moduleId>/"). In the manifest the entry takes `"count": { "refreshSeconds": -1 }` so that nothing is read from a route.
import { useEffect } from 'react';
import { ENTRY_INDICATOR_EVENT, ENTRY_INDICATORS_STORE, parseIndicator, type Indicator } from '@wadeck-app/app-core-server/indicator';

export type { Indicator, IndicatorIcon, IndicatorTone } from '@wadeck-app/app-core-server/indicator';

type Store = Map<string, unknown>;

// Sets the indicator of an entry, or clears it with null. A wrong value (a count that is not a whole number, an unknown tone) throws
// here, in the component that gives it, instead of showing something else on the screen.
export function setEntryIndicator(entryId: string, indicator: Indicator | null): void {
  if (entryId.trim() === '') {
    throw new Error('setEntryIndicator needs the id of the entry: "<moduleId><path>", for example "queue/dlq".');
  }
  if (indicator !== null) {
    const read = parseIndicator(indicator);
    if ('problem' in read) {
      throw new Error(`setEntryIndicator("${entryId}"): ${read.problem}.`);
    }
  }
  const existing: unknown = Reflect.get(globalThis, ENTRY_INDICATORS_STORE);
  const store: Store = existing instanceof Map ? existing : new Map();
  Reflect.set(globalThis, ENTRY_INDICATORS_STORE, store);
  store.set(entryId, indicator);
  window.dispatchEvent(new CustomEvent(ENTRY_INDICATOR_EVENT, { detail: { id: entryId, indicator } }));
}

// The indicator of an entry for as long as the component is mounted: set when the value changes, cleared when it goes away.
// `undefined` shows nothing. Pass a stable value or it is set again at each render (harmless, but a wasted event).
export function useEntryIndicator(entryId: string, indicator: Indicator | undefined): void {
  const key = JSON.stringify(indicator ?? null);
  useEffect(() => {
    setEntryIndicator(entryId, indicator ?? null);
    return () => setEntryIndicator(entryId, null);
    // `key` stands for the content of `indicator`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, key]);
}
