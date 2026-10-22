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
import { liveryOf, TUG_HULL } from './catalog';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';

/** Her hull definition: the exhaust stacks, every socket (the places her modules go), her rescue places, what she can carry, her handling, windage and fittings. */
export function hullDefPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart) {
  const { code, d, id } = a;
  const { F, aft, at, batteriesKg, beamDeck, bowRamp, cf, cr, craneAt, cx, damping, deckMid, deckSockets, deckhouse, dhW, eng, engMid, engZ0, engineSockets, form, freeboard, front, h, hg, houseGearSockets, houseL, hw, interiorSockets, layout, lc, lengthM, level, mass, n, nOb, obc, outboards, pdc, planing, pods, prot, pushFender, q, r2, rho, ring, rnd, roofDrop, roofTopAt, roofY, saloonL, sb, sd, sdc, shape, sideDoor, singleOnly, st, stem, transom, twin, tyres, wall, weighed, wheelhouseSockets } = p;
  // A tug's dry exhaust stacks (owner, Oct 2026; CONFIG.shipyard.exhaustStack): one per
  // engine, each in an aft corner of the wheelhouse (starboard; a twin's second to port), from
  // under the floor (down to her engine space) up through the roof and well over it, raked aft
  // or straight (design.stackStyle), the smoke out of their tops; her cooling water out of a
  // hole in her side near the waterline for each, abreast of the engines. Not with outboards
  // (theirs goes out through their legs). Only through a wheelhouse a pipe can stand in: one
  // at least a metre long and high.
  const esc = CONFIG.shipyard.exhaustStack;
  const stack = d.hull === TUG_HULL && !nOb && aft - front >= 1 && roofTopAt(aft - 0.3) - F >= 1
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
  // Her places (sockets), each part offering its own (P4b): her own here (the exhaust stacks,
  // what protects her sides), the engine room's, the wheelhouse's, inside it, on deck, and on the house outside.
  const sockets: Socket[] = [
    ...(stack ? [{ id: 'exhaustStack', type: 'deck.fitting' as const, transform: { position: [stack.pipes[0].x, stack.floor, stack.pipes[0].z] as V3 }, label: 'The wheelhouse\'s aft corners: her exhaust stacks' }] : []),
    ...(pushFender ? [{ id: 'pushFender', type: 'hull.side' as const, transform: { position: [0, pushFender.bottom, pushFender.z] as V3 }, label: 'Her square bow: the push fender' }] : []),
    ...(prot.side ? [{ id: 'hullGuard', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: prot.side === 'strake' ? 'Her sheer, all round: the rubbing strake' : 'Her sides: the tyres' }] : []),
    ...engineSockets,
    ...wheelhouseSockets,
    ...interiorSockets,
    ...deckSockets,
    ...houseGearSockets,
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
        ...(d.hull === TUG_HULL || singleOnly ? { lineGun: [hw - 0.2, F + 1.0, aft - 0.35 - (stack ? 2 * esc.radius + 0.25 : 0)] as V3 } : {}),
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
