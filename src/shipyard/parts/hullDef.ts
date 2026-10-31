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
import { cradleAxis } from '../../modules/diveFrame';
import type { Socket } from '../../modular/socket';
import { displacementResistance } from '../../vessel/displacementHull';
import { BREAKERS } from '../../vessel/vesselState';
import { deckhouseHalfWidth } from '../../vessel/deckhouse';
import { STACK_POS_STEPS } from '../design';
import { atDWL, type BuildArgs, type V3 } from './common';
import { DESIGN_HULLS, liveryOf, TUG_DIESEL, TUG_HULL } from './catalog';
import { electricOf } from './solar';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';

/** Her hull definition: the exhaust stacks, every socket (the places her modules go), her rescue places, what she can carry, her handling, windage and fittings. */
export function hullDefPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart) {
  const { code, d, id } = a;
  const { electric, fendering, markings, F, aft, at, batteriesKg, hx, beamDeck, bowFender, bowRamp, cf, cr, craneAt, cx, damping, deckMid, deckSockets, deckhouse, dhW, eng, engMid, engZ0, engineSockets, form, freeboard, front, h, hg, houseGearSockets, houseL, hw, interiorSockets, layout, lc, lengthM, level, mass, n, nOb, obc, outboards, pdc, planing, pods, prot, pushFender, q, r2, rho, ring, rnd, roofDrop, roofTopAt, roofY, saloonL, sb, sd, sdc, shape, sideDoor, st, stem, transom, twin, tyres, wall, warnings, weighed, wheelhouseSockets } = p;
  // A tug's dry exhaust stacks (owner, Oct 2026; CONFIG.shipyard.exhaustStack; the stern
  // trawler's too: a hull type with `exhaustStacks`): one per
  // engine, each in an aft corner of the wheelhouse (starboard; a twin's second to port), from
  // under the floor (down to her engine space) up through the roof and well over it, raked aft
  // or straight (design.stackStyle), the smoke out of their tops; her cooling water out of a
  // hole in her side near the waterline for each, abreast of the engines. Not with outboards
  // (theirs goes out through their legs). Only through a wheelhouse a pipe can stand in: one
  // at least a metre long and high.
  const esc = CONFIG.shipyard.exhaustStack;
  // Faceted aft windows (house.ts aftFacet): how far forward the aft wall comes at x (her axes,
  // across from the house's middle), and anything inside the house by its aft wall (within
  // 0.7 m, above her floor less half a metre, off the middle pane) brought forward as much, so
  // it stays inside the angled corners: the exhaust stacks, the battery switches, the hand gear.
  const af = p.house.aftFacet;
  const aftIn = (x: number) => (af ? Math.max(0, Math.abs(x - hx) - af.centre) * (af.depth / (hw - af.centre)) : 0);
  const intoFacets = (v: V3): V3 => (af && Math.abs(v[0] - hx) < hw && v[2] > aft - wall - 0.7 && v[2] <= aft - wall + 0.01 && v[1] > F - 0.5 ? [v[0], v[1], rnd(v[2] - aftIn(v[0]))] : v);
  // On the deckhouse (design.stackMount; owner, Oct 2026: "split these exhaust pipes out as
  // something that you can control ... move the twin exhaust pipes forward and aft on this deck
  // house and choose whether they've got like a circular or a square kind of box around them"):
  // each pipe in a casing of its own (CONFIG.shipyard.exhaustStack.onDeckhouse) out near the
  // deckhouse's side, `stackPos` along it from its aft end to its front, clear of the
  // wheelhouse on it (moved aft or forward of it if it would stand in it). Without a deckhouse,
  // or no room on it, they go up through the wheelhouse as before.
  const odh = esc.onDeckhouse;
  const pad = esc.radius + odh.casingPad;
  const onDh = (() => {
    if (!d.stackMount || !deckhouse || !DESIGN_HULLS[d.hull]?.exhaustStacks || nOb) return null;
    const z0 = deckhouse.z0 + pad + odh.endClear;
    const z1 = deckhouse.z1 - pad - odh.endClear;
    if (z1 < z0) return null;
    const want = z1 - ((d.stackPos ?? 0) / (STACK_POS_STEPS - 1)) * (z1 - z0);
    const xAt = (z: number) => deckhouseHalfWidth(deckhouse, z) - odh.fromSide - pad;
    // In the wheelhouse's plan (its walls and a hand's width): moved to the nearer of its ends, if the deckhouse runs on past it.
    const inHouse = (z: number) => z > front - pad - 0.1 && z < aft + pad + 0.1 && xAt(z) - pad < hx + hw + 0.1 && xAt(z) + pad > hx - hw - 0.1;
    let z = want;
    if (inHouse(z)) {
      const ends = [aft + pad + 0.15, front - pad - 0.15].filter((e) => e >= z0 && e <= z1 && !inHouse(e)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
      if (!ends.length) return null;
      z = ends[0];
    }
    const x = Math.min(xAt(z - pad), xAt(z + pad), xAt(z));
    if (x < pad) return null;
    return { z: rnd(z), x: rnd(x), moved: Math.abs(z - want) > 0.05 };
  })();
  if (d.stackMount && !onDh && DESIGN_HULLS[d.hull]?.exhaustStacks && !nOb) warnings.push(deckhouse ? 'There’s no room on her deckhouse for her exhaust stacks: they go up through the wheelhouse.' : 'Her exhaust stacks stand on a deckhouse: she has none, so they go up through the wheelhouse.');
  if (onDh?.moved) warnings.push('Her exhaust stacks would stand in the wheelhouse there: they’re moved along the deckhouse clear of it.');
  const stack = DESIGN_HULLS[d.hull]?.exhaustStacks && !nOb && (onDh || (aft - front >= 1 && roofTopAt(aft - 0.3) - F >= 1))
    ? (() => {
        const r = esc.radius;
        const sides = twin ? [1, -1] : [1];
        const z = onDh ? onDh.z : rnd(aft - wall - esc.inset - r);
        const pipes = onDh ? sides.map((sd) => ({ x: rnd(sd * onDh.x), z: onDh.z })) : sides.map((sd) => ({ x: rnd(sd * (hw - wall - esc.inset - r)), z: rnd(z - aftIn(hx + sd * (hw - wall - esc.inset))) }));
        const roof = onDh ? rnd(deckhouse!.top) : rnd(roofTopAt(z));
        const floor = onDh ? rnd(q.deckY(z)) : rnd(F);
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
          foot: rnd(floor - esc.below),
          floor,
          roof,
          above: onDh ? odh.aboveCasing : esc.aboveRoof,
          ...(onDh ? { outer: { shape: d.stackCasing ? ('square' as const) : ('round' as const), half: rnd(pad), top: rnd(roof + odh.casingHeight) } } : {}),
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
  const portStack = stack && !stack.outer && stack.pipes.length > 1 ? 2 * esc.radius + 0.17 : 0;
  // Her places (sockets), each part offering its own (P4b): her own here (the exhaust stacks,
  // what protects her sides), the engine room's, the wheelhouse's, inside it, on deck, and on the house outside.
  const sockets: Socket[] = [
    ...(stack ? [{ id: 'exhaustStack', type: 'deck.fitting' as const, transform: { position: [stack.pipes[0].x, stack.floor, stack.pipes[0].z] as V3 }, label: stack.outer ? 'On the deckhouse: her exhaust stacks' : 'The wheelhouse\'s aft corners: her exhaust stacks' }] : []),
    ...(bowFender ? [{ id: 'bowFender', type: 'hull.side' as const, transform: { position: [0, bowFender.bottom, bowFender.front] as V3 }, label: 'Her bow: the bow fender' }] : []),
    ...(pushFender ? [{ id: 'pushFender', type: 'hull.side' as const, transform: { position: [0, pushFender.bottom, pushFender.z] as V3 }, label: 'Her square bow: the push fender' }] : []),
    ...(electric && p.base.solarRoof ? [{ id: 'solarRoof', type: 'deck.equipment' as const, transform: { position: [0, roofY, (front + aft) / 2] as V3 }, label: 'Her roof: the solar panels' }] : []),
    ...(p.form.kind === 'lofted' && p.form.design.foils ? [{ id: 'foils', type: 'hull.side' as const, transform: { position: [0, 0, 0] as V3 }, label: 'Under her: her hydrofoils and their struts' }] : []),
    ...(markings ? [{ id: 'markings', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: 'Her topsides: the service markings' }] : []),
    ...(fendering ? [{ id: 'fendering', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: 'Her sides, stern and bow: the fendering' }] : []),
    ...(prot.side ? [{ id: 'hullGuard', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: prot.side === 'strake' ? 'Her sheer, all round: the rubbing strake' : 'Her sides: the tyres' }] : []),
    ...engineSockets,
    ...wheelhouseSockets,
    // (An open boat has no wheelhouse inside or out: her places are her console's, places.ts.)
    ...(p.base.open ? [] : interiorSockets),
    ...deckSockets,
    ...(p.base.open ? [] : houseGearSockets),
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
  if (af) for (const s of sockets) if (s.transform?.position) s.transform.position = intoFacets(s.transform.position as V3);
  // An open boat (the RIB's): her helm at her console (places.ts ribHelm), her hand gear stowed
  // in and on it, her windage her tubes and hull side-on and the console standing up from her deck.
  const rh = p.ribHelm;
  const ribWindage = () => {
    const tubeTop = layout.bulwarkHeight;
    const cH = rh!.top - q.deckY((rh!.front + rh!.aft) / 2);
    // (A T-top's or hardtop's roof, its edge a deep canopy's: 0.2 m of it side-on and ahead.)
    const r = rh!.roof;
    const roofSide = r ? (r.aft - r.front) * 0.2 : 0;
    const roofFront = r ? 2 * r.halfWidth * 0.2 : 0;
    return { side: Math.round(lengthM * (freeboard + tubeTop) + (rh!.aft - rh!.front) * cH + roofSide), front: Math.round(beamDeck * (freeboard + tubeTop) + 2 * rh!.halfWidth * cH + roofFront), center: [0, r2(freeboard + (r ? 0.6 : 0.4)), r2((rh!.front + rh!.aft) / 2)] as V3 };
  };
  const ribStowage = () => {
    const mid = (rh!.front + rh!.aft) / 2;
    const deck = q.deckY(mid);
    return {
      extinguisher: [r2(rh!.halfWidth + 0.08), r2(deck + 0.32), r2(rh!.front + 0.15)] as V3,
      torch: [r2(-rh!.halfWidth - 0.06), r2(deck + 0.85), r2(rh!.aft - 0.12)] as V3,
      // (A bigger console's top is its dash and switches: on the leaning post's bolster, to port.)
      binoculars: rh!.roof ? { at: [r2(-(rh!.post.halfWidth - 0.15)), r2(rh!.post.top + 0.04), r2((rh!.post.front + rh!.post.aft) / 2)] as V3, yawDeg: 0 } : { at: [-0.18, r2(rh!.top + 0.04), r2(rh!.front + 0.28)] as V3, yawDeg: 0 },
    };
  };
  const hull: HullDefinition = {
    id: `hull.${id}`,
    version: 1,
    name: `Shipyard design ${code}`,
    // (An open boat's: between her console and the leaning post.)
    helm: { stand: rh ? [0, r2(q.deckY(rh.aft + 0.3)), r2((rh.aft + rh.post.front) / 2)] : [cx, F, cf + 1.125], yawDeg: 0 },
    form,
    lightship: lightshipLess(weighed, [
      outboards ? { massKg: obc.massKg * nOb, at: [0, outboards.mount.y, outboards.mount.z] as V3 } : { massKg: (eng.kg + (sd ? sdc.legKg : pods ? (electric ? electricOf(d).podKg : pdc.legKg) : 0)) * n, at: at.engineBed },
      { massKg: batteriesKg, at: at.engineSpace },
      // The deck crane, if she has one: designed in where its column stands, so she still
      // floats on her lines and upright with it (her hull and ballast lighter by its weight,
      // and trimmed against it: a crane at the starboard edge, her ballast a little to port).
      ...(craneAt ? [{ massKg: cr.massKg, at: [craneAt[0], craneAt[1] + cr.columnHeight / 2, craneAt[2]] as V3 }] : []),
      // The dive A-frame and its sub on her cradle (modules/diveFrame weighs them itself), the same way.
      ...(p.diveFrame
        ? [
            { massKg: CONFIG.modules.diveFrame.frameKg, at: [0, p.diveFrame.place.deck + p.diveFrame.legLength / 2, p.diveFrame.place.transom - CONFIG.modules.diveFrame.footFromTransom] as V3 },
            { massKg: CONFIG.modules.diveFrame.sub.massKg, at: cradleAxis({ ...CONFIG.modules.diveFrame, legLength: p.diveFrame.legLength, at: p.diveFrame.place }) },
          ]
        : []),
    ]),
    // (A catamaran: her roll added inertia and her resistance are two slim hulls': trim.ts `cat`.)
    addedMass: p.cat ? { ...lc.addedMass, roll: Math.round(p.cat.addedRoll * 1000) / 1000 } : lc.addedMass,
    damping,
    // Tyres hanging low catch spray and the odd wave: a little more drag.
    resistance: (() => {
      // A displacement hull (the tug, the trawler): a curve that keeps climbing past her hull
      // speed (vessel/displacementHull.ts), so power past what her length can use barely
      // moves her; the others the landing craft's, which levels off for planing.
      const lwl = Math.round(h.lwl * 100) / 100;
      const r = p.cat ? p.cat.resistance : DESIGN_HULLS[a.d.hull].regime === 'displacement' ? displacementResistance(lwl, lc.resistance.y) : { ...lc.resistance, lwl };
      return tyres.length ? { ...r, formFactor: r.formFactor + hg.tyres.formFactorAdd } : r;
    })(),
    ...(planing ? { planing } : {}),
    windage: rh ? ribWindage() : {
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
      stowage: rh ? ribStowage() : {
        // (Inboard of a twin's port exhaust stack, in that corner.)
        // (Across from the house's middle: an offset house's, `hx`.)
        extinguisher: intoFacets([hx - (hw - 0.2 - portStack), F + 0.58, aft - 0.15]),
        // A tug's line-throwing gun (CONFIG.lineGun): on the starboard wall aft, inside. A tug
        // is the tug hull, or any hull with the tug diesel (not every shaft-only engine: the
        // stern trawler's 750 kW is one too, owner Oct 2026: she got the gun by mistake).
        // (Forward of the exhaust stack in that corner, if she has one.)
        ...(d.hull === TUG_HULL || d.engine === TUG_DIESEL ? { lineGun: intoFacets([hx + hw - 0.2, F + 1.0, aft - 0.35 - (stack ? 2 * esc.radius + 0.25 : 0)]) } : {}),
        torch: intoFacets([hx - (hw - 0.45 - portStack), F + 0.68, aft - 0.12]),
        binoculars: { at: [hx - (hw - 0.35), F + 1.35, cf + 0.14 + sb(hw - 0.35)], yawDeg: 20 },
      },
      livery: liveryOf(d),
      ...(rescueGear ? { rescueGear } : {}),
    },
    sockets,
    provides: [{ power: 'electrical', circuits: BREAKERS }],
    features: [
      ...(rh ? [] : [{ id: 'door.aft', kind: 'door' as const, openKey: 'door.aft.open' as const }]),
      ...(sideDoor ? [{ id: 'door.side', kind: 'door' as const, openKey: 'door.side.open' as const }] : []),
      { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
      ...(bowRamp ? [{ id: 'ramp.bow', kind: 'door' as const, openKey: 'ramp.bow.down' as const }] : []),
    ],
  };

  return { hull, stack };
}
export type HullDefPart = ReturnType<typeof hullDefPart>;

/**
 * Her lightship: the weighed boat less the parts that weigh themselves (massProperties.ts
 * lightshipOf). On the builder's first pass she's weighed as her lines' displacement, before
 * her own weights are known (build.ts buildDesign), and a heavy engine fit in a small hull
 * (twin 750 kW diesels in the landing craft: 9.6 t of engine in a boat of about 5 t) can weigh
 * more than that: then the parts aren't taken off, as nothing uses that pass's lightship. The
 * second pass weighs her with them, and says if she's too heavy for her hull.
 */
function lightshipLess(weighed: Parameters<typeof lightshipOf>[0], parts: Parameters<typeof lightshipOf>[1]): ReturnType<typeof lightshipOf> {
  const partsKg = parts.reduce((a, p) => a + p.massKg, 0);
  return partsKg < weighed.massKg ? lightshipOf(weighed, parts) : { massKg: weighed.massKg, cg: [...weighed.cg], inertia: [...weighed.inertia] };
}
