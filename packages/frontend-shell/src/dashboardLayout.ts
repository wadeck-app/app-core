// The placement of the dashboard widgets on the lattice of square cells: pure functions, no DOM.

export interface LayoutItem {
  key: string;
  // Where the user put it (cells from the top left); undefined until the user moved it.
  col: number | undefined;
  row: number | undefined;
  // Size in cells.
  width: number;
  height: number;
}

export interface Placement {
  col: number;
  row: number;
}

// A widget held at a place (the one being dragged, or moved from its menu): the others make room for it.
export interface Pin {
  key: string;
  col: number;
  row: number;
}

interface Box extends Placement {
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box): boolean => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
const collides = (box: Box, placed: readonly Box[]): boolean => placed.some((other) => overlaps(box, other));

// The first row, from the one `box` is at and going down, at which it overlaps nothing.
function firstFreeRowFrom(box: Box, placed: readonly Box[]): number {
  const bottom = placed.reduce((max, other) => Math.max(max, other.row + other.h), box.row);
  for (let row = box.row; row < bottom; row += 1) {
    if (!collides({ ...box, row }, placed)) {
      return row;
    }
  }
  return bottom;
}

// The first free place scanning rows from the top and columns from the left (what an automatic grid does).
function firstFit(w: number, h: number, columns: number, placed: readonly Box[]): Placement {
  for (let row = 0; ; row += 1) {
    for (let col = 0; col + w <= columns; col += 1) {
      if (!collides({ col, row, w, h }, placed)) {
        return { col, row };
      }
    }
  }
}

// Where every widget goes on a grid of `columns`. A widget the user placed stays where it was put, empty cells above it
// included, and goes down only as far as another widget forces it. A pinned widget is held at its place first and the
// others make room under it. Widgets the user never moved fill the first free place in the order given, which is a plain
// automatic grid when nobody moved anything. Nothing overlaps.
export function resolveLayout(items: readonly LayoutItem[], columns: number, pin?: Pin): Map<string, Placement> {
  const result = new Map<string, Placement>();
  const widthOf = (item: LayoutItem): number => Math.max(1, Math.min(item.width, columns));
  const clampCol = (col: number, w: number): number => Math.max(0, Math.min(col, columns - w));
  const boxes = new Map<string, Box>();
  const placed: Box[] = [];

  const pinned = pin === undefined ? undefined : items.find((item) => item.key === pin.key);
  if (pin !== undefined && pinned !== undefined) {
    const w = widthOf(pinned);
    const box: Box = { col: clampCol(pin.col, w), row: Math.max(0, pin.row), w, h: pinned.height };
    boxes.set(pinned.key, box);
    placed.push(box);
  }

  // Moved widgets, from the top and from the left; ties keep the order given. The one placed higher keeps its place and the
  // other goes down.
  const positioned = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.key !== pin?.key && item.col !== undefined && item.row !== undefined)
    .sort((a, b) => a.item.row! - b.item.row! || a.item.col! - b.item.col! || a.index - b.index);
  for (const { item } of positioned) {
    const w = widthOf(item);
    const base: Box = { col: clampCol(item.col!, w), row: item.row!, w, h: item.height };
    const box = { ...base, row: firstFreeRowFrom(base, placed) };
    boxes.set(item.key, box);
    placed.push(box);
  }

  for (const item of items) {
    if (boxes.has(item.key)) {
      continue;
    }
    const w = widthOf(item);
    const box: Box = { ...firstFit(w, item.height, columns, placed), w, h: item.height };
    boxes.set(item.key, box);
    placed.push(box);
  }

  for (const item of items) {
    const box = boxes.get(item.key)!;
    result.set(item.key, { col: box.col, row: box.row });
  }
  return result;
}

// The keys in reading order: top to bottom, left to right.
export function readingOrder(layout: ReadonlyMap<string, Placement>): string[] {
  return [...layout.entries()].sort(([, a], [, b]) => a.row - b.row || a.col - b.col).map(([key]) => key);
}

// The cell under the top left corner of a widget held at (`left`, `top`) pixels from the top left of the grid.
export function snapToCell(left: number, top: number, trackLeft: number, cellPx: number, gapPx: number): Placement {
  const stride = cellPx + gapPx;
  return { col: Math.round((left - trackLeft) / stride), row: Math.round(top / stride) };
}

// The last row used plus one: how many rows the grid has.
export function rowsUsed(items: readonly LayoutItem[], layout: ReadonlyMap<string, Placement>): number {
  return items.reduce((max, item) => Math.max(max, (layout.get(item.key)?.row ?? 0) + item.height), 0);
}
