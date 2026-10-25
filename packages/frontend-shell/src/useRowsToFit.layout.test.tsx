import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowsToFit } from './useRowsToFit.js';

// jsdom lays nothing out: the sizes the hook reads are given by a `data-size` attribute on each element (JSON), through
// getters on the prototype. Cells are 100px with 16px between them.
const SIZE_KEYS = ['offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth', 'scrollWidth'] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  for (const key of SIZE_KEYS) {
    originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) ?? Object.getOwnPropertyDescriptor(Element.prototype, key));
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        const sizes = JSON.parse(this.dataset['size'] ?? '{}') as Record<string, number>;
        return sizes[key] ?? 0;
      },
    });
  }
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    gridAutoRows: '100px',
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingLeft: '8px',
    paddingRight: '8px',
  } as unknown as CSSStyleDeclaration);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  for (const key of SIZE_KEYS) {
    const original = originals.get(key);
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The markup of a dashboard cell: grid > cell > frame (header + body) > article.
function Cell({ article }: { article: Record<string, number> }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useRowsToFit(ref, 16);
  return (
    <div>
      <div ref={ref}>
        <section data-size={JSON.stringify({ offsetHeight: 100, clientHeight: 98, offsetWidth: 300, clientWidth: 298 })}>
          <header data-size={JSON.stringify({ offsetHeight: 32 })} />
          <div>
            <div role="article" data-size={JSON.stringify(article)} />
          </div>
        </section>
      </div>
      <output>{`${fit.rows}x${fit.cols}`}</output>
    </div>
  );
}

describe('useRowsToFit: columns', () => {
  it('asks for one column while the content fits the tile', () => {
    render(<Cell article={{ offsetHeight: 30, scrollWidth: 280, clientWidth: 280 }} />);
    expect(screen.getByRole('status').textContent).toBe('1x1');
  });

  it('asks for the columns a content wider than its tile needs (frame border and body padding included)', () => {
    // 2 (borders) + 16 (padding) + 400 (content) = 418px: 4 cells of 100px with 16px between them hold 448.
    render(<Cell article={{ offsetHeight: 30, scrollWidth: 400, clientWidth: 280 }} />);
    expect(screen.getByRole('status').textContent).toBe('1x4');
  });

  it('ignores a 1px rounding difference', () => {
    render(<Cell article={{ offsetHeight: 30, scrollWidth: 281, clientWidth: 280 }} />);
    expect(screen.getByRole('status').textContent).toBe('1x1');
  });

  it('asks for rows from the height of the content, header and padding included', () => {
    // 32 (header) + 2 (borders) + 16 (padding) + 200 (content) = 250px: 3 rows hold 332, 2 hold 216.
    render(<Cell article={{ offsetHeight: 200, scrollWidth: 280, clientWidth: 280 }} />);
    expect(screen.getByRole('status').textContent).toBe('3x1');
  });
});
