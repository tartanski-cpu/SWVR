/**
 * A deckhouse (owner, Oct 2026): a lower tier of superstructure on the main deck that the
 * wheelhouse stands on, as on pilot and rescue boats (and, later, tugs). In plan it runs
 * from `z0` (its front, at the deck) aft to `z1` (the wheelhouse's aft wall), out to
 * `plan`'s half widths (following her sides when it's full width, or set in from them),
 * and up to `top` (y, flat). Its front face rakes aft as it rises (`rakeDeg`, from the
 * vertical). Solid, nothing inside (an interior comes with P2c, the trunk cabin); its top
 * walked if it has `walk` (below).
 *
 * If the wheelhouse's floor is sunk into it (the Shipyard's floor height, measured from its
 * top), its top is left open over the cabin (`well`): the wheelhouse's own walls go down
 * inside it to the floor, and its aft door is in the wheelhouse's aft wall as usual.
 *
 * Used by the hull's drawing (vessel/view/hullMesh.ts), walking (vessel/layout.ts: the deck
 * under it is closed, and it's solid below its top), and cargo (cargo/deck.ts).
 */
export interface DeckhouseLayout {
  z0: number;
  z1: number;
  top: number;
  rakeDeg: number;
  /** Its half width along her, [z, half width] from front to aft. */
  plan: [number, number][];
  /** Where its top is open for a wheelhouse sunk into it: inside the house's walls, from its front aft to `z1`. */
  well?: { halfWidth: number; z0: number };
  /** Its top walked (parametric boats P2b, design.dhWalk): see DeckhouseWalk. */
  walk?: DeckhouseWalk;
  /**
   * Out to her sides (owner, Oct 2026: then "you would kind of walk over the sides"): a raised
   * deck, really. Her bulwarks and rails rise along it (hullMesh.ts buildDeckFittings), its top
   * is always walked out to them, and its own rail runs only across its front and aft edges.
   */
  full?: boolean;
}

/**
 * A deckhouse's walked top (parametric boats P2b; owner: a pilothouse raised on a walkable
 * deckhouse): a deck round the wheelhouse standing on it, from `z0` (aft of the front's rake,
 * where its top is flat) aft, kept `margin` in from its edge, where a rail `railHeight` high
 * runs round it (open at the ladder head). The ladder goes up from the main deck: on its aft
 * face beside the wheelhouse (`face` 'aft', at `x`), or up its front (`face` 'front', on the
 * centreline, leaning with a raked front), `width` wide, its climbing zone `depth` out from the
 * face. Walked by vessel/layout.ts, drawn by vessel/view/hullMesh.ts.
 */
export interface DeckhouseWalk {
  z0: number;
  margin: number;
  railHeight: number;
  /** Its rail's posts no further apart than this (m). */
  postSpacing: number;
  ladder: { face: 'aft' | 'front'; x: number; width: number; depth: number };
}

/** How far in from a full-width deckhouse's side its top is walked (m): just inside her risen bulwark. */
const FULL_SIDE_MARGIN = 0.1;

/** Is (x, z) on its walked top (`pad` further in from its edge)? Not checked against the wheelhouse standing on it. */
export function onDeckhouseTop(dh: DeckhouseLayout, x: number, z: number, pad = 0): boolean {
  const w = dh.walk;
  if (!w) return false;
  const m = w.margin + pad;
  if (z < w.z0 + m || z > dh.z1 - m) return false;
  // (Out to her sides: right out to her bulwarks, risen along it.)
  return Math.abs(x) <= deckhouseHalfWidth(dh, z) - (dh.full ? FULL_SIDE_MARGIN + pad : m);
}

/** The ladder's climbing zone in plan: x across, z along (from the face out onto the deck, or up a raked front's slope). */
export function deckhouseLadderZone(dh: DeckhouseLayout): { x0: number; x1: number; z0: number; z1: number } | null {
  const l = dh.walk?.ladder;
  if (!l) return null;
  const [x0, x1] = [l.x - l.width / 2, l.x + l.width / 2];
  return l.face === 'aft' ? { x0, x1, z0: dh.z1 + 0.02, z1: dh.z1 + l.depth } : { x0, x1, z0: dh.z0 - l.depth, z1: dh.walk!.z0 };
}

/** Its half width at z (interpolated along its plan; 0 outside it). */
export function deckhouseHalfWidth(dh: DeckhouseLayout, z: number): number {
  const p = dh.plan;
  if (z < p[0][0] || z > p[p.length - 1][0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (z <= p[i][0]) {
      const [za, wa] = p[i - 1];
      const [zb, wb] = p[i];
      return zb === za ? wb : wa + ((wb - wa) * (z - za)) / (zb - za);
    }
  }
  return p[p.length - 1][1];
}

/** Is (x, z) within the deckhouse in plan, grown by `pad` all round? */
export function inDeckhouse(dh: DeckhouseLayout, x: number, z: number, pad = 0): boolean {
  if (z < dh.z0 - pad || z > dh.z1 + pad) return false;
  const zz = Math.min(dh.z1, Math.max(dh.z0, z));
  return Math.abs(x) <= deckhouseHalfWidth(dh, zz) + pad;
}
