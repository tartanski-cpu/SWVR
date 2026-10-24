/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): How she floats and moves: weight, centre of gravity, inertia, damping.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import { strakeLine, tyreSpots } from '../../vessel/physics/guards';
import { guardParts } from '../design';
import { catamaranHandling } from '../../vessel/catamaran';
import { atDWL, type BuildArgs, type V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart } from './house';

/** She floats on her lines: her weight (as drawn, or as weighed), her centre of gravity, her hull protection's weight, inertia, damping, and how she rides at speed. */
export function trimPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart) {
  const { d, given, raise } = a;
  const { base, bulwarkHeight, deckhouse, dhArea, dhc, floorY, headroom, level, q, rnd, shape, st, stem, transom, warnings } = p;
  // ── Weight, CG, inertia, damping: she floats on her lines ──
  const h = atDWL(shape);
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  // (Her weight, once weighed: buildDesign. The first time, what her lines displace as drawn.)
  const mass = given ? given.massKg : Math.round(rho * h.volume);
  const mid = st.reduce((a, s) => (Math.abs(s.z - h.lcb) < Math.abs(a.z - h.lcb) ? s : a)).polygon;
  const keelMid = mid[2][1];
  const deckMid = mid[0][1];
  const cg: V3 = [0, keelMid + 0.63 * (deckMid - keelMid) + 0.15 * (headroom - 2.2) + 0.15 * (floorY - level), h.lcb];
  // A deckhouse's plate, high up: her centre of gravity rises by its share of her weight
  // times how far its own centre (halfway up it) is above hers. Her displacement is the
  // same (she still floats on her lines: the rest of her is that much lighter).
  const dhKg = dhArea * dhc.kgPerM2;
  if (deckhouse) cg[1] += (dhKg / mass) * ((deckMid + deckhouse.top) / 2 + 0.2 - cg[1]);
  // Hull protection (owner): the strake or the tyres, high on her sides, designed in the same
  // way (the crew's few fenders are too light to count). The strake runs right round her: both
  // sides, the transom and, without a ramp, across a square bow.
  const prot = guardParts(d.guard);
  const hg = CONFIG.modules.hullGuard;
  const strakeAt = prot.side === 'strake' ? strakeLine(q) : [];
  let strakeM = 0;
  for (let i = 1; i < strakeAt.length; i++) strakeM += 2 * Math.hypot(strakeAt[i][0] - strakeAt[i - 1][0], strakeAt[i][1] - strakeAt[i - 1][1], strakeAt[i][2] - strakeAt[i - 1][2]);
  if (strakeAt.length) strakeM += 2 * strakeAt[0][0] + (base.ramp ? 0 : 2 * strakeAt[strakeAt.length - 1][0]);
  const tyres = prot.side === 'tyres' ? tyreSpots(q) : [];
  const guardKg = strakeM * hg.strake.kgPerM + 2 * tyres.length * hg.tyres.kgEach;
  const guardY = prot.side === 'strake' ? deckMid - hg.strake.drop : deckMid - hg.tyres.drop;
  if (guardKg > 0) cg[1] += (guardKg / mass) * (guardY - cg[1]);
  // A tug's push knees on her square bow plate (modules/pushFender): from the bulwark top
  // down to just above where the plate's sides end (its chines), within `inset` of her
  // sides; designed in high at her bow, as the strake is.
  const pf = CONFIG.modules.pushFender;
  const stemPoly = st[st.length - 1].polygon;
  const pushFender = base.pushBow
    ? { halfWidth: rnd(q.halfBeam(stem) - pf.inset), bottom: rnd(stemPoly[3][1] + pf.clear), top: rnd(q.deckY(stem) + bulwarkHeight), z: rnd(stem) }
    : null;
  if (pushFender) {
    const kg = pf.knees * pf.kneeWidth * (pushFender.top - pushFender.bottom) * pf.kgPerM2;
    cg[1] += (kg / mass) * ((pushFender.top + pushFender.bottom) / 2 - cg[1]);
  }
  const beamDeck = 2 * Math.max(...st.map((s) => s.halfBeamDeck));
  const lengthM = transom - stem;
  // A catamaran's handling (vessel/catamaran.ts): two slim hulls' resistance, and her roll
  // inertia (her roll radius of gyration, and each hull's heave added mass acting half her
  // hull spacing out) rather than a monohull's.
  const cat = shape.catamaran ? catamaranHandling(shape, Math.round(h.lwl * 100) / 100, CONFIG.vessels.landingCraft.resistance.y) : null;
  const gyradius = { roll: cat ? cat.rollGyradius : 0.39 * beamDeck, pitch: 0.278 * lengthM, yaw: 0.29 * lengthM };
  // Weighed (buildDesign), her centre of gravity is her parts': its height from the weights
  // below, her lines raised with it; along her it stays over her centre of buoyancy (level
  // trim: as her designer would trim her, with her tanks and ballast).
  if (given) cg[1] = Math.round((given.cgY + raise) * 1000) / 1000;
  const gm = h.kbY + h.iT / h.volume - cg[1];
  // Under CONFIG.shipyard.minGM she'd capsize (she can't float upright): the page holds back Try her.
  if (gm < CONFIG.shipyard.minGM) warnings.unshift(`She would capsize: she can't float upright (GM ${gm.toFixed(2)} m). Give her more beam or less depth before she goes in the water.`);
  else if (gm < CONFIG.shipyard.lowGM) warnings.push(`Her stability is low (GM ${gm.toFixed(2)} m): give her more beam or less depth.`);
  const iRoll = mass * gyradius.roll ** 2 * (1 + (cat ? cat.addedRoll : 0.25)); // with its added mass
  const rollCritical = 2 * Math.sqrt(iRoll * mass * g * Math.max(0.2, gm));
  const lc = CONFIG.vessels.landingCraft;
  const sizeK = (mass / lc.mass) * (lengthM / 10.2) ** 2;
  // Per-area terms: a planing hull's (the landing craft's, with her small settling drag in
  // surge) or a displacement hull's (the workboat's).
  const perArea = base.regime === 'planing' ? lc.damping : CONFIG.vessels.workboat.damping;
  // How she rides at speed (CONFIG.shipyard regimes): her deadrise aft (where her planing
  // pressure acts) sets how hard she banks into a turn, amidships how hard she slams.
  const sy = CONFIG.shipyard;
  const deadrise = (frac: number) => {
    const poly = st[Math.round(frac * (st.length - 1))].polygon;
    const keel = poly.reduce((a, p) => (p[1] < a[1] ? p : a));
    const midY = (keel[1] + Math.max(...poly.map((p) => p[1]))) / 2;
    const chine = poly.filter((p) => p[1] < midY).reduce((a, p) => (Math.abs(p[0]) > Math.abs(a[0]) ? p : a));
    return Math.atan2(chine[1] - keel[1], Math.max(0.01, Math.abs(chine[0]) - Math.abs(keel[0])));
  };
  const deadriseAft = deadrise(sy.deadriseAt);
  const deadriseMid = deadrise(0.5);
  const slam = Math.min(sy.slamMax, Math.max(sy.slamMin, Math.tan((sy.slamRefDeg * Math.PI) / 180) / Math.tan(Math.max(0.02, deadriseMid))));
  // (A catamaran: no planing turn model; two slim hulls don't bank on a vee.)
  const regime = base.regime === 'displacement' || cat ? null : sy.regimes[base.regime];
  const planing = regime ? { lean: Math.round((sy.leanBase + sy.leanPerSine * Math.sin(deadriseAft)) * regime.lift * 1000) / 1000, fnStart: regime.fnStart, fnFull: regime.fnFull } : null;
  const damping = { ...perArea, rollLift: sy.rollLift, verticalCd: Math.round(perArea.verticalCd * slam * 100) / 100, roll: Math.round(0.28 * rollCritical), pitch: Math.round(lc.damping.pitch * sizeK), yaw: Math.round(lc.damping.yaw * sizeK) };

  return { beamDeck, cat, cg, damping, deckMid, gm, guardKg, guardY, gyradius, h, hg, keelMid, lc, lengthM, mass, mid, pf, planing, prot, pushFender, rho, strakeM, tyres };
}
export type TrimPart = ReturnType<typeof trimPart>;
