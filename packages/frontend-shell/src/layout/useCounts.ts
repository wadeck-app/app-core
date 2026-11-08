import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../errors.js';
import type { CountSource } from '../types.js';

// A figure to read: GET `url` (a route of the module that declared it), JSON, `field` the path to a whole number in the answer.
export interface CountRequest {
  // Who it is for ("menu:/modules/queue/dlq", "tab:flow/executions/:id/logs").
  key: string;
  url: string;
  field?: string;
  refreshSeconds: number;
}

export const DEFAULT_COUNT_REFRESH_SECONDS = 60;

// "/api/modules/queue" + "/dlq/count" -> the URL to read; `params` fill the ":params" of the route (a tab, the ones of its page).
export function countUrl(moduleId: string, source: CountSource, params: Record<string, string | undefined> = {}): string {
  const route = source.route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));
  return `/api/modules/${moduleId}${route === '/' ? '/' : route}`;
}

export function countRequest(key: string, moduleId: string, source: CountSource, params?: Record<string, string | undefined>): CountRequest {
  return { key, url: countUrl(moduleId, source, params), ...(source.field === undefined ? {} : { field: source.field }), refreshSeconds: source.refreshSeconds ?? DEFAULT_COUNT_REFRESH_SECONDS };
}

// The whole number at `field` in the answer (the answer itself without a field), or why it is not one.
export function readCount(answer: unknown, field: string | undefined): { value: number } | { problem: string } {
  let value: unknown = answer;
  for (const name of field === undefined ? [] : field.split('.')) {
    if (typeof value !== 'object' || value === null || !(name in value)) {
      return { problem: `the answer has no "${field}" (it stopped at "${name}")` };
    }
    value = (value as Record<string, unknown>)[name];
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return { problem: `${field === undefined ? 'the answer' : `"${field}"`} is ${JSON.stringify(value)}, not a whole number of 0 or more` };
  }
  return { value };
}

// One warning per request and problem, not one per refresh: the figure stays absent and the reason is in the console.
const warned = new Set<string>();
function warnOnce(request: CountRequest, problem: string): void {
  const id = `${request.url}|${request.field ?? ''}|${problem}`;
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[app-core] the figure of ${request.key} cannot be shown: GET ${request.url}: ${problem}. Fix the route or the "count" in the manifest of that module.`);
  }
}

// Reads the figures and keeps them up to date: again every `refreshSeconds` (0: once), not while the browser tab is hidden, and as soon
// as it is shown again. A figure that cannot be read is left out (and said once in the console), never shown as 0.
export function useCounts(requests: readonly CountRequest[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const signature = JSON.stringify(requests);
  const stable = useMemo(() => JSON.parse(signature) as CountRequest[], [signature]);

  useEffect(() => {
    if (stable.length === 0) {
      setCounts((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return undefined;
    }
    const controller = new AbortController();
    const readOne = async (request: CountRequest): Promise<void> => {
      try {
        const res = await fetch(request.url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!res.ok) {
          warnOnce(request, `answered ${res.status}`);
          setCounts((prev) => without(prev, request.key));
          return;
        }
        const read = readCount(await res.json(), request.field);
        if ('problem' in read) {
          warnOnce(request, read.problem);
          setCounts((prev) => without(prev, request.key));
          return;
        }
        setCounts((prev) => (prev[request.key] === read.value ? prev : { ...prev, [request.key]: read.value }));
      } catch (err) {
        if (!controller.signal.aborted) {
          warnOnce(request, getErrorMessage(err));
          setCounts((prev) => without(prev, request.key));
        }
      }
    };
    const readAll = (): void => {
      for (const request of stable) {
        void readOne(request);
      }
    };
    readAll();
    const timers = stable
      .filter((r) => r.refreshSeconds > 0)
      .map((request) =>
        window.setInterval(() => {
          if (!document.hidden) {
            void readOne(request);
          }
        }, request.refreshSeconds * 1000),
      );
    // Back from a hidden tab: the figures may be old, read them now.
    const onVisible = (): void => {
      if (!document.hidden) {
        readAll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      timers.forEach((t) => window.clearInterval(t));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [stable]);

  return counts;
}

function without(counts: Record<string, number>, key: string): Record<string, number> {
  if (!(key in counts)) {
    return counts;
  }
  const next = { ...counts };
  delete next[key];
  return next;
}
