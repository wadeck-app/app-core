import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../errors.js';
import type { CountSource } from '../types.js';
import { readIndicator, type Indicator } from './indicator.js';

// An indicator to read: GET `url` (a route of the module that declared it), JSON, `field` where the number or the object is in the
// answer, `defaults` what the manifest gave for what the answer does not say.
export interface IndicatorRequest {
  // Who it is for ("menu:/modules/queue/dlq", "tab:flow/executions/:id/logs").
  key: string;
  url: string;
  field?: string;
  defaults: Indicator;
  refreshSeconds: number;
}

export const DEFAULT_REFRESH_SECONDS = 60;

// "/api/modules/queue" + "/dlq/count" -> the URL to read; `params` fill the ":params" of the route (a tab, the ones of its page).
export function indicatorUrl(moduleId: string, route: string, params: Record<string, string | undefined> = {}): string {
  const filled = route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));
  return `/api/modules/${moduleId}${filled === '/' ? '/' : filled}`;
}

// The request for what a manifest declared, or none: a page that sets its indicator itself (refreshSeconds -1) reads nothing.
export function indicatorRequest(key: string, moduleId: string, source: CountSource, params?: Record<string, string | undefined>): IndicatorRequest | undefined {
  if (source.refreshSeconds === -1 || source.route === undefined) {
    return undefined;
  }
  return {
    key,
    url: indicatorUrl(moduleId, source.route, params),
    ...(source.field === undefined ? {} : { field: source.field }),
    defaults: {
      ...(source.tone === undefined ? {} : { tone: source.tone }),
      ...(source.icon === undefined ? {} : { icon: source.icon }),
      ...(source.label === undefined ? {} : { label: source.label }),
    },
    refreshSeconds: source.refreshSeconds ?? DEFAULT_REFRESH_SECONDS,
  };
}

// One warning per request and problem, not one per refresh: the indicator stays absent and the reason is in the console.
const warned = new Set<string>();
function warnOnce(request: IndicatorRequest, problem: string): void {
  const id = `${request.url}|${request.field ?? ''}|${problem}`;
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[app-core] the indicator of ${request.key} cannot be shown: GET ${request.url}: ${problem}. Fix the route or the "count" in the manifest of that module.`);
  }
}

// Reads the indicators and keeps them up to date: again every `refreshSeconds` (0: once), not while the browser tab is hidden, and as
// soon as it is shown again. One that cannot be read is left out (and said once in the console), never shown as 0.
export function useIndicators(requests: readonly IndicatorRequest[]): Record<string, Indicator> {
  const [indicators, setIndicators] = useState<Record<string, Indicator>>({});
  const signature = JSON.stringify(requests);
  const stable = useMemo(() => JSON.parse(signature) as IndicatorRequest[], [signature]);

  useEffect(() => {
    if (stable.length === 0) {
      setIndicators((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return undefined;
    }
    const controller = new AbortController();
    const readOne = async (request: IndicatorRequest): Promise<void> => {
      try {
        const res = await fetch(request.url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!res.ok) {
          warnOnce(request, `answered ${res.status}`);
          setIndicators((prev) => without(prev, request.key));
          return;
        }
        const read = readIndicator(await res.json(), request.field, request.defaults);
        if ('problem' in read) {
          warnOnce(request, read.problem);
          setIndicators((prev) => without(prev, request.key));
          return;
        }
        setIndicators((prev) => (JSON.stringify(prev[request.key]) === JSON.stringify(read.indicator) ? prev : { ...prev, [request.key]: read.indicator }));
      } catch (err) {
        if (!controller.signal.aborted) {
          warnOnce(request, getErrorMessage(err));
          setIndicators((prev) => without(prev, request.key));
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
    // Back from a hidden tab: they may be old, read them now.
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

  return indicators;
}

function without(indicators: Record<string, Indicator>, key: string): Record<string, Indicator> {
  if (!(key in indicators)) {
    return indicators;
  }
  const next = { ...indicators };
  delete next[key];
  return next;
}
