/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her machinery, and the engine hatch and space over it.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { bottomAt as bottomUnder, FLANGE_SHARE, halfSection, layShaft, sternDriveLine, twinEngineX } from '../machinery';
import { CONFIG } from '../../config';
import { outboardCount, SCALES, SHAFT_ONLY_ENGINES, SINGLE_ONLY_ENGINES } from '../design';
import type { Socket } from '../../modular/socket';
import type { BuildArgs, HatchZone, V3 } from './common';
import { ENGINES, materialOf } from './catalog';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart } from './house';
import type { TrimPart } from './trim';
import type { PlacesPart } from './places';
import type { DeckGearPart } from './deckGear';

/** Her machinery: the engine (or twin engines, pod drives, stern drives or outboards), its shaft line placed for her balance, the propeller and gearbox, the rudder, her plating's area, and where the engine space and its hatch can go. */
export function machineryPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart) {
  const { d } = a;
  const { aft, base, beamDeck, deckhouse, dhArea, floorY, front, grownPlate, h, houseL, hw, lengthM, q, rnd, roofDrop, roofY, saloonL, shape, st, transom, warnings } = p;
  // ── Machinery ──
  const eng = ENGINES[d.engine];
  const kw = eng.kw;
  // Her engine's rated speed as a share of the 1800 rpm engines' (1 for those).
  const rs = eng.ratedRpm / 1800;
  // Twin engines: two of the package, their propellers set out ~28 % of her deck beam either
  // side of the centreline (under her bottom, clear of each other), twin rudders behind them.
  // (An engine that only goes in singly is built single, whatever the twin choice says.)
  const singleOnly = SINGLE_ONLY_ENGINES.includes(d.engine);
  if (d.twin && singleOnly) warnings.push(`The ${eng.name.split(' (')[0]} goes in singly: she has one.`);
  // (The tug diesel goes on a shaft only: its big slow propeller.)
  const shaftOnly = SHAFT_ONLY_ENGINES.includes(d.engine);
  // Pod drives (owner, Oct 2026; design.pods; CONFIG.modules.pods): two steerable pods under
  // her bottom, each with its own engine (so always twin). For a planing hull (a fast boat's
  // small, quick propellers); not the slow tug diesel; outboards, if chosen, instead.
  const pdc = CONFIG.modules.pods;
  // (And the solar catamaran's electric motors: hers are pods, one under each hull.)
  const electric = 'electric' in eng && !!eng.electric;
  if (d.pods && !outboardCount(d) && base.regime !== 'planing' && !electric) warnings.push('Pod drives are for a planing hull (the landing craft, the gillnetter or the pilot boat): she has a shaft.');
  else if (d.pods && !outboardCount(d) && shaftOnly) warnings.push(`The ${eng.name.split(' (')[0]} goes on a shaft (its big slow propeller): no pod drives.`);
  const pods = !!d.pods && !outboardCount(d) && (base.regime === 'planing' || electric) && !shaftOnly;
  // A catamaran always has twin engines, one in each hull (her hulls are too slim for one on
  // her centreline, and her tunnel is there).
  // Too much power for a displacement hull (CONFIG.shipyard.maxKwPerTonne, on her lines'
  // displacement): twin engines past it go in singly, if one is within it.
  const maxKw = base.regime === 'displacement' ? CONFIG.shipyard.maxKwPerTonne * h.volume * 1.025 : Infinity;
  const tooMuchForTwin = !!d.twin && !singleOnly && !outboardCount(d) && 2 * kw > maxKw && kw <= maxKw;
  if (tooMuchForTwin) warnings.push(`Two ${eng.name.split(' (')[0]}s are too much for her: ${2 * kw} kW in a hull of ${Math.round(h.volume * 1.025)} t (she takes about ${Math.round(maxKw / 10) * 10} kW). She has one.`);
  // (The foiling ferry's two pods on her aft foils' struts: DesignHull.foilPods, a motor each.)
  const twin = (!!d.twin || pods || !!base.catamaran) && !singleOnly && !tooMuchForTwin;
  // Stern drives (owner, Oct 2026; design.sternDrive): the engine against the transom, a
  // leg through it that swings to steer (CONFIG.modules.sternDrive). Not the slow tug
  // diesel (its big slow propeller wants a shaft); outboards, if chosen, instead.
  const sdc = CONFIG.modules.sternDrive;
  if (d.sternDrive && shaftOnly && !outboardCount(d)) warnings.push(`The ${eng.name.split(' (')[0]} goes on a shaft (its big slow propeller): no stern drive.`);
  if (d.sternDrive && pods) warnings.push('Pod drives in place of the stern drives.');
  const sd = !!d.sternDrive && !shaftOnly && !outboardCount(d) && !pods;
  // A Kort nozzle (owner, Oct 2026; design.nozzle; CONFIG.nozzle): on a shaft-driven propeller only.
  if (d.nozzle && (sd || pods || outboardCount(d))) warnings.push(`A Kort nozzle goes round a shaft-driven propeller: none on ${outboardCount(d) ? 'outboards' : pods ? 'pod drives' : 'a stern drive'}.`);
  const nozzle = !!d.nozzle && !sd && !pods && !outboardCount(d);
  const n = twin ? 2 : 1;
  const keelAft = st[0].polygon[2][1];
  // (The harbour tug's stern is shallow, cut up for drive pods to hang under: her propellers
  // reach down as her drives' would, DesignHull.propDepth, until her drives come.)
  const draughtAft = Math.max(-keelAft, base.propDepth ?? 0);
  // The propeller: as big as her draught aft allows (tip clear below her keel by ~1/4 of
  // it), and no bigger than her engine can turn (0.675 m at 150 kW .. 1.05 m at 400 kW). A
  // slower engine turns a bigger one for its power (a propeller's best diameter grows as its
  // revs fall): the 1000 rpm tug engine up to 1.4 m, as her draught allows (ENGINES propMaxM).
  // (A catamaran's: each under its own hull's keel, half her hull spacing out.)
  const twinX = shape.catamaran ? Math.round((shape.catamaran.spacing / 2) * 100) / 100 : Math.round(0.28 * 2 * Math.max(...st.map((s) => s.halfBeamDeck)) * 100) / 100;
  // (An electric motor's full torque from rest turns its own big slow propeller, ENGINES propMaxM, whatever its power.)
  // (A pod hung deep under her on her aft foil's strut, the foiling ferry's: as big as her motors turn, her draught aft no bound.)
  const propD = base.foilPods ? eng.propMaxM : Math.round(Math.max(0.45, Math.min(1.25 * draughtAft, electric ? eng.propMaxM : 0.45 + (0.0015 * kw) / rs, eng.propMaxM, twin ? 2 * twinX - 0.15 : 9)) * 100) / 100;
  // Her shaft and the engine on it (machinery.ts): the shaft rises forward from the
  // propeller at a set angle and the engine sits on it where it clears her bottom. Its top
  // must be under the cabin floor (under the house) or the deck (elsewhere): a tall engine in
  // a shallow hull doesn't fit, which is a reason for more depth (owner).
  // Her plating's area (every station's section all round, deck included, her transom and
  // any square bow plate) and its centre (height y, place along her z): for her weights.
  let shellM2 = 0;
  let shellM2y = 0;
  let shellM2z = 0;
  const ring2 = (p: readonly (readonly [number, number])[]) => p.map((a, i) => [a, p[(i + 1) % p.length]] as const);
  for (let i = 1; i < st.length; i++) {
    const dz = Math.abs(st[i].z - st[i - 1].z) / 2;
    for (const sec of [st[i - 1], st[i]])
      for (const [a, b] of ring2(sec.polygon)) {
        const m2 = Math.hypot(b[0] - a[0], b[1] - a[1]) * dz;
        shellM2 += m2;
        shellM2y += (m2 * (a[1] + b[1])) / 2;
        shellM2z += m2 * (st[i - 1].z + st[i].z) / 2;
      }
  }
  for (const end of [st[0], ...(st[st.length - 1].halfBeamDeck > 0.3 ? [st[st.length - 1]] : [])]) {
    const p = end.polygon;
    const m2 = Math.abs(p.reduce((a, [x, y], i) => a + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;
    shellM2 += m2;
    shellM2y += (m2 * p.reduce((a, [, y]) => a + y, 0)) / p.length;
    shellM2z += m2 * end.z;
  }
  const material = materialOf(d);
  const mat = CONFIG.shipyard.materials[material];
  const wc = CONFIG.shipyard.weights;
  // Where her balance wants the engine (owner, Oct 2026: "a place where the centre of gravity
  // is good longitudinally"): her other main weights (plating, houses, fit-out, crew) and
  // where they are; the engine, its shafting and the batteries placed so that, with them, her
  // centre of gravity is over her centre of buoyancy (she floats level without ballast to
  // trim her). Her fuel and ballast are taken to be about her centre of buoyancy; her deck
  // gear isn't placed yet, and left out.
  const restKgZ: [number, number][] = [
    [shellM2 * mat.shellKgPerM2 * (base.scantlings ?? 1) * grownPlate, shellM2z / shellM2],
    // (A lower saloon roof: its two side walls that much shorter; the step's riser and the lower aft wall cancel.)
    [(2 * (houseL + 2 * hw) * (roofY - floorY) - 2 * saloonL * roofDrop + 4 * hw * houseL) * mat.houseKgPerM2, (front + aft) / 2],
    [dhArea * mat.houseKgPerM2, deckhouse ? (deckhouse.z0 + deckhouse.z1) / 2 : 0],
    [wc.outfitKgPerM2 * lengthM * beamDeck * 0.8, shellM2z / shellM2],
    [wc.crewKg + wc.storesKg, (front + aft) / 2],
  ];
  const engineGroupKg = eng.kg * n * (1 + wc.machineryShare) + 2 * CONFIG.modules.batteryBank.massKg;
  const restKg = restKgZ.reduce((a, [m]) => a + m, 0);
  const balanceZ = (h.lcb * (restKg + engineGroupKg) - restKgZ.reduce((a, [m, z]) => a + m * z, 0)) / engineGroupKg;
  // (The harbour tug's engine room rises into her deckhouse, as a ship's machinery casing:
  // under it, her engines may stand up to its top. DesignHull.engineCasing.)
  const casing = base.engineCasing && deckhouse ? deckhouse : null;
  const ceilingAt = (z: number) => (casing && z >= casing.z0 && z <= casing.z1 ? casing.top : z >= front && z <= aft ? floorY : q.deckY(z));
  // (Pods: the engine level as a stern drive's, its gearbox end over the pod's axis.)
  // (Z-drives, the harbour tug's (DesignHull.zDrives; owner, Oct 2026: "much lower and further
  // back"): her engines level and as low as they clear her bottom, their gearbox ends
  // `zDriveEngineAft` of her length forward of her transom, a level shaft aft from each to its
  // drive; the propellers at the drives' feet, `propDepth` down.)
  const shaft = base.zDrives
    ? { ...sternDriveLine(shape, eng.size, twin ? twinEngineX(twinX, eng.size[1]) : 0, transom, ceilingAt, CONFIG.shipyard.harbourTug.zDriveEngineAft * lengthM), propY: -(base.propDepth ?? 0) + propD / 2 }
    : sd || pods
    ? // (The foiling ferry's motors are in her pod: her machinery space, with its controllers and her 12 V batteries, is in her starboard hull aft, under the hatch over it.)
      sternDriveLine(shape, eng.size, twin || base.foilPods ? (shape.catamaran ? twinX : twinEngineX(twinX, eng.size[1])) : 0, transom, ceilingAt, pods ? pdc.forwardOfTransom : sdc.transomInset)
    : layShaft(shape, eng.size, twin ? (shape.catamaran ? twinX : twinEngineX(twinX, eng.size[1])) : 0, { x: twin ? twinX : 0, z: transom - 0.65, d: propD }, ceilingAt, CONFIG.shipyard.shaftAngleDeg, CONFIG.shipyard.shaftAngleMaxDeg, balanceZ);
  // A stern drive's legs: one behind each engine, through the transom; the top of each (its
  // gimbal housing) over the engine's output, its anti-ventilation plate level with her
  // bottom at the transom; its propeller a high-revving one, no bigger than `propMaxM`.
  const sdPropD = Math.min(propD, sdc.propMaxM);
  const sdLegs = sd
    ? (() => {
        const units = twin ? [-shaft.x, shaft.x].map(rnd) : [0];
        const mount = { y: rnd(shaft.flangeY + 0.15), z: rnd(transom) };
        const plateY = Math.max(...units.map((x) => bottomUnder(shape, x, transom))) - 0.02;
        return { units, mount, look: { ...sdc.look, shaftLength: rnd(Math.max(0.3, mount.y - plateY)) } };
      })()
    : null;
  // The pods: one under each engine's gearbox end, its strut down from her bottom there long
  // enough that its propellers' tips clear her bottom (and never shorter than the look's).
  // (An electric motor's pods turn its own big slow propeller: no pod gears to keep it small.)
  const podPropD = electric ? propD : Math.min(propD, pdc.propMaxM);
  // (The foiling ferry's pods: on her aft foils' struts, the ones her lines give a pod, port
  // then starboard, each from her hull's bottom at its top down to its foot, where its foil is.)
  const podStruts = base.foilPods && p.form.kind === 'lofted' ? (p.form.design.foils?.struts ?? []).filter((s) => s.podDragArea).sort((a, b) => a.x - b.x) : [];
  const podStrut = podStruts[0];
  const podSet = podStrut
    ? { units: podStruts.map((s) => rnd(s.x)), mount: { y: rnd(podStrut.top), z: rnd(podStrut.z) }, strut: rnd(podStrut.top - podStrut.bottom) }
    : pods
    ? (() => {
        const units = [-shaft.x, shaft.x].map(rnd);
        const z = rnd(shaft.flangeZ);
        const y = rnd(Math.max(...units.map((x) => bottomUnder(shape, x, z))));
        return { units, mount: { y, z }, strut: rnd(Math.max(pdc.look.strutLength, podPropD / 2 + 0.12)) };
      })()
    : null;
  // The harbour tug's azimuth drives (DesignHull.zDrives; modules/dieselInboard `azimuth`):
  // each drive's upright axis half a propeller's diameter forward of where the stand-in's
  // propeller was (as the Engine step draws them, enginePreview.ts zDrive), its head just
  // inside her bottom there, its propeller at the shaft's level `propDepth` down, or lower if
  // need be so the top of its nozzle clears her bottom by `hullClear` all over the nozzle's
  // footprint (as a real one hangs under her).
  const zDriveSet = base.zDrives && twin
    ? (() => {
        const az = CONFIG.modules.azimuth;
        const legZ = rnd(transom - 0.65 - 0.5 * propD);
        const ring = propD / 2 + 0.01 + az.look.nozzleWall;
        const mid = legZ - az.propFwd * propD;
        const half = (az.look.nozzleLength * propD) / 2;
        let lowest = Infinity;
        for (const cx of [-shaft.x, shaft.x]) for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const z of [mid - half, mid, mid + half]) lowest = Math.min(lowest, bottomUnder(shape, cx + dx * ring, z));
        const propY = Math.min(shaft.propY ?? 0, lowest - az.hullClear - ring);
        return { legZ, headY: rnd(Math.max(...[-shaft.x, shaft.x].map((x) => bottomUnder(shape, x, legZ))) + 0.3), propY: rnd(propY) };
      })()
    : null;
  // Outboards instead (owner, Oct 2026; design.outboards): 2 to 4 of the petrol V8s
  // (CONFIG.modules.outboard) on a bracket off the transom, in place of the engine package,
  // its shaft and the rudder (they steer by swinging). The engine choice above then only
  // stands in the code. Their units set `spacing` apart, centred, closer if her transom is
  // narrow; the bracket as wide as the row and a margin, aft of the transom by its length,
  // its bottom at the waterline and its top just under the mount. The mount's height: their
  // anti-ventilation plates about level with her keel (the bottom's water is clean there),
  // up to 0.35 m under the water and no higher than 0.08 m under it, a 30 in shaft above.
  const nOb = outboardCount(d);
  const obc = CONFIG.modules.outboard;
  // Her gearbox (or the outboards' lower units), the design's step: matched by trial
  // (shipyard/trial.ts matchGear) so she reaches her rated revs flat out. (Outboards on a
  // fixed 2.0 lower unit lugged on a heavy hull and ran hot: owner.)
  const gear = Math.round(SCALES.gear(d.gear) * 100) / 100;
  const outboards = (() => {
    if (!nOb) return null;
    const halfT = st[0].halfBeamDeck;
    const spacing = nOb > 1 ? Math.min(obc.spacing, (2 * (halfT - 0.35)) / (nOb - 1)) : 0;
    if (spacing < obc.spacing - 1e-6) warnings.push(`Her transom is narrow for ${nOb} outboards: they're ${Math.round(spacing * 100)} cm apart (they want ${Math.round(obc.spacing * 100)} cm to turn lock to lock). Give her more beam (Hull), or fit fewer.`);
    const units = Array.from({ length: nOb }, (_, i) => Math.round((i - (nOb - 1) / 2) * spacing * 100) / 100);
    const plateY = Math.round(Math.max(-0.35, Math.min(-0.08, keelAft + 0.35)) * 100) / 100;
    const mount = { y: Math.round((plateY + obc.look.shaftLength) * 100) / 100, z: Math.round((transom + obc.bracket.length) * 100) / 100 };
    const bracket = { z0: Math.round((transom - 0.02) * 100) / 100, z1: mount.z, y0: 0, y1: Math.round((mount.y - obc.bracket.belowMount) * 100) / 100, halfWidth: Math.round(Math.min(halfT - 0.05, Math.max(...units.map(Math.abs)) + obc.bracket.margin) * 100) / 100 };
    // A lower unit only comes in a narrow range of ratios: a code matched for an inboard (or
    // never matched) can't put a 1.2 on them (she'd lug and run hot).
    const [gMin, gMax] = obc.engine.gearRange;
    return { units, mount, bracket, engine: { ...obc.engine, gearRatio: Math.min(gMax, Math.max(gMin, gear)) } };
  })();
  if (!shaft.fits && !outboards && !podStrut) warnings.push(`The ${eng.name.split(' (')[0]} doesn't fit: ${sd ? 'against the transom' : pods ? 'over its pod' : 'on its shaft line'} it stands ${(shaft.shortM * 100).toFixed(0)} cm above the ${shaft.flangeZ - eng.size[0] / 2 >= front && shaft.flangeZ - eng.size[0] / 2 <= aft ? 'cabin floor' : 'deck'}. Give her more depth (Hull), raise the floor (Wheelhouse), or fit a smaller engine.`);

  // ── The engine space and its hatch (owner, Oct 2026: the box under the wheelhouse "is not
  // where the engine will go") ──
  // Over the engine, where its shaft line puts it (the starboard one of a twin: the one whose
  // oil is checked). Outboards have no engine inside: the hatch (her oil checks, as the
  // Alaskan's lazarette) goes at the aft end. It's cut into whichever floor holds most of the
  // engine, as close over its middle as fits: the cabin floor (aft of the helm, clear of the
  // chart table and any steps inside; not on a deckhouse, its floor far above), or the open
  // deck (clear of the house and its steps, the bow and the stern gear). As long as the
  // engine and a little (CONFIG.shipyard.engineHatch), as wide as it and a hand's width each
  // side for the dipstick and the oil can. The engine space under it goes down to just over
  // her bottom (the highest of it under the hatch's corners: a V bottom rises to the chines).
  const ehc = CONFIG.shipyard.engineHatch;
  const [engL, engW, engH] = eng.size;
  const engX = outboards ? 0 : twin || podStrut ? shaft.x : 0;
  const engZ0 = outboards ? transom - 0.6 - ehc.minLength : shaft.flangeZ - engL;
  const engZ1 = outboards ? transom - 0.6 : shaft.flangeZ;
  const engHalf = outboards ? 0.25 : engW / 2;
  const engMid = (engZ0 + engZ1) / 2;
  // (HatchZone: parts/common.ts.)
  /** The engine's top (the model's) at z along her, on its tilted shaft line. */
  const engTopAt = (z: number) => shaft.flangeY + (shaft.flangeZ - z) * Math.tan((shaft.angleDeg * Math.PI) / 180) + (1 - FLANGE_SHARE) * engH;
  const propPos: V3 = [0, keelAft + 0.1, transom - 0.65];
  const rudderPos: V3 = [0, keelAft + 0.15, transom - 0.25];
  const prop = base.regime === 'planing' ? { kt0: 0.6, j0: 1.35, kq0: 0.1, jq0: 1.45, wake: 0.06, thrustDeduction: 0.08 } : { kt0: 0.57, j0: 1.15, kq0: 0.077, jq0: 1.25, wake: 0.18, thrustDeduction: 0.18 };
  // One rudder (or twin rudders, as one of twice the area, each in its own propeller's wash).
  const rudderArea = Math.round(0.07 * h.lwl * Math.max(0.3, draughtAft) * n * 100) / 100;
  // Her installed power (the outboards': each one's, times their count).
  const powerKw = nOb ? obc.engine.powerKw * nOb : kw * n;
  // (A ship's tanks, where her type sets them: the harbour tug's, DesignHull.fuelL.)
  const tankL = base.fuelL ?? Math.max(200, Math.round((powerKw * 1.1) / 50) * 50);
  const batteriesKg = 2 * CONFIG.modules.batteryBank.massKg;

  return { electric, zDriveSet, batteriesKg, ehc, eng, engH, engHalf, engL, engMid, engTopAt, engW, engX, engZ0, engZ1, gear, kw, mat, material, n, nOb, nozzle, obc, outboards, pdc, podPropD, podSet, pods, powerKw, prop, propD, propPos, rs, rudderArea, rudderPos, sd, sdLegs, sdPropD, sdc, shaft, shellM2, shellM2y, shellM2z, shaftOnly, singleOnly, tankL, twin, twinX, wc };
}
export type MachineryPart = ReturnType<typeof machineryPart>;

/** The engine hatch and the space under it, now the deck gear has its places: in the deck or the cabin floor over most of the engine, the dipstick by it. */
export function engineHatchPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart) {
  const { d } = a;
  const { aft, at, bowRamp, cf, craneAt, deckhouse, ehc, engHalf, engMid, engTopAt, engX, engZ0, engZ1, floorY, foreEndAt, helmAft, hw, hx, inside, layout, nSteps, outboards, pods, q, rise, rnd, rudderPos, saloonDrop, sd, shape, skiffAt, stem, taken, transom, tread, twin, wall, winchAt } = p;
  // Her engine hatch (planned above, with the engine), now the deck gear has its places.
  const ctabW = d.chartTable ? CONFIG.modules.chartTable.width + 0.1 : 0;
  const zones: HatchZone[] = [];
  // (In the wheelhouse's floor: a saloon a step down has its own, at another height.)
  // (In her axes: an offset house's floor is across from its middle, `hx`.)
  if (!deckhouse) zones.push({ floor: true, z0: cf + 0.5 + ehc.helmRoom, z1: saloonDrop ? helmAft - 0.05 : aft - wall - inside - 0.05, x0: () => hx - (hw - wall) + 0.05 + ctabW, x1: () => hx + hw - wall - 0.05 });
  const houseZ0 = foreEndAt - 0.3;
  const houseZ1 = aft + Math.max(0.7, (rise > 0 ? nSteps * tread : 0) + 0.3);
  const deckX = (z: number) => q.halfBeam(z) - ehc.deckMargin;
  zones.push({ floor: false, z0: stem + (bowRamp ? 1.8 : 1.0), z1: houseZ0, x0: (z) => -deckX(z), x1: deckX });
  zones.push({ floor: false, z0: houseZ1, z1: transom - 0.35, x0: (z) => -deckX(z), x1: deckX });
  const hatchLen = Math.max(ehc.minLength, Math.min(ehc.maxLength, engZ1 - engZ0 + 2 * ehc.endRoom));
  // In each, the spots along it (5 cm apart) clear of the gear placed on deck (`taken`, with
  // room to lift the lid: narrower or shorter if need be); the best is the one over most of
  // the engine, then the nearest its middle.
  const hatchesIn = (zone: HatchZone) => {
    const out = [];
    for (let len = Math.min(hatchLen, zone.z1 - zone.z0); len >= ehc.minLength - 1e-6; len -= 0.1) {
      for (let k = 0; k <= Math.floor((zone.z1 - zone.z0 - len) / 0.05); k++) {
        const mid = zone.z0 + len / 2 + k * 0.05;
        const z0 = mid - len / 2;
        const z1 = mid + len / 2;
        let x0 = Math.max(zone.x0(z0), zone.x0(z1), engX - engHalf - ehc.sideRoom);
        let x1 = Math.min(zone.x1(z0), zone.x1(z1), engX + engHalf + ehc.sideRoom);
        // Narrower, clear of gear beside it (a crane at the deck edge): from whichever side it's on.
        if (!zone.floor)
          for (const o of taken)
            if (o.z0 < z1 + 0.1 && o.z1 > z0 - 0.1) {
              if ((o.x0 + o.x1) / 2 >= engX) x1 = Math.min(x1, o.x0 - 0.1);
              else x0 = Math.max(x0, o.x1 + 0.1);
            }
        if (x1 - x0 < ehc.minWidth) continue;
        out.push({ zone, x0, x1, z0, z1, over: Math.max(0, Math.min(z1, engZ1) - Math.max(z0, engZ0)), off: Math.abs(mid - engMid) });
      }
    }
    return out;
  };
  const spot = zones.flatMap(hatchesIn).sort((a, b) => b.over - a.over || a.off - b.off)[0];
  // (Never without one in practice: a hull too short for any of these keeps it in the cabin floor, aft to starboard.)
  const hs = spot ?? { zone: zones[0] ?? { floor: true }, x0: hx + 0.15, x1: hx + Math.min(0.85, hw - 0.2), z0: aft - 1.125 - inside, z1: aft - 0.325 - inside };
  const hatchZ = (hs.z0 + hs.z1) / 2;
  /** The hatch's top: the cabin floor, or the deck there. */
  const hatchTop = hs.zone.floor ? floorY : q.deckY(hatchZ);
  // The engine space's floor plates: just over her bottom under the engine's sides (under
  // the hatch's sides for outboards' lazarette), so the engine stands up through them on
  // its bearers. The sea is kept out of it in the drawing (the diesel module's water stop).
  const sideXs = outboards ? [hs.x0, hs.x1] : (twin ? [-1, 1] : [1]).flatMap((s) => [s * engX - engHalf, s * engX + engHalf]);
  const soleY = Math.max(...[hs.z0, hatchZ, hs.z1].flatMap((z) => sideXs.map((x) => bottomUnder(shape, x, z)))) + ehc.soleClear;
  /** Her hull's inside half-breadth at height y, at z (from her section there: keel, chine, deck edge). */
  const insideHalf = (z: number, y: number) => {
    const s = halfSection(shape, z);
    for (let k = 1; k < s.length; k++)
      if (y <= s[k][1]) return s[k - 1][0] + ((s[k][0] - s[k - 1][0]) * (y - s[k - 1][1])) / Math.max(1e-6, s[k][1] - s[k - 1][1]);
    return s[s.length - 1][0];
  };
  // The space: across both engines of a twin (each on its own shaft, either side), otherwise
  // the hatch's own width; no wider than her hull inside at the floor plates (less a frame).
  // (In the cabin floor, inside the house's walls too: its walls stand on the floor's edge.)
  const roomHalf = Math.min(insideHalf(hs.z0, soleY), insideHalf(hs.z1, soleY)) - 0.05;
  /**
   * A catamaran's starboard hull inside at height y, at z: its inner and outer sides (her
   * half-section there runs wet-deck corner, inner chine, keel, chine, deck edge).
   */
  const catInside = (z: number, y: number): [number, number] => {
    const [corner, inChine, keel, chine, deck] = halfSection(shape, z);
    const across = (a: [number, number], b: [number, number]) => (b[1] - a[1] > 1e-6 ? a[0] + ((b[0] - a[0]) * Math.max(0, Math.min(1, (y - a[1]) / (b[1] - a[1])))) : b[0]);
    const xin = y <= inChine[1] ? across(keel, inChine) : across(inChine, corner);
    const xout = y <= chine[1] ? across(keel, chine) : across(chine, deck);
    return [xin, xout];
  };
  // (A catamaran: the space is in her starboard hull, over its engine, not across her tunnel.)
  const span = twin && !outboards && !shape.catamaran ? engX + engHalf + ehc.sideRoom : 0;
  // (In the cabin floor, inside the house's walls too: across from its middle, `hx`.)
  const catRoom = shape.catamaran ? [catInside(hs.z0, soleY), catInside(hs.z1, soleY)] : null;
  const [lo, hi] = catRoom
    ? [Math.max(catRoom[0][0], catRoom[1][0]) + 0.05, Math.min(catRoom[0][1], catRoom[1][1]) - 0.05]
    : hs.zone.floor
      ? [Math.max(-roomHalf, hx - (hw - wall) + 0.05), Math.min(roomHalf, hx + hw - wall - 0.05)]
      : [-roomHalf, roomHalf];
  const sx0 = Math.max(lo, Math.min(hs.x0, -span));
  const sx1 = Math.min(hi, Math.max(hs.x1, span));
  const eh = {
    x0: rnd(Math.max(hs.x0, sx0)),
    x1: rnd(Math.min(hs.x1, sx1)),
    z0: rnd(hs.z0),
    z1: rnd(hs.z1),
    pitDepth: rnd(hatchTop - soleY),
    ...(hs.zone.floor ? {} : { y: rnd(hatchTop) }),
    ...(sx0 < hs.x0 - 0.01 || sx1 > hs.x1 + 0.01 ? { space: { x0: rnd(sx0), x1: rnd(sx1) } } : {}),
  };
  layout.engineHatch = eh;
  at.engineSpace = [rnd((eh.x0 + eh.x1) / 2), rnd(soleY + 0.15), rnd(hatchZ)];
  // The dipstick on the engine's inboard side near its forward end, its ring a hand's depth
  // under the hatch (in reach through it); outboards': in the space under the hatch.
  const dipZ = Math.max(eh.z0 + 0.15, Math.min(eh.z1 - 0.15, engZ0 + 0.35));
  const dip: V3 = outboards
    ? [rnd(eh.x0 + 0.15), rnd(hatchTop - 0.32), rnd(eh.z0 + 0.2)]
    : [rnd(Math.max(eh.x0 + 0.06, engX - engHalf - 0.04)), rnd(Math.min(hatchTop - 0.25, Math.max(soleY + 0.1, engTopAt(dipZ) - 0.3))), rnd(dipZ)];
  const hatchIs = hs.zone.floor ? 'Cabin floor' : 'Deck';

  // The places the engine room offers (P4b): the engine (or its drives) on her shaft line, the tank, batteries and bilge pump, the rudder, the hatch over it all with the dipstick and the oil can under it, and the deck hydraulics' pump.
  const engineSockets: Socket[] = [
    // (A stern drive: its engine and legs, weighed at the engine.)
    ...(sd ? [{ id: 'sternDrive', type: 'transom.outboards' as const, transform: { position: at.engineBed }, label: 'Against the transom: her engine and its stern drive' }] : []),
    ...(pods ? [{ id: 'pods', type: 'hull.pods' as const, transform: { position: at.engineBed }, label: 'Under her bottom: her pod drives, and their engines over them' }] : []),
    ...(outboards ? [{ id: 'outboards', type: 'transom.outboards' as const, transform: { position: [0, outboards.mount.y, outboards.mount.z] as V3 }, label: 'The bracket off the transom: her outboards' }] : []),
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, hatchTop, hatchZ] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: `${hatchIs}, over the engine` },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: dip }, label: "Engine space, the engine's inboard side" },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, hatchTop - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    // (Up to the harbour tug's twin 1,850 kW diesels: 3700 kW.)
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 4000 }, label: 'Engine bed, on her shaft line' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], rnd(soleY), at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: rudderPos }, label: 'Rudder stock, under the transom' },
    // (The trawl's net drum, winches and A-frame rams too, with trawl winches and no tow winch; the dive A-frame's rams and winch.)
    ...(craneAt || winchAt || skiffAt || p.aFrame || p.diveFrame ? [{ id: 'hydraulicPump', type: 'engine.bay' as const, transform: { position: at.engineSpace }, label: 'On the engine\'s power take-off (nominal)' }] : []),
  ];
  return { engineSockets, dip, dipZ, eh, hatchIs, hatchTop, hatchZ, soleY, sx0, sx1 };
}
export type EngineHatchPart = ReturnType<typeof engineHatchPart>;
