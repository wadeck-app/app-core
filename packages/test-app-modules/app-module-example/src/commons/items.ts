// Code shared by the backend and the dsl-components. It ends up in the browser, so: pure functions and
// constants only, no `node:` import (`check` enforces it).
import type { ExampleItem, TickEvent } from './types.js';

export const TICK_MS = 1000;

// One place for the URL, so the route the backend registers and the one the component calls cannot drift.
export const EVENTS_URL = '/api/modules/example/events';

export const ITEMS: readonly ExampleItem[] = [
  { id: 'alpha', name: 'Alpha', status: 'active' },
  { id: 'beta', name: 'Beta', status: 'idle' },
  { id: 'gamma', name: 'Gamma', status: 'active' },
];

export function findItem(id: string): ExampleItem | undefined {
  return ITEMS.find((item) => item.id === id);
}

// Server side of the wire format...
export function formatTickEvent(tick: number): string {
  const event: TickEvent = { tick };
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ...and the browser side of it.
export function parseTickEvent(data: string): TickEvent {
  const parsed = JSON.parse(data) as Partial<TickEvent>;
  if (typeof parsed.tick !== 'number') {
    throw new Error(`Malformed tick event ${JSON.stringify(data)}: expected {"tick": <number>}.`);
  }
  return { tick: parsed.tick };
}
