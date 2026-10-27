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

/** The screens' names in words (the Shipyard's console editor, the warnings), by their console socket. */
export const SCREEN_NAMES: Record<string, string> = { speed: 'Speed and depth', anchorScreen: 'Anchor', heading: 'Heading', rpm: 'Engine', engineMonitor: 'Engine monitor', efficiency: 'Efficiency', solar: 'Solar & battery', towline: 'Tow line', dialCompass: 'Compass', dialSpeed: 'Log', dialDepth: 'Depth', dialChain: 'Chain counter', dialRpm: 'Rev counter', dialTemp: 'Temperature', dialFuel: 'Fuel', clock: 'Clock', dialClock: 'Clock', touch1: 'Touchscreen', touch2: 'Second touchscreen' };

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
export function placeOnDash(p: GridPlace, all: GridPlace[], cols: number, rows: number, pitch: number, gap: number, cellH: number, snap = true): { x: number; rise: number; width: number; height: number } {
  const at = (c: number, r: number) => all.some((q) => q !== p && c >= q.col && c < q.col + q.w && r >= q.row && r < q.row + q.h);
  let c0 = p.col;
  let w = p.w;
  // A lone quarter over (or under) a strip: across the pair.
  const pair = p.col - (p.col % 2);
  // (Not when placed by hand: it stays where it was put.)
  if (snap && p.w === 1 && pair + 1 < cols && !at(pair === p.col ? p.col + 1 : pair, p.row) && all.some((q) => q !== p && q.col <= pair && q.col + q.w >= pair + 2)) {
    c0 = pair;
    w = 2;
  }
  let r0 = p.row;
  let h = p.h;
  // Nothing above or below it in its columns: the middle of the dash's height.
  const cleanColumn = Array.from({ length: p.w }, (_, i) => p.col + i).every((c) => Array.from({ length: rows }, (_, r) => r).every((r) => (r >= p.row && r < p.row + p.h) || !at(c, r)));
  if (snap && p.h < rows && cleanColumn) {
    r0 = 0;
    h = rows;
  }
  const left = (-cols * pitch + gap) / 2;
  const x = left + (c0 + w / 2) * pitch - gap / 2;
  const rise = ((rows - h) / 2 - r0) * cellH;
  return { x, rise, width: p.w * pitch - gap, height: p.h === rows ? rows * cellH : p.h * cellH - gap / 2 };
}

/**
 * The switch panel (CS2): the flat panel in front of the dash, a row of switch cells along
 * the console (`pitch` m apart, CONFIG.shipyard.helm.switchPitch). A group (LIGHTS, ENGINE...)
 * is a run of cells, at least `cells` long, its members side by side in the middle of it. The
 * port groups are packed in from the port end of the panel, in order; the starboard ones in
 * from the starboard end; neither nearer the wheel's middle than `groupClear` (behind its rim
 * a switch is hard to see and reach). One beside the wheel (`wheelPort`: the horn) goes out
 * from `wheelClear` port of its middle, under the rim beside the hub. If a side's groups won't
 * fit, the cells close up (both sides alike) until they do, but not under `minPitch` (then
 * the groups nearest the wheel reach in under it).
 */
export interface PanelGroup {
  title: string;
  color: number;
  side: 'port' | 'starboard' | 'wheelPort';
  members: string[];
  cells?: number;
}

/** Each member's place across the panel (m, + starboard), each group's run of cells (m), and the pitch used. */
export function packPanel(groups: PanelGroup[], half: number, pitch: number, wheelClear: number, groupClear = wheelClear, minPitch = 0): { at: Record<string, number>; runs: { group: PanelGroup; x0: number; x1: number }[]; pitch: number } {
  const n = (g: PanelGroup) => Math.max(g.cells ?? 0, g.members.length);
  const sum = (side: PanelGroup['side']) => groups.filter((g) => g.side === side && g.members.length).reduce((a, g) => a + n(g), 0);
  // Close up if needed: each side's groups between its end and `groupClear` from the wheel.
  const room = Math.max(0.01, half - groupClear);
  const p = Math.max(Math.min(minPitch, pitch), Math.min(pitch, sum('port') ? room / sum('port') : pitch, sum('starboard') ? room / sum('starboard') : pitch));
  const at: Record<string, number> = {};
  const runs: { group: PanelGroup; x0: number; x1: number }[] = [];
  const cursor = { port: -half, starboard: half, wheelPort: -wheelClear };
  for (const g of groups) {
    if (!g.members.length) continue;
    const len = n(g) * p;
    const x0 = g.side === 'port' ? cursor.port : cursor[g.side] - len;
    if (g.side === 'port') cursor.port += len;
    else cursor[g.side] -= len;
    const first = (n(g) - g.members.length) / 2;
    g.members.forEach((id, i) => (at[id] = x0 + (first + i + 0.5) * p));
    runs.push({ group: g, x0, x1: x0 + len });
  }
  return { at, runs, pitch: p };
}

// ── Placed by hand (CS3) ──

/**
 * The dash's whole grid (for placing by hand): as many columns as the dash has room for at the
 * full pitch, or the automatic row's if that's more (then all smaller together, as the row is).
 */
export function dashCap(room: number, pitch: number, gap: number, autoCols: number): { cap: number; pitch: number } {
  const cap = Math.max(autoCols, Math.floor((room + gap) / pitch + 1e-9));
  return { cap, pitch: Math.min(pitch, (room + gap) / cap) };
}

/**
 * Screens placed by hand on the dash's whole grid (`cap` columns, `rows` high): each where it
 * was put (`want`: its column and row) if it's on the grid and its cells are free, in order;
 * the rest (new, or not fitting where they were put: `moved`) at the first free place nearest
 * the middle, as the rules would.
 */
export function placeDashByHand(items: GridItem[], rows: number, cap: number, want: Record<string, { col: number; row: number } | null>): { places: GridPlace[]; moved: string[] } {
  const used: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cap).fill(false));
  const free = (c: number, r: number, w: number, h: number) => {
    if (c < 0 || r < 0 || c + w > cap || r + h > rows) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (used[y][x]) return false;
    return true;
  };
  const take = (it: GridItem, c: number, r: number): GridPlace => {
    for (let y = r; y < r + it.cells[1]; y++) for (let x = c; x < c + it.cells[0]; x++) used[y][x] = true;
    return { id: it.id, col: c, row: r, w: it.cells[0], h: it.cells[1] };
  };
  const places: GridPlace[] = [];
  const moved: string[] = [];
  const later: GridItem[] = [];
  for (const it of items) {
    const w = want[it.id];
    if (w && free(w.col, w.row, it.cells[0], it.cells[1])) places.push(take(it, w.col, w.row));
    else {
      if (w) moved.push(it.id);
      later.push(it);
    }
  }
  for (const it of later) {
    const [w, h] = it.cells;
    const mid = (cap - w) / 2;
    const cols = Array.from({ length: Math.max(0, cap - w + 1) }, (_, c) => c).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const tryRows = Array.from({ length: rows - h + 1 }, (_, i) => i);
    if (w === 2 && h < rows) tryRows.reverse();
    let placed = false;
    for (const c of cols) {
      for (const r of tryRows)
        if (free(c, r, w, h)) {
          places.push(take(it, c, r));
          placed = true;
          break;
        }
      if (placed) break;
    }
    // (No room anywhere: left off the grid; the caller says so.)
    if (!placed && !moved.includes(it.id)) moved.push(it.id);
  }
  return { places, moved };
}

/** A switch group's key in the design (PANEL_SLOTS): its title, the searchlight's whatever it's called, the horn by name. */
export const panelKey = (g: PanelGroup): string => (g.title === '' ? 'horn' : g.title.includes('SEARCH') || g.title === 'FIRE' ? 'SEARCH' : g.title);

/**
 * Switch groups placed by hand along the panel's `cap` cells: each from the cell it was put
 * at (`want`, by panelKey) if its run is on the panel and free, in order; the rest (`moved`
 * if they had a place) packed as the rules would, port ones from the port end, starboard ones
 * from the starboard end, the horn nearest the middle, into the first free run.
 */
export function placePanelByHand(groups: PanelGroup[], cap: number, want: Record<string, number | null>): { starts: Record<string, number>; moved: string[] } {
  const used = new Array<boolean>(cap).fill(false);
  const free = (k: number, n: number) => k >= 0 && k + n <= cap && used.slice(k, k + n).every((u) => !u);
  const n = (g: PanelGroup) => Math.max(g.cells ?? 0, g.members.length);
  const starts: Record<string, number> = {};
  const moved: string[] = [];
  const later: PanelGroup[] = [];
  for (const g of groups) {
    if (!g.members.length) continue;
    const k = want[panelKey(g)];
    if (k !== null && k !== undefined && free(k, n(g))) {
      used.fill(true, k, k + n(g));
      starts[panelKey(g)] = k;
    } else {
      if (k !== null && k !== undefined) moved.push(panelKey(g));
      later.push(g);
    }
  }
  for (const g of later) {
    const len = n(g);
    const all = Array.from({ length: Math.max(0, cap - len + 1) }, (_, k) => k);
    const order = g.side === 'port' ? all : g.side === 'starboard' ? all.reverse() : all.sort((a, b) => Math.abs(a + len / 2 - cap / 2) - Math.abs(b + len / 2 - cap / 2));
    const k = order.find((c) => free(c, len));
    if (k === undefined) {
      if (!moved.includes(panelKey(g))) moved.push(panelKey(g));
      continue;
    }
    used.fill(true, k, k + len);
    starts[panelKey(g)] = k;
  }
  return { starts, moved };
}

