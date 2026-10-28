/**
 * The ferries' designs (the coast extras plan, C7; traffic/ferries.ts): three of the game's
 * own, more detailed than the passing traffic (about the tow's coaster), each one merged,
 * vertex-coloured mesh of simple shapes. Bow toward -z, the waterline at y = 0, sized to
 * CONFIG.ferries.classes.
 *
 *   large   a ro-ro ferry for the longer crossings: a high-sided hull round the car deck, a
 *           bow visor and a stern ramp, two decks of passenger accommodation with rows of
 *           windows, the bridge forward with its wings, a mast and radar, a funnel aft,
 *           lifeboats along the boat deck
 *   small   a double-ended car ferry for the short hops: a low open car deck with a ramp at
 *           each end, the passenger lounge and wheelhouse along one side, a small funnel
 *   launch  a passenger launch: a cabin with a row of windows, the wheelhouse on top forward,
 *           an open deck aft
 *   harbour a harbour ferry of Hamburg's kind (owner: "a wheelhouse at the back, and then the
 *           cabin at the front"): a beamy, shallow hull; the enclosed passenger cabin forward
 *           with its windows, its roof an open upper deck behind a rail; aft, the wheelhouse
 *           raised on an arch over the open after deck and the boarding ramp
 *   container  a container ship: a long hull with a flared bow, her accommodation block and
 *           bridge aft with its wings across her beam, her funnel behind it, and bay after bay
 *           of containers stacked on deck in mixed colours, lashing bridges between
 *
 * Liveries (the owner's choice for the Clyde and the Hebrides): `calmac` the colours a
 * Clyde or Hebridean ferry is known by (black hull, red boot-topping, white upperworks, red
 * funnel with a black top; no emblem, no name); `other` another company's, the game's own
 * (dark blue hull, white upperworks, a blue funnel with a white band); `aegean` an island
 * ferry's (white hull with a blue band, a blue funnel with a white top).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mergeParts, part } from '../render/geometryUtils';
import type { FerryRouteDef } from '../world/defs';

type Livery = FerryRouteDef['livery'];
const LIVERY: Record<Livery, { hull: number; band: number; boot: number; upper: number; funnel: number; funnelTop: number; funnelBand?: number }> = {
  calmac: { hull: 0x18191b, band: 0x18191b, boot: 0xa8201c, upper: 0xf2f0ea, funnel: 0xc8201c, funnelTop: 0x18191b },
  other: { hull: 0x1d2f4f, band: 0x1d2f4f, boot: 0xa8201c, upper: 0xf2f0ea, funnel: 0x1d3f7a, funnelTop: 0x1d3f7a, funnelBand: 0xf2f0ea },
  aegean: { hull: 0xf2f0ea, band: 0x1d4f9a, boot: 0xa8201c, upper: 0xf2f0ea, funnel: 0x1d4f9a, funnelTop: 0xf2f0ea },
  // Hamburg's harbour ferries (owner: "typically like all yellow or all red"): one colour all
  // over, hull and upperworks, a dark boot-topping.
  'harbour-yellow': { hull: 0xf0c020, band: 0xf0c020, boot: 0x2a2a2a, upper: 0xf0c020, funnel: 0xf0c020, funnelTop: 0xf0c020 },
  'harbour-red': { hull: 0xc42a22, band: 0xc42a22, boot: 0x2a2a2a, upper: 0xc42a22, funnel: 0xc42a22, funnelTop: 0xc42a22 },
  // Container ships' hulls (invented lines): dark blue, dark red, grey; white accommodation.
  'cargo-blue': { hull: 0x1d2f4f, band: 0x1d2f4f, boot: 0x9a2a22, upper: 0xf2f0ea, funnel: 0x1d2f4f, funnelTop: 0x18191b },
  'cargo-red': { hull: 0x6a1e1c, band: 0x6a1e1c, boot: 0x3a1a1a, upper: 0xf2f0ea, funnel: 0xf2f0ea, funnelTop: 0x6a1e1c },
  'cargo-grey': { hull: 0x5a6266, band: 0x5a6266, boot: 0x9a2a22, upper: 0xf2f0ea, funnel: 0x2a5a8a, funnelTop: 0x18191b },
};
const GLASS = 0x1c2a34;
const DECK = 0x6a6c6a;
const GREY = 0x8a8c88;
const ORANGE = 0xe8701a;

const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, l).translate(x, y, z), c);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, c: number, seg = 10) => part(new THREE.CylinderGeometry(r1, r0, h, seg).translate(x, y + h / 2, z), c);

/** A hull from its plan, extruded from `bottom` to `top`: a transom `stern` x her beam wide, the forward `bow` share of her length drawn in to the stem (a double-ender: both ends). */
function hullPlan(L: number, B: number, bottom: number, top: number, bow: number, stern: number, c: number, both = false): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const aft = both ? L / 2 - L * bow : -L / 2;
  const sw = both ? B * 0.35 : B * stern;
  // Shape y = -z (the stem at +y), extruded along +z and turned to stand up.
  s.moveTo(-sw / 2, -L / 2);
  s.lineTo(sw / 2, -L / 2);
  if (both) s.lineTo(B / 2, -aft);
  s.lineTo(B / 2, L / 2 - L * bow);
  s.lineTo(B * 0.18, L / 2);
  s.lineTo(-B * 0.18, L / 2);
  s.lineTo(-B / 2, L / 2 - L * bow);
  if (both) s.lineTo(-B / 2, -aft);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2).translate(0, bottom, 0);
  return part(g, c);
}

/**
 * Her hull in horizontal slices, each its own colour, bottom to top ([bottom, top, colour]):
 * the boot-topping, the hull, a band. One plan for all, stacked, so no two side faces lie on
 * each other. (Painted on as a hair-larger copy of the hull, a band's sides and the hull's
 * were a few centimetres apart, and from a few hundred metres the depth buffer can't tell
 * them apart: they flickered, owner Oct 2026.)
 */
function hullBands(L: number, B: number, bow: number, stern: number, slices: [number, number, number][], both = false): THREE.BufferGeometry[] {
  return slices.filter(([b, t]) => t > b).map(([b, t, c]) => hullPlan(L, B, b, t, bow, stern, c, both));
}

/** Rows of dark windows along both sides of a block (its middle at x `x0`, half-width `hw`), `n` rows from `y0` every `dy`, from z0 to z1. */
function windows(hw: number, y0: number, dy: number, n: number, z0: number, z1: number, out: THREE.BufferGeometry[], x0 = 0): void {
  for (let r = 0; r < n; r++) for (const side of [-1, 1]) out.push(box(0.06, 0.9, z1 - z0, x0 + side * (hw + 0.03), y0 + r * dy, (z0 + z1) / 2, GLASS));
}

function large(L: number, B: number, d: number, fb: number, c: (typeof LIVERY)[Livery]): THREE.BufferGeometry[] {
  const car = fb + 5.4; // the top of the car deck's shell
  const p: THREE.BufferGeometry[] = [
    // Boot-topping at the waterline; above the hull, the car deck's shell in the upper works'
    // white, as the West Coast ferries are painted, or an Aegean ferry's blue band under the deck edge.
    ...hullBands(L, B, 0.22, 0.86, c.band === c.hull
      ? [[-d, -0.7, c.hull], [-0.7, 0.5, c.boot], [0.5, fb + 1.2, c.hull], [fb + 1.2, car, c.upper]]
      : [[-d, -0.7, c.hull], [-0.7, 0.5, c.boot], [0.5, car - 1.6, c.hull], [car - 1.6, car - 0.4, c.band], [car - 0.4, car, c.hull]]),
    hullPlan(L * 0.996, B * 0.99, car, car + 0.08, 0.22, 0.86, DECK), // her weather deck, end to end
    // The bow visor's seam and the stern ramp.
    box(B * 0.5, 0.15, 0.2, 0, fb + 2.4, -L / 2 + L * 0.07, 0x0a0a0a),
    box(B * 0.66, 4.2, 0.25, 0, fb + 2.2, L / 2 - 0.05, GREY),
  ];
  // A row of the car deck's ventilation openings along each side, in her parallel middle body.
  for (let z = -L * 0.26; z < L * 0.36; z += 6) for (const sd of [-1, 1]) p.push(box(0.06, 0.8, 2.4, sd * (B * 0.503 + 0.03), fb + 3.2, z, 0x2a2c2e));
  // Two decks of accommodation, the bridge deck above them forward.
  const z0 = -L * 0.3;
  const z1 = L * 0.3;
  p.push(box(B * 0.92, 2.8, z1 - z0, 0, car + 1.4, (z0 + z1) / 2, c.upper), box(B * 0.84, 2.8, (z1 - z0) * 0.86, 0, car + 4.2, (z0 + z1) / 2 - 1, c.upper));
  windows(B * 0.46, car + 1.5, 2.8, 1, z0 + 2, z1 - 2, p);
  windows(B * 0.42, car + 4.3, 2.8, 1, z0 + 3, z1 - 6, p);
  const bz = z0 + 4;
  p.push(box(B * 0.6, 2.6, 7, 0, car + 7.0, bz, c.upper), box(B * 0.62, 1.0, 0.1, 0, car + 7.3, bz - 3.55, GLASS));
  // Bridge wings out to her sides, glass at their ends.
  p.push(box(B * 1.02, 0.5, 3, 0, car + 6.0, bz - 1.5, c.upper));
  for (const s of [-1, 1]) p.push(box(0.1, 1.0, 2.4, s * B * 0.51, car + 6.7, bz - 1.5, GLASS));
  // Mast and radar on the bridge top; the funnel aft (red, black top).
  p.push(cyl(0.2, 0.15, 6, 0, car + 8.3, bz + 1, GREY, 6), box(3.2, 0.2, 0.4, 0, car + 12, bz + 1, 0x3a3e40));
  const fz = z1 - 6;
  p.push(cyl(2.0, 1.8, 6.5, 0, car + 5.6, fz, c.funnel), cyl(1.82, 1.8, 1.2, 0, car + 12.1, fz, c.funnelTop));
  if (c.funnelBand) p.push(cyl(1.95, 1.9, 0.8, 0, car + 9.2, fz, c.funnelBand));
  // Lifeboats on the boat deck, both sides; liferaft canisters aft.
  for (const s of [-1, 1]) {
    for (const z of [z0 + 8, z0 + 14]) p.push(box(2.2, 1.3, 5, s * (B * 0.42 + 1.1), car + 6.1, z, ORANGE));
    for (let k = 0; k < 4; k++) p.push(cyl(0.45, 0.45, 1.4, s * B * 0.43, car + 3.0, z1 - 3 - k * 1.6, 0xf2f2ea, 6));
  }
  return p;
}

function small(L: number, B: number, d: number, fb: number, c: (typeof LIVERY)[Livery]): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [
    ...hullBands(L, B, 0.14, 0.86, [[-d, -0.6, c.hull], [-0.6, 0.4, c.boot], [0.4, fb, c.hull]], true),
    hullPlan(L * 0.996, B * 0.99, fb, fb + 0.08, 0.14, 0.86, DECK, true), // the car deck, end to end
    // The car deck's bulwarks along both sides; the ramps at each end, raised.
    ...[-1, 1].map((s) => box(0.25, 1.2, L * 0.72, s * B * 0.46, fb + 0.6, 0, c.hull)),
    ...[-1, 1].map((e) => part(new THREE.BoxGeometry(B * 0.6, 0.25, 4).rotateX(e * 0.5).translate(0, fb + 1.0, e * (L / 2 - 1.5)), GREY)),
  ];
  // The lounge and wheelhouse along the starboard side, the funnel on its after end.
  const sx = B * 0.36;
  p.push(box(B * 0.24, 2.6, L * 0.5, sx, fb + 2.5, 0, c.upper));
  windows(B * 0.12, fb + 2.6, 2.6, 1, -L * 0.2, L * 0.2, p, sx);
  p.push(box(B * 0.26, 2.0, 5, sx, fb + 4.8, 0, c.upper), box(B * 0.27, 0.9, 5.1, sx, fb + 5.1, 0, GLASS));
  p.push(cyl(0.9, 0.8, 3.5, sx, fb + 3.8, L * 0.18, c.funnel), cyl(0.82, 0.8, 0.6, sx, fb + 7.3, L * 0.18, c.funnelTop));
  if (c.funnelBand) p.push(cyl(0.92, 0.88, 0.5, sx, fb + 5.4, L * 0.18, c.funnelBand));
  p.push(cyl(0.12, 0.1, 3.5, sx, fb + 5.8, -1, GREY, 6));
  return p;
}

function launch(L: number, B: number, d: number, fb: number, c: (typeof LIVERY)[Livery]): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [
    ...hullBands(L, B, 0.3, 0.84, [[-d, -0.4, c.hull], [-0.4, 0.3, c.boot], [0.3, fb, c.hull]]),
    hullPlan(L * 0.996, B * 0.99, fb, fb + 0.06, 0.3, 0.84, DECK),
    box(B * 0.8, 2.2, L * 0.52, 0, fb + 1.1, -L * 0.05, c.upper),
  ];
  windows(B * 0.4, fb + 1.3, 2, 1, -L * 0.28, L * 0.2, p);
  p.push(box(B * 0.56, 1.6, 3.4, 0, fb + 3.0, -L * 0.2, c.upper), box(B * 0.57, 0.8, 3.45, 0, fb + 3.2, -L * 0.2, GLASS));
  p.push(cyl(0.08, 0.06, 2.5, 0, fb + 3.8, -L * 0.15, GREY, 6));
  return p;
}

function harbour(L: number, B: number, d: number, fb: number, c: (typeof LIVERY)[Livery]): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [
    ...hullBands(L, B, 0.2, 0.9, [[-d, -0.4, c.hull], [-0.4, 0.3, c.boot], [0.3, fb, c.hull]]),
    hullPlan(L * 0.996, B * 0.99, fb, fb + 0.06, 0.2, 0.9, DECK),
  ];
  // The cabin forward (bow toward -z): from just abaft the bow to past her middle, nearly her full beam.
  const z0 = -L / 2 + L * 0.14;
  const z1 = L * 0.12;
  p.push(box(B * 0.9, 2.3, z1 - z0, 0, fb + 1.15, (z0 + z1) / 2, c.upper));
  windows(B * 0.45, fb + 1.35, 2.3, 1, z0 + 1, z1 - 1, p);
  p.push(box(B * 0.7, 1.1, 0.1, 0, fb + 1.4, z0 - 0.05, GLASS));
  // Its roof the open upper deck, a rail round it.
  for (const sd of [-1, 1]) p.push(box(0.1, 1.0, z1 - z0, sd * B * 0.44, fb + 2.8, (z0 + z1) / 2, c.upper));
  p.push(box(B * 0.88, 1.0, 0.1, 0, fb + 2.8, z0 + 0.05, c.upper));
  // Aft: the arch over the after deck, the wheelhouse on it, glass all round, a mast.
  const za = L / 2 - L * 0.17;
  for (const sd of [-1, 1]) p.push(box(0.5, 4.6, 0.6, sd * B * 0.38, fb + 2.3, za, c.upper));
  p.push(box(B * 0.8, 0.6, 1.2, 0, fb + 4.7, za, c.upper));
  p.push(box(B * 0.42, 2.2, 2.8, 0, fb + 6.1, za, c.upper), box(B * 0.43, 1.0, 2.85, 0, fb + 6.4, za, GLASS));
  p.push(cyl(0.08, 0.06, 2.2, 0, fb + 7.2, za + 0.6, GREY, 6));
  // The boarding ramp at her stern.
  p.push(part(new THREE.BoxGeometry(B * 0.4, 0.2, 2.6).rotateX(0.35).translate(0, fb + 0.5, L / 2 + 0.6), GREY));
  return p;
}

/** Container colours, picked down the bays by a steady hash (the same every ship of a design). */
const BOXES = [0xa8201c, 0x1d4f9a, 0xe8a020, 0x2a7a4a, 0xf2f0ea, 0x7a3a8a, 0x5a6266, 0xd85a1a];
function container(L: number, B: number, d: number, fb: number, c: (typeof LIVERY)[Livery]): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [
    ...hullBands(L, B, 0.16, 0.8, [[-d, 0, c.boot], [0, fb, c.hull]]),
    hullPlan(L * 0.996, B * 0.99, fb, fb + 0.08, 0.16, 0.8, DECK),
  ];
  // Her accommodation aft (bow toward -z): a tall block, the bridge on top with wings across her beam.
  const hz = L / 2 - L * 0.13;
  p.push(box(B * 0.5, 20, 14, 0, fb + 10, hz, c.upper));
  for (let r = 0; r < 6; r++) for (const sd of [-1, 1]) p.push(box(0.06, 0.9, 12, sd * (B * 0.25 + 0.03), fb + 3 + r * 3, hz, GLASS));
  p.push(box(B * 1.02, 2.6, 6, 0, fb + 21.3, hz - 4, c.upper), box(B * 0.5, 1.0, 0.1, 0, fb + 21.6, hz - 7.05, GLASS));
  p.push(box(5, 9, 6, 0, fb + 24, hz + 9, c.funnel), box(5.05, 2, 6.05, 0, fb + 29.5, hz + 9, c.funnelTop));
  p.push(cyl(0.3, 0.2, 10, 0, fb + 22.6, hz - 2, GREY, 6));
  // Bays of containers (6.1 m each, a lashing gap between), from the forecastle to the house,
  // each bay three stacks across, each stack its own height and colour.
  let k = 7;
  for (let z = -L / 2 + L * 0.12; z < hz - 10; z += 13.2) {
    for (const x of [-B * 0.31, 0, B * 0.31]) {
      k = (k * 1103515245 + 12345) & 0x7fffffff;
      const tiers = 3 + (k % 4);
      p.push(box(B * 0.3, tiers * 2.6, 12.4, x, fb + (tiers * 2.6) / 2, z + 6.6, BOXES[(k >> 4) % BOXES.length]));
    }
    p.push(box(B * 0.96, 0.4, 0.5, 0, fb + 2, z, GREY));
  }
  // The forecastle's bulwark at the bow, and a mast on it.
  p.push(box(B * 0.5, 2.5, 4, 0, fb + 1.2, -L / 2 + L * 0.06, c.hull), cyl(0.25, 0.2, 9, 0, fb + 2.5, -L / 2 + L * 0.07, GREY, 6));
  return p;
}

const CACHE = new Map<string, THREE.BufferGeometry>();
/** A ferry's mesh (built once for each class and livery). */
export function ferryGeometry(cls: FerryRouteDef['cls'], livery: Livery): THREE.BufferGeometry {
  const key = `${cls}/${livery}`;
  let g = CACHE.get(key);
  if (!g) {
    const k = CONFIG.ferries.classes[cls];
    const build = cls === 'large' ? large : cls === 'small' ? small : cls === 'harbour' ? harbour : cls === 'container' ? container : launch;
    g = mergeParts(build(k.length, k.beam, k.draught, k.freeboard, LIVERY[livery]));
    g.computeBoundingSphere();
    CACHE.set(key, g);
  }
  return g;
}

/**
 * Her lights after dark (her own frame): masthead white, sidelights red to port and green
 * to starboard, a stern light, and a few of her saloon windows lit. Points with their colours.
 */
export function ferryLights(cls: FerryRouteDef['cls']): { p: [number, number, number]; c: number }[] {
  const k = CONFIG.ferries.classes[cls];
  const L = k.length;
  const B = k.beam;
  const top = cls === 'large' ? k.freeboard + 5.4 + 14 : cls === 'small' ? k.freeboard + 9 : cls === 'container' ? k.freeboard + 32 : cls === 'harbour' ? k.freeboard + 9.3 : k.freeboard + 6;
  const side = cls === 'large' ? k.freeboard + 5.4 + 6.4 : cls === 'container' ? k.freeboard + 21.3 : cls === 'harbour' ? k.freeboard + 5 : k.freeboard + 3;
  const out: { p: [number, number, number]; c: number }[] = [
    { p: [0, top, cls === 'large' ? -L * 0.26 : -1], c: 0xffffff },
    { p: [-B * 0.5, side, -L * 0.25], c: 0xff2020 },
    { p: [B * 0.5, side, -L * 0.25], c: 0x20ff40 },
    { p: [0, k.freeboard + 1.5, L / 2], c: 0xffffff },
  ];
  // Her lit windows: a large ferry's two decks of lounges along both sides, a small one's side
  // lounge (starboard, ferryKit's small()), a launch's cabin.
  const warm = 0xffd890;
  if (cls === 'large')
    for (const [y, hw, z0, z1] of [
      [k.freeboard + 5.4 + 1.5, B * 0.47, -L * 0.28, L * 0.28],
      [k.freeboard + 5.4 + 4.3, B * 0.43, -L * 0.26, L * 0.2],
    ])
      for (let i = 0; i < 10; i++) for (const s of [-1, 1]) out.push({ p: [s * hw, y, z0 + ((z1 - z0) * i) / 9], c: warm });
  else if (cls === 'container') {
    // Her forward masthead light too, and her accommodation's windows aft.
    out.push({ p: [0, k.freeboard + 11, -L / 2 + L * 0.07], c: 0xffffff });
    for (let r = 0; r < 6; r++) for (const sd of [-1, 1]) out.push({ p: [sd * B * 0.26, k.freeboard + 3 + r * 3, L / 2 - L * 0.13], c: warm });
  } else if (cls === 'harbour') for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) out.push({ p: [sd * B * 0.46, k.freeboard + 1.35, -L / 2 + L * 0.18 + i * L * 0.09], c: warm });
  else if (cls === 'small') for (let i = 0; i < 5; i++) for (const s of [-1, 1]) out.push({ p: [B * 0.36 + s * B * 0.13, k.freeboard + 2.6, -L * 0.18 + i * L * 0.09], c: warm });
  else for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push({ p: [s * B * 0.41, k.freeboard + 1.3, -L * 0.26 + i * L * 0.14], c: warm });
  return out;
}
