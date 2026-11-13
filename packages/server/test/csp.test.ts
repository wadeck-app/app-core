import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, CSP_POLICY, CSP_REPORT_PATH, registerCsp, resolveCspMode, type CspMode } from '../src/csp.js';

describe('resolveCspMode', () => {
  it('enforces when nothing is set', () => {
    expect(resolveCspMode({})).toBe('enforce');
    expect(resolveCspMode({ APP_CORE_CSP: '' })).toBe('enforce');
  });

  it('takes the three modes', () => {
    for (const mode of ['enforce', 'report-only', 'off'] as const) {
      expect(resolveCspMode({ APP_CORE_CSP: mode })).toBe(mode);
    }
  });

  it('refuses another value, naming the variable and the modes, instead of leaving the pages unprotected', () => {
    expect(() => resolveCspMode({ APP_CORE_CSP: 'enforced' })).toThrow(/Invalid APP_CORE_CSP: "enforced".*enforce, report-only, off/s);
  });
});

describe('the policy', () => {
  it('closes everything by default and allows only what this origin serves', () => {
    expect(CSP_DIRECTIVES).toContain("default-src 'none'");
    expect(CSP_DIRECTIVES).toContain("script-src 'self'");
    expect(CSP_DIRECTIVES).toContain("style-src 'self'");
    expect(CSP_DIRECTIVES).toContain("connect-src 'self'");
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
    expect(CSP_DIRECTIVES).toContain("base-uri 'none'");
    expect(CSP_DIRECTIVES).toContain("object-src 'none'");
  });

  it('has no way in for inline code, eval, another origin or a wildcard', () => {
    expect(CSP_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*|https?:|data:|blob:/);
  });

  it('says where the browser reports what it blocks', () => {
    expect(CSP_POLICY).toContain(`report-uri ${CSP_REPORT_PATH}`);
  });
});

describe('registerCsp', () => {
  let server: FastifyInstance | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function app(mode: CspMode): Promise<{ server: FastifyInstance; warnings: string[] }> {
    const warnings: string[] = [];
    const instance = Fastify({ logger: false });
    registerCsp(instance, mode, (m) => warnings.push(m));
    instance.get('/page', async (_req, reply) => reply.type('text/html; charset=utf-8').send('<html></html>'));
    instance.get('/own', async (_req, reply) => reply.type('text/html').header('content-security-policy', "default-src 'self'").send('<html></html>'));
    instance.get('/data', async () => ({ ok: true }));
    instance.get('/app.js', async (_req, reply) => reply.type('application/javascript').send('1'));
    await instance.ready();
    server = instance;
    return { server: instance, warnings };
  }

  it('puts the policy on HTML and on nothing else', async () => {
    const { server: s } = await app('enforce');
    expect((await s.inject('/page')).headers['content-security-policy']).toBe(CSP_POLICY);
    expect((await s.inject('/data')).headers['content-security-policy']).toBeUndefined();
    expect((await s.inject('/app.js')).headers['content-security-policy']).toBeUndefined();
  });

  it('keeps the policy a response already has and adds this one: the browser applies both', async () => {
    const { server: s } = await app('enforce');
    const header = (await s.inject('/own')).headers['content-security-policy'];
    expect(header).toEqual(["default-src 'self'", CSP_POLICY]);
  });

  it('says in the log that it only reports, and sends the report-only header, when asked to', async () => {
    const { server: s, warnings } = await app('report-only');
    const response = await s.inject('/page');
    expect(response.headers['content-security-policy-report-only']).toBe(CSP_POLICY);
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(warnings.join('\n')).toContain('APP_CORE_CSP=report-only: the policy blocks nothing');
  });

  it('sends nothing, and says so in the log with the way back, when it is off', async () => {
    const { server: s, warnings } = await app('off');
    expect((await s.inject('/page')).headers['content-security-policy']).toBeUndefined();
    expect(warnings.join('\n')).toContain('APP_CORE_CSP=off: no Content-Security-Policy is sent. Unset it');
  });

  describe('the report route', () => {
    const post = (s: FastifyInstance, body: string, type = 'application/csp-report') =>
      s.inject({ method: 'POST', url: CSP_REPORT_PATH, headers: { 'content-type': type }, payload: body });
    const report = (blocked: string, directive = 'img-src') => JSON.stringify({ 'csp-report': { 'violated-directive': directive, 'blocked-uri': blocked, 'document-uri': 'http://127.0.0.1:4850/modules/flow/executions' } });

    it('answers 204 and logs one readable line per distinct violation, not one per request', async () => {
      const { server: s, warnings } = await app('enforce');
      expect((await post(s, report('https://evil.example/x.png'))).statusCode).toBe(204);
      await post(s, report('https://evil.example/x.png'));
      await post(s, report('https://other.example/y.png'));
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('[csp] blocked "https://evil.example/x.png" (img-src) on /modules/flow/executions');
      expect(warnings[0]).toContain('APP_CORE_CSP=report-only');
    });

    it('says "would block" in report-only mode, and names an inline script', async () => {
      const { server: s, warnings } = await app('report-only');
      await post(s, report('inline', 'script-src-elem'));
      expect(warnings.at(-1)).toContain('[csp] would block an inline script (script-src-elem)');
    });

    it('takes the application/reports+json type too', async () => {
      const { server: s, warnings } = await app('enforce');
      expect((await post(s, report('https://evil.example/z.png'), 'application/reports+json')).statusCode).toBe(204);
      expect(warnings.some((w) => w.includes('evil.example/z.png'))).toBe(true);
    });

    it('answers 400 with what it takes, not a 500, when the body is not JSON', async () => {
      const { server: s } = await app('enforce');
      const response = await post(s, 'not json');
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('takes the JSON report a browser posts');
    });

    it('ignores a body that is not a report, without logging it', async () => {
      const { server: s, warnings } = await app('enforce');
      expect((await post(s, '{"hello":1}')).statusCode).toBe(204);
      expect(warnings).toEqual([]);
    });
  });
});
