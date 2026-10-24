import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WidgetFrame } from './WidgetFrame.js';
import { rowsToFit } from './useRowsToFit.js';

// Cells of 144px with 16px between them: 1 row = 144, 2 rows = 304, 3 rows = 464.
describe('rowsToFit', () => {
  it('takes one row for a content that fits in it, and never fewer', () => {
    expect(rowsToFit(100, 144, 16)).toBe(1);
    expect(rowsToFit(144, 144, 16)).toBe(1);
    expect(rowsToFit(0, 144, 16)).toBe(1);
  });

  it('takes the next row as soon as the content passes the end of a row (the gap counts)', () => {
    expect(rowsToFit(145, 144, 16)).toBe(2);
    expect(rowsToFit(304, 144, 16)).toBe(2);
    expect(rowsToFit(305, 144, 16)).toBe(3);
    expect(rowsToFit(464, 144, 16)).toBe(3);
  });

  it('answers one row while the grid has not been measured (no cell height yet)', () => {
    expect(rowsToFit(500, 0, 16)).toBe(1);
    expect(rowsToFit(500, -1, 16)).toBe(1);
  });
});

describe('WidgetFrame in a cell of fixed height', () => {
  const frame = (scroll: boolean) =>
    render(
      <WidgetFrame moduleTitle="Queue" label="Top events" bare scroll={scroll} handle={<span>grip</span>} toolbar={<button>tools</button>}>
        <p>body</p>
      </WidgetFrame>,
    );

  it('scrolls its content inside when asked, instead of stretching the tile', () => {
    frame(true);
    expect(screen.getByText('body').closest('div[role="article"]')?.parentElement?.className).toContain('overflow-auto');
  });

  it('lets the content set the height otherwise', () => {
    frame(false);
    expect(screen.getByText('body').closest('div[role="article"]')?.parentElement?.className).not.toContain('overflow-auto');
  });
});
