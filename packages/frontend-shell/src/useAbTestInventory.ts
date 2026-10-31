import { useEffect, useState } from 'react';
import { getErrorMessage } from './errors.js';

// Mirrors GET /api/ab-tests (server/src/abTestScan.ts): the A/B tests the installed modules declare, over all their pages.
export interface AbTestInventory {
  // Declared in a view of a module (`$type: AbTest`): exact.
  exact: number;
  // Written in the code a module ships (`useAbTest` calls): an estimate, read from the text of its bundle.
  estimated: number;
  total: number;
  views: Array<{ moduleId: string; id: string; label?: string; where: string }>;
  components: Array<{ moduleId: string; label?: string }>;
  // Modules whose components could not be read: their tests, if any, are not in the count.
  unreadable: Array<{ moduleId: string; reason: string }>;
}

export type AbTestInventoryState = { state: 'loading' } | { state: 'ready'; inventory: AbTestInventory } | { state: 'error'; message: string };

async function fetchInventory(): Promise<AbTestInventory> {
  const res = await fetch('/api/ab-tests');
  if (!res.ok) {
    throw new Error(`GET /api/ab-tests answered ${res.status}${res.status === 404 ? ' (this server is older than this frontend: update app-core)' : ''}`);
  }
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('total' in body) || typeof body.total !== 'number') {
    throw new Error('/api/ab-tests has no "total": the server answers something else than the A/B inventory');
  }
  return body as AbTestInventory;
}

// Read once each time it is mounted: the popup that shows it mounts it when it opens.
export function useAbTestInventory(): AbTestInventoryState {
  const [state, setState] = useState<AbTestInventoryState>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetchInventory().then(
      (inventory) => !cancelled && setState({ state: 'ready', inventory }),
      (err: unknown) => !cancelled && setState({ state: 'error', message: getErrorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
