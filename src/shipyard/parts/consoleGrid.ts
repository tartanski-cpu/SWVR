/**
 * The console's dash as a grid of quarter cells (dynamic console sockets, CS1; owner, Oct
 * 2026: "place sockets on the console, dynamic sockets ... depending on the size of the
 * console, so we can eventually place the instruments where we want"). A cell is a quarter
 * of a full screen (controls/instruments.ts `cells`): half its width, half its height. The
 * dash is `rows` cells high (2: one full screen) and as many across as the row needs; a full
 * screen takes 2 x 2, a strip 2 x 1, a quarter 1 x 1.
 *
 * The builder fills it by rules (`packDash`), in the screens' order of importance: each at
 * the first place, column by column, where it fits; full screens and strips on an even
 * column (so they share places in pairs: a strip under two quarters, as two half-height
 * screens stacked in one screen's place), strips at the bottom, quarters at the top. Columns
 * left empty are dropped. Later (CS3) a design may say where each goes instead.
 *
 * Plain numbers: no drawing, tested (tests/shipyard/consoleGrid.test.ts).
 */

/** A thing for the dash: its id and its size in cells (across, down). */
export interface GridItem {
  id: string;
  cells: [number, number];
}

/** Where it went: its first column and row (row 0 the top), and its size. */
export interface GridPlace {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

/** The dash's layout: each item's place, and how many columns it takes. */
export function packDash(items: GridItem[], rows = 2): { places: GridPlace[]; cols: number } {
  const used: boolean[][] = Array.from({ length: rows }, () => []);
  const free = (c: number, r: number, w: number, h: number) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (used[y][x]) return false;
    return true;
  };
  const places: GridPlace[] = [];
  for (const it of items) {
    const [w, h] = it.cells;
    if (h > rows) throw new Error(`${it.id} is taller than the dash (${h} cells, ${rows} rows)`);
    // Rows to try: a strip from the bottom up, anything else from the top down.
    const tryRows = Array.from({ length: rows - h + 1 }, (_, i) => i);
    if (w === 2 && h < rows) tryRows.reverse();
    const step = w === 2 ? 2 : 1;
    let done = false;
    for (let c = 0; !done; c += step)
      for (const r of tryRows)
        if (free(c, r, w, h)) {
          for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used[y][x] = true;
          places.push({ id: it.id, col: c, row: r, w, h });
          done = true;
          break;
        }
  }
  // Drop the columns nothing stands in (a lone quarter's pair), closing the row up.
  const width = Math.max(0, ...places.map((p) => p.col + p.w));
  const empty = Array.from({ length: width }, (_, c) => used.every((row) => !row[c]));
  const shift = (c: number) => empty.slice(0, c).filter(Boolean).length;
  for (const p of places) p.col -= shift(p.col);
  return { places, cols: width - empty.filter(Boolean).length };
}

/**
 * Where an item stands on the dash (m, across from the row's middle, and up from the dash's
 * middle) and its size, the grid's cells `pitch` m across (a full screen and the gap between
 * two: half each) and `cellH` m high, the row `cols` across, centred. A half-height item
 * with nothing above or below it stands in the middle of the dash's height; a quarter with
 * nothing beside it in its pair of columns stands in the middle of the pair (over a strip).
 */
export function placeOnDash(p: GridPlace, all: GridPlace[], cols: number, rows: number, pitch: number, gap: number, cellH: number): { x: number; rise: number; width: number; height: number } {
  const at = (c: number, r: number) => all.some((q) => q !== p && c >= q.col && c < q.col + q.w && r >= q.row && r < q.row + q.h);
  let c0 = p.col;
  let w = p.w;
  // A lone quarter over (or under) a strip: across the pair.
  const pair = p.col - (p.col % 2);
  if (p.w === 1 && pair + 1 < cols && !at(pair === p.col ? p.col + 1 : pair, p.row) && all.some((q) => q !== p && q.col <= pair && q.col + q.w >= pair + 2)) {
    c0 = pair;
    w = 2;
  }
  let r0 = p.row;
  let h = p.h;
  // Nothing above or below it in its columns: the middle of the dash's height.
  const cleanColumn = Array.from({ length: p.w }, (_, i) => p.col + i).every((c) => Array.from({ length: rows }, (_, r) => r).every((r) => (r >= p.row && r < p.row + p.h) || !at(c, r)));
  if (p.h < rows && cleanColumn) {
    r0 = 0;
    h = rows;
  }
  const left = (-cols * pitch + gap) / 2;
  const x = left + (c0 + w / 2) * pitch - gap / 2;
  const rise = ((rows - h) / 2 - r0) * cellH;
  return { x, rise, width: p.w * pitch - gap, height: p.h === rows ? rows * cellH : p.h * cellH - gap / 2 };
}
