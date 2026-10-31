import type { FastifyReply, FastifyRequest } from 'fastify';

// The part of conditional GET that needs nothing from Node: `createModuleContext` is exported by the SDK's main entry, which
// browser code imports and which must not pull in a Node builtin (scripts/bundle.mjs checks). What reads files or hashes a
// body lives in conditionalGet.ts.

// The tags of an If-None-Match header, or '*' when it matches any version. Empty when there is none.
export function parseIfNoneMatch(header: string | string[] | undefined): string[] | '*' {
  const text = Array.isArray(header) ? header.join(',') : header;
  if (text === undefined || text.trim() === '') {
    return [];
  }
  if (text.trim() === '*') {
    return '*';
  }
  return text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
}

// The weak comparison of RFC 9110 (a GET revalidation only needs to know the content is equivalent): "W/" is ignored on both sides.
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  const tags = parseIfNoneMatch(header);
  if (tags === '*') {
    return true;
  }
  const bare = (tag: string): string => tag.replace(/^W\//, '');
  return tags.some((tag) => bare(tag) === bare(etag));
}

// 128 bits of FNV-1a (four 32-bit lanes with different starting values) as 22 URL-safe characters. Not a cryptographic hash: it
// only has to give the same text the same tag and different texts different tags.
export function hashText(text: string): string {
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    for (let lane = 0; lane < lanes.length; lane++) {
      lanes[lane] = Math.imul((lanes[lane] as number) ^ (unit + lane), 0x01000193) >>> 0;
    }
  }
  const bytes = lanes.flatMap((value) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// An ETag value from a version the module chose: a token as it is, anything else hashed (a quote or a space would break the header).
export function versionEtag(version: string): string {
  return /^[A-Za-z0-9._-]{1,64}$/.test(version) ? `W/"${version}"` : `W/"${hashText(version)}"`;
}

type Req = Pick<FastifyRequest, 'headers' | 'method'>;
type Rep = Pick<FastifyReply, 'header' | 'getHeader' | 'code' | 'send' | 'statusCode'>;

// For a handler that knows, before it computes the answer, which version of the data it would send: sets the ETag, and when the
// client already has that version, answers 304 and returns true (the handler then returns the reply and does nothing else).
//     if (ctx.unchanged(req, reply, version)) return reply;
export function unchanged(req: Req, reply: Rep, version: string): boolean {
  if (typeof version !== 'string' || version === '') {
    throw new TypeError(`ctx.unchanged needs a version (a non-empty text that changes when the answer would), got ${JSON.stringify(version)}. Use ctx.fileVersion(...files) for data kept in files.`);
  }
  const etag = versionEtag(version);
  reply.header('ETag', etag);
  if (reply.getHeader('Cache-Control') === undefined) {
    reply.header('Cache-Control', 'no-cache');
  }
  if (req.method === 'GET' && etagMatches(req.headers['if-none-match'], etag)) {
    reply.code(304).send();
    return true;
  }
  return false;
}
