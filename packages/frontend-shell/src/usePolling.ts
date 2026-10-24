import { useEffect, useRef, useState } from 'react';

// Polls with exponential backoff when nothing changed, and drops to a very
// long "hibernate" interval when the tab is not focused. Kept as a standalone
// hook (not inline in a component) so the scheduling logic has real unit
// tests with fake timers, independent of any rendering.

export interface PollingOptions<T> {
  fetchFn: () => Promise<T>;
  isEqual: (a: T, b: T) => boolean;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  hibernateIntervalMs?: number;
  backoffFactor?: number;
  isDocumentHidden?: () => boolean;
}

export interface PollingState<T> {
  data: T | undefined;
  error: unknown;
}

const DEFAULTS = {
  minIntervalMs: 2_000,
  maxIntervalMs: 60_000,
  hibernateIntervalMs: 10 * 60_000,
  backoffFactor: 2,
};

export function usePolling<T>(options: PollingOptions<T>): PollingState<T> {
  const { fetchFn, isEqual } = options;
  const minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULTS.maxIntervalMs;
  const hibernateIntervalMs = options.hibernateIntervalMs ?? DEFAULTS.hibernateIntervalMs;
  const backoffFactor = options.backoffFactor ?? DEFAULTS.backoffFactor;
  const isDocumentHidden = options.isDocumentHidden ?? (() => typeof document !== 'undefined' && document.hidden);

  const [state, setState] = useState<PollingState<T>>({ data: undefined, error: undefined });

  // Refs so a running timer always reads the latest options/data without
  // being torn down and rebuilt (which would reset backoff) every render.
  const lastDataRef = useRef<T | undefined>(undefined);
  const errorShownRef = useRef(false);
  const currentIntervalRef = useRef(minIntervalMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const scheduleNext = (delayMs: number) => {
      if (disposedRef.current) {
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, delayMs);
    };

    async function tick(): Promise<void> {
      if (disposedRef.current) {
        return;
      }

      if (isDocumentHidden()) {
        // Hibernate: don't even fetch, just check back much later.
        scheduleNext(hibernateIntervalMs);
        return;
      }

      try {
        const next = await fetchFn();
        if (disposedRef.current) {
          return;
        }

        const changed = lastDataRef.current === undefined || !isEqual(lastDataRef.current, next);
        if (changed) {
          lastDataRef.current = next;
          errorShownRef.current = false;
          setState({ data: next, error: undefined });
        } else if (errorShownRef.current) {
          // Same content, but an earlier tick left an error to clear.
          errorShownRef.current = false;
          setState((prev) => ({ data: prev.data, error: undefined }));
        }
        // Same content and nothing to clear: no setState at all. A new identity re-renders everything derived from the
        // data, and a component defined from it per render is remounted (bound form fields lost focus at every poll).

        currentIntervalRef.current = changed
          ? minIntervalMs
          : Math.min(currentIntervalRef.current * backoffFactor, maxIntervalMs);
      } catch (error) {
        if (disposedRef.current) {
          return;
        }
        errorShownRef.current = true;
        setState((prev) => ({ data: prev.data, error }));
        currentIntervalRef.current = Math.min(currentIntervalRef.current * backoffFactor, maxIntervalMs);
      }

      scheduleNext(currentIntervalRef.current);
    }

    const onVisibilityChange = () => {
      if (!isDocumentHidden()) {
        // Coming back into focus: reset backoff and poll immediately.
        currentIntervalRef.current = minIntervalMs;
        clearTimeout(timerRef.current);
        void tick();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void tick();

    return () => {
      disposedRef.current = true;
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: options are captured once, see refs above
  }, []);

  return state;
}
