import type { FastifyInstance } from 'fastify';

// The Content-Security-Policy of every HTML document app-core serves (the shell, and any HTML a module's route answers).
//
// Everything is closed by default (`default-src 'none'`) and the shell is given back only what it uses: its own scripts, styles, images,
// fonts and requests, all from this origin. No inline script or style, no eval, no framing, no <base>, no forms to other sites, no
// plugin. Measured on the installed modules (flow, flow-chart, task, queue, orchestrator, project, health, the dashboard, the module and
// A/B test pages, the dialogs and menus of the top bar): no violation. The module bundles (`_lib/`) are scripts of this origin, so the
// policy allows them, and it does NOT keep one module from reading what another shows (T-04); it keeps the page from sending anything
// to another site, from running a script that was injected, and from being framed.
//
// Not included: `require-trusted-types-for 'script'`. The shell renders Markdown and charts through innerHTML, so it needs a Trusted
// Types policy with a sanitizer first.

export const CSP_ENV = 'APP_CORE_CSP';
export const CSP_MODES = ['enforce', 'report-only', 'off'] as const;
export type CspMode = (typeof CSP_MODES)[number];
export const CSP_REPORT_PATH = '/api/csp-report';

// "enforce" when nothing is set. A value that is not a mode stops the server at startup: a typo must not leave the page unprotected.
export function resolveCspMode(env: NodeJS.ProcessEnv = process.env): CspMode {
  const raw = env[CSP_ENV];
  if (raw === undefined || raw === '') {
    return 'enforce';
  }
  const mode = CSP_MODES.find((m) => m === raw);
  if (mode === undefined) {
    throw new Error(`Invalid ${CSP_ENV}: "${raw}". Use one of ${CSP_MODES.join(', ')} ("report-only" shows what would be blocked in the server log without blocking it; "off" turns the policy off).`);
  }
  return mode;
}

// One directive per line of the policy, each with the reason it is this way.
export const CSP_DIRECTIVES: readonly string[] = [
  // Whatever is not listed below is forbidden: frames, workers, media, manifests, prefetch.
  "default-src 'none'",
  // The shell and the module bundles are files of this origin. No inline script, no eval, no other origin.
  "script-src 'self'",
  // The stylesheets of the shell and of the module bundles. No inline <style>, no style="" attribute.
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  // fetch, XHR, EventSource and WebSocket only to this server: what a page learns cannot be sent to another site.
  "connect-src 'self'",
  // The page cannot be put in a frame by any site (clickjacking), this one included.
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  // The browser says what it blocked: logged by the server (see registerCsp).
  `report-uri ${CSP_REPORT_PATH}`,
];

export const CSP_POLICY = CSP_DIRECTIVES.join('; ');

const REPORT_BODY_LIMIT = 16 * 1024;
const MAX_DISTINCT_REPORTS = 200;

interface ReportFields {
  directive: string;
  blocked: string;
  page: string;
  sample: string;
}

// The JSON a browser posts to `report-uri`: { "csp-report": { "violated-directive", "blocked-uri", "document-uri", ... } }.
function readReport(body: unknown): ReportFields | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const report: unknown = Reflect.get(body, 'csp-report');
  if (typeof report !== 'object' || report === null) {
    return undefined;
  }
  const text = (key: string): string => {
    const value: unknown = Reflect.get(report, key);
    return typeof value === 'string' ? value.slice(0, 160) : '';
  };
  return {
    directive: text('violated-directive') || text('effective-directive'),
    blocked: text('blocked-uri'),
    page: text('document-uri').replace(/^https?:\/\/[^/]+/, ''),
    sample: text('script-sample'),
  };
}

// Adds the policy to every HTML response, and receives the browsers' reports. A response that already has its own policy keeps it and
// gets this one too: the browser applies both, so a module cannot loosen the shell's.
export function registerCsp(server: FastifyInstance, mode: CspMode, warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`)): void {
  if (mode === 'off') {
    warn(`[app-core] ${CSP_ENV}=off: no Content-Security-Policy is sent. Unset it to protect the pages (script injection, framing, data sent to other sites).`);
    return;
  }
  const header = mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  if (mode === 'report-only') {
    warn(`[app-core] ${CSP_ENV}=report-only: the policy blocks nothing, it only logs what it would block ("[csp] ..."). Unset it to enforce.`);
  }

  // Browsers post the report as application/csp-report (older) or application/reports+json.
  for (const type of ['application/csp-report', 'application/reports+json']) {
    server.addContentTypeParser(type, { parseAs: 'string', bodyLimit: REPORT_BODY_LIMIT }, (_request, body, done) => {
      try {
        done(null, JSON.parse(typeof body === 'string' ? body : body.toString('utf8')));
      } catch {
        done(Object.assign(new Error(`${CSP_REPORT_PATH} takes the JSON report a browser posts ({"csp-report": {...}}), this body is not JSON.`), { statusCode: 400 }), undefined);
      }
    });
  }

  server.addHook('onSend', async (_request, reply, payload) => {
    const type = reply.getHeader('content-type');
    if (typeof type === 'string' && type.toLowerCase().startsWith('text/html')) {
      const existing = reply.getHeader(header);
      reply.header(header, existing === undefined ? CSP_POLICY : [...(Array.isArray(existing) ? existing : [String(existing)]), CSP_POLICY]);
    }
    return payload;
  });

  // One line per distinct violation: a page that breaks the policy on every render must not fill the log.
  const seen = new Set<string>();
  server.post(CSP_REPORT_PATH, async (request, reply) => {
    const report = readReport(request.body);
    if (report !== undefined) {
      const key = `${report.directive}|${report.blocked}|${report.page}`;
      if (!seen.has(key) && seen.size < MAX_DISTINCT_REPORTS) {
        seen.add(key);
        const what = report.blocked === 'inline' || report.blocked === 'eval' ? `an ${report.blocked} ${report.directive.startsWith('style') ? 'style' : 'script'}` : `"${report.blocked}"`;
        warn(
          `[csp] ${mode === 'enforce' ? 'blocked' : 'would block'} ${what} (${report.directive}) on ${report.page || '(unknown page)'}${report.sample === '' ? '' : `, from: ${report.sample}`}. ` +
            `A module bundle or view that needs this must stop using it; to see what else breaks without blocking, start the server with ${CSP_ENV}=report-only.`,
        );
      }
    }
    return reply.code(204).send();
  });
}
