/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her hull definition: sockets, rescue places, payload, handling, fittings.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { stackOutlet } from '../../modules/exhaustStack';
import { halfSection } from '../machinery';
import { CONFIG } from '../../config';
import type { HullDefinition } from '../../modular/hull';
import { lightshipOf } from '../../modular/massProperties';
import type { Socket } from '../../modular/socket';
import { BREAKERS } from '../../vessel/vesselState';
import { atDWL, type BuildArgs, type V3 } from './common';
import { liveryOf } from './catalog';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';

/** Her hull definition: the exhaust stacks, every socket (the places her modules go), her rescue places, what she can carry, her handling, windage and fittings. */
export function hullDefPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart) {
  const { code, d, id } = a;
  const { F, FA, aFrame, aft, anchorAt, at, basketAt, batteriesKg, beamDeck, bowCleat, bowRamp, cf, chartTableAt, cleat, consoleHalf, cr, craneAt, cranePlaced, craneYaw, ctab, cx, damping, deckMid, deckWords, deckhouse, dhW, dip, eh, eng, engMid, engZ0, form, freeboard, front, h, hasMonitor, hatchIs, hatchTop, hatchZ, helmAssist, hg, houseL, hw, lampFoot, lampHand, lampRoof, layout, lc, lengthM, level, mass, midCleat, monitorFoot, monitorRoof, n, nOb, obc, outboards, pdc, planing, pods, prot, pushFender, q, r2, rampBow, rho, ring, ringSide, rnd, rodRack, roofAt, roofDrop, roofFront, roofTopAt, roofY, rudderPos, saloonL, sb, sd, sdc, shape, sideDoor, singleOnly, skiffAt, soleY, st, stem, sternCleat, sternRoller, transom, twin, tyres, wall, weighed, winchAt, winchFace } = p;
  // A tug's dry exhaust stacks (owner, Oct 2026; CONFIG.shipyard.exhaustStack): one per
  // engine, each in an aft corner of the wheelhouse (starboard; a twin's second to port), from
  // under the floor (down to her engine space) up through the roof and well over it, raked aft
  // or straight (design.stackStyle), the smoke out of their tops; her cooling water out of a
  // hole in her side near the waterline for each, abreast of the engines. Not with outboards
  // (theirs goes out through their legs). Only through a wheelhouse a pipe can stand in: one
  // at least a metre long and high.
  const esc = CONFIG.shipyard.exhaustStack;
  const stack = d.hull === 4 && !nOb && aft - front >= 1 && roofTopAt(aft - 0.3) - F >= 1
    ? (() => {
        const r = esc.radius;
        const z = rnd(aft - wall - esc.inset - r);
        const sides = twin ? [1, -1] : [1];
        const pipes = sides.map((sd) => ({ x: rnd(sd * (hw - wall - esc.inset - r)), z }));
        const roof = rnd(roofTopAt(z));
        // The water's holes: where her side is `waterAbove` over the waterline, abreast of the engine.
        const zw = rnd(Math.min(transom - 0.8, Math.max(engZ0, engMid)));
        const sec = halfSection(shape, zw);
        let xw = sec[sec.length - 1][0];
        for (let k = 1; k < sec.length; k++) {
          const [x0, y0] = sec[k - 1];
          const [x1, y1] = sec[k];
          if (y0 <= esc.waterAbove && y1 >= esc.waterAbove) {
            xw = x0 + ((x1 - x0) * (esc.waterAbove - y0)) / (y1 - y0 || 1);
            break;
          }
        }
        const raked = (d.stackStyle ?? 0) === 0;
        return {
          pipes,
          radius: r,
          foot: rnd(F - esc.below),
          floor: rnd(F),
          roof,
          above: esc.aboveRoof,
          rakedShare: esc.rakedShare,
          rakeDeg: raked ? esc.rakeDeg : 0,
          cutDeg: raked ? esc.cutDeg : 0,
          taper: raked ? esc.taper : 1,
          colour: esc.colour,
          casing: esc.casing,
          water: sides.map((sd) => ({ position: [rnd(sd * xw), esc.waterAbove, zw] as V3, direction: [sd, -0.15, 0] as V3 })),
        };
      })()
    : null;
  const stackTops = stack ? stack.pipes.map((p) => stackOutlet(stack, p)) : [];
  /** How far a port stack moves the hand gear on the aft wall inboard (m). */
  const portStack = stack && stack.pipes.length > 1 ? 2 * esc.radius + 0.17 : 0;
  const sockets: Socket[] = [
    ...(stack ? [{ id: 'exhaustStack', type: 'deck.fitting' as const, transform: { position: [stack.pipes[0].x, stack.floor, stack.pipes[0].z] as V3 }, label: 'The wheelhouse\'s aft corners: her exhaust stacks' }] : []),
    // (A stern drive: its engine and legs, weighed at the engine.)
    ...(sd ? [{ id: 'sternDrive', type: 'transom.outboards' as const, transform: { position: at.engineBed }, label: 'Against the transom: her engine and its stern drive' }] : []),
    ...(pods ? [{ id: 'pods', type: 'hull.pods' as const, transform: { position: at.engineBed }, label: 'Under her bottom: her pod drives, and their engines over them' }] : []),
    ...(outboards ? [{ id: 'outboards', type: 'transom.outboards' as const, transform: { position: [0, outboards.mount.y, outboards.mount.z] as V3 }, label: 'The bracket off the transom: her outboards' }] : []),
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * consoleHalf - 0.04, 1.6, 1.0] }, label: 'Helm console, across the front of the cabin' },
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: at.breakerPanel, rotationDeg: [-40, -90, 0] }, label: 'Starboard wall, by the helm' },
    ...(helmAssist ? [{ id: 'helmAssist', type: 'wall.panel' as const, transform: { position: at.helmAssist, rotationDeg: [-40, -90, 0] as V3 }, label: 'Starboard wall, aft of the breaker panel' }] : []),
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: at.batteryMaster, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: at.batterySelector, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: at.vhf, rotationDeg: [0, 20, 0] }, label: 'Under the roof, out to port' },
    { id: 'fm', type: 'cabin.overhead', transform: { position: at.fm, rotationDeg: [0, -20, 0] }, label: 'Under the roof, out to starboard: the FM set' },
    { id: 'chartplotter', type: 'cabin.overhead', transform: { position: at.chartplotter, rotationDeg: [0, -35, 0] }, label: 'Under the roof, out to starboard ahead of the helm' },
    { id: 'navDisplay', type: 'cabin.overhead', transform: { position: at.navDisplay }, label: 'Overhead, on the centreline ahead of the helm' },
    { id: 'whiteboard', type: 'cabin.overhead', transform: { position: at.whiteboard, rotationDeg: [0, 180, 0] }, label: 'Under the roof by the aft wall, port of the door: the pull-down whiteboard' },
    { id: 'dutyBoard', type: 'wall.panel', transform: { position: at.dutyBoard, rotationDeg: [0, -90, 0] }, label: 'Starboard wall, aft' },
    ...(chartTableAt ? [{ id: 'chartTable', type: 'cabin.furniture' as const, transform: { position: chartTableAt }, capacity: { size: [ctab.width, roofAt(chartTableAt[2]) - chartTableAt[1], ctab.depth] as V3 }, label: 'Port wall, aft: the chart table' }] : []),
    { id: 'doorIn', type: 'wall.panel', transform: { position: [0.45, FA + 1.1, aft - wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [0.45, FA + 1.1, aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    ...(rampBow
      ? ([
          { id: 'rampCabin', type: 'wall.panel', transform: { position: at.rampButton, rotationDeg: [-90, -90, 0] }, label: 'Port wall, by the helm' },
          { id: 'rampBow', type: 'wall.panel', transform: { position: rampBow, rotationDeg: [-90, -90, 0] }, label: 'Port bulwark, by the bow ramp' },
        ] as Socket[])
      : []),
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, hatchTop, hatchZ] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: `${hatchIs}, over the engine` },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: dip }, label: "Engine space, the engine's inboard side" },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, hatchTop - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 1000 }, label: 'Engine bed, on her shaft line' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], rnd(soleY), at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: rudderPos }, label: 'Rudder stock, under the transom' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'Cabin ceiling' },
    { id: 'overhead', type: 'cabin.overhead', transform: { position: at.overhead }, label: 'Under the roof, over the helm: the switch panel' },
    { id: 'floodFore', type: 'hull.light', transform: { position: at.floodFore }, label: 'Roof edge, forward: the foredeck flood' },
    { id: 'floodAft', type: 'hull.light', transform: { position: at.floodAft }, label: 'Roof edge, aft: the aft deck flood' },
    lampFoot
      ? { id: 'searchlight', type: 'deck.equipment', transform: { position: lampFoot }, label: `${deckWords(lampFoot)}: the searchlight's pole` }
      : { id: 'searchlight', type: 'roof.mount', transform: { position: lampRoof }, label: lampHand.roof ? 'Cabin roof: the searchlight' : 'Cabin roof, forward' },
    ...(hasMonitor
      ? [
          monitorFoot
            ? { id: 'fireMonitor', type: 'deck.equipment' as const, transform: { position: monitorFoot }, label: `${deckWords(monitorFoot)}: the fire monitor's pole` }
            : { id: 'fireMonitor', type: 'roof.mount' as const, transform: { position: monitorRoof }, label: 'Cabin roof, aft of the masthead light: the fire monitor' },
        ]
      : []),
    { id: 'navLights', type: 'hull.light', transform: { position: at.navLights }, label: 'Cabin roof: the navigation lights' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTopAt(roofFront + 0.775), roofFront + 0.775] }, label: 'Cabin roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, roofY - 0.2, front] }, label: 'Over the front windows (nominal)' },
    { id: 'cleatFwdPort', type: 'deck.fitting', transform: { position: cleat(-1, bowCleat) }, label: 'Bulwark top, forward, port' },
    { id: 'cleatFwdStbd', type: 'deck.fitting', transform: { position: cleat(1, bowCleat) }, label: 'Bulwark top, forward, starboard' },
    { id: 'cleatAftPort', type: 'deck.fitting', transform: { position: cleat(-1, sternCleat) }, label: 'Bulwark top, aft, port' },
    { id: 'cleatAftStbd', type: 'deck.fitting', transform: { position: cleat(1, sternCleat) }, label: 'Bulwark top, aft, starboard' },
    ...(midCleat !== null && skiffAt
      ? ([
          { id: 'cleatMidPort', type: 'deck.fitting', transform: { position: cleat(-1, midCleat) }, label: "Bulwark top, amidships, port (the skiff's painter)" },
          { id: 'cleatMidStbd', type: 'deck.fitting', transform: { position: cleat(1, midCleat) }, label: "Bulwark top, amidships, starboard (the skiff's painter)" },
        ] as Socket[])
      : []),
    // The working deck gear (version 10).
    ...(winchAt ? [{ id: 'towWinch', type: 'deck.equipment' as const, transform: { position: winchAt, ...(winchFace ? { rotationDeg: [0, -90 * winchFace, 0] as V3 } : {}) }, label: `${deckWords(winchAt)}: the tow winch` }] : []),
    ...(sternRoller ? [{ id: 'sternRoller', type: 'stern.gantry' as const, transform: { position: [0, q.deckY(transom), transom] as V3 }, label: 'Transom, centreline: the notch in the bulwark' }] : []),
    ...(aFrame
      ? [
          { id: 'aFrame', type: 'stern.gantry' as const, transform: { position: [0, q.deckY(transom), transom] as V3 }, label: 'Transom, across the quarters: the A-frame' },
          { id: 'trawl', type: 'deck.equipment' as const, transform: { position: winchAt! }, label: 'Aft deck: the net (nominal)' },
        ]
      : []),
    ...(rodRack ? [{ id: 'rodRack', type: 'deck.fitting' as const, transform: { position: rodRack.rods[0] }, label: `Wheelhouse ${rodRack.yawDeg ? (rodRack.side < 0 ? 'port' : 'starboard') : 'aft'} wall${rodRack.yawDeg ? '' : rodRack.side < 0 ? ', port of the door' : ', starboard of the door'}: the fishing rods' rack, the bucket beside it` }] : []),
    ...(ring
      ? [
          { id: 'lifeRing', type: 'deck.fitting' as const, transform: { position: ring.stow }, label: `Wheelhouse aft wall, ${ringSide < 0 ? 'port' : 'starboard'}: the life ring (its line on that quarter's cleat)` },
          { id: 'boatHook', type: 'deck.fitting' as const, transform: { position: [ring.hook[0], ring.hook[1], ring.hook[2]] as V3 }, label: `${ringSide < 0 ? 'Port' : 'Starboard'} bulwark, aft: the boat-hook clips` },
        ]
      : []),
    ...(sideDoor
      ? ([
          { id: 'sideDoorIn', type: 'wall.panel', transform: { position: [r2(-hw + wall), r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, -90, 0] }, label: 'Side door jamb, inside' },
          { id: 'sideDoorOut', type: 'wall.panel', transform: { position: [-hw, r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, 90, 0] }, label: 'Side door jamb, outside' },
        ] as Socket[])
      : []),
    ...(craneAt
      ? [
          // The aft one faces aft (its boom rests over the aft deck, not the house).
          { id: 'deckCrane', type: 'deck.equipment' as const, transform: { position: craneAt, ...(craneYaw ? { rotationDeg: [0, craneYaw, 0] as V3 } : {}) }, capacity: { loadRatingKg: 1000 }, label: cranePlaced ? `${deckWords(craneAt)}: the deck crane` : d.deckCrane === 1 ? 'Foredeck, starboard edge: the deck crane' : 'Aft deck, port edge: the deck crane' },
        ]
      : []),
    // Hull protection: the fender basket on deck; the strake or tyres along her sides.
    ...(basketAt ? [{ id: 'fenders', type: 'deck.fitting' as const, transform: { position: [basketAt[0], q.deckY(basketAt[1]), basketAt[1]] as V3 }, label: `${deckWords([basketAt[0], 0, basketAt[1]])}: the fender basket` }] : []),
    ...(pushFender ? [{ id: 'pushFender', type: 'hull.side' as const, transform: { position: [0, pushFender.bottom, pushFender.z] as V3 }, label: 'Her square bow: the push fender' }] : []),
    ...(prot.side ? [{ id: 'hullGuard', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: prot.side === 'strake' ? 'Her sheer, all round: the rubbing strake' : 'Her sides: the tyres' }] : []),
    // The deck hydraulics' pump on the engine's power take-off, for the crane and the winch.
    ...(anchorAt ? [{ id: 'anchor', type: (bowRamp ? 'deck.equipment' : 'bow.windlass') as 'deck.equipment', transform: { position: anchorAt.at, rotationDeg: [0, anchorAt.yaw, 0] as V3 }, label: bowRamp ? 'The stern roller for the kedge anchor, port quarter' : 'The bow roller and the windlass behind it' }] : []),
    ...(skiffAt ? [{ id: 'tenderCrane', type: 'deck.equipment' as const, transform: { position: skiffAt }, label: 'The skiff crane\'s column (her cradle forward of it)' }] : []),
    ...(craneAt || winchAt || skiffAt ? [{ id: 'hydraulicPump', type: 'engine.bay' as const, transform: { position: at.engineSpace }, label: 'On the engine\'s power take-off (nominal)' }] : []),
  ];
  // (Her open deck aft of the house, for the rescue places below.)
  const aftDeck = transom - 0.5 - aft;
  // Her rescue places (owner, Oct 2026: a Shipyard boat with a life ring gets the rescue
  // calls, as the workboat does): survivors on the line come aboard over the transom's
  // centre at the waterline (`stern`), and sit on the larger open deck, three abreast.
  const seatZ = r2(aftDeck >= 1.5 ? (aft + transom) / 2 : (stem + front) / 2);
  const seatX = r2(Math.min(0.9, q.halfBeam(seatZ) - 0.5));
  const rescueGear = ring
    ? {
        ringStow: ring.stow,
        ringCleat: ring.cleat,
        hookStow: ring.hook,
        stern: [0, 0.2, r2(transom - 0.05)] as V3,
        seats: [[-seatX, seatZ], [seatX, seatZ], [0, r2(seatZ - 0.2)]] as [number, number][],
      }
    : undefined;
  // What she can carry on deck: what she'd displace sunk by a share of her freeboard
  // (CONFIG.shipyard.weights.payloadFreeboard), less what she weighs. So the same hull in
  // aluminium carries more than in steel: she has more reserve of buoyancy.
  const sunkBy = CONFIG.shipyard.weights.payloadFreeboard * deckMid;
  const payloadKg = Math.max(0, Math.round((atDWL({ ...shape, stations: st.map((s) => ({ ...s, polygon: s.polygon.map(([x, y]) => [x, y - sunkBy] as [number, number]) })) }).volume * rho - mass) / 100) * 100);
  const hull: HullDefinition = {
    id: `hull.${id}`,
    version: 1,
    name: `Shipyard design ${code}`,
    helm: { stand: [cx, F, cf + 1.125], yawDeg: 0 },
    form,
    lightship: lightshipOf(weighed, [
      outboards ? { massKg: obc.massKg * nOb, at: [0, outboards.mount.y, outboards.mount.z] as V3 } : { massKg: (eng.kg + (sd ? sdc.legKg : pods ? pdc.legKg : 0)) * n, at: at.engineBed },
      { massKg: batteriesKg, at: at.engineSpace },
      // The deck crane, if she has one: designed in where its column stands, so she still
      // floats on her lines and upright with it (her hull and ballast lighter by its weight,
      // and trimmed against it: a crane at the starboard edge, her ballast a little to port).
      ...(craneAt ? [{ massKg: cr.massKg, at: [craneAt[0], craneAt[1] + cr.columnHeight / 2, craneAt[2]] as V3 }] : []),
    ]),
    addedMass: lc.addedMass,
    damping,
    // Tyres hanging low catch spray and the odd wave: a little more drag.
    resistance: { ...lc.resistance, lwl: Math.round(h.lwl * 100) / 100, ...(tyres.length ? { formFactor: lc.resistance.formFactor + hg.tyres.formFactorAdd } : {}) },
    ...(planing ? { planing } : {}),
    windage: {
      side: Math.round(lengthM * freeboard + houseL * (roofY + 0.3 - level) - saloonL * roofDrop + (deckhouse ? (deckhouse.z1 - deckhouse.z0) * d.dhHeight : 0)),
      front: Math.round(beamDeck * freeboard + 2 * hw * (roofY + 0.3 - level) + (deckhouse ? 2 * Math.max(0, dhW - hw) * d.dhHeight : 0)),
      center: [0, Math.round((freeboard + 0.4) * 100) / 100, Math.round(((front + aft) / 4) * 100) / 100],
    },
    layout,
    cargo: { maxPayloadKg: payloadKg, slots: 0, bowClear: 0.4, aftClear: 0.25, fixed: false },
    spawn: { x: 0, z: -22, dropHeight: 3, headingDeg: 90 },
    fittings: {
      exhaust: stack
        ? { ...stackTops[0], stack: true, ...(stackTops.length > 1 ? { more: stackTops.slice(1).map((t) => t.position) } : {}), water: stack.water }
        : { position: [0.55, 0.2, transom + 0.05], direction: [0, -0.12, 1] },
      stowage: {
        // (Inboard of a twin's port exhaust stack, in that corner.)
        extinguisher: [-(hw - 0.2 - portStack), F + 0.58, aft - 0.15],
        // A tug's line-throwing gun (CONFIG.lineGun): on the starboard wall aft, inside.
        // (Forward of the exhaust stack in that corner, if she has one.)
        ...(d.hull === 4 || singleOnly ? { lineGun: [hw - 0.2, F + 1.0, aft - 0.35 - (stack ? 2 * esc.radius + 0.25 : 0)] as V3 } : {}),
        torch: [-(hw - 0.45 - portStack), F + 0.68, aft - 0.12],
        binoculars: { at: [-(hw - 0.35), F + 1.35, cf + 0.14 + sb(hw - 0.35)], yawDeg: 20 },
      },
      livery: liveryOf(d),
      ...(rescueGear ? { rescueGear } : {}),
    },
    sockets,
    provides: [{ power: 'electrical', circuits: BREAKERS }],
    features: [
      { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
      ...(sideDoor ? [{ id: 'door.side', kind: 'door' as const, openKey: 'door.side.open' as const }] : []),
      { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
      ...(bowRamp ? [{ id: 'ramp.bow', kind: 'door' as const, openKey: 'ramp.bow.down' as const }] : []),
    ],
  };

  return { hull, stack };
}
export type HullDefPart = ReturnType<typeof hullDefPart>;
