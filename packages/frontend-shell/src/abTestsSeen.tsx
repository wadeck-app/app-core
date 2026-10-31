import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAbExperiments } from '@wadeck-app/dsl-ui';

// Where each A/B test was SEEN in this browser: the dock registers the tests of the page being shown, and the address of that
// page is kept. It is the only exact answer for a test written in the code of a module, which no scan can place on a page.
// Only recorded while the dock is on.
export const SEEN_KEY = 'app-core.ab-tests-seen';
const MAX_PLACES = 5;

export interface SeenTest {
  label: string;
  // Addresses (no query), most recent first.
  paths: string[];
}

export type SeenTests = Record<string, SeenTest>;

export function readSeen(): SeenTests {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SEEN_KEY);
  } catch (err) {
    console.warn(`[ab-tests] cannot read "${SEEN_KEY}" from localStorage: ${String(err)}. Where the tests were seen is not shown.`);
    return {};
  }
  if (raw === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('expected an object');
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, SeenTest] => typeof entry[1] === 'object' && entry[1] !== null && typeof (entry[1] as SeenTest).label === 'string' && Array.isArray((entry[1] as SeenTest).paths),
      ),
    );
  } catch (err) {
    console.warn(`[ab-tests] "${SEEN_KEY}" in localStorage is not usable (${String(err)}). Where the tests were seen is not shown; it is rebuilt as you visit pages.`);
    return {};
  }
}

// Notes `tests` as seen at `pathname`. Returns the new record, or undefined when nothing changed (so nothing is written).
export function noteSeen(current: SeenTests, tests: ReadonlyArray<{ id: string; label: string }>, pathname: string): SeenTests | undefined {
  let changed = false;
  const next: SeenTests = { ...current };
  for (const test of tests) {
    const before = next[test.id];
    const paths = [pathname, ...(before?.paths ?? []).filter((p) => p !== pathname)].slice(0, MAX_PLACES);
    if (before === undefined || before.label !== test.label || before.paths.join('\n') !== paths.join('\n')) {
      next[test.id] = { label: test.label, paths };
      changed = true;
    }
  }
  return changed ? next : undefined;
}

// Mounted once, under the A/B host and the router: records the tests the dock shows on the page being shown.
export function AbTestsSeenRecorder(): null {
  const host = useAbExperiments();
  const { pathname } = useLocation();
  const noop = (): (() => void) => () => undefined;
  const empty: readonly never[] = [];
  const tests = useSyncExternalStore(host?.store.subscribe ?? noop, host?.store.getSnapshot ?? (() => empty));
  const enabled = host?.enabled === true;

  useEffect(() => {
    if (!enabled || tests.length === 0) {
      return;
    }
    const next = noteSeen(readSeen(), tests, pathname);
    if (next === undefined) {
      return;
    }
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SEEN_CHANGED));
    } catch (err) {
      console.warn(`[ab-tests] cannot save "${SEEN_KEY}" to localStorage: ${String(err)}. Where the tests were seen is not kept.`);
    }
  }, [enabled, tests, pathname]);
  return null;
}

const SEEN_CHANGED = 'app-core:ab-tests-seen';

// What was seen so far, kept up to date while the page is open (a test recorded in another tab shows up too).
export function useSeenTests(): SeenTests {
  const [seen, setSeen] = useState<SeenTests>(readSeen);
  useEffect(() => {
    const refresh = (): void => setSeen(readSeen());
    window.addEventListener(SEEN_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SEEN_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return seen;
}
