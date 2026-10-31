/**
 * Module deck.rib-console: the rescue boat's centre console and leaning post (owner, Oct 2026:
 * "a central seating position with a wheel and an outboard motor"). The console amidships, a
 * grey box with a small raked windscreen on its forward edge; its top is her helm console's
 * socket (the wheel on its aft face, the throttle, key and screens on top: console.standard,
 * her recipe). Aft of it the leaning post you stand against at the helm: a padded bolster on
 * a frame, a grab rail round its back, as fast rescue boats have. CONFIG.vessels.rib.console.
 *
 * Drawn in the boat's axes from its config (her own: there's one place for it). Merged with
 * her fixed parts: no draw call of its own. You walk round them (footprints).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { GearFootprint, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

/**
 * (`colour`: its body's paint, the Shipyard RIB's; unset, the crane RIB's grey. `roof`: a
 * T-top's canopy or a hardtop over the console and the leaning post, the Shipyard's bigger
 * RIBs' (shipyard/parts/rib.ts): from `front` to `aft`, `halfWidth` each side, its top `top`,
 * `thick`; on four legs, at the console's forward corners and the post's aft ones.)
 */
export type RibConsoleConfig = typeof CONFIG.vessels.rib.console & { colour?: number; roof?: { front: number; aft: number; top: number; halfWidth: number; thick: number } };

const GREY = 0x8d9399;
const DARK = 0x2b2f33;
const PAD = 0x1f2326;
const STEEL = 0xc4c8cc;
const GLASS = 0x8fb3c4;
const TOP = 0xe8e8e2;

/** A T-top's or hardtop's legs: from the deck by the console's forward corners and the post's aft ones, out to under the roof's edges. */
function roofLegs(c: RibConsoleConfig, deckAt: (z: number) => number): { foot: [number, number, number]; head: [number, number, number] }[] {
  const r = c.roof!;
  const zf = c.front + 0.1;
  const za = c.post.aft - 0.04;
  const legs: { foot: [number, number, number]; head: [number, number, number] }[] = [];
  for (const s of [-1, 1]) {
    legs.push({ foot: [s * (c.halfWidth + 0.04), deckAt(zf), zf], head: [s * (r.halfWidth - 0.06), r.top - r.thick, zf] });
    legs.push({ foot: [s * (c.post.halfWidth + 0.06), deckAt(za), za], head: [s * (r.halfWidth - 0.06), r.top - r.thick, za] });
  }
  return legs;
}

export const RIB_CONSOLE: ModuleDefinition<RibConsoleConfig> = {
  id: 'deck.rib-console',
  version: 1,
  fits: ['deck.equipment'],
  defaults: CONFIG.vessels.rib.console,
  validateConfig: (c) => (c.aft > c.front && c.post.aft > c.post.front && c.post.front >= c.aft ? [] : ['the console forward of the leaning post, each longer than nothing']),
  ports: {},
  footprints: (c, hull): GearFootprint[] => {
    const deck = hull.deckY((c.front + c.aft) / 2);
    return [
      { x0: -c.halfWidth, x1: c.halfWidth, z0: c.front, z1: c.aft, base: deck, top: c.top },
      { x0: -c.post.halfWidth, x1: c.post.halfWidth, z0: c.post.front + 0.1, z1: c.post.aft, base: deck, top: c.post.top },
      // (A roof's legs: their feet.)
      ...(c.roof ? roofLegs(c, (z) => hull.deckY(z)).map(({ foot: [x, y, z] }) => ({ x0: x - 0.04, x1: x + 0.04, z0: z - 0.04, z1: z + 0.04, base: y, top: y + 1 })) : []),
    ];
  },
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const parts: THREE.BufferGeometry[] = [];
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: number) => parts.push(part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col));
      // The console: its body from the deck up, a dark plinth along its foot.
      const deck = hull.deckY((c.front + c.aft) / 2);
      const w = 2 * c.halfWidth;
      box(w, c.top - deck, c.aft - c.front, 0, (deck + c.top) / 2, (c.front + c.aft) / 2, c.colour ?? GREY);
      box(w + 0.04, 0.08, c.aft - c.front + 0.04, 0, deck + 0.04, (c.front + c.aft) / 2, DARK);
      // Its windscreen: a raked pane on the forward edge of its top, in a dark frame.
      const sc = c.screen;
      const glass = new THREE.BoxGeometry(w - 0.06, sc.height, 0.012).rotateX(-sc.rake).translate(0, c.top + (sc.height / 2) * Math.cos(sc.rake), c.front + 0.06 + (sc.height / 2) * Math.sin(sc.rake));
      parts.push(part(glass, GLASS));
      box(w, 0.03, 0.06, 0, c.top + 0.015, c.front + 0.05, DARK);
      // A grab rail round the console's top, at hand height each side.
      for (const s of [-1, 1]) box(0.03, 0.03, c.aft - c.front - 0.1, s * (c.halfWidth + 0.06), c.top - 0.15, (c.front + c.aft) / 2, STEEL);
      // The leaning post: two legs, the bolster across their tops, a backrest and a grab rail behind.
      const p = c.post;
      const pd = hull.deckY((p.front + p.aft) / 2);
      for (const s of [-1, 1]) box(0.05, p.top - pd - 0.08, 0.05, s * (p.halfWidth - 0.06), (pd + p.top - 0.08) / 2, (p.front + p.aft) / 2, STEEL);
      box(2 * p.halfWidth, 0.14, p.aft - p.front, 0, p.top - 0.07, (p.front + p.aft) / 2, PAD);
      box(2 * p.halfWidth, 0.3, 0.08, 0, p.top + 0.17, p.aft - 0.04, PAD);
      box(2 * p.halfWidth + 0.08, 0.03, 0.03, 0, p.top + 0.38, p.aft + 0.04, STEEL);
      for (const s of [-1, 1]) box(0.03, 0.4, 0.03, s * (p.halfWidth + 0.04), p.top + 0.18, p.aft + 0.04, STEEL);
      // A T-top or hardtop (the bigger Shipyard RIBs'): its top, a dark edge round it, on four
      // steel legs raked out from the console and the post to under its edges.
      if (c.roof) {
        const r = c.roof;
        box(2 * r.halfWidth, r.thick, r.aft - r.front, 0, r.top - r.thick / 2, (r.front + r.aft) / 2, TOP);
        box(2 * r.halfWidth + 0.02, 0.03, r.aft - r.front + 0.02, 0, r.top - r.thick, (r.front + r.aft) / 2, DARK);
        for (const { foot, head } of roofLegs(c, (z) => hull.deckY(z))) {
          const a = new THREE.Vector3(...foot);
          const dir = new THREE.Vector3(...head).sub(a);
          const len = dir.length();
          const g = new THREE.BoxGeometry(0.05, len, 0.05).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
          g.translate(a.x + dir.x / 2, a.y + dir.y / 2, a.z + dir.z / 2);
          parts.push(part(g, STEEL));
        }
      }
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
