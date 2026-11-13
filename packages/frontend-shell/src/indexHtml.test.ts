import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// The server sends `script-src 'self'; style-src 'self'` with this page (packages/server/src/csp.ts): an inline script or style in
// it would be blocked, and the page would break in a browser although every other test passes.
const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

describe('index.html under the Content-Security-Policy', () => {
  it('has no inline script: every <script> has a src', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    for (const attributes of scripts) {
      expect(attributes, `<script${attributes}>`).toMatch(/\bsrc=/);
    }
    expect(html).not.toMatch(/<script\b[^>]*>\s*[^<\s]/i);
  });

  it('has no inline style: no <style> element, no style="" attribute', () => {
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it('sets the theme from a file of the shell, which exists', () => {
    expect(html).toContain('src="/theme-init.js"');
    expect(fs.existsSync(path.join(process.cwd(), 'public', 'theme-init.js'))).toBe(true);
  });
});
