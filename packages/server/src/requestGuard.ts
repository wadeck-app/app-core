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

export function registerRequestGuard(server: FastifyInstance, extraHosts: readonly string[] = []): void {
  const allowedHosts = new Set([...LOOPBACK_HOSTS, ...extraHosts]);
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
        const originHost = origin === 'null' ? undefined : originHostnameOf(origin);
        if (originHost === undefined || !allowedHosts.has(originHost)) {
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
