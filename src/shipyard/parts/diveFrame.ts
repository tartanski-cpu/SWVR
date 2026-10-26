/**
 * The Shipyard's builder (P4): the dive A-frame and its submersible (design.diveFrame;
 * modules/diveFrame; owner, Oct 2026: "placeable on any boat that's big enough"). Where it
 * stands on her, or why it won't, in plain words. It goes on any hull that passes:
 *
 *   - her stern wide enough for the sub (2.9 m over her thrusters) to pass between its legs;
 *   - her aft deck clear and level for the sub on her cradle, forward of the transom (about
 *     7.7 m of it: the sub is 7.4 m long, tail cone included), aft of the wheelhouse, on one deck;
 *   - legs long enough to swing her out over the transom's bulwark (longer, up to `maxLeg`, on
 *     a high bulwark);
 *   - big enough to carry her: the sub no more than `maxShare` of her displacement (about a
 *     fifth: she's 10 t, so a boat of 50 t or more), and her GM still `minGM` with the sub
 *     lifted off her cradle to the docking head, high over the stern (a suspended weight acts
 *     where it hangs from: her centre of gravity rises to take it in there);
 *   - freeboard left at her transom with the sub hanging out over the stern: her 10 t moved
 *     beyond the transom trims her by the stern (`minFreeboard`; she floats level on her lines
 *     with the sub on her cradle, designed in). Small angles, from her waterplane at the DWL
 *     worked from her stations (a catamaran's two hulls as two strips): her trim w x shift /
 *     (Delta GML), GML taken as BML = I_L / volume (KB - KG small beside it), about her
 *     waterplane's centre.
 */
import { CONFIG } from '../../config';
import { diveGeometry, headAt, type DiveFrameConfig, type DiveFramePlace } from '../../modules/diveFrame';

export interface DiveFrameFit {
  place: DiveFramePlace;
  legLength: number;
  /** Her cradle in plan (the boat's axes), for keeping the rest of her gear clear. */
  rects: { x0: number; x1: number; z0: number; z1: number }[];
}

/**
 * Where the dive A-frame stands on her, or why it won't (a few words for "There's no room
 * for the dive A-frame: ...").
 * @param aftEnd   the aft end of what stands on her deck amidships (her house, a deckhouse's stair)
 * @param oneLevel is a plan rectangle on one deck (not across a raised foredeck's break)?
 */
export function diveFrameFit(o: {
  q: { halfBeam(z: number): number; deckY(z: number): number };
  transom: number;
  bulwarkHeight: number;
  aftEnd: number;
  oneLevel: (r: { z0: number; z1: number }) => boolean;
  stations: readonly { z: number; weight: number; demihull?: unknown; polygon: readonly (readonly [number, number])[] }[];
  volume: number;
  /** Her weight as designed (kg), her centre of gravity's height and her GM (m). */
  massKg: number;
  kgY: number;
  gm: number;
}): DiveFrameFit | { why: string } {
  const c = CONFIG.modules.diveFrame;
  const fit = CONFIG.shipyard.diveFrame;
  const s = c.sub;
  const { q, transom } = o;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const footZ = transom - c.footFromTransom;
  const footX = r2(q.halfBeam(footZ) - c.footInset);
  if (footX < s.halfWidth + fit.legClear) return { why: `her stern is too narrow (the sub is ${(2 * s.halfWidth).toFixed(1)} m wide over her thrusters, and has to pass between its legs)` };
  const place: DiveFramePlace = { transom: r2(transom), deck: r2(q.deckY(footZ)), footX, waterY: 0 };
  // Her cradle: the sub on it, from her bow to her tail.
  const g0 = diveGeometry({ ...c, at: place });
  const z0 = g0.cradleLiftZ - s.front - 0.2;
  const z1 = transom - 0.1;
  if (z0 < o.aftEnd) return { why: `her aft deck is too short (the sub on her cradle needs ${(transom - z0).toFixed(1)} m clear forward of the transom, she has ${Math.max(0, transom - o.aftEnd).toFixed(1)} m aft of the wheelhouse)` };
  if (!o.oneLevel({ z0, z1 })) return { why: 'her aft deck isn’t all on one level for the sub’s cradle' };
  for (let z = z0; z <= z1; z += 0.25) if (q.halfBeam(z) - 0.15 < s.halfWidth) return { why: 'her aft deck is too narrow for the sub’s cradle' };
  // Legs long enough to carry her out over the transom's bulwark: through the swing, while
  // she's over the transom, her skids clear its top.
  const bulwarkTop = q.deckY(transom) + o.bulwarkHeight;
  let legLength = 0;
  for (let L = c.legLength; L <= fit.maxLeg + 1e-6; L += 0.25) {
    const cfg: DiveFrameConfig = { ...c, legLength: L, at: place };
    const g = diveGeometry(cfg);
    let clear = true;
    for (let k = 0; k <= 40 && clear; k++) {
      const deg = g.inDeg + ((g.outDeg - g.inDeg) * k) / 40;
      const [hy, hz] = headAt(cfg, deg);
      const over = transom >= hz - s.front && transom <= hz + s.aft; // (her lift point is at the head)
      if (over && hy - s.lift - s.bottom < bulwarkTop + fit.bulwarkClear) clear = false;
    }
    if (clear) {
      legLength = Math.round(L * 100) / 100;
      break;
    }
  }
  if (!legLength) return { why: `her bulwark aft is too high to swing the sub over (it would need legs over ${fit.maxLeg} m)` };
  // Big enough to carry her at all.
  if (s.massKg > fit.maxShare * o.massKg) return { why: `she's too small for the sub: at ${(s.massKg / 1000).toFixed(0)} t it's ${Math.round((100 * s.massKg) / o.massKg)} % of her weight (a dive support boat carries no more than about ${Math.round(fit.maxShare * 100)} %: she'd want to weigh ${Math.ceil(s.massKg / fit.maxShare / 1000)} t or more)` };
  // Her freeboard at the transom with the sub hung out over the stern, from her cradle.
  const cfg: DiveFrameConfig = { ...c, legLength, at: place };
  const g = diveGeometry(cfg);
  // (The sub is designed into her lines on her cradle: hung out, she's moved that far aft.)
  const shift = headAt(cfg, g.outDeg)[1] - g.cradleLiftZ; // m aft
  const rho = CONFIG.ocean.density;
  const wp = waterplane(o.stations);
  const trim = (s.massKg * shift) / (rho * o.volume * (wp.iL / o.volume)); // rad, by the stern
  const sinkage = trim * (transom - wp.lcf);
  const freeboard = q.deckY(transom) - sinkage;
  if (freeboard < fit.minFreeboard) return { why: `she's too small for the sub: with her hung out over the stern she'd trim down to ${Math.max(0, freeboard).toFixed(2)} m of freeboard at the transom (she needs ${fit.minFreeboard} m)` };
  // Her stability with the sub lifted off her cradle to the docking head, at its highest (the
  // frame upright): her centre of gravity rises by her share of that lift.
  const headY = place.deck + legLength - c.headDrop;
  const cradleY = g0.cradleTop + s.bottom;
  const gmWith = o.gm - (s.massKg * (headY - cradleY)) / o.massKg;
  if (gmWith < fit.minGM) return { why: `she'd be too tender with the sub hanging from the frame (GM ${gmWith.toFixed(2)} m with it up at the docking head; she needs ${fit.minGM} m)` };
  return { place, legLength, rects: [{ x0: -s.halfWidth - 0.1, x1: s.halfWidth + 0.1, z0, z1: transom }] };
}

/** Her waterplane at the DWL (y = 0) from her stations: its area, its centre along her, and its inertia about that (I_L). */
function waterplane(stations: readonly { z: number; weight: number; polygon: readonly (readonly [number, number])[] }[]): { area: number; lcf: number; iL: number } {
  // Each station's breadth at the waterline: the polygon's crossings of y = 0, in pairs (one
  // pair across a monohull's section, two for a catamaran's two hulls).
  const breadth = (poly: readonly (readonly [number, number])[]) => {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      if (y0 * y1 < 0) xs.push(x0 + ((x1 - x0) * -y0) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    let b = 0;
    for (let j = 0; j + 1 < xs.length; j += 2) b += xs[j + 1] - xs[j];
    return b;
  };
  const strips = stations.map((s) => ({ z: s.z, a: breadth(s.polygon) * s.weight }));
  const area = strips.reduce((t, s) => t + s.a, 0);
  const lcf = strips.reduce((t, s) => t + s.a * s.z, 0) / Math.max(1e-6, area);
  const iL = strips.reduce((t, s) => t + s.a * (s.z - lcf) ** 2, 0);
  return { area: Math.max(1e-6, area), lcf, iL };
}
