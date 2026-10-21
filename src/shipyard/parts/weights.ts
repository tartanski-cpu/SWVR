/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her weights, her price, and the designed boat.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import { overheadM2, type BuildArgs } from './common';
import type { DesignedBoat } from '../build';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';
import type { HullDefPart } from './hullDef';
import type { RecipePart } from './recipe';
import type { FurniturePart } from './furniture';

/** Her weights built up part by part (what she's built of, her houses, machinery and gear), her price, and the designed boat itself. */
export function weightsPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart & HullDefPart & FurniturePart & RecipePart): DesignedBoat {
  const { d } = a;
  const { aFrame, afc, aft, anchorAt, at, base, basketAt, batteriesKg, beamDeck, bowRamp, bulwarkHeight, cabinM2, cr, craneAt, deckMid, deckhouse, dg, dhArea, dhRailM, eng, floorY, front, gear, gm, grownPlate, guardKg, guardY, h, hasMonitor, houseL, hull, hw, keelMid, kw, layout, lengthM, level, mass, mat, material, n, nOb, nozzle, obc, onTop, outboards, pc, pdc, pf, placed, podPropD, podSet, pods, powerKw, propD, pushFender, recipe, ring, rodRack, roofDrop, roofY, saloonL, sd, sdPropD, sdc, shaft, shellM2, shellM2y, shellM2z, sideDoor, skiffAt, st, stem, sternRoller, strakeM, tankL, transom, twin, tyres, warnings, wc, winchAt } = p;
  // ── Her weights, built up (owner, Oct 2026: aluminium or steel, the houses counted) ──
  // Each part's weight and the height of its centre. Her hull: her plating and framing, by
  // its area (every station's section all round, deck included, and her transom and any
  // square bow plate) at the material's weight a square metre; her bulwarks the same, lighter.
  // Her houses: walls, roof and floor by area. Her machinery, batteries and crane as their
  // modules weigh. Her deck gear, hull protection, fit-out (wiring, interior, windows,
  // fittings, paint, by her deck area), and her load as she's trialled: half her fuel, crew
  // and stores (CONFIG.shipyard.weights).
  const bulwarkRun = 2 * lengthM + 2 * st[0].halfBeamDeck + (bowRamp ? 0 : 2 * st[st.length - 1].halfBeamDeck);
  const houseM2 = 2 * (houseL + 2 * hw) * (roofY - floorY) - 2 * saloonL * roofDrop + 2 * (2 * hw * houseL);
  const machineKg = outboards ? obc.massKg * nOb : eng.kg * n;
  const machineY = outboards ? outboards.mount.y : at.engineBed[1];
  const machineZ = outboards ? outboards.mount.z : at.engineBed[2];
  const gearAt: [number, number][] = [
    ...(winchAt ? [[wc.gear.towWinch, winchAt[2]] as [number, number]] : []),
    ...(aFrame ? [[wc.gear.aFrame, transom - afc.footFromTransom] as [number, number]] : []),
    ...(sternRoller ? [[wc.gear.sternRoller, transom] as [number, number]] : []),
    ...(skiffAt ? [[wc.gear.skiff, skiffAt[2]] as [number, number]] : []),
    ...(anchorAt ? [[wc.gear.anchor, anchorAt.at[2]] as [number, number]] : []),
    ...(rodRack ? [[wc.gear.rodRack, rodRack.bucket[2]] as [number, number]] : []),
  ];
  const gearKg = gearAt.reduce((a, [m]) => a + m, 0);
  const gearKgZ = gearAt.reduce((a, [m, z]) => a + m * z, 0);
  const pushKg = pushFender ? pf.knees * pf.kneeWidth * (pushFender.top - pushFender.bottom) * pf.kgPerM2 : 0;
  const items = [
    { name: `Hull: ${material} plating and framing`, kg: shellM2 * mat.shellKgPerM2 * (base.scantlings ?? 1) * grownPlate, y: shellM2y / shellM2, z: shellM2z / shellM2 },
    { name: 'Bulwarks', kg: bulwarkRun * bulwarkHeight * mat.shellKgPerM2 * wc.bulwarkShare, y: deckMid + bulwarkHeight / 2, z: (stem + transom) / 2 },
    { name: 'Wheelhouse', kg: houseM2 * mat.houseKgPerM2, y: (floorY + roofY) / 2, z: (front + aft) / 2 },
    { name: 'Deckhouse: the cabin below (sole, lining, berth)', kg: cabinM2 * CONFIG.shipyard.deckhouse.cabin.kgPerM2, y: layout.cabin ? layout.cabin.sole + 0.6 : deckMid, z: layout.cabin ? (layout.cabin.z0 + layout.cabin.z1) / 2 : 0 },
    { name: 'Deckhouse rail and ladder', kg: deckhouse?.walk ? dhRailM * CONFIG.shipyard.deckhouse.walk.railKgPerM + CONFIG.shipyard.deckhouse.walk.ladder.kg : 0, y: deckhouse ? deckhouse.top + 0.4 : deckMid, z: deckhouse ? (deckhouse.z0 + deckhouse.z1) / 2 : 0 },
    { name: 'Cockpit overhead', kg: overheadM2(layout.overhead) * mat.houseKgPerM2, y: layout.overhead ? layout.overhead.y - 0.3 : deckMid, z: layout.overhead ? (layout.overhead.z0 + layout.overhead.z1) / 2 : 0 },
    { name: 'Deckhouse', kg: dhArea * mat.houseKgPerM2, y: deckhouse ? (deckMid + deckhouse.top) / 2 : deckMid, z: deckhouse ? (deckhouse.z0 + deckhouse.z1) / 2 : 0 },
    { name: outboards ? 'Outboards' : n > 1 ? 'Engines and gearboxes' : 'Engine and gearbox', kg: machineKg, y: machineY, z: machineZ },
    { name: outboards ? 'Bracket, rigging and tanks' : sd ? 'Stern drive legs, tanks, exhaust' : pods ? 'Pod drives, tanks, exhaust' : 'Shafting, propeller, rudder, tanks, exhaust', kg: sd ? sdc.legKg * n + machineKg * wc.machineryShare * 0.4 : pods ? pdc.legKg * n + machineKg * wc.machineryShare * 0.4 : machineKg * wc.machineryShare, y: outboards ? deckMid : pods ? podSet!.mount.y : machineY, z: outboards ? machineZ : sd ? transom : pods ? podSet!.mount.z : (machineZ + transom) / 2 },
    { name: 'Batteries', kg: batteriesKg, y: at.engineSpace[1], z: at.engineSpace[2] },
    { name: 'Deck crane', kg: craneAt ? cr.massKg : 0, y: craneAt ? craneAt[1] + cr.columnHeight / 2 : deckMid, z: craneAt ? craneAt[2] : 0 },
    { name: 'Deck gear', kg: gearKg, y: deckMid + 0.5, z: gearKg > 0 ? gearKgZ / gearKg : 0 },
    { name: 'Hull protection', kg: guardKg + pushKg, y: guardKg + pushKg > 0 ? (guardKg * guardY + (pushFender ? (pushKg * (pushFender.top + pushFender.bottom)) / 2 : 0)) / (guardKg + pushKg) : deckMid, z: guardKg + pushKg > 0 ? (guardKg * ((stem + transom) / 2) + (pushFender ? pushKg * pushFender.z : 0)) / (guardKg + pushKg) : 0 },
    { name: 'Furniture', kg: p.furnitureKg, y: floorY + 0.4, z: (front + aft) / 2 },
    { name: 'Fit-out: wiring, interior, windows, fittings, paint', kg: wc.outfitKgPerM2 * lengthM * beamDeck * 0.8, y: deckMid + 0.3, z: shellM2z / shellM2 },
    { name: 'Fuel (half her tanks)', kg: tankL * wc.fuelShare * wc.fuelDensity, y: keelMid + 0.35 * (deckMid - keelMid), z: h.lcb },
    { name: 'Crew and stores', kg: wc.crewKg + wc.storesKg, y: deckMid + 0.8, z: (front + aft) / 2 },
    { name: 'Ballast', kg: base.ballastKg ?? 0, y: keelMid + 0.15, z: h.lcb },
  ]
    .filter((it) => it.kg > 0)
    .map((it) => ({ name: it.name, kg: Math.round(it.kg), y: Math.round(it.y * 1000) / 1000, z: Math.round(it.z * 1000) / 1000 }));
  const weighedKg = items.reduce((a, it) => a + it.kg, 0);
  const weights = {
    material,
    items,
    massKg: weighedKg,
    cgY: Math.round((items.reduce((a, it) => a + it.kg * it.y, 0) / weighedKg) * 1000) / 1000,
    // Where her weights put her centre of gravity along her, against her centre of buoyancy
    // (m, + aft): what her tanks and ballast trim out (she's built to float level).
    balanceM: Math.round((items.reduce((a, it) => a + it.kg * it.z, 0) / weighedKg - h.lcb) * 100) / 100,
  };
  // Her build: her structure (hull, bulwarks, houses) at the material's price a kilo, built
  // (aluminium dearer to buy and to weld; steel heavier, cheaper), and her fit-out.
  const buildPrice = items.filter((it) => /^(Hull|Bulwarks|Wheelhouse|Cockpit overhead|Deckhouse)/.test(it.name)).reduce((a, it) => a + it.kg, 0) * mat.pricePerKg + (items.find((it) => it.name.startsWith('Fit-out'))?.kg ?? 0) * wc.outfitPricePerKg + p.furnitureKg * CONFIG.shipyard.furniture.pricePerKg;

  const gp = dg.price;
  const gearPrice = (winchAt ? gp.towWinch : 0) + (sternRoller ? gp.sternRoller : 0) + (aFrame ? gp.aFrame : 0) + (ring ? gp.lifeRing : 0) + (rodRack ? gp.rodRack : 0) + (sideDoor ? gp.sideDoor : 0) + (anchorAt ? gp.anchor : 0) + (skiffAt ? gp.skiff : 0);
  const guardPrice = (pushFender ? CONFIG.shipyard.pushFenderPrice : 0) + (basketAt ? pc.fendersPrice : 0) + strakeM * pc.strakePerM + (tyres.length ? 2 * tyres.length * pc.tyrePrice + pc.tyreFitting : 0);
  const price = Math.round((buildPrice + (nOb ? powerKw * obc.pricePerKw : kw * n * eng.pricePerKw) + (sd ? sdc.price * n : 0) + (pods ? pdc.price * n : 0) + (nozzle ? CONFIG.nozzle.price * n : 0) + (d.controls ? 18000 : 6000) + (craneAt ? 25000 : 0) + (hasMonitor ? 15000 : 0) + gearPrice + guardPrice) / 1000) * 1000;
  return {
    hull,
    recipe,
    figures: { lengthM, beamM: beamDeck, massT: mass / 1000, draughtM: -Math.min(...st.map((s) => s.polygon[2][1])), gmM: gm, propellerM: nOb ? obc.propeller.diameter : sd ? sdPropD : pods ? podPropD : propD, engineShortM: nOb ? 0 : shaft.shortM, gear, engine: nOb ? `${['', 'One', 'Two', 'Three', 'Four'][nOb]} ${obc.engine.powerKw} kW petrol V8 outboards` : `${twin ? `Twin ${eng.name}` : eng.name}${sd ? (twin ? ', on stern drives' : ', on a stern drive') : pods ? ', on pod drives' : ''}${nozzle ? (twin ? ', in Kort nozzles' : ', in a Kort nozzle') : ''}`, price, floorM: Math.round((floorY - level) * 100) / 100, floorOnDeckhouseM: deckhouse ? Math.round((floorY - onTop) * 100) / 100 : undefined, material, freeboardM: Math.round(deckMid * 100) / 100 },
    warnings,
    placed: { ...placed, ...p.furniturePlaced },
    shaft,
    weights,
  };
}
