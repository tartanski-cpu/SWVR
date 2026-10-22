/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): her fish hold
 * (design.fishHold; owner, Oct 2026: "to have a fish hold", step 1 toward a trawler).
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 *
 * Where it goes: under her open deck, in the longest stretch of it clear of what's already
 * below or above the deck there: the wheelhouse (and deckhouse), the engine and its space,
 * the propeller and rudder aft, the cabin below and a raised foredeck forward. As on a
 * trawler, the working deck over it stays clear for the catch to come aboard and go down.
 *
 * How big: from the transverse bulkhead at each end of that stretch, its floor just over her
 * bottom (and the propeller shaft, if it runs under it), as wide as her hull is inside at the
 * floor, less her framing; its ceiling her deck. A V bottom is narrow low down, so the floor
 * comes up until the hold is at least a box and a bit wide. What it holds: as many fish boxes
 * as stack in it (modules/fishHold holdSlots).
 */
import { CONFIG } from '../../config';
import type { Mount } from '../../modular/recipe';
import { holdSlots, type FishHoldConfig } from '../../modules/fishHold';
import { bottomAt as bottomUnder, halfSection } from '../machinery';
import type { BuildArgs } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, InteriorPart } from './house';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { DeckGearPart } from './deckGear';
import type { HullDefPart } from './hullDef';

const r2 = (v: number) => Math.round(v * 1000) / 1000;

/** The fish hold, if the design has one and it fits: its module on its place, its weight and price. */
export function holdPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & MachineryPart & DeckGearPart & EngineHatchPart & InteriorPart & HullDefPart) {
  const none = { holdMount: null as Mount | null, holdKg: 0, holdPrice: 0, holdY: 0, holdZ: 0 };
  if (!a.d.fishHold) return none;
  const c = CONFIG.shipyard.fishHold;
  const { aft, deckhouse, eh, engZ0, engZ1, foredeck, foreEndAt, hull, layout, outboards, q, shaft, shape, stem, taken, transom, warnings, pods, sd, propPos } = p;
  const leave = (why: string) => {
    warnings.push(`No fish hold: ${why}.`);
    return none;
  };

  // ── Where along her: the open deck's stretches, less what's under or over them ──
  const houseFwd = Math.min(foreEndAt, deckhouse?.z0 ?? foreEndAt);
  const houseAft = Math.max(aft, deckhouse?.z1 ?? aft);
  const stretches: [number, number][] = [
    [houseAft + c.engineGap, transom - c.aftClear],
    [Math.max(stem + 1.2, foredeck ? foredeck.z + 0.3 : -Infinity), houseFwd - c.engineGap],
  ];
  const blocked: [number, number][] = [];
  if (!outboards) blocked.push([engZ0 - c.engineGap, engZ1 + c.engineGap]);
  if (eh.y !== undefined) blocked.push([eh.z0 - c.engineGap, eh.z1 + c.engineGap]);
  if (layout.cabin) blocked.push([layout.cabin.z0 - c.engineGap, layout.cabin.z1 + c.engineGap]);
  const pieces = stretches.flatMap(([z0, z1]) => {
    let out: [number, number][] = [[z0, z1]];
    for (const [b0, b1] of blocked) out = out.flatMap(([s0, s1]): [number, number][] => (b1 <= s0 || b0 >= s1 ? [[s0, s1]] : [...(b0 > s0 ? [[s0, b0] as [number, number]] : []), ...(b1 < s1 ? [[b1, s1] as [number, number]] : [])]));
    return out;
  });
  const [z0, z1] = pieces.sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0] ?? [0, 0];
  if (z1 - z0 < c.minLength) return leave(`there's no stretch of her hull ${c.minLength} m long under the open deck, clear of the houses, the engine and the stern gear`);

  // ── Its floor, its width ──
  /** Her hull's inside half-breadth at height y, at z (from her section there: keel, chine, deck edge). */
  const insideHalf = (z: number, y: number) => {
    const s = halfSection(shape, z);
    for (let k = 1; k < s.length; k++) if (y <= s[k][1]) return s[k - 1][0] + ((s[k][0] - s[k - 1][0]) * (y - s[k - 1][1])) / Math.max(1e-6, s[k][1] - s[k - 1][1]);
    return s[s.length - 1][0];
  };
  const zs = [z0, (z0 + z1) / 2, z1];
  // Over her bottom on the centreline, and over the shaft (an inboard's, running aft under it to the propeller).
  const [, boxH, boxW] = CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')!.size;
  const shaftY = (z: number) => shaft.flangeY + ((shaft.propY - shaft.flangeY) * (z - shaft.flangeZ)) / Math.max(1e-6, propPos[2] - shaft.flangeZ);
  const inboard = !outboards && !pods && !sd;
  let sole = Math.max(...zs.map((z) => bottomUnder(shape, 0, z))) + c.soleClear;
  if (inboard) sole = Math.max(sole, ...zs.filter((z) => z > shaft.flangeZ).map((z) => shaftY(z) + c.shaftClear));
  const halfAt = (y: number) => Math.min(...zs.map((z) => insideHalf(z, y))) - c.frame;
  // (Up from there until a box lies across it with room either side: a V bottom's narrow floor.)
  const minHalf = CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')!.size[0] / 2 + 0.1;
  while (halfAt(sole) < minHalf && sole < q.deckY((z0 + z1) / 2) - c.minDepth) sole += 0.05;
  const half = halfAt(sole);
  const deckFwd = q.deckY(z0) - sole;
  const deckAft = q.deckY(z1) - sole;
  if (Math.min(deckFwd, deckAft) < c.minDepth) return leave(`her hull is only ${Math.min(deckFwd, deckAft).toFixed(2)} m deep under the deck there (${c.minDepth} m at least): give her more depth (Hull)`);
  if (half < minHalf) return leave('her hull is too narrow low down there');

  // ── The hatch: on the open deck clear of the deck gear, as big as fits (down to
  // `hatch.min`), as near the hold's middle as it can be, along her first, then to the side ──
  const pad = c.hatch.clear + 0.05;
  const mid = (z0 + z1) / 2;
  const deckHalf = (z: number) => q.halfBeam(z) - 0.4;
  let hatch: { x0: number; x1: number; z0: number; z1: number } | null = null;
  for (let size = 1; size >= c.hatch.min / Math.max(c.hatch.length, c.hatch.width) - 1e-6 && !hatch; size -= 0.1) {
    const hl = Math.min(c.hatch.length * size, z1 - z0 - 0.2);
    const hb = Math.min(c.hatch.width * size, 2 * half - 0.2);
    const spots: { x: number; z: number; off: number }[] = [];
    for (let k = -Math.round((z1 - z0 - hl) / 0.1); k <= Math.round((z1 - z0 - hl) / 0.1); k++)
      for (let j = -Math.round(half / 0.1); j <= Math.round(half / 0.1); j++) spots.push({ x: j * 0.1, z: mid + k * 0.05, off: Math.abs(k * 0.05) + 2 * Math.abs(j * 0.1) });
    for (const { x, z } of spots.sort((u, v) => u.off - v.off)) {
      const r = { x0: x - hb / 2, x1: x + hb / 2, z0: z - hl / 2, z1: z + hl / 2 };
      if (r.z0 < z0 + 0.1 || r.z1 > z1 - 0.1 || r.x0 < -half + 0.1 || r.x1 > half - 0.1) continue;
      if (Math.max(Math.abs(r.x0), Math.abs(r.x1)) > Math.min(deckHalf(r.z0), deckHalf(r.z1))) continue;
      if (taken.every((o) => o.x1 < r.x0 - pad || o.x0 > r.x1 + pad || o.z1 < r.z0 - pad || o.z0 > r.z1 + pad)) {
        hatch = r;
        break;
      }
    }
  }
  if (!hatch) return leave('there\'s no room for its hatch on deck clear of the deck gear over it');

  // ── It, on its place ──
  const zm = (z0 + z1) / 2;
  const config: FishHoldConfig = {
    length: r2(z1 - z0),
    width: r2(2 * half),
    deckFwd: r2(deckFwd),
    deckAft: r2(deckAft),
    hatch: { x0: r2(hatch.x0), x1: r2(hatch.x1), z0: r2(hatch.z0 - zm), z1: r2(hatch.z1 - zm), y: r2(q.deckY((hatch.z0 + hatch.z1) / 2) - sole) },
    coaming: c.hatch.coaming,
  };
  const capacity = holdSlots(config).length;
  if (capacity < 1) return leave(`it's too small for a fish box (${boxW} x ${boxH} m)`);
  layout.fishHold = { x0: r2(-half), x1: r2(half), z0: r2(z0), z1: r2(z1), sole: r2(sole), hatch: { x0: config.hatch.x0, x1: config.hatch.x1, z0: r2(hatch.z0), z1: r2(hatch.z1) } };
  hull.sockets.push({ id: 'fishHold', type: 'hold.fish', transform: { position: [0, r2(sole), r2(zm)] }, label: `Her hull under the deck, ${z0 > aft ? 'aft of' : 'forward of'} the wheelhouse: the fish hold (${capacity} boxes)` });
  // Its weight: its insulated lining all round, and the hatch.
  const h = (deckFwd + deckAft) / 2;
  const w = 2 * half;
  const L = z1 - z0;
  const holdKg = 2 * (w * L + w * h + L * h) * c.kgPerM2 + c.hatch.kg;
  return { holdMount: { socket: 'fishHold', module: 'hold.fish', config: config as unknown as Record<string, unknown> } as Mount, holdKg, holdPrice: w * L * h * c.pricePerM3, holdY: sole + h / 2, holdZ: zm };
}
export type HoldPart = ReturnType<typeof holdPart>;
