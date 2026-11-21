import type { FastifyInstance } from 'fastify';

// The server listens on 127.0.0.1 only, but a web page the user opens can still reach it: a body-less POST is a "simple" request
// the browser sends without asking (so any site can fire /api/modules/<id>/<action> at the dashboard), and DNS rebinding makes
// the attacker's own host name resolve to 127.0.0.1 (the page then reads the API as if it were its own). One guard for every
// route, modules' included, instead of each module defending itself.

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_HOSTS_ENV = 'APP_CORE_ALLOWED_HOSTS';

// "name:port" -> "name" (lower case; IPv6 keeps its brackets), undefined when the header is not a valid host.
export function hostnameOf(hostHeader: string): string | undefined {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// "http://name:port" -> "name", undefined when the header is not an origin.
function originHostnameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// Extra host names the server is reached by (a reverse proxy, an SSH tunnel), from the option or APP_CORE_ALLOWED_HOSTS
// ("name1,name2", names without port).
export function allowedHostsFrom(option: readonly string[] | undefined, env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = (env[ALLOWED_HOSTS_ENV] ?? '').split(',');
  return [...(option ?? []), ...fromEnv].map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
}

// The host names this server answers to: loopback plus the extra ones.
export function allowedHostSet(extraHosts: readonly string[] = []): Set<string> {
  return new Set([...LOOPBACK_HOSTS, ...extraHosts]);
}

// True when the Origin header names one of this server's hosts (the port is not compared: the Vite dev proxy on 5173 keeps its own
// Origin and Host, and the guard accepts them the same way). "null" and anything that is not an origin are not ours.
export function isOwnOrigin(origin: string, allowedHosts: ReadonlySet<string>): boolean {
  const originHost = origin === 'null' ? undefined : originHostnameOf(origin);
  return originHost !== undefined && allowedHosts.has(originHost);
}

// The request looks like one the dashboard in a browser sends: an Origin that is ours, or Sec-Fetch-Site: same-origin. A script can
// forge both headers; this only stops a bare curl.
export function looksLikeShellRequest(headers: { origin?: string | undefined; 'sec-fetch-site'?: string | string[] | undefined }, allowedHosts: ReadonlySet<string>): boolean {
  if (headers.origin !== undefined && isOwnOrigin(headers.origin, allowedHosts)) {
    return true;
  }
  return headers['sec-fetch-site'] === 'same-origin';
}

export function registerRequestGuard(server: FastifyInstance, extraHosts: readonly string[] = []): void {
  const allowedHosts = allowedHostSet(extraHosts);
  server.addHook('onRequest', async (request, reply) => {
    // Any request, reads included: rebinding is how a foreign page reads the API.
    const hostHeader = request.headers.host;
    if (hostHeader !== undefined) {
      const hostname = hostnameOf(hostHeader);
      if (hostname === undefined || !allowedHosts.has(hostname)) {
        return reply.code(403).send({
          error: 'host-not-allowed',
          message: `This request was addressed to "${hostHeader}", which is not a name of this machine app-core answers to (${[...allowedHosts].join(', ')}). Open the dashboard by one of them. If you reach app-core through a proxy or a tunnel, start it with ${ALLOWED_HOSTS_ENV}=<host name> (names without port, separated by commas).`,
        });
      }
    }
    // Requests that change something: the browser says who is asking in Sec-Fetch-Site. Absent (curl, a CLI, another module's
    // server-side fetch, tests) and same-origin / none (typed address, bookmark) pass.
    if (!SAFE_METHODS.has(request.method) && request.url.startsWith('/api/')) {
      // Browsers that do not send Sec-Fetch-Site (older Safari) still send Origin on a request that changes something.
      const origin = request.headers.origin;
      if (origin !== undefined) {
        if (!isOwnOrigin(origin, allowedHosts)) {
          return reply.code(403).send({
            error: 'cross-site-request',
            message: `${request.method} ${request.url.split('?')[0]} was refused: it comes from the origin "${origin}", which is not this app-core. A page of another site must not change anything here. Do it from the app-core dashboard itself, or from a tool that is not a web page (curl, the CLI).`,
          });
        }
      }
      const site = request.headers['sec-fetch-site'];
      if (site === 'cross-site' || site === 'same-site') {
        return reply.code(403).send({
          error: 'cross-site-request',
          message: `${request.method} ${request.url.split('?')[0]} was refused: the browser says it comes from another site (Sec-Fetch-Site: ${site}), and a page of another site must not change anything in app-core. Do it from the app-core dashboard itself, or from a tool that is not a web page (curl, the CLI).`,
        });
      }
    }
  });
}
