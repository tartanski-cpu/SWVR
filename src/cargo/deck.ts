/**
 * Where cargo can stand on a vessel's open deck (vessel axes): inside the bulwarks, clear
 * of the wheelhouse, aft of the narrow bow (`cargo.bowClear`), forward of `cargo.aftClear`. Shared by the simulation (placing, sliding) and
 * the hands (choosing where a crate will go). Footprints are treated as squares of their
 * larger half-size, so an item's yaw on deck doesn't matter.
 */
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';

export interface DeckFootprint {
  hx: number;
  hz: number;
}

/** Bulwark thickness plus a little air (m). */
const EDGE = 0.25;
const plans = new Map<string, ReturnType<typeof hullPlan>>();

function planOf(defId: string) {
  let p = plans.get(defId);
  if (!p) plans.set(defId, (p = hullPlan(VESSEL_DEFS[defId])));
  return p;
}

/** Is a point of the deck open (not bulwark, wheelhouse or bow)? */
function openPoint(defId: string, x: number, z: number): boolean {
  const plan = planOf(defId);
  const def = VESSEL_DEFS[defId];
  const wh = def.layout.wheelhouse;
  if (z > plan.transom - Math.max(EDGE, def.cargo.aftClear) || z < plan.stem + def.cargo.bowClear) return false;
  if (Math.abs(x) > plan.halfBeam(z) - EDGE) return false;
  if (wh && Math.abs(x) < wh.halfWidth + 0.05 && z > wh.front - 0.05 && z < wh.aft + 0.05) return false;
  return true;
}

/** Does an item of this footprint fit at (x, z)? */
export function onOpenDeck(defId: string, f: DeckFootprint, x: number, z: number): boolean {
  const r = Math.max(f.hx, f.hz);
  return openPoint(defId, x - r, z - r) && openPoint(defId, x + r, z - r) && openPoint(defId, x - r, z + r) && openPoint(defId, x + r, z + r);
}

/**
 * The nearest place to (x, z) where the item fits without overlapping `others` (discs),
 * searching outward in rings; null if there's no room within 5 m.
 */
export function deckSpot(
  defId: string,
  f: DeckFootprint,
  x: number,
  z: number,
  others: readonly { x: number; z: number; r: number }[],
): { x: number; z: number } | null {
  const r = Math.max(f.hx, f.hz);
  const free = (px: number, pz: number) => onOpenDeck(defId, f, px, pz) && !others.some((o) => Math.hypot(o.x - px, o.z - pz) < o.r + r + 0.05);
  if (free(x, z)) return { x, z };
  for (let ring = 1; ring <= 20; ring++) {
    const rad = ring * 0.25;
    const n = 8 * ring;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * rad;
      const pz = z + Math.sin(a) * rad;
      if (free(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Lashing points of a vessel (vessel axes, x/z on the deck). */
export function lashPoints(defId: string): readonly [number, number][] {
  return VESSEL_DEFS[defId].cargo.lashPoints;
}

export const DECK_EDGE = EDGE;

