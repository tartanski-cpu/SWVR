/**
 * The harbour tug's fendering in the Shipyard (owner, Oct 2026): hulls/fendering.ts draws it
 * on her lines (the hull modifications chat's); here, what the boat needs of it: its mesh (to
 * be drawn with her fixed parts, modules/fendering) and the points on its outer face that meet
 * a quay or a ship (her side guard's probes).
 *
 * The points: its mesh's corners gathered into cells `CONFIG.shipyard.harbourTug.probeCell` m
 * a side, and in each cell the corner farthest out from her middle in plan (the fendering's
 * outer face, not its back on her plating): a point every metre or so along each belt, round
 * her stern and round her bow, and down the bow's blocks.
 */
import { CONFIG } from '../../config';
import { fenderingGeometry, type TugFendering } from '../../hulls/fendering';
import type { HullForm } from '../../vessel/hullForm';

export interface FenderingFit {
  positions: number[];
  probes: [number, number, number][];
  /** Where it is, on average (m, the boat's y), for her centre of gravity. */
  y: number;
}

export function fenderingFit(form: HullForm, spec: TugFendering): FenderingFit {
  const g = fenderingGeometry(form, spec).toNonIndexed();
  const pos = g.attributes.position;
  const positions = Array.from(pos.array as Float32Array, (v) => Math.round(v * 1000) / 1000);
  const st = form.stations;
  const zMid = (st[0].z + st[st.length - 1].z) / 2;
  // Out from her middle in plan, her length squeezed to her beam's scale, so her ends count as her sides do.
  const half = (st[0].z - st[st.length - 1].z) / 2;
  const beam = Math.max(...st.map((s) => s.halfBeamDeck));
  const out = (x: number, z: number) => Math.hypot(x / beam, (z - zMid) / half);
  const cell = CONFIG.shipyard.harbourTug.probeCell;
  const best = new Map<string, [number, number, number]>();
  let ySum = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    ySum += y;
    const key = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
    const was = best.get(key);
    if (!was || out(x, z) > out(was[0], was[2])) best.set(key, [x, y, z]);
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { positions, probes: [...best.values()].map(([x, y, z]) => [r3(x), r3(y), r3(z)]), y: pos.count ? ySum / pos.count : 0 };
}
