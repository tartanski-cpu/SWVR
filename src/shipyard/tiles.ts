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
};
