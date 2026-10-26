/**
 * Service liveries (owner, 26 Oct 2026: "liveries for the pilot boat and the fast landing
 * craft, probably police, fire, and rescue. And Coast Guard"; design.markings): her colours
 * for the service, and its markings on her topsides: bands, a chequer, the service's name.
 * Our own schemes, in the spirit of such boats, not any real service's.
 *
 * The markings are a thin skin over her topsides (modules/markings draws it, with its picture
 * painted from the bands and the name here): worked out here on her stations, the game's own
 * (vessel/hullForm.ts), so it lies on her hull as the game draws it. Down her side its rows
 * are at fixed depths under her deck edge, so a band keeps its depth as her sheer rises.
 * A monohull's only: the catamaran's sides are two hulls' (none for her yet).
 */
import { CONFIG } from '../../config';
import type { HullForm, Station } from '../../vessel/hullForm';
import type { MarkingBand, MarkingsConfig } from '../../modules/markings';

export interface ServiceLivery {
  name: string;
  /** Her colours for it, set when it's chosen (still the player's to change after). */
  colours: { paint: number; houseColour: number; roofPaint: number; frames: number };
  /** Its bands down her side: from `top` to `top + height`, as shares of the markings' depth. */
  bands: MarkingBand[];
  /** The service's name along her side forward, and where it stands down her side (shares). */
  text: { word: string; colour: number; outline?: number; top: number; height: number };
}

/**
 * The services (design.markings 1..4; 0 none). Colours: LIVERIES (paint), HOUSE_PAINTS
 * (houseColour), ROOF_PAINTS (roofPaint) and FRAME_COLOURS (frames) indexes.
 */
export const SERVICE_LIVERIES: ServiceLivery[] = [
  {
    // White, a band of blue and yellow squares, POLICE in dark blue under it.
    name: 'Police',
    colours: { paint: 4, houseColour: 1, roofPaint: 7, frames: 0 },
    bands: [
      { top: 0.04, height: 0.32, kind: 'chequer', colours: [0x1e3f8f, 0xf2c41a] },
      { top: 0.38, height: 0.035, kind: 'solid', colours: [0x1e3f8f] },
    ],
    text: { word: 'POLICE', colour: 0x1e3f8f, top: 0.48, height: 0.44 },
  },
  {
    // Red, a white band over a yellow one, FIRE in white.
    name: 'Fire',
    colours: { paint: 7, houseColour: 1, roofPaint: 6, frames: 0 },
    bands: [
      { top: 0.04, height: 0.1, kind: 'solid', colours: [0xf4f4f0] },
      { top: 0.14, height: 0.08, kind: 'solid', colours: [0xf2c41a] },
    ],
    text: { word: 'FIRE', colour: 0xf4f4f0, top: 0.32, height: 0.56 },
  },
  {
    // Orange, a chequer of orange and white, RESCUE in white edged dark blue.
    name: 'Rescue',
    colours: { paint: 1, houseColour: 1, roofPaint: 1, frames: 0 },
    bands: [
      { top: 0.04, height: 0.22, kind: 'chequer', colours: [0xf4f4f0, 0xd9622b] },
      { top: 0.27, height: 0.04, kind: 'solid', colours: [0x1f3a5c] },
    ],
    text: { word: 'RESCUE', colour: 0xf4f4f0, outline: 0x1f3a5c, top: 0.4, height: 0.5 },
  },
  {
    // White, a broad red band with a thin dark blue one under it, COASTGUARD in dark blue.
    name: 'Coastguard',
    colours: { paint: 4, houseColour: 1, roofPaint: 2, frames: 0 },
    bands: [
      { top: 0.04, height: 0.16, kind: 'solid', colours: [0xc0302a] },
      { top: 0.23, height: 0.05, kind: 'solid', colours: [0x1f3a5c] },
    ],
    text: { word: 'COASTGUARD', colour: 0x1f3a5c, top: 0.42, height: 0.4 },
  },
];

/** The page's names for design.markings: none, then the services. */
export const MARKING_NAMES = ['None', ...SERVICE_LIVERIES.map((s) => s.name)] as const;

/** Her starboard side's half-breadth at height `y` on a station, down her drawn outline (deck edge, spray chine, chine or bilge, keel). */
function sideAt(st: Station, y: number): number {
  const p = st.polygon;
  const n = p.length;
  // Her starboard half: the last points of her section, deck edge first (hullForm.ts: port deck edge, port chine, keel, starboard chine, starboard deck edge).
  const pts: [number, number][] = [p[n - 1], ...(st.spray ? [st.spray] : []), ...(st.bilge ? [st.bilge[1], st.bilge[0]] : [p[n - 2]]), p[n - 3]];
  if (y >= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (y <= y0 && y >= y1) return y0 === y1 ? x0 : x0 + ((x1 - x0) * (y0 - y)) / (y0 - y1);
  }
  return pts[pts.length - 1][0];
}

/**
 * The skin's corners and picture coordinates for a service livery on her (null: a catamaran,
 * or no room on her sides). It starts under the top of her bulwark (`bulwark` m over her deck
 * edge; its plate stands on the deck edge, so her side carries straight up it), so a boat whose
 * side is mostly bulwark (the landing craft) wears them there, not squeezed under her deck. Positions in her axes; `uv` across the picture: its top half her
 * starboard side, its bottom half her port, each read with her bow ahead of the name.
 */
export function markingsFit(form: HullForm, service: ServiceLivery, bulwark: number): MarkingsConfig | null {
  if (form.catamaran) return null;
  const c = CONFIG.shipyard.markings;
  const st = [...form.stations].sort((a, b) => b.z - a.z); // transom first
  const zT = st[0].z;
  const zS = st[st.length - 1].z;
  const at = (t: number) => {
    const z = zT + (zS - zT) * t;
    let i = 0;
    while (i < st.length - 2 && st[i + 1].z > z) i++;
    const a = st[i];
    const b = st[i + 1];
    const u = a.z === b.z ? 0 : (z - a.z) / (b.z - a.z);
    const deckY = a.polygon[a.polygon.length - 1][1] + u * (b.polygon[b.polygon.length - 1][1] - a.polygon[a.polygon.length - 1][1]);
    return { z, deckY, x: (y: number) => sideAt(a, y) + u * (sideAt(b, y) - sideAt(a, y)) };
  };
  // Along her: her stations' spacing, closer at her ends.
  const ts: number[] = [];
  for (let t = c.from; t < c.to; t += t > 0.75 ? 0.01 : 0.025) ts.push(t);
  ts.push(c.to);
  const cols = ts.map(at);
  // Its top under her bulwark's; its depth a share of her least freeboard to it (her waterline at y 0).
  const top = bulwark - c.topDrop;
  const depth = c.depthShare * Math.min(...cols.map((s) => s.deckY + top));
  if (depth < 0.15) return null;
  const length = Math.abs(cols[cols.length - 1].z - cols[0].z);
  const positions: number[] = [];
  const uvs: number[] = [];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  for (const side of [1, -1]) {
    // Each side's corners: a grid, `rows` deep, a column at each t.
    const grid = cols.map((s) =>
      Array.from({ length: c.rows + 1 }, (_, k) => {
        const y = s.deckY + top - (depth * k) / c.rows;
        const along = Math.abs(s.z - cols[0].z) / length; // 0 aft .. 1 forward
        // The picture: starboard in its top half, read aft to forward; port in its bottom half, read forward to aft.
        const u = side > 0 ? along : 1 - along;
        const v = side > 0 ? 1 - (0.5 * k) / c.rows : 0.5 - (0.5 * k) / c.rows;
        return { p: [r3(side * (s.x(y) + c.offset)), r3(y), r3(s.z)], uv: [r3(u), r3(v)] };
      }),
    );
    for (let j = 0; j < grid.length - 1; j++)
      for (let k = 0; k < c.rows; k++) {
        const a = grid[j][k];
        const b = grid[j + 1][k];
        const d = grid[j][k + 1];
        const e = grid[j + 1][k + 1];
        // Wound to face outboard (her stations run forward, -z, along j).
        const quad = side > 0 ? [a, d, b, b, d, e] : [a, b, d, b, e, d];
        for (const q of quad) {
          positions.push(...q.p);
          uvs.push(...q.uv);
        }
      }
  }
  return { positions, uvs, lengthM: r3(length), depthM: r3(depth), bands: service.bands, text: { ...service.text, at: c.textAt, share: c.textShare }, pxPerM: c.pxPerM, maxPx: c.maxPx };
}
