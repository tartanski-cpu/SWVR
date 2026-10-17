/**
 * A deckhouse (owner, Oct 2026): a lower tier of superstructure on the main deck that the
 * wheelhouse stands on, as on pilot and rescue boats (and, later, tugs). In plan it runs
 * from `z0` (its front, at the deck) aft to `z1` (the wheelhouse's aft wall), out to
 * `plan`'s half widths (following her sides when it's full width, or set in from them),
 * and up to `top` (y, flat). Its front face rakes aft as it rises (`rakeDeg`, from the
 * vertical). For now it's solid: not walked on, nothing inside (a walkable top with rails,
 * and an interior, come with bigger boats).
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
