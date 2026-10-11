import type { FastifyInstance } from 'fastify';
import type { ModuleManager } from '../loader.js';

export interface SlotsRoutesOptions {
  manager: ModuleManager;
}

// A module's view can embed `{ "$type": "ExtensionSlot", "items": "$sources.<key>" }`,
// and the dsl-renderer-side directive expects whatever that $sources URL returns
// to be a BARE array of DSL nodes -- no envelope, or dsl-renderer surfaces a
// visible UI alert rather than silently failing. This endpoint is that URL's
// target.
//
// Ordering/multiplicity is app-core's job, without app-core needing to know
// what any slot *means*: each contributing extensionPoint can declare a
// generic `order` number; this handler sorts by it and strips it before
// responding, so the wire format stays a bare array of resolved view nodes only.
export async function slotsRoutes(server: FastifyInstance, opts: SlotsRoutesOptions): Promise<void> {
  const { manager } = opts;

  server.get('/api/slots/:slotId', async (req, reply) => {
    const { slotId } = req.params as Record<string, string>;

    const contributions: Array<{ order?: number; view: unknown }> = [];
    for (const mod of manager.list()) {
      for (const ep of mod.resolvedViews) {
        if (ep.slot === slotId) {
          contributions.push({ order: ep.order, view: ep.view });
        }
      }
    }

    // Stable sort: entries with `order` come first (ascending), entries without
    // it keep their encountered order and sort after every ordered entry.
    const indexed = contributions.map((c, i) => ({ ...c, i }));
    indexed.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return a.i - b.i;
    });

    return reply.code(200).send(indexed.map((c) => c.view));
  });
}
