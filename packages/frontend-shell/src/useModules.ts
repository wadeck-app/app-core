import { usePolling } from './usePolling.js';
import type { ModulesResponse } from './types.js';

async function fetchModules(): Promise<ModulesResponse> {
  const res = await fetch('/api/modules');
  if (!res.ok) {
    throw new Error(`GET /api/modules failed: ${res.status}`);
  }
  return (await res.json()) as ModulesResponse;
}

function isEqual(a: ModulesResponse, b: ModulesResponse): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useModules(): { data: ModulesResponse | undefined; error: unknown } {
  return usePolling<ModulesResponse>({ fetchFn: fetchModules, isEqual });
}
