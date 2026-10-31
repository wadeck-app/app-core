import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { etagMatches } from './etagCore.js';

// Conditional GET for the routes of the modules. A client that asked for the same address before sends the ETag it got
// (If-None-Match); when the answer is still the same, the server says 304 and sends nothing. A browser does this by itself for
// any response that has an ETag, so the shell and the DSL runtime need no change: an answer that did not change costs a header.
// Two ways to get there:
//  - automatic (`etagHook`): the ETag is a hash of the body, so only the bytes are saved, the handler still runs;
//  - the module says it ahead (`ctx.unchanged`, `ctx.fileVersion`): the handler stops before it computes anything. The pure
//    part of that is in etagCore.ts (the SDK needs it without Node); the reading of files is here.
export { etagMatches, parseIfNoneMatch, unchanged, versionEtag } from './etagCore.js';

// A weak ETag for a body: the same bytes always give the same tag.
export function bodyEtag(payload: string | Buffer): string {
  return `W/"${createHash('sha1').update(payload).digest('base64url').slice(0, 22)}"`;
}

// A version for data kept in files: it changes when one of them changes (modification time or size) or appears or disappears.
// A file that does not exist is a version of its own ("missing"), not an error; any other failure to read it is.
export async function fileVersion(files: readonly string[]): Promise<string> {
  if (files.length === 0) {
    throw new TypeError('ctx.fileVersion needs at least one file path.');
  }
  const parts: string[] = [];
  for (const file of files) {
    try {
      const { mtimeMs, size } = await fs.promises.stat(file);
      parts.push(`${mtimeMs}-${size}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        parts.push('missing');
      } else {
        throw new Error(`ctx.fileVersion cannot read ${file}: ${(err as Error).message}`);
      }
    }
  }
  return createHash('sha1').update(parts.join('|')).digest('base64url').slice(0, 22);
}

// Fastify onSend hook of the module routes: a 200 answer to a GET whose body is text gets an ETag (unless the module set its
// own) and `Cache-Control: no-cache` (unless it set one), and becomes a 304 when the client already has it.
export async function etagHook(req: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  if (req.method !== 'GET' || reply.statusCode !== 200) {
    return payload;
  }
  // Streams (files, events) are not hashed: reading them would defeat them.
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    return payload;
  }
  const own = reply.getHeader('ETag');
  const etag = typeof own === 'string' && own !== '' ? own : bodyEtag(payload);
  reply.header('ETag', etag);
  if (reply.getHeader('Cache-Control') === undefined) {
    reply.header('Cache-Control', 'no-cache');
  }
  if (etagMatches(req.headers['if-none-match'], etag)) {
    reply.code(304);
    return '';
  }
  return payload;
}
