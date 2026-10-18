// Backend entry (fixed path): the default export receives the context and registers everything through it.
// Only `ctx` services are used for routes, timers and events, so app-core can undo all of it on unload.
// What it returns is handed to `teardown` as `ctx.instance` (see teardown.ts).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { ITEMS, TICK_MS, findItem, formatTickEvent } from '../commons/items.js';
import { EVENTS_LOG, RUNNING_FILE, TICKS_FILE } from './files.js';
import type { ExampleInstance } from './instance.js';

export default function setup(ctx: ModuleContext): ExampleInstance {
  const ticksFile = path.join(ctx.dataDir, TICKS_FILE);
  // Resume what a previous run (or version, see migrate.ts) saved in the module's own data folder.
  let tick = fs.existsSync(ticksFile) ? (JSON.parse(fs.readFileSync(ticksFile, 'utf8')) as { ticks: number }).ticks : 0;
  fs.writeFileSync(path.join(ctx.dataDir, RUNNING_FILE), JSON.stringify({ since: new Date().toISOString() }));

  // Plain JSON route. app-core mounts it at /api/modules/example/items.
  ctx.registerRoute('GET', '/items', (_req, reply) => reply.send({ items: ITEMS }));

  // ":id" segments reach the handler in req.params.
  ctx.registerRoute('GET', '/items/:id', (req, reply) => {
    const item = findItem(req.params.id);
    if (item === undefined) {
      return reply.code(404).send({ error: `No item "${req.params.id}". GET /api/modules/example/items lists the ids.` });
    }
    return reply.send(item);
  });

  ctx.registerRoute('GET', '/events', (req, reply) => {
    // Server-sent events: take the socket over from Fastify and write to it ourselves.
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    reply.raw.write(formatTickEvent(tick));
    // One listener per open stream, removed with ctx.off when the stream closes: nothing piles up per request.
    const send = (): void => {
      reply.raw.write(formatTickEvent(tick));
    };
    ctx.on('tick', send);
    // Runs when the client leaves AND when app-core ends the stream because the module is unloaded,
    // updated or unregistered (the browser's EventSource then reconnects to the new version).
    // In the second case the context is already disposed and ctx.off is a no-op.
    req.raw.on('close', () => {
      ctx.off('tick', send);
      fs.appendFileSync(path.join(ctx.dataDir, EVENTS_LOG), 'stream closed\n');
    });
  });

  ctx.setInterval(() => {
    tick += 1;
    ctx.emit('tick');
  }, TICK_MS);

  // The counter lives in memory only. teardown receives this object as `ctx.instance` and saves it once,
  // instead of this module writing the file on every tick.
  return { ticks: () => tick };
}
