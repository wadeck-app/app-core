import { describe, expect, it } from 'vitest';
import { readingOrder, resolveLayout, rowsUsed, snapToCell, type LayoutItem } from './dashboardLayout.js';

const item = (key: string, width: number, height: number, at?: [number, number]): LayoutItem => ({ key, width, height, col: at?.[0], row: at?.[1] });
const at = (layout: ReturnType<typeof resolveLayout>, key: string): [number, number] => {
  const place = layout.get(key)!;
  return [place.col, place.row];
};

describe('resolveLayout: widgets nobody moved', () => {
  it('fills the first free place in the order given, like an automatic grid', () => {
    const layout = resolveLayout([item('a', 2, 2), item('b', 2, 1), item('c', 4, 1)], 9);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([2, 0]);
    expect(at(layout, 'c')).toEqual([4, 0]);
  });

  it('goes to the next row when the row is full, and back-fills a hole under a short widget', () => {
    const layout = resolveLayout([item('a', 3, 1), item('b', 3, 2), item('c', 3, 1)], 6);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([3, 0]);
    expect(at(layout, 'c')).toEqual([0, 1]);
  });

  it('limits a widget wider than the grid to the columns that exist', () => {
    const layout = resolveLayout([item('a', 12, 1), item('b', 2, 1)], 4);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([0, 1]);
  });
});

describe('resolveLayout: widgets the user placed', () => {
  it('keeps a widget where it was put', () => {
    const layout = resolveLayout([item('a', 2, 1, [5, 0]), item('b', 2, 1, [0, 0])], 9);
    expect(at(layout, 'a')).toEqual([5, 0]);
    expect(at(layout, 'b')).toEqual([0, 0]);
  });

  it('keeps a widget where it was put, the empty rows above it included', () => {
    const layout = resolveLayout([item('a', 2, 1, [0, 7])], 9);
    expect(at(layout, 'a')).toEqual([0, 7]);
  });

  it('leaves a gap between two widgets of the same column', () => {
    const layout = resolveLayout([item('a', 2, 1, [0, 0]), item('b', 2, 1, [0, 4])], 9);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([0, 4]);
  });

  it('pushes a widget down when another one holds its place', () => {
    const layout = resolveLayout([item('a', 3, 2, [0, 0]), item('b', 3, 1, [1, 0])], 9);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([1, 2]);
  });

  it('clamps a widget placed past the right edge when the window gets narrower', () => {
    const layout = resolveLayout([item('a', 3, 1, [8, 0])], 5);
    expect(at(layout, 'a')).toEqual([2, 0]);
  });

  it('puts widgets nobody moved around the ones the user placed', () => {
    const layout = resolveLayout([item('free', 2, 1), item('placed', 2, 1, [0, 0])], 4);
    expect(at(layout, 'placed')).toEqual([0, 0]);
    expect(at(layout, 'free')).toEqual([2, 0]);
  });
});

describe('resolveLayout: a pinned widget', () => {
  const items = [item('a', 3, 1, [0, 0]), item('b', 3, 1, [3, 0]), item('c', 3, 1, [0, 1])];

  it('takes the place it is dropped on and the others make room under it', () => {
    const layout = resolveLayout(items, 9, { key: 'c', col: 0, row: 0 });
    expect(at(layout, 'c')).toEqual([0, 0]);
    expect(at(layout, 'a')).toEqual([0, 1]);
    expect(at(layout, 'b')).toEqual([3, 0]);
  });

  it('lands in a free place without moving anything else', () => {
    const layout = resolveLayout(items, 9, { key: 'c', col: 6, row: 0 });
    expect(at(layout, 'c')).toEqual([6, 0]);
    expect(at(layout, 'a')).toEqual([0, 0]);
    expect(at(layout, 'b')).toEqual([3, 0]);
  });

  it('stays where it is dropped, below the last row', () => {
    const layout = resolveLayout(items, 9, { key: 'a', col: 0, row: 9 });
    expect(at(layout, 'a')).toEqual([0, 9]);
  });

  it('is clamped to the columns that exist', () => {
    const layout = resolveLayout(items, 5, { key: 'a', col: 20, row: 0 });
    expect(at(layout, 'a')[0]).toBe(2);
  });

  it('never overlaps anything, whatever it is dropped on', () => {
    for (let col = 0; col < 9; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        const layout = resolveLayout(items, 9, { key: 'b', col, row });
        const boxes = items.map((it) => ({ ...layout.get(it.key)!, w: it.width, h: it.height }));
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i]!;
            const b = boxes[j]!;
            const overlap = a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
            expect(overlap, `pin at ${col},${row}: ${i} vs ${j}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('readingOrder and rowsUsed', () => {
  it('lists the keys top to bottom, left to right', () => {
    const layout = resolveLayout([item('a', 2, 1, [4, 0]), item('b', 2, 1, [0, 1]), item('c', 2, 1, [0, 0])], 9);
    expect(readingOrder(layout)).toEqual(['c', 'a', 'b']);
  });

  it('counts the rows the widgets use', () => {
    const items = [item('a', 2, 3, [0, 0]), item('b', 2, 1, [2, 0])];
    expect(rowsUsed(items, resolveLayout(items, 9))).toBe(3);
  });
});

describe('snapToCell', () => {
  it('rounds the top left corner of a held widget to the nearest cell (116px apart)', () => {
    expect(snapToCell(0, 0, 0, 100, 16)).toEqual({ col: 0, row: 0 });
    expect(snapToCell(57, 57, 0, 100, 16)).toEqual({ col: 0, row: 0 });
    expect(snapToCell(59, 59, 0, 100, 16)).toEqual({ col: 1, row: 1 });
    expect(snapToCell(350, 240, 0, 100, 16)).toEqual({ col: 3, row: 2 });
  });

  it('counts from the left of the first column when the lattice is centered in a wider box', () => {
    expect(snapToCell(158, 0, 42, 100, 16)).toEqual({ col: 1, row: 0 });
  });
});
