/**
 * Where cargo can stand on a vessel's open deck (vessel axes): inside the bulwarks, clear
 * of the wheelhouse and of the gear on deck (tender cradle and crane, tow winch), aft of the narrow bow
 * (`cargo.bowClear`), forward of `cargo.aftClear`. Shared by the simulation (placing, sliding) and
 * the hands (choosing where a crate will go). Footprints are treated as squares of their
 * larger half-size, so an item's yaw on deck doesn't matter.
 */
import { footprintsOf } from '../boats/sims';
import { hullPlan, onGear } from '../vessel/layout';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { inDeckhouse } from '../vessel/deckhouse';

export interface DeckFootprint {
  hx: number;
  hz: number;
}

/** Bulwark thickness plus a little air (m), unless she says (`cargo.edge`: the skiff's thin sides). */
const EDGE = 0.25;
/** Kept by the def itself, so a Shipyard design (a new 'design' def each time) gets its own. */
const plans = new WeakMap<VesselDef, ReturnType<typeof hullPlan>>();

function planOf(defId: string) {
  const def = VESSEL_DEFS[defId];
  let p = plans.get(def);
  if (!p) plans.set(def, (p = hullPlan(def)));
  return p;
}

/** Is a point of the deck open (not bulwark, wheelhouse or bow)? */
function openPoint(defId: string, x: number, z: number): boolean {
  const plan = planOf(defId);
  const def = VESSEL_DEFS[defId];
  const wh = def.layout.wheelhouse;
  if (z > plan.transom - Math.max(EDGE, def.cargo.aftClear) || z < plan.stem + def.cargo.bowClear) return false;
  if (Math.abs(x) > plan.halfBeam(z) - (def.cargo.edge ?? EDGE)) return false;
  if (wh && Math.abs(x) < wh.halfWidth + 0.05 && z > wh.front - 0.05 && z < wh.aft + 0.05) return false;
  if (def.layout.deckhouse && inDeckhouse(def.layout.deckhouse, x, z, 0.05)) return false;
  if (onGear(footprintsOf({ defId }), x, z, 0.05, plan.deckY(z))) return false;
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

/**
 * How many items of a footprint stand on her open deck at once (the Shipyard's "deck
 * cargo" figure), one deep, not stacked: rows across the deck, each as many as fit side by
 * side with a hand's width (`gap`) between, from the transom forward. The same rule as
 * placing them by hand (`onOpenDeck`), so she really takes that many. The rows are tried at
 * a few starting points and the best kept, so a short deck isn't undercounted by where the
 * first row happened to fall.
 */
export function deckCapacity(defId: string, f: DeckFootprint, gap = 0.05): number {
  const plan = planOf(defId);
  const r = Math.max(f.hx, f.hz);
  const pitch = 2 * r + gap;
  let best = 0;
  for (const shift of [0, 0.25, 0.5, 0.75]) {
    let n = 0;
    for (let z = plan.transom - r - shift * pitch; z > plan.stem + r; z -= pitch) {
      // The row's open stretch across, at this station (a wheelhouse splits it in two).
      const half = plan.halfBeam(z);
      let run: number[] = [];
      const fill = () => {
        if (run.length) n += Math.floor((run[run.length - 1] - run[0]) / pitch + 1e-6) + 1;
        run = [];
      };
      for (let x = -half; x <= half; x += 0.05) {
        if (onOpenDeck(defId, f, x, z)) run.push(x);
        else fill();
      }
      fill();
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Lashing points of a vessel (vessel axes, x/z on the deck). */
export function lashPoints(defId: string): readonly [number, number][] {
  return VESSEL_DEFS[defId].cargo.lashPoints;
}

export const DECK_EDGE = EDGE;

