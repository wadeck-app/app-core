import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('index.css', () => {
  // The dsl-ui A/B dock appends an empty block (data-testid="ab-dock-spacer") at the end of the page so that the floating dock never
  // covers the last content: on every page it showed as a blank band under the content. The dock is a dev tool and folds into a pill.
  it('removes the empty block the A/B dock adds at the end of the page', () => {
    expect(css).toMatch(/\[data-testid=["']ab-dock-spacer["']\]\s*\{[^}]*display:\s*none/);
  });
});
