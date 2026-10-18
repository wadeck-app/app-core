import { useEffect, useState } from 'react';
import { getErrorMessage } from './errors.js';

// Mirrors scripts/build-info.mjs: what the served frontend was built with.
export interface BuildInfo {
  builtAt: string;
  appCore: string;
  commit?: string;
  dslUi: string;
  dslRenderer: string;
  react: string;
  reactDom: string;
  reactRouterDom: string;
}

export type BuildInfoState = { state: 'loading' } | { state: 'ready'; info: BuildInfo } | { state: 'error'; message: string };

async function fetchBuildInfo(): Promise<BuildInfo> {
  const res = await fetch('/build-info.json');
  if (!res.ok) {
    throw new Error(`GET /build-info.json answered ${res.status}`);
  }
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('appCore' in body) || typeof body.appCore !== 'string') {
    throw new Error('/build-info.json has no "appCore" version; rebuild the frontend (npm run build:full)');
  }
  return body as BuildInfo;
}

// Read once per page load: the file only changes when the frontend is rebuilt.
export function useBuildInfo(): BuildInfoState {
  const [state, setState] = useState<BuildInfoState>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchBuildInfo().then(
      (info) => {
        if (!cancelled) {
          setState({ state: 'ready', info });
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({ state: 'error', message: getErrorMessage(err) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
