/**
 * The Shipyard's picture tiles (owner, Oct 2026: the side menus are "still too much text. I'd
 * like it to be more pictorial ... a tooltip to give you all that information, or an
 * information button"). A choice is a small drawing with a short name and one line under it;
 * its full description is behind an ⓘ button (shown under the tiles, in place, so it works on
 * a touchscreen and in the headset's browser too) and in the tile's tooltip.
 *
 * Two kinds, as the page's other controls:
 *   pick    one of several (a design field's value: `data-key`/`data-i`, so page.ts marks the
 *           chosen one `on` as it does its other choices);
 *   toggle  on or off (a checkbox inside, `data-key`, so page.ts ticks and disables it as
 *           before; the tile shows it ticked or unavailable).
 *
 * The drawings are simple line icons drawn for the game (48 x 32, in the text's colour).
 */

/** One tile: its drawing (SVG markup), name, line under it, and full description. */
export interface Tile {
  icon: string;
  name: string;
  sub?: string;
  info: string;
}

/** The tiles' grid and, under it, the place their descriptions open in. */
function grid(parent: HTMLElement, heading?: string): { box: HTMLElement; info: (tile: HTMLElement, text: string) => HTMLButtonElement } {
  if (heading) {
    const h = document.createElement('div');
    h.className = 'tilesHead';
    h.textContent = heading;
    parent.appendChild(h);
  }
  const box = document.createElement('div');
  box.className = 'tiles';
  parent.appendChild(box);
  const about = document.createElement('div');
  about.className = 'tileInfo';
  about.hidden = true;
  parent.appendChild(about);
  let showing: HTMLElement | null = null;
  const info = (tile: HTMLElement, text: string) => {
    tile.title = text;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tileAbout';
    b.textContent = 'i';
    b.setAttribute('aria-label', 'More about this');
    b.onclick = (e) => {
      // (Inside a toggle's label: don't tick it.)
      e.preventDefault();
      e.stopPropagation();
      const open = showing !== tile;
      showing = open ? tile : null;
      about.hidden = !open;
      about.textContent = open ? text : '';
      box.querySelectorAll('.tileAbout').forEach((x) => x.classList.toggle('open', x === b && open));
    };
    tile.appendChild(b);
    return b;
  };
  return { box, info };
}

/** One row for up to four tiles (no tile left alone on a row), two rows for more; a pair no wider than it needs. */
function columns(box: HTMLElement, n: number): void {
  const across = n <= 4 ? n : Math.ceil(n / 2);
  box.style.gridTemplateColumns = `repeat(${across}, minmax(0, 1fr))`;
  if (n < 3) box.style.maxWidth = `${n * 110}px`;
}

const face = (t: Tile) => `${t.icon}<b>${t.name}</b>${t.sub ? `<small>${t.sub}</small>` : ''}`;

/** One of several: choosing a tile calls `pick` with its index. Returns the grid. */
export function pickTiles(parent: HTMLElement, key: string, tiles: Tile[], pick: (i: number) => void, heading?: string): HTMLElement {
  const { box, info } = grid(parent, heading);
  tiles.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.key = key;
    el.dataset.i = String(i);
    el.innerHTML = face(t);
    el.onclick = () => pick(i);
    info(el, t.info);
    box.appendChild(el);
  });
  columns(box, tiles.length);
  return box;
}

/** On or off, each its own design field: `set` is called with the field and 1 or 0. Returns the grid. */
export function toggleTiles(parent: HTMLElement, tiles: (Tile & { key: string })[], set: (key: string, on: number) => void, heading?: string): HTMLElement {
  const { box, info } = grid(parent, heading);
  for (const t of tiles) {
    const el = document.createElement('label');
    el.className = 'tile toggle';
    el.innerHTML = `<input type="checkbox" data-key="${t.key}">${face(t)}`;
    const input = el.querySelector('input')!;
    input.onchange = () => set(t.key, input.checked ? 1 : 0);
    info(el, t.info);
    box.appendChild(el);
  }
  columns(box, tiles.length);
  return box;
}

const svg = (body: string) => `<svg viewBox="0 0 48 32" width="48" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The Engine step's drawings: each engine from the side, her drives, her outboards. */
export const ENGINE_ICONS = {
  // A straight six: a long low block on its sump, six valve covers along its head, the flywheel at its end.
  six: svg('<path d="M9 13h28v10H9zM11 23l2 4h20l2-4M10 13v-3h26v3M12 10V8h3v2M16.5 10V8h3v2M21 10V8h3v2M25.5 10V8h3v2M30 10V8h3v2M37 14v9"/>'),
  // A V8: the block, its two heads leaning out in a V, a turbocharger's snail at the back.
  v8: svg('<path d="M12 15h22v8H12zM14 23l2 4h14l2-4M12 15l-3-6h10l2 6M34 15l3-6H27l-2 6"/><circle cx="41" cy="12" r="3"/><path d="M38 13h-4"/>'),
  // The bigger V8: the same, taller, with a turbocharger each side.
  v8big: svg('<path d="M11 14h24v10H11zM13 24l2 4h16l2-4M11 14l-3-7h11l2 7M35 14l3-7H27l-2 7"/><circle cx="42" cy="11" r="3"/><circle cx="5" cy="11" r="2.5"/><path d="M39 12h-4M7.5 12H11"/>'),
  // The tug diesel: a tall heavy block, six covers, a big flywheel.
  tug: svg('<path d="M13 9h27v16H13zM15 25l2 4h21l2-4M14 9V7h3v2M18.5 9V7h3v2M23 9V7h3v2M27.5 9V7h3v2M32 9V7h3v2M36.5 9V7h3v2"/><circle cx="8" cy="17" r="6"/><circle cx="8" cy="17" r="1.5"/>'),
  // The 750 kW diesel: taller still, filling the tile, a turbocharger on top, the biggest flywheel.
  medium: svg('<path d="M14 7h31v20H14zM16 27l2 3h24l2-3M18 7V4h22v3M32 4V1h6v3"/><circle cx="8" cy="17" r="7"/><circle cx="8" cy="17" r="1.5"/>'),
  // Two engines side by side (from above), a shaft and propeller each.
  twin: svg('<path d="M5 5h16v8H5zM5 19h16v8H5zM21 9h17M21 23h17M40 6v6M40 20v6"/>'),
  // Her stern from the side: the engine against the transom, the leg through it, its propeller.
  sternDrive: svg('<path d="M4 20h28l4-12M8 11h14v7H8zM22 14h11l2 2v8h4M40 21v6M33 26h3"/>'),
  // Her bottom from the side, a pod hung under it, its propeller at the front pulling.
  pods: svg('<path d="M3 9c10 2 30 2 42 0M24 11v7M14 18h16a3 3 0 0 1 0 6H14zM11 18v6M30 21h4"/>'),
  // A propeller inside its duct (cut through, from the side), the shaft to it.
  nozzle: svg('<path d="M14 5c6-2 16-2 22 0l-2 3c-5-1-13-1-18 0zM14 27c6 2 16 2 22 0l-2-3c-5 1-13 1-18 0zM3 16h21M25 9v14M25 16l3-5M25 16l-3 5"/>'),
  // No outboards: the inboard's shaft out through her bottom to its propeller and rudder.
  inboard: svg('<path d="M4 8h12v8H4zM16 13l18 7M36 17v7M40 14v12"/>'),
  // Outboards on her transom, seen from astern: one, two or three... cowls on their legs.
  ob2: svg('<path d="M4 9h40"/>' + [14, 34].map((x) => `<path d="M${x - 5} 12h10v7h-10zM${x} 19v8M${x - 3} 27h6"/>`).join('')),
  ob3: svg('<path d="M3 9h42"/>' + [10, 24, 38].map((x) => `<path d="M${x - 4} 12h8v7h-8zM${x} 19v8M${x - 2.5} 27h5"/>`).join('')),
  ob4: svg('<path d="M2 9h44"/>' + [8, 19, 30, 41].map((x) => `<path d="M${x - 3.5} 12h7v7h-7zM${x} 19v8M${x - 2} 27h4"/>`).join('')),
  // Exhaust stacks: raked aft, or straight up.
  stackRaked: svg('<path d="M8 28h32M17 28l4-14 6-6M25 28l4-14 6-6M26 6l3 3M34 6l3 3"/>'),
  stackStraight: svg('<path d="M8 28h32M18 28V6M24 28V6M28 28V6M34 28V6M17 6h8M27 6h8"/>'),
  // Stacks standing on the deckhouse in casings (a deckhouse, a box on it, a pipe out of its top).
  stackCasing: svg('<path d="M6 28h36M10 28V20h28v8M30 20v-8h6v8M33 12V4"/>'),
  casingRound: svg('<ellipse cx="24" cy="8" rx="8" ry="3"/><path d="M16 8v18M32 8v18M16 26c0 2 16 2 16 0M24 8V2"/>'),
  casingSquare: svg('<path d="M15 8h18v18H15zM24 8V2"/>'),
};

/**
 * An ⓘ button on a heading (a step's or a group's) that opens its longer description under it
 * (owner, Oct 2026: the description behind an information button, not always on the page).
 */
export function aboutHeading(heading: HTMLElement, text: string, html = false): HTMLElement {
  const about = document.createElement('div');
  about.className = 'tileInfo';
  about.hidden = true;
  if (html) about.innerHTML = text;
  else about.textContent = text;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tileAbout inline';
  b.textContent = 'i';
  b.title = about.textContent ?? '';
  b.setAttribute('aria-label', 'More about this');
  b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    about.hidden = !about.hidden;
    b.classList.toggle('open', !about.hidden);
  };
  heading.appendChild(b);
  heading.after(about);
  return about;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** A colour sample (filled shapes, not lines): `body` in its own fills. */
const swatch = (body: string) => `<svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">${body}</svg>`;

/** The Hull step's drawings: each hull type from the side (bow to the right), her protection, rails, what she's built of. */
export const HULL_ICONS = {
  // The landing craft: a flat-bottomed box, the house right aft, the ramp raised at her square bow.
  lander: svg('<path d="M3 15h37l3 7H6zM5 22l-2-7M6 15V9h8v6M40 15l4-10"/>'),
  // The gillnetter: beamy and low, the house forward of amidships, her working deck aft.
  gillnetter: svg('<path d="M3 16h41l-4 7H6zM6 23l-3-7M24 16V9h9v7M26 9V6"/>'),
  // The (retired) workboat: a hard-chine hull, her house amidships.
  workboat: svg('<path d="M3 15h38l5-3-4 11H7zM7 23l-4-8M18 15V8h11v7"/>'),
  // The pilot boat: long and low, a long house with sloped front, a well-raked stem.
  pilot: svg('<path d="M3 16h36l7-4c-2 6-4 9-8 11H8zM8 23l-5-7M11 16V10h17l5 6"/>'),
  // The small tug: deep, a strong sheer up to her high square push bow, the house forward, a stack.
  tug: svg('<path d="M3 18h22c7 0 13-3 18-8v15H7zM7 25l-4-7M25 18V8h9v8M29 8V3M43 11v13"/>'),
  // The stern trawler: a whaleback forward with the house on it, a long low working deck aft, the A-frame over her stern.
  trawler: svg('<path d="M4 18h24l4-5h12l-3 11H7zM7 24l-3-6M30 13V6h8v7M4 18l2-8 4 8"/>'),
  // The fast catamaran, seen from ahead: two slim hulls under a wide bridge deck, the house on it.
  catamaran: svg('<path d="M5 13h38v4H5zM7 17l3 9h4l3-9M31 17l3 9h4l3-9M17 13V6h14v7"/>'),
  // Her sides from abeam, and what's on them.
  guardNone: svg('<path d="M4 9h40l-2 15H6z"/>'),
  guardFenders: svg('<path d="M4 9h40l-2 15H6zM13 9v4M24 9v4M35 9v4"/><rect x="11" y="13" width="4" height="8" rx="2"/><rect x="22" y="13" width="4" height="8" rx="2"/><rect x="33" y="13" width="4" height="8" rx="2"/>'),
  guardStrake: svg('<path d="M4 9h40l-2 15H6z"/><path d="M4.5 13h39" stroke-width="3.2"/>'),
  // A bow fender: her bow in profile, a thick block of rubber on the stem.
  bowFender: svg('<path d="M4 12h26l10 10H6z"/><path d="M30 8h7v8h-3z" fill="currentColor"/>'),
  noBowFender: svg('<path d="M4 12h26l10 10H6z"/>'),
  guardTyres: svg('<path d="M4 9h40l-2 15H6z"/><circle cx="12" cy="15" r="3.5"/><circle cx="24" cy="15" r="3.5"/><circle cx="36" cy="15" r="3.5"/>'),
  guardBoth: svg('<path d="M4 9h40l-2 15H6zM18 9v6M30 9v6"/><path d="M4.5 12h39" stroke-width="3.2"/><rect x="16" y="15" width="4" height="7" rx="2"/><rect x="28" y="15" width="4" height="7" rx="2"/>'),
  // Her bulwark, with handrails on posts over it, or bare.
  rails: svg('<path d="M3 26h42M5 26v-6h38v6M8 20V9M18 20V9M28 20V9M38 20V9M6 9h36M6 14.5h36"/>'),
  noRails: svg('<path d="M3 26h42M5 26v-6h38v6"/>'),
  // A plate of each: light aluminium, heavy steel (an I-beam).
  aluminium: svg('<path d="M8 10h32l-4 12H4z"/><text x="21" y="19.5" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">Al</text>'),
  steel: svg('<path d="M10 6h28M10 26h28M24 6v20M10 6v3h28V6M10 26v-3h28v3"/>'),
};

/** The Wheelhouse step's drawings. */
export const HOUSE_ICONS = {
  // Her front windows from above: flat across, or in three facets.
  flat: svg('<path d="M8 8h32v18H8zM8 8h32" stroke-width="2.4"/>'),
  facets: svg('<path d="M8 14l6-6h20l6 6v12H8z"/><path d="M8 14l6-6h20l6 6" stroke-width="2.4"/>'),
  // Her aft windows from above (the front at the top): flat across, or in three facets.
  aftFlat: svg('<path d="M8 8h32v18H8z"/><path d="M8 26h32" stroke-width="2.4"/>'),
  aftFacets: svg('<path d="M8 8h32v12l-6 6H14l-6-6z"/><path d="M40 20l-6 6H14l-6-6" stroke-width="2.4"/>'),
  // From ahead: the sides upright, or raked out (wider at the top).
  upright: svg('<path d="M12 26V8h24v18M12 14h24M8 26h32"/>'),
  rakedOut: svg('<path d="M14 26L9 6h30l-5 20M11 13h26M8 26h32"/>'),
  // From the side: the window sill at the standard height, or low, below the console.
  sillStd: svg('<path d="M6 26V6h36v20zM6 15h36M10 15V9h28v6"/><path d="M12 26v-5h8v5"/>'),
  sillLow: svg('<path d="M6 26V6h36v20zM6 21h36M10 21V9h28v12"/><path d="M12 26v-8h8v8"/>'),
  sillHigh: svg('<path d="M6 26V6h36v20zM6 12h36M10 12V9h28v3"/><path d="M12 26v-12h8v12"/>'),
  // Her helm from above: the console in the middle, to port or to starboard (bow up).
  consoleMid: svg('<path d="M10 4h28v24H10z"/><rect x="18" y="7" width="12" height="5" fill="currentColor"/>'),
  consolePort: svg('<path d="M10 4h28v24H10z"/><rect x="12" y="7" width="12" height="5" fill="currentColor"/>'),
  consoleStbd: svg('<path d="M10 4h28v24H10z"/><rect x="24" y="7" width="12" height="5" fill="currentColor"/>'),
  // From above: no chart table, or one against the port wall aft.
  noTable: svg('<path d="M10 4h28v24H10zM18 7h12v4H18z"/>'),
  table: svg('<path d="M10 4h28v24H10zM18 7h12v4H18z"/><rect x="11" y="18" width="7" height="8" fill="currentColor"/>'),
  // The deckhouse's top: bare, or walked with a rail and a ladder.
  notWalked: svg('<path d="M4 26h40M10 26V16h28v10M20 16V6h10v10"/>'),
  walked: svg('<path d="M4 26h40M10 26V16h28v10M20 16V6h10v10M11 16v-5M37 16v-5M11 11h7M32 11h5M8 26v-9M5 18h3M5 22h3"/>'),
  // Inside the deckhouse (cut through): solid, or a cabin below with its berth.
  solid: svg('<path d="M3 20h42l-4 7H7zM14 20v-8h20v8"/>'),
  cabin: svg('<path d="M3 20h42l-4 7H7zM14 20v-8h20v8"/><path d="M15 26v-9h18v9" stroke-dasharray="2 1.5"/><path d="M26 23h6"/>'),
  // Her hull cut through: no hold, or a hold under the deck.
  noHold: svg('<path d="M4 9h40l-6 17H10zM4 9h40"/>'),
  // The ship's boat, side on: the dinghy (fat tubes, a small motor), or the rescue boat (a
  // longer RIB with her console and a big outboard).
  dinghy: svg('<rect x="9" y="15" width="26" height="6" rx="3"/><path d="M11 21l3 4h17l3-4M35 14v9h3"/>'),
  ribBoat: svg('<rect x="3" y="16" width="36" height="6" rx="3"/><path d="M5 22l4 4h27l3-4M20 16v-7h6l1 7M39 12v12h4v-12z"/>'),
  hold: svg('<path d="M4 9h40l-6 17H10z"/><path d="M14 11h20l-3 11H17z" fill="currentColor" fill-opacity=".35"/>'),
};

/** Her lining (walls and ceiling) as a sample: the ceiling over the walls, beams across it where it has them. */
export function liningIcon(f: { walls: number; ceiling: number; ceilingTile: string }): string {
  const beams = f.ceilingTile.startsWith('beams') ? [10, 20, 30, 40].map((x) => `<rect x="${x}" y="3" width="2" height="9" fill="#a86c3c"/>`).join('') : '';
  const grain = f.ceilingTile === 'wood' ? [6, 9, 18, 21, 27].map((y) => `<rect x="4" y="${y}" width="40" height="0.8" fill="#000" fill-opacity=".2"/>`).join('') : '';
  return swatch(`<rect x="4" y="3" width="40" height="9" rx="1" fill="${hex(f.ceiling)}"/>${beams}<rect x="4" y="13" width="40" height="16" rx="1" fill="${hex(f.walls)}"/>${grain}`);
}

/** Her cabin floor as a sample: matting, teak planks with pale seams, a dark non-slip grip. */
export function floorIcon(f: { colour: number | null; tile: string }): string {
  const base = hex(f.colour ?? 0x8a8678);
  const lines =
    f.tile === 'deckTeak'
      ? [9, 15, 21].map((y) => `<rect x="4" y="${y}" width="40" height="0.9" fill="#d8c8a8"/>`).join('')
      : f.tile === 'nonSlip'
        ? Array.from({ length: 24 }, (_, i) => `<circle cx="${8 + (i % 8) * 4.6}" cy="${8 + Math.floor(i / 8) * 7}" r="0.9" fill="#777"/>`).join('')
        : [8, 14, 20, 26].map((x) => `<rect x="${x * 1.5}" y="4" width="0.8" height="23" fill="#000" fill-opacity=".15"/>`).join('');
  return swatch(`<rect x="4" y="4" width="40" height="23" rx="1.5" fill="${base}"/>${lines}`);
}

/** The Controls step's drawings. */
export const CONTROL_ICONS = {
  // Old school: a round gauge with its needle.
  analogue: svg('<circle cx="16" cy="16" r="10"/><circle cx="34" cy="18" r="7"/><path d="M16 16l5-5M34 18l-3-4M10 12l1.5 1M22 12l-1.5 1"/>'),
  // Basic: two small screens with their figures.
  basic: svg('<rect x="4" y="8" width="18" height="14" rx="1.5"/><rect x="26" y="8" width="18" height="14" rx="1.5"/><path d="M9 15h8M31 15h8"/>'),
  // Advanced: big screens over a row of switches.
  advanced: svg('<rect x="3" y="4" width="20" height="14" rx="1.5"/><rect x="25" y="4" width="20" height="14" rx="1.5"/><path d="M5 25h38M9 22v4M15 22v4M21 22v4M30 22v4M36 22v4"/>'),
  // Screens: one for each, or touchscreens with tabs along the top.
  separate: svg('<rect x="3" y="10" width="12" height="12" rx="1"/><rect x="18" y="10" width="12" height="12" rx="1"/><rect x="33" y="10" width="12" height="12" rx="1"/>'),
  oneTouch: svg('<rect x="9" y="5" width="30" height="22" rx="1.5"/><path d="M9 10h30M16 5v5M23 5v5M30 5v5"/>'),
  twoTouch: svg('<rect x="3" y="7" width="20" height="18" rx="1.5"/><rect x="25" y="7" width="20" height="18" rx="1.5"/><path d="M3 11h20M25 11h20M9 7v4M15 7v4M31 7v4M37 7v4"/>'),
  // Helm assist: none, or the wheel with an A for the autopilot.
  noAssist: svg('<circle cx="24" cy="16" r="10"/><circle cx="24" cy="16" r="2"/><path d="M24 6v8M14 16h8M26 16h8"/>'),
  assist: svg('<circle cx="18" cy="16" r="10"/><circle cx="18" cy="16" r="2"/><path d="M18 6v8M8 16h8M20 16h8M34 24l5-14 5 14M36 19h6"/>'),
};
