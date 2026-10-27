/**
 * An engine room you can go down into (owner, 27 Oct 2026: a detailed engine room, drawn only
 * while you're below, in the same page; the harbour tug and the stern trawler first). This
 * works out where one fits in a boat, from her own hull sections and her engine hatch: plain
 * numbers in her axes (x across, + to starboard; y up; z along, + aft), no drawing.
 *
 * The rule (CONFIG.engineRoom): a boat long enough (`minLoaM`), whose hull under her engine
 * hatch has standing headroom (`headroomM`, floor plates to the underside of her deck beams)
 * over a floor at least `minWidthM` wide (and wide enough for her engines with a walkway
 * `walkwayM` outboard of each), for at least `minLengthM` along her. The room grows
 * forward and aft from under the hatch while that holds, to `lengthShare` of her length (at
 * most `maxLengthM`), and stops short of her ends. Its floor plates (the sole) are as low as
 * that floor width allows; its sides are upright, at her narrowest inside breadth at the sole
 * (her sides flare out above it, so the box stands clear of her plating), less a lining.
 *
 * A boat whose hull doesn't give that (a small boat, a shallow one) has none: her engine hatch
 * stays a hatch over the engine, as before.
 */
import { CONFIG } from '../../config';
import type { HullForm } from '../../vessel/hullForm';
import type { LayoutConfig } from '../../vessel/vesselDef';

/** An engine in the room: as the diesel module has it installed (its model, size and place). */
export interface RoomEngine {
  model: number;
  size: [number, number, number];
  x: number;
  flangeY: number;
  flangeZ: number;
  angleDeg: number;
}

export interface EngineRoomPlan {
  /** The room: half its width (it's on her centreline), its ends along her, its floor plates and its deckhead (m). */
  halfWidth: number;
  z0: number;
  z1: number;
  sole: number;
  deckhead: number;
  /** The engine hatch over it (the way down), and the deck's height there. */
  hatch: { x0: number; x1: number; z0: number; z1: number; y: number };
  /** The ladder: its foot on the sole under the hatch's after edge, its head at the hatch. */
  ladder: { x: number; z: number; foot: number; head: number };
  engines: RoomEngine[];
}

/** Her half-breadth inside at height y, at one station (the widest crossing of her section there). */
function sectionHalf(polygon: readonly [number, number][], y: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    if ((y < Math.min(y0, y1)) || (y > Math.max(y0, y1)) || y0 === y1) continue;
    const x = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    if (x >= 0 && (best === null || x > best)) best = x;
  }
  return best;
}

/** Her inside half-breadth at height y, at z (between her stations); 0 below her bottom there. */
export function insideHalf(hull: HullForm, z: number, y: number): number {
  const st = hull.stations; // transom (z max) -> stem (z min)
  const at = (i: number) => sectionHalf(st[i].polygon, y) ?? 0;
  if (z >= st[0].z) return at(0);
  for (let i = 0; i < st.length - 1; i++)
    if (z <= st[i].z && z >= st[i + 1].z) {
      const t = (st[i].z - z) / (st[i].z - st[i + 1].z);
      return at(i) + (at(i + 1) - at(i)) * t;
    }
  return at(st.length - 1);
}

/** Her deck's height at z (the deck edge of her section there). */
function deckAt(hull: HullForm, z: number): number {
  const st = hull.stations;
  const top = (i: number) => Math.max(...st[i].polygon.map((p) => p[1]));
  if (z >= st[0].z) return top(0);
  for (let i = 0; i < st.length - 1; i++)
    if (z <= st[i].z && z >= st[i + 1].z) {
      const t = (st[i].z - z) / (st[i].z - st[i + 1].z);
      return top(i) + (top(i + 1) - top(i)) * t;
    }
  return top(st.length - 1);
}

/** The lowest floor at z with `half` m clear each side (searching up from her bottom), or null. */
function soleAt(hull: HullForm, z: number, half: number, top: number): number | null {
  for (let y = top - 3.5; y < top; y += 0.05) if (insideHalf(hull, z, y) >= half) return y;
  return null;
}

/**
 * Her engine room, or null where none fits (see above). `engines`: the diesel module's
 * installed engines (none: the room is still a room, with nothing in it to draw but the space).
 */
export function engineRoomPlan(def: { hull: HullForm; layout: LayoutConfig }, engines: RoomEngine[] = []): EngineRoomPlan | null {
  const c = CONFIG.engineRoom;
  const hull = def.hull;
  const eh = def.layout.engineHatch;
  if (!eh || hull.catamaran) return null;
  const st = hull.stations;
  const transom = st[0].z;
  const stem = st[st.length - 1].z;
  const loa = transom - stem;
  if (loa < c.minLoaM) return null;
  // Wide enough to walk round her engines (a twin's sit well out either side).
  const engineOuter = Math.max(0, ...engines.map((e) => Math.abs(e.x) + e.size[1] / 2));
  const half = Math.max(c.minWidthM / 2, engineOuter + c.walkwayM) + c.liningM;
  const mid = (eh.z0 + eh.z1) / 2;
  // Out from under the hatch, a step at a time, while there's standing room over a wide enough floor.
  const fits = (z: number, sole: number) => deckAt(hull, z) - c.deckheadM - sole >= c.headroomM;
  const step = 0.25;
  const fwdLimit = stem + c.endClearShare * loa;
  const aftLimit = transom - c.endClearShare * loa;
  // (A big boat's longer: room forward of her engines for an engine control room.)
  const big = loa >= c.big.fromLoaM;
  const maxLen = big ? Math.min(c.big.maxLengthM, c.big.lengthShare * loa) : Math.min(c.maxLengthM, c.lengthShare * loa);
  let sole = soleAt(hull, mid, half, deckAt(hull, mid));
  if (sole === null || !fits(mid, sole)) return null;
  let z0 = mid;
  let z1 = mid;
  for (let grow = true; grow && z1 - z0 < maxLen; ) {
    grow = false;
    for (const dir of [-1, 1] as const) {
      if (z1 - z0 >= maxLen) break;
      const z = dir < 0 ? z0 - step : z1 + step;
      if (z < fwdLimit || z > aftLimit) continue;
      const s = soleAt(hull, z, half, deckAt(hull, z));
      if (s === null) continue;
      const newSole = Math.max(sole, s);
      // Raising the floor for this end mustn't take the headroom away anywhere already in the room.
      if (!fits(z, newSole) || !fits(z0, newSole) || !fits(z1, newSole) || !fits(mid, newSole)) continue;
      sole = newSole;
      if (dir < 0) z0 = z;
      else z1 = z;
      grow = true;
    }
  }
  if (z1 - z0 < c.minLengthM) return null;
  // Upright sides at her narrowest inside breadth at the floor, less the lining.
  let halfWidth = Infinity;
  for (let z = z0; z <= z1 + 1e-6; z += step) halfWidth = Math.min(halfWidth, insideHalf(hull, z, sole + 0.02) - c.liningM);
  let deckhead = Infinity;
  for (let z = z0; z <= z1 + 1e-6; z += step) deckhead = Math.min(deckhead, deckAt(hull, z) - c.deckheadM);
  const hatchY = eh.y ?? def.layout.wheelhouse?.floorY ?? deckAt(hull, mid);
  const hatch = { x0: eh.x0, x1: eh.x1, z0: eh.z0, z1: eh.z1, y: hatchY };
  // The ladder down from the hatch's after edge: under its middle, or (an engine there, as
  // there usually is: the hatch is over it, to lift it out) beside that engine, on its walkway.
  const lz = Math.min(z1 - 0.3, eh.z1 - 0.25);
  let lx = (eh.x0 + eh.x1) / 2;
  const under = engines.find((e) => Math.abs(lx - e.x) < e.size[1] / 2 + 0.3 && lz > e.flangeZ - e.size[0] - 0.3 && lz < e.flangeZ + 0.3);
  if (under) {
    const off = under.size[1] / 2 + c.walkwayM / 2;
    // The side nearer her centreline (a twin's inboard walkway), else to starboard.
    lx = under.x + (under.x > 0.01 ? -off : under.x < -0.01 ? off : off);
  }
  const ladder = { x: lx, z: lz, foot: sole, head: hatchY };
  return { halfWidth, z0, z1, sole, deckhead, hatch, ladder, engines };
}
