/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her houses: the wheelhouse (and saloon), the deckhouse, the deck layout, the cockpit overhead, and inside (chart table, side door, the cabin below).
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { BODY_RADIUS, CONFIG } from '../../config';
import { hullQueries } from '../../modular/hull';
import type { CabinBelow, DoorStep, FloorLevel, FloorPatch, Hollow, HouseShape, LayoutConfig, OverheadLayout } from '../../vessel/vesselDef';
import { deckhouseHalfWidth, type DeckhouseLayout } from '../../vessel/deckhouse';
import { consoleLengthM, houseOffsetM, lowSills, MEASURES, SCALES } from '../design';
import type { Socket } from '../../modular/socket';
import { halfBreadthAt, type BuildArgs, type V3 } from './common';
import { facetCentre, frontMullions, TUG_HULL, type DesignHull } from './catalog';
import { hullFormOf } from '../../modular/hull';
import type { ShipDesign } from '../design';
import type { HullPart } from './hull';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart } from './deckGear';

/**
 * Where a raised foredeck's break goes (owner, Oct 2026, from a photo of a trawler: "a raised
 * foredeck as an option"; the fishing boat's; CONFIG.shipyard.foredeck), or null for none: `fcLength`
 * aft of the stem, but never under the wheelhouse nor so close forward of it that its ladders
 * won't fit between: there it runs on aft past the house (which stands on it, as on the photo's
 * trawler), leaving a landing aft of the house's door long enough for the door's own steps down
 * from a raised cabin floor (`lift`, m above her deck) and a stride more. Short of the transom by
 * the ladders' run. `t` is the break's place along the hull study (0 transom, 1 stem: her deck
 * runs from one to the other), `z` in hers.
 */
function raisedForedeck(d: ShipDesign, base: DesignHull, at: { transom: number; stem: number; front: number; aft: number }, lift: number, warnings: string[]): { z: number; t: number; raise: number; steps: number } | null {
  if (!d.fcLength || !base.raisedForedeck) return null;
  const c = CONFIG.shipyard.foredeck;
  const raise = SCALES.fcHeight(d.fcHeight ?? 2);
  const steps = Math.ceil(raise / c.stepRise - 1e-9) - 1; // treads between her deck and the raised one
  const run = steps * c.tread + c.clear;
  // The door's steps (as housePart lays them: a rise of 0.35 at most, 0.28 deep), then a stride.
  const doorSteps = Math.max(0, Math.ceil((lift + 0.03) / 0.35 - 1e-9) - 1);
  const landing = Math.max(c.landing, doorSteps * 0.28 + 0.5);
  let z = at.stem + SCALES.fcLength(d.fcLength);
  if (z > at.front - run && z < at.aft + landing) {
    z = at.aft + landing;
    warnings.push('The raised foredeck would end under or just forward of the wheelhouse: run on aft past it (the house stands on it, with a landing aft of its door).');
  }
  if (z > at.transom - run - c.clear) {
    z = at.transom - run - c.clear;
    warnings.push('The raised foredeck reaches too far aft: stopped short of the transom, with room for its ladders.');
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { z: r(z), t: (at.transom - z) / (at.transom - at.stem), raise, steps };
}

/**
 * The ladders up to a raised foredeck (raisedForedeck; owner, Oct 2026: "how stairs are in real
 * life arranged"): as on a trawler or tug, a steep steel ship's ladder each side against the
 * break bulkhead, beside the bulwark, leaving the middle of the working deck clear. Each its
 * treads running aft from the break, the highest against it, evenly spaced in height from her
 * deck at their foot to the raised deck (a rise of at most `stepRise`, `tread` deep: about
 * 55 degrees). Port's first, then starboard's.
 */
function foredeckSteps(f: { z: number; raise: number; steps: number }, q: { deckY(z: number): number; halfBeam(z: number): number }): FloorPatch[] {
  const c = CONFIG.shipyard.foredeck;
  // Evenly from her deck at their foot (it falls a little aft, with her sheer) up to the raised deck.
  const foot = q.deckY(f.z + f.steps * c.tread + 0.05);
  const top = q.deckY(f.z + 0.05) + f.raise;
  // Against her side: in from the deck's edge by the bulwark's margin, the narrowest along the run.
  const outer = Math.min(q.halfBeam(f.z + 0.02), q.halfBeam(f.z + f.steps * c.tread)) - c.fromSide;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [-1, 1].flatMap((side) =>
    Array.from({ length: f.steps }, (_, i) => {
      const k = f.steps - i; // from the highest (k = steps, against the break) aft
      const [x0, x1] = side < 0 ? [-outer, -outer + c.width] : [outer - c.width, outer];
      return { x0: r(x0), x1: r(x1), z0: r(f.z + i * c.tread), z1: r(f.z + (i + 1) * c.tread), y: r(foot + ((top - foot) * k) / (f.steps + 1)) };
    }),
  );
}

/**
 * The stair down a deckhouse run on aft of the wheelhouse (owner, Oct 2026: "a steep
 * transverse stair instead" of a ladder), as on a trawler's casing: against its aft face,
 * running across her, from a landing at its top near her centreline (where you step on and off
 * its top; railed aft and at its port end, the deckhouse's rail open over it) down to starboard,
 * a tread `tread` wide for each rise of at most `rise` (about 54 degrees, steep but walked, not
 * climbed: a walk step is 0.4, vessel/layout.ts STEP_HEIGHT), `width` out from the face. It
 * keeps inside the deckhouse's width (moved to port if it must; said if even that's short).
 * CONFIG.shipyard.deckhouse.walk.stair. Its treads, the landing first, and its place as the
 * walk's `ladder` (face 'stair': the landing's middle and width, the stair's depth).
 */
function transverseStair(dh: DeckhouseLayout, q: { deckY(z: number): number }, warnings: string[]): { treads: FloorPatch[]; ladder: { face: 'stair'; x: number; width: number; depth: number } } {
  const s = CONFIG.shipyard.deckhouse.walk.stair;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const [za, zb] = [dh.z1 + 0.02, dh.z1 + s.width];
  const foot = q.deckY(zb);
  const rises = Math.max(1, Math.ceil((dh.top - foot) / s.rise - 1e-9));
  const n = rises - 1; // treads between her deck and the landing
  const rise = (dh.top - foot) / rises;
  const run = s.landing + n * s.tread;
  // The landing just to port of her centreline, the treads down to starboard; inside its width.
  const room = deckhouseHalfWidth(dh, dh.z1) - 0.05;
  let x0 = Math.min(-s.landing / 2, room - run);
  if (x0 < -room) {
    x0 = -room;
    warnings.push('The deckhouse is too narrow aft for its stair across its aft face: it runs past its side.');
  }
  // The landing reaches forward over its top to where the walked top starts (in from its rail).
  const landing: FloorPatch = { x0: r(x0), x1: r(x0 + s.landing), z0: r(dh.z1 - CONFIG.shipyard.deckhouse.walk.margin - 0.35), z1: r(zb), y: r(dh.top) };
  const treads = Array.from({ length: n }, (_, i): FloorPatch => ({ x0: r(x0 + s.landing + i * s.tread), x1: r(x0 + s.landing + (i + 1) * s.tread), z0: r(za), z1: r(zb), y: r(dh.top - (i + 1) * rise) }));
  return { treads: [landing, ...treads], ladder: { face: 'stair', x: r(x0 + s.landing / 2), width: s.landing, depth: s.width } };
}

/** The front windows' mullions: more panes on a wide house (the usual two, at +-0.5 m, left unset). */
function mullionsOf(hw: number, wall: number, house: HouseShape): { frontMullions?: number[] } {
  const m = frontMullions(hw, wall, house.facet?.centre);
  return m.length === 2 && Math.abs(m[1] - 0.5) < 1e-6 ? {} : { frontMullions: m };
}

/** Her wheelhouse within the deck that's free for it (and a saloon aft of it), the deckhouse it may stand on and that deckhouse's walked top, its floor, roof and windows, the console's line, the steps at its aft door. */
export function housePart(a: BuildArgs, p: HullPart) {
  const { d } = a;
  const { base, bulwarkHeight, stem, transom, warnings } = p;
  let { form, shape, st } = p;
  // ── The wheelhouse, within the deck free for it ──
  const queries = () => hullQueries({ hull: shape, layout: { bulwarkHeight, railHeight: 0, deckEdgeMargin: 0.25, bodyRadius: BODY_RADIUS } as LayoutConfig });
  let q = queries();
  // A tug's wheelhouse is kept forward: its aft end no further aft than near amidships
  // (CONFIG.shipyard.deckGear.tug), the aft deck clear for her towing hook and the towline.
  // Placed as any other (housePos), then stopped there if it would lie further aft.
  const tugAft = d.hull === TUG_HULL ? (stem + transom) / 2 + CONFIG.shipyard.deckGear.tug.houseAftOfMidships * (transom - stem) : Infinity;
  const zAft = transom - base.cockpit;
  const zFwd = stem + base.foredeck + (base.ramp ? 0.6 : 0);
  let houseL = d.houseLength;
  if (houseL > zAft - zFwd) {
    houseL = zAft - zFwd;
    warnings.push(`The wheelhouse is longer than her deck allows: cut to ${houseL.toFixed(1)} m.`);
  }
  // A saloon aft of it (parametric boats P2b): the house runs on aft, one house, one roof.
  // Cut short (or left off, under `saloonMin`) if her deck hasn't the room.
  const sal = CONFIG.shipyard.saloon;
  let saloonL = d.saloon ?? 0;
  if (saloonL && houseL + saloonL > zAft - zFwd) {
    saloonL = Math.floor((zAft - zFwd - houseL) * 10) / 10;
    if (saloonL < sal.minLength) {
      saloonL = 0;
      warnings.push('There\'s no room on her deck for a saloon aft of the wheelhouse: left off (a shorter wheelhouse leaves some).');
    } else warnings.push(`The saloon is longer than her deck allows: cut to ${saloonL.toFixed(1)} m.`);
  }
  /** The wheelhouse's own length; `houseL` from here on is the whole house's, saloon and all. */
  const helmL = houseL;
  houseL += saloonL;
  const aft = Math.max(zFwd + houseL, Math.min(tugAft, zAft - d.housePos * (zAft - zFwd - houseL)));
  const front = aft - houseL;
  /** Where the wheelhouse ends and the saloon begins (the house's aft, without one). */
  const helmAft = front + helmL;
  // A raised foredeck (owner, Oct 2026; the fishing boat's): now the house is placed, her hull
  // again with her deck stepped up forward of the break (its z: `foredeck`). The parts after
  // this take her hull from here.
  const foredeck = raisedForedeck(d, base, { transom, stem, front, aft }, d.floor, warnings);
  if (foredeck) {
    form = p.loft({ from: foredeck.t, raise: foredeck.raise });
    shape = hullFormOf(form);
    st = shape.stations;
    q = queries();
  }
  const along = (n: number) => Array.from({ length: n + 1 }, (_, i) => front + ((aft - front) * i) / n);
  const narrowest = Math.min(...along(8).map((z) => q.halfBeam(z)));
  const sideDeck = 0.28;
  let hw = d.houseWidth * (narrowest - sideDeck);
  // No narrower than `minInside` inside (CS6, owner, Oct 2026: about 1.2 m, one at a short
  // console; it was 1.7 m when the console had to hold a full row of screens and switches).
  const minHw = CONFIG.shipyard.helm.minInside / 2 + 0.06;
  if (hw < minHw) {
    warnings.push(`Her wheelhouse is too narrow: widened to ${CONFIG.shipyard.helm.minInside.toFixed(1)} m inside, leaving narrow side decks.`);
    hw = Math.min(minHw, narrowest - 0.12);
  }
  // Offset across her (owner, Oct 2026: on the landing craft, a narrow wheelhouse to port or
  // starboard; design.houseX, a hull type that allows it: `offsetHouse`): its middle `hx` m to
  // starboard (negative to port), no further than leaves its outer wall `offsetEdge` inside
  // her deck edge along it. Not with a deckhouse under it or an overhead aft (they're built on
  // her centreline): it stays there then. Everything of the house is laid out in its own
  // frame, as if on her centreline, and moved across with it (layout.wheelhouse.x, and the
  // places and gear in and on it: places.ts, deckGear.ts, furniture.ts...).
  let hx = 0;
  if (base.offsetHouse && (d.houseX ?? 20) !== 20) {
    const want = houseOffsetM(d.houseX);
    if (d.dhLength || d.overhead) warnings.push(`Her wheelhouse stays on her centreline with ${d.dhLength ? 'a deckhouse under it' : 'an overhead aft'}: the offset is for a wheelhouse standing on her deck.`);
    else {
      const most = Math.max(0, Math.floor((narrowest - hw - CONFIG.shipyard.offsetEdge) * 100) / 100);
      hx = Math.max(-most, Math.min(most, want));
      if (Math.abs(hx) < Math.abs(want) - 1e-6) warnings.push(`Her wheelhouse can go only ${most.toFixed(2)} m to ${want < 0 ? 'port' : 'starboard'} at this width: its wall at her deck edge.`);
    }
  }
  const deckHi = Math.max(...along(8).map((z) => q.deckY(z)));
  const deckLo = Math.min(...along(8).map((z) => q.deckY(z)));
  const headroom = d.headroom;
  // The floor (owner: the house's height, to see over a bow or a ramp): raised from the
  // highest deck under the house, or sunk from the lowest (a step down in, for headroom).
  // A floor below the deck needs her hull at least as wide as the house down there (its
  // walls go down to it); in a fine entry it isn't, and the floor comes up until it is.
  // (Set after the deckhouse, below: with one, the floor is measured from its top.)
  const lift = d.floor;
  const level = deckHi + 0.03;
  const tightAt = (y: number) => Math.min(...along(8).map((z) => halfBreadthAt(st.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a)).polygon, y)));
  // ── The deckhouse (owner: pilot and rescue boats; vessel/deckhouse.ts) ──
  // From the wheelhouse's aft wall (just inside it, so the house's own aft wall shows)
  // forward past its front, out to her sides less any side deck (but at least as wide as
  // the house it carries), its top flat over the highest deck under it. The wheelhouse then
  // stands on it: its floor at the deckhouse's top, steps up to its aft door from the deck.
  const dhc = CONFIG.shipyard.deckhouse;
  const rnd = (v: number) => Math.round(v * 1000) / 1000;
  // A three-facet front (decided here: the deckhouse under the house follows it too).
  const facetTan = Math.tan((CONFIG.shipyard.facetDeg * Math.PI) / 180);
  let facet: { centre: number; depth: number } | null = null;
  if (d.facets) {
    const centre = facetCentre(hw);
    const depth = Math.round((hw - centre) * facetTan * 1000) / 1000;
    if (hw - centre < 0.25) warnings.push('Her wheelhouse is too narrow for a faceted front (its middle pane would be all of it): left flat.');
    else if (aft - front - depth < 1.6) warnings.push('Her wheelhouse is too short for a faceted front (the console\'s wings would reach too far aft): left flat.');
    else facet = { centre, depth };
  }
  // Faceted aft windows (owner, Oct 2026: "rear windows faceted in the same way"; design.aftFacets):
  // as the front's, the middle pane (the aft door in it) square, the outer two angled forward to
  // the side walls. With windows raked out all round they lean out with the rest (houseFlare.ts
  // stretches the house as a whole, so the angled corners go with the sides and aft; owner: "a
  // proper wheelhouse"). Not with a cockpit overhead (its wings meet the aft corners).
  let aftFacet: { centre: number; depth: number } | null = null;
  if (d.aftFacets) {
    const centre = facetCentre(hw);
    const depth = Math.round((hw - centre) * facetTan * 1000) / 1000;
    if (hw - centre < 0.25) warnings.push('Her wheelhouse is too narrow for faceted aft windows (the middle pane would be all of it): left flat.');
    else if (d.overhead) warnings.push('The cockpit overhead’s wings meet the wheelhouse’s aft corners: no faceted aft windows with it: left flat.');
    else if (aft - front - (facet?.depth ?? 0) - depth < 1.6) warnings.push('Her wheelhouse is too short for faceted aft windows (the helm would have no room): left flat.');
    else aftFacet = { centre, depth };
  }
  let deckhouse: DeckhouseLayout | null = null;
  let dhArea = 0;
  // Run on aft of the wheelhouse (owner, Oct 2026: the stern trawler's bridge deck over the
  // working deck; design.dhAft): its top a deck the house's aft door opens onto. Not for one
  // only as wide as the house (that's only forward of it), nor so far it leaves her no
  // working deck: `dhc.aftDeck` m of deck clear forward of her transom at the least.
  let aftExt = d.dhLength ? SCALES.dhAft(d.dhAft ?? 0) : 0;
  if (aftExt && d.dhNarrow) {
    warnings.push('A deckhouse as wide as the wheelhouse is only forward of it: it doesn’t run on aft.');
    aftExt = 0;
  }
  if (aftExt && aft + aftExt > transom - dhc.aftDeck) {
    aftExt = Math.max(0, Math.floor((transom - dhc.aftDeck - aft) * 10) / 10);
    warnings.push(`The deckhouse would leave her too little working deck aft: it runs on ${aftExt.toFixed(1)} m aft of the wheelhouse.`);
  }
  if (d.dhAft && !d.dhLength) warnings.push('The deckhouse can only run on aft of the wheelhouse when she has one (Forward over 0): none.');
  if (d.dhLength) {
    let z0 = front - d.dhLength;
    const minZ = stem + (base.ramp ? 1.8 : dhc.fromStem);
    if (z0 < minZ) {
      z0 = minZ;
      warnings.push('The deckhouse reaches further forward than her bow allows: cut short.');
    }
    // As wide as the house (owner: leaves her side decks clear, for a side door): only forward
    // of it, the house's own walls coming down to the deck. Else from its aft wall.
    const narrow = !!d.dhNarrow;
    // (As wide as a faceted house: on to its angled corners, so they stand on it.)
    const z1 = narrow ? front + 0.03 + (facet?.depth ?? 0) : aft - 0.02 + aftExt;
    const side = d.dhWidth;
    // Out to her sides (no side decks): a raised deck (owner, Oct 2026), its top always walked.
    const full = !narrow && side < 0.025;
    const plainAt = (z: number) => (narrow ? Math.max(0.3, Math.min(hw, q.halfBeam(z) - dhc.edge)) : Math.max(z >= front - 0.01 ? hw : 0.3, q.halfBeam(z) - Math.max(dhc.edge, side)));
    // Faceted as the house is (owner): its front square across the middle, its corners cut
    // back at the same angle from its own front (always ahead of the house's, so wider).
    const halfAt = (z: number) => (facet ? Math.min(plainAt(z), Math.max(0.3, facet.centre + (z - z0) / facetTan)) : plainAt(z));
    const zs: number[] = [];
    for (let z = z0; z < z1 - 0.05; z += 0.25) zs.push(z);
    // A section where the cut corner meets her side (or the set-in width), so its edge is straight.
    if (facet) for (let z = z0; z < z1; z += 0.05) if (Math.abs(facet.centre + (z - z0) / facetTan - plainAt(z)) < 0.03) zs.push(z);
    zs.push(z1);
    zs.sort((a, b) => a - b);
    const plan = zs.map((z): [number, number] => [rnd(z), rnd(halfAt(z))]);
    const top = rnd(Math.max(...zs.map((z) => q.deckY(z))) + d.dhHeight);
    deckhouse = { z0: rnd(z0), z1: rnd(z1), top, rakeDeg: d.dhRake, plan, ...(full ? { full: true } : {}), ...(aftExt ? { houseAft: rnd(aft) } : {}) };
    // Its plate: the two sides, the top, the front and the aft face (m²), for its weight and price.
    const h = d.dhHeight;
    for (let i = 1; i < plan.length; i++) dhArea += (plan[i][0] - plan[i - 1][0]) * (2 * h + plan[i][1] + plan[i - 1][1]);
    dhArea += 2 * plan[0][1] * h + 2 * plan[plan.length - 1][1] * h;
    // Out to her sides: her bulwarks risen along it too.
    if (full) dhArea += 2 * (z1 - z0) * h;
  }
  // The floor: with a deckhouse, from its top (owner, Oct 2026: level with it, raised, or
  // sunk into it, the house's walls going down inside it and its top open over the cabin);
  // without, from the deck. Below the deck it needs her hull at least as wide as the house.
  const onTop = deckhouse ? deckhouse.top + 0.02 : level;
  let floorY = deckhouse || lift >= 0 ? onTop + lift : Math.min(level, deckLo + 0.01 + lift);
  if (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) {
    while (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) floorY = Math.min(level, floorY + 0.2);
    warnings.push(`Her hull is too fine under the wheelhouse for its floor that low: raised to ${(floorY - level).toFixed(1)} m about the deck.`);
  }
  if (deckhouse?.houseAft !== undefined && floorY < onTop - 1e-6) {
    // Its aft door opens onto the deckhouse's top: no lower than that.
    floorY = onTop;
    warnings.push('The wheelhouse floor can’t sink into a deckhouse that runs on aft of it (its aft door opens onto its top): level with its top.');
  }
  if (deckhouse && floorY < deckhouse.top - 0.01 && !d.dhNarrow) {
    // Sunk into it: no top over the cabin (inside the house's walls), less plate.
    deckhouse.well = { halfWidth: rnd(hw - 0.03), z0: rnd(front + 0.03) };
    dhArea -= 2 * (hw - 0.03) * (deckhouse.z1 - front - 0.03);
  }
  // ── The deckhouse's top walked (P2b, design.dhWalk; owner: a pilothouse raised on a walkable
  // deckhouse) ── A deck round the wheelhouse: forward of it, and beside it where the deckhouse
  // is wider; a rail along its edge, and a ladder up from the main deck (CONFIG.shipyard.
  // deckhouse.walk). On its aft face beside the house if there's room, else up its front.
  let dhRailM = 0;
  // (A side door onto it wants the wheelhouse floor within 0.35 m of its top: a step, vessel/layout.ts STEP_HEIGHT 0.4.)
  /** The forward end of what stands on her deck amidships (the deckhouse's front, and a ladder up it), set below. */
  let foreEndAt = front;
  if (d.dhWalk && !deckhouse) warnings.push('The walked deckhouse top needs a deckhouse: none.');
  if (deckhouse) foreEndAt = Math.min(front, deckhouse.z0);
  // (Out to her sides, always: it's a raised deck you cross to get forward.)
  // (Run on aft of the house, always: its aft door opens onto it.)
  if ((d.dhWalk || deckhouse?.full || deckhouse?.houseAft !== undefined) && deckhouse) {
    const wk = dhc.walk;
    // Its top is flat aft of the front's rake (hullMesh.ts buildDeckhouse: the same slope).
    const foot = q.deckY(deckhouse.z0) - 0.06;
    const flat = rnd(deckhouse.z0 + (deckhouse.top - foot) * Math.tan((deckhouse.rakeDeg * Math.PI) / 180));
    const fore = front - flat - 2 * wk.margin;
    const stripAft = deckhouseHalfWidth(deckhouse, deckhouse.z1) - hw;
    const runsAft = deckhouse.houseAft !== undefined;
    const roomAft = runsAft || (!d.dhNarrow && stripAft - wk.margin >= wk.ladder.width + 0.1);
    if (fore < wk.minFore && !roomAft) {
      // (Only said when asked for: out to her sides it's walked if there's room, quietly not if the house fills it.)
      if (d.dhWalk) warnings.push('The deckhouse’s top has no room to walk round the wheelhouse (make it reach further forward, or wider than the house): not walked.');
    }
    else {
      // (Run on aft: a steep stair across its aft face, down to the working deck: transverseStair.)
      const stair = runsAft ? transverseStair(deckhouse, q, warnings) : null;
      const ladder = stair
        ? stair.ladder
        : roomAft
        ? { face: 'aft' as const, x: rnd(hw + (stripAft - wk.margin) / 2 + 0.05), width: wk.ladder.width, depth: wk.ladder.depth }
        : { face: 'front' as const, x: 0, width: wk.ladder.width, depth: wk.ladder.depth };
      deckhouse.walk = { z0: flat, margin: wk.margin, railHeight: wk.railHeight, postSpacing: wk.postSpacing, ladder, ...(stair ? { stair: stair.treads } : {}) };
      // The rail's run: both sides from the flat top's front aft (beside the house too), and across the front.
      const w0 = deckhouseHalfWidth(deckhouse, flat);
      if (ladder.face === 'front') foreEndAt = deckhouse.z0 - ladder.depth;
      // (Out to her sides: no rail along them; her bulwarks are risen there.)
      // (Run on aft: right across its aft edge.)
      dhRailM = (deckhouse.full ? 0 : 2 * (deckhouse.z1 - flat)) + 2 * w0 + (runsAft ? 2 * stripAft + 2 * hw : roomAft ? 2 * stripAft : 0);
    }
  }
  const roofY = floorY + headroom;
  const wall = 0.06;
  // The saloon's floor (owner: "two steps down into the saloon", as on the Alaskan): level with
  // the wheelhouse's, or a step or more down, each a 0.2 m rise with a tread `sal.tread` deep
  // between (the treads aft of the wheelhouse, in the saloon). Not into a deckhouse it stands
  // on, and below the deck only where her hull is wide enough for the house's walls to go
  // down to it (as a sunk wheelhouse floor); else as low as it can go, in whole steps.
  let saloonDrop = saloonL ? d.saloonFloor ?? 0 : 0;
  if (saloonDrop) {
    const salTight = (y: number) => Math.min(...Array.from({ length: 5 }, (_, i) => helmAft + ((aft - helmAft) * i) / 4).map((z) => halfBreadthAt(st.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a)).polygon, y)));
    const lowest = deckhouse ? Math.min(floorY, deckhouse.top + 0.02) : -Infinity;
    const fits = (drop: number) => floorY - drop >= lowest - 1e-6 && (floorY - drop >= level - 1e-6 || salTight(floorY - drop - 0.15) >= hw + 0.02);
    const asked = saloonDrop;
    while (saloonDrop > 1e-6 && !fits(saloonDrop)) saloonDrop = Math.round((saloonDrop - 0.2) * 10) / 10;
    if (saloonDrop < asked - 1e-6) warnings.push(saloonDrop ? `The saloon's floor can only go ${Math.round(saloonDrop / 0.2)} step${saloonDrop > 0.3 ? 's' : ''} down here (${deckhouse ? 'not into the deckhouse' : 'her hull is too fine for it lower'}).` : `The saloon's floor can't step down here (${deckhouse ? 'not into the deckhouse' : 'her hull is too fine for it lower'}): level with the wheelhouse's.`);
  }
  /** The saloon's floor (the wheelhouse's, without one or level with it): the floor at the aft door. */
  const FA = rnd(floorY - saloonDrop);
  const nRise = Math.round(saloonDrop / 0.2);
  const levels: FloorLevel[] = saloonDrop
    ? [
        // The treads down from the wheelhouse, then the saloon.
        ...Array.from({ length: nRise - 1 }, (_, k) => ({ y: rnd(floorY - 0.2 * (k + 1)), z0: rnd(helmAft + k * sal.tread), z1: rnd(helmAft + (k + 1) * sal.tread) })),
        { y: FA, z0: rnd(helmAft + (nRise - 1) * sal.tread), z1: rnd(aft) },
      ]
    : [];
  // The house's shape (owner): the roof one flat slab reaching forward over the windows (the
  // visor), its front edge cut back underneath; the front windows raked either way.
  const roofThickness = d.roofThickness;
  // Its front and sides chamfered (hullMesh.ts chamferedSlab): the top set in this much.
  const roofBack = roofThickness * Math.tan((d.roofEdge * Math.PI) / 180);
  // The window sills, one height all round (owner; they were 1.31 at the front, the dash top,
  // and 1.0 at the sides): the standard height, low (below the console) or high (level with the dash top).
  const ws = CONFIG.shipyard.windowSills;
  const sill = [ws.standard, ws.low, ws.high][d.sills ?? 0] ?? ws.standard;
  // The windows run up to the roof's underside, only their frame between (owner: the roof is
  // one piece, overhanging them, no band of wall above the glass).
  const windowHead = headroom - CONFIG.pixelPaint.frameWidth;
  const doorHeight = Math.min(1.95, headroom - 0.1);
  // The saloon's own roof (owner, P2b: the raised pilothouse look): lower than the wheelhouse's
  // by whole 0.2 m steps, the step in the roofline at the wheelhouse's aft end, its windows
  // coming down with it. Never so low its headroom is under the doorway's plus 0.1 m (the aft
  // door is in its wall), or its window band (from the sill to the frame under the roof) under
  // `sal.minBand`: as low as it can go then, and said.
  let roofDrop = saloonL ? d.saloonRoof ?? 0 : 0;
  if (roofDrop) {
    const asked = roofDrop;
    const ok = (drop: number) => roofY - drop - FA >= doorHeight + 0.1 - 1e-6 && roofY - drop - CONFIG.pixelPaint.frameWidth - (floorY + sill) >= sal.minBand - 1e-6;
    const by = MEASURES.saloonRoof.by;
    while (roofDrop > 1e-6 && !ok(roofDrop)) roofDrop = Math.max(0, Math.round((roofDrop - by) / by) * by);
    if (roofDrop < asked - 1e-6) {
      const why = roofY - asked - FA < doorHeight + 0.1 - 1e-6 ? 'its headroom over the saloon floor would be less than the doorway' : 'its windows would be too shallow';
      warnings.push(roofDrop ? `The saloon's roof can only come ${roofDrop.toFixed(2)} m lower (${why}): a deeper saloon floor, or more headroom, lets it go lower.` : `The saloon's roof can't come lower (${why}): it's as high as the wheelhouse's. A deeper saloon floor, or more headroom, lets it.`);
    }
  }
  /** The saloon's roof (its underside), lower than the wheelhouse's aft of the step at `helmAft`; null: one roof. */
  const saloonRoof = roofDrop ? { z: rnd(helmAft), y: rnd(roofY - roofDrop) } : null;
  /** The roof's underside at z (a lower saloon roof aft of its step). */
  const roofAt = (z: number) => (saloonRoof && z > saloonRoof.z ? saloonRoof.y : roofY);
  // The front below the windows stays upright (its choice isn't offered now, owner).
  const house: HouseShape = { lowerRakeDeg: 0, lowerFromY: Math.min(q.deckY(front), floorY), roofEdgeDeg: d.roofEdge, visor: CONFIG.shipyard.visor }; // (one set length now, owner: `d.visor` is kept in the code, unused)
  // A three-facet front (owner: a tug's pilot house): the middle pane square across her
  // between the mullions, the outer two angled back `facetDeg` to the side walls; the
  // console wraps round with it, its wings set back as much (sb).
  if (facet) house.facet = facet;
  if (aftFacet) house.aftFacet = aftFacet;
  // Windows raked out all round (owner; houseFlare.ts): the sides and aft lean out above the sill.
  if (d.flare) house.flare = { tan: Math.round(Math.tan((CONFIG.shipyard.flareDeg * Math.PI) / 180) * 1e4) / 1e4 };
  /** How far a faceted front is set back at x (0 across the middle; the console's wings, and what's placed beside them, follow it). */
  const sb = (x: number) => (house.facet ? (Math.max(0, Math.abs(x) - house.facet.centre) * house.facet.depth) / (hw - house.facet.centre) : 0);
  // Raked out all round (owner): the front leans out with the sides, at the same angle (its own rake is set aside).
  const windowRake = d.flare ? CONFIG.shipyard.flareDeg : d.windowRake;
  // Where the front windows' foot and head stand (z), as hullMesh draws them.
  const ahead = Math.max(0, floorY + sill - house.lowerFromY) * Math.tan((house.lowerRakeDeg * Math.PI) / 180);
  const zHead = front - ahead - (windowHead - sill) * Math.tan((windowRake * Math.PI) / 180);
  // The console (and what's placed by it) set back from the front (owner: it stood against the
  // glass): far enough that each of its parts rising above the sill is `consoleClear` behind the
  // glass anywhere from the sill up to that part's top. Glass raked aft at the top (negative rake)
  // leans back over it, so that needs more. Each part: its height above the floor, and its front (m aft of the house front)
  // with the console against the wall: the dash; with low sills, the desk's raised back and the
  // screens on stalks; the screens hung from the roof.
  const consoleBack = (() => {
    const lean = Math.tan((windowRake * Math.PI) / 180); // + forward at the top
    // How far aft the glass reaches anywhere from the sill up to height y (it's tightest at the
    // sill for glass leaning forward, at y for glass raked aft).
    const glassAft = (y: number) => Math.max(0, -lean * (y - sill));
    const parts: [number, number][] = lowSills(d)
      ? [[1.02, 0.06], [0.9 + 0.21 + CONFIG.modules.screen.dash.height / 2, 0.2], [headroom - 0.1, 0.32]]
      : [[0.9 + CONFIG.modules.helmConsole.dash.top, 0.06], [headroom - 0.1, 0.32]];
    const above = parts.filter(([y]) => y > sill);
    return above.length ? Math.ceil(Math.max(0, ...above.map(([y, z]) => glassAft(y) + CONFIG.shipyard.consoleClear - z)) * 100) / 100 : 0; // (up to the next cm)
  })();
  /** The console's line: the house front, less any setback (consoleBack). */
  const cf = front + consoleBack;
  // The console across the cabin (owner: cut short on a wide wheelhouse, for the view past
  // it; to port, the middle or starboard): no longer than `maxConsole`, its middle `cx`. A
  // faceted front's console wraps round the middle pane: it stays in the middle.
  const helmCfg = CONFIG.shipyard.helm;
  // (Or as long as set, `consoleLen`: CS6, a short console for a narrow wheelhouse.)
  const setLen = consoleLengthM(d.consoleLen ?? 0);
  const consoleHalf = Math.min(hw - wall, helmCfg.maxConsole / 2, setLen ? setLen / 2 : Infinity);
  const short = consoleHalf < hw - wall - 0.005;
  let side = d.consoleSide ?? 0;
  if (side && !short) side = 0; // (as wide as the cabin: nowhere to move to)
  // (The Shipyard only offers the side with a flat front: a side chosen before the front was
  // faceted is set aside, quietly.)
  if (facet) side = 0;
  const cx = Math.round((side === 1 ? -(hw - wall - consoleHalf) : side === 2 ? hw - wall - consoleHalf : 0) * 1000) / 1000;
  // Steps at the aft door, no rise over 0.35 m (a player steps up 0.4): outside for a
  // raised floor, inside for a deep sunk one.
  // (Onto the deckhouse's top where it runs on aft of the house.)
  const doorDeck = deckhouse?.houseAft !== undefined ? deckhouse.top : q.deckY(aft + 0.15);
  const rise = FA - doorDeck;
  const nSteps = Math.max(0, Math.ceil(Math.abs(rise) / 0.35) - 1);
  const tread = 0.28;
  const steps: DoorStep[] = Array.from({ length: nSteps }, (_, i) => {
    const k = i + 1; // 1: the lowest step; nSteps: the highest, at the door
    const y = Math.min(FA, doorDeck) + (Math.abs(rise) * k) / (nSteps + 1);
    const out = nSteps - k; // treads between it and the door
    return rise > 0 ? { y, z0: aft + out * tread, z1: aft + (out + 1) * tread } : { y, z0: aft - wall - (out + 1) * tread, z1: aft - wall - out * tread };
  });
  // Treads inside the aft wall (a sunk floor): the engine hatch keeps forward of them.
  const inside = rise < 0 ? nSteps * tread : 0;
  const F = floorY;
  /** The roof's top (flat, or a step down to a lower saloon roof). */
  const roofTopAt = (z: number) => roofAt(z) + roofThickness;
  // On the roof, forward: clear of its front edge (the visor's top, set back by its rake) whichever way the windows rake.
  const roofFront = Math.max(front, zHead - house.visor + roofThickness * Math.tan((house.roofEdgeDeg * Math.PI) / 180));
  return { F, FA, aft, ahead, along, cf, consoleBack, consoleHalf, cx, deckHi, hx, deckLo, deckhouse, dhArea, dhRailM, dhc, doorHeight, floorY, foreEndAt, foredeck, form, front, headroom, shape, st, helmAft, house, houseL, hw, inside, level, levels, nSteps, onTop, q, rise, rnd, roofAt, roofBack, roofDrop, roofFront, roofThickness, roofTopAt, roofY, saloonDrop, saloonL, saloonRoof, sb, short, side, sill, steps, tread, wall, windowHead, windowRake, zHead };
}
export type HousePart = ReturnType<typeof housePart>;

/** Her bow ramp, if she has one, and her deck layout (the wheelhouse, roof, deckhouse, bulwarks and rails) for walking and drawing. */
export function layoutPart(a: BuildArgs, p: HullPart & HousePart) {
  const { d } = a;
  const { aft, base, bulwarkHeight, consoleBack, consoleHalf, cx, deckhouse, doorHeight, floorY, foredeck, front, grownPlate, q, house, hw, levels, rnd, roofThickness, roofY, saloonDrop, saloonRoof, short, sill, st, stem, steps, wall, warnings, windowHead, windowRake } = p;

  // Her bow ramp (the landing craft's), across her square bow.
  const bowHalf = st[st.length - 1].halfBeamDeck;
  const lcRamp = CONFIG.vessels.landingCraft.layout.bowRamp;
  // (Grown, her ramp is longer, its rams and toe flaps with it, as her depth grows: her bow
  // stands that much higher off the beach.)
  const rk = (v: number) => Math.round(v * grownPlate * 100) / 100;
  const bowRamp = base.ramp
    ? { ...lcRamp, width: Math.round(2 * (bowHalf - 0.08) * 100) / 100, length: rk(lcRamp.length), flap: { ...lcRamp.flap, length: rk(lcRamp.flap.length) }, ram: { ...lcRamp.ram, x: Math.round((bowHalf - 0.07) * 100) / 100, aft: rk(lcRamp.ram.aft), height: rk(lcRamp.ram.height), along: rk(lcRamp.ram.along) }, button: { z: stem + 0.8, y: 0.42 } }
    : undefined;

  const layout = {
    // No roof rail or ladder (owner: simpler): the roof isn't walked.
    wheelhouse: { halfWidth: hw, ...(p.hx ? { x: p.hx } : {}), front, aft, floorY, roofY, wall, doorWidth: 0.7, doorHeight, windowSill: sill, windowHead, frontSill: sill, frontRakeDeg: windowRake, ...(d.flare ? { doorHinged: true } : {}), consoleDepth: 0.5, ...(consoleBack ? { consoleBack } : {}), consoleHeight: 0.9, viewSill: lowSills(d) ? 0.9 : Math.max(sill, 0.9 + CONFIG.modules.helmConsole.dash.top), shape: house, ...mullionsOf(hw, wall, house), ...(short ? { consoleSpan: { x0: Math.round((cx - consoleHalf) * 1000) / 1000, x1: Math.round((cx + consoleHalf) * 1000) / 1000 } } : {}), ...(steps.length ? { steps } : {}), ...(levels.length ? { levels } : {}), ...(saloonRoof ? { saloonRoof } : {}) },
    roof: { thickness: roofThickness, overhang: 0.15, railHeight: 0, edgeMargin: 0.25 },
    // A cockpit overhead (design.overhead): fitted below, once the deck gear has its places.
    overhead: undefined as OverheadLayout | undefined,
    // (Their height from the wheelhouse's floor: 1.1 m above the saloon's at its aft door.)
    doorButtons: { x: 0.45, height: rnd(1.1 - saloonDrop) },
    ...(bowRamp ? { bowRamp } : {}),
    ...(deckhouse ? { deckhouse } : {}),
    bulwarkHeight,
    // Handrails 0.4 m over the bulwarks, or none (owner: an option; bulwarks only).
    railHeight: d.rails ? 0 : bulwarkHeight + 0.4,
    // The notch in the transom bulwark for a stern roller (set below if she has one).
    fairleadGap: d.sternRoller ? CONFIG.vessels.workboat.layout.fairleadGap : 0,
    deckEdgeMargin: 0.25,
    bodyRadius: BODY_RADIUS,
  } as LayoutConfig;
  // A deckhouse's stair (walked as floors; drawn by the hull mesh with its rail).
  if (deckhouse?.walk?.stair) layout.extraFloors = [...(layout.extraFloors ?? []), ...deckhouse.walk.stair];
  // A raised foredeck's steps (walked as floors; drawn by the hull mesh).
  if (foredeck) {
    const treads = foredeckSteps(foredeck, q);
    layout.deckSteps = treads;
    layout.extraFloors = [...(layout.extraFloors ?? []), ...treads];
  }
  // Her door is in the house's aft wall: what counts is the deck you step out onto just aft
  // of it (not the highest deck under the house, which forward on a hull rising to her bow is
  // well above it). The side door's own height is worked out below.
  const doorDeck = Math.max(...[aft, aft + 0.3].map((z) => q.deckY(Math.min(z, st[0].z))));
  if (layout.wheelhouse && roofY - doorDeck < 1.8) warnings.push('Her wheelhouse roof is low over the deck outside: the doorway will be a squeeze.');

  return { bowRamp, layout };
}
export type LayoutPart = ReturnType<typeof layoutPart>;

/** The cockpit overhead (P2b), fitted now the deck gear has its places: short of what stands up through it, not over a crane's aft deck. */
export function overheadPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart) {
  const { d } = a;
  const { aFrame, afc, aft, craneAt, lampFoot, layout, monitorFoot, q, rnd, roofAt, roofThickness, skiffAt, transom, warnings } = p;
  // ── The cockpit overhead (P2b, design.overhead; owner) ──
  // The house's aft roof carried on aft over the working deck, on a wing each side just
  // inside the bulwarks (CONFIG.shipyard.overhead). Fitted now the deck gear has its places:
  // it stops short of what stands up through it, and isn't fitted over a deck crane's or the
  // skiff crane's aft deck.
  const ohc = CONFIG.shipyard.overhead;
  if (d.overhead) {
    const want = SCALES.overhead(d.overhead);
    const booms = [craneAt && craneAt[2] > aft ? 'the deck crane' : null, skiffAt && skiffAt[2] > aft ? "the skiff's crane" : null].filter((b): b is string => !!b);
    let z1 = Math.min(aft + want, transom - ohc.transomClear);
    let shortOf = z1 < aft + want - 0.01 ? 'the transom' : '';
    const stopAt = (z: number, what: string) => {
      if (z < z1) [z1, shortOf] = [z, what];
    };
    if (aFrame) stopAt(transom - afc.footFromTransom - ohc.gearClear, 'the A-frame');
    if (lampFoot && lampFoot[2] > aft) stopAt(lampFoot[2] - ohc.gearClear, "the searchlight's pole");
    if (monitorFoot && monitorFoot[2] > aft) stopAt(monitorFoot[2] - ohc.gearClear, "the fire monitor's pole");
    if (booms.length) warnings.push(`The cockpit overhead is left off: ${booms.join(' and ')} works her aft deck, and its boom would strike it.`);
    else if (z1 - aft < ohc.minLength) warnings.push(`There's no room aft of the house for the cockpit overhead${shortOf ? ` (${shortOf} is in the way)` : ''}: left off.`);
    else {
      if (shortOf) warnings.push(`The cockpit overhead stops short of ${shortOf}: ${(z1 - aft).toFixed(2)} m long, not ${want.toFixed(2)} m.`);
      const zs = Array.from({ length: 9 }, (_, i) => aft + ((z1 - aft) * i) / 8);
      const y = roofAt(aft - 0.01);
      const kneeZ = aft + Math.min(ohc.kneeMax, (z1 - aft) * ohc.kneeShare);
      const headroom = y - Math.max(...zs.map((z) => q.deckY(z)));
      if (headroom < ohc.minHeadroom) warnings.push(`There's only ${headroom.toFixed(2)} m of headroom under the cockpit overhead: raise the wheelhouse floor or its headroom.`);
      layout.overhead = { z0: rnd(aft), z1: rnd(z1), y: rnd(y), thickness: roofThickness, halfWidth: rnd(Math.min(...zs.map((z) => q.halfBeam(z))) - ohc.inset), wing: ohc.wing, kneeZ: rnd(kneeZ), deckY: rnd(q.deckY(kneeZ)) };
    }
  }

  return {  };
}
export type OverheadPart = ReturnType<typeof overheadPart>;

/** Inside the wheelhouse: the chart table, the side door, and a cabin below the deckhouse with its companionway (P2c). */
export function interiorPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart) {
  const { d } = a;
  const { F, FA, aft, at, bowRamp, cf, deckLo, deckhouse, dg, engZ0, engZ1, floorY, foredeck, front, helmAft, hw, hx, layout, levels, outboards, q, r2, rnd, roofAt, roofY, saloonDrop, saloonL, sb, side, st, stem, wall, warnings, windowHead } = p;
  // The chart table (owner: its own choice): along the port wall at the aft end, its hinge
  // corner forward, if her house is wide enough to pass inboard of it and long enough to
  // leave the helm clear.
  const ctab = CONFIG.modules.chartTable;
  let chartTableAt: V3 | null = null;
  if (d.chartTable) {
    const z0 = aft - wall - 0.3 - ctab.depth;
    if (hw - wall - ctab.width >= 0.35 && z0 >= cf + 1.0 + sb(hw) && (!saloonDrop || z0 >= levels[levels.length - 1].z0)) chartTableAt = [rnd(hx - (hw - wall)), FA, Math.round(z0 * 1000) / 1000];
    else warnings.push(`Her wheelhouse is too ${hw - wall - ctab.width < 0.35 ? 'narrow' : 'short'} for the chart table along its port wall: left off.`);
  }
  // The side door (owner): a sliding door in the port wall, aft of the console with room to
  // stand at the helm, forward of the chart table, onto a side deck wide enough to step out on.
  // The house itself is drawn with the opening (vessel/view/hullMesh.ts), and the door slides
  // and is walked through as the starting workboat's does.
  let sideDoor: { z0: number; z1: number; height: number; buttonHeight: number } | null = null;
  if (d.sideDoor) {
    const sdc = dg.sideDoor;
    const z0 = Math.max(cf + sb(hw) + wall + 0.5 + sdc.fromConsole, bowRamp ? at.rampButton[2] + 0.15 : -Infinity);
    // (Forward of the step down into a saloon: the doorway on one floor.)
    // (Faceted aft windows: short of where the side wall turns in at the aft corner.)
    const zEnd = Math.min(chartTableAt ? chartTableAt[2] - 0.05 : aft - wall - 0.15 - (p.house.aftFacet?.depth ?? 0), saloonDrop ? helmAft - 0.05 : Infinity);
    // Up to the window band's top edge (the door's opening runs up through the band).
    const height = Math.min(2.0, windowHead - 0.04, roofY - F - 0.12);
    // (Onto the deckhouse's walked top, when the house stands on one as wide as her: below.)
    // (Her port deck edge to the house's port wall: the wall is at hx - hw, offset across her.)
    const deckOutside = deckhouse?.walk && !d.dhNarrow ? Infinity : q.halfBeam(z0 + sdc.width / 2) - hw + hx;
    // On a house raised on a deckhouse as wide as it, the door opens onto the side deck below
    // with no steps (owner: the crew jump in and out; if that's too high it's a bad design).
    // A sliding door wants a flat wall to slide along (owner): not with the windows raked out.
    if (d.flare) warnings.push('The side door slides along an upright wall: it needs upright side windows (not raked out all round): left off.');
    else if (deckhouse && !d.dhNarrow && !deckhouse.walk) warnings.push('The side door would open onto the deckhouse’s top, which isn’t walked (walk its top, or make the deckhouse as wide as the wheelhouse): left off.');
    else if (deckhouse?.walk && !d.dhNarrow && Math.abs(floorY - deckhouse.top) > 0.35) warnings.push('The wheelhouse floor is too far from the deckhouse’s top for a side door onto it (bring its floor level with the top): left off.');
    else if (deckhouse?.walk && !d.dhNarrow && deckhouseHalfWidth(deckhouse, z0 + sdc.width / 2) - hw - deckhouse.walk.margin < sdc.sideDeck) warnings.push('The deckhouse’s top is too narrow beside the wheelhouse to step out of a side door onto (a narrower wheelhouse, or a deckhouse only as wide as the wheelhouse): left off.');
    else if (zEnd - z0 < sdc.width) warnings.push(`Her wheelhouse is too short for a side door between the helm and ${chartTableAt ? 'the chart table' : 'the aft wall'}: left off.`);
    else if (deckOutside < sdc.sideDeck) warnings.push('There\'s no side deck outside her wheelhouse to step out onto (a narrower house leaves one): the side door is left off.');
    else if (height < 1.7) warnings.push('Her wheelhouse is too low inside for a side door: left off.');
    else sideDoor = { z0: r2(z0), z1: r2(z0 + sdc.width), height: r2(height), buttonHeight: sdc.buttonHeight };
  }
  if (sideDoor) layout.wheelhouse!.sideDoor = sideDoor;

  // ── A cabin below (P2c, design.foreCabin; owner) ──
  // Under the deckhouse forward of the wheelhouse (its trunk), the deck cut away and the sole
  // sunk into her hull for standing headroom (CONFIG.shipyard.deckhouse.cabin), reaching aft under the
  // wheelhouse floor to the foot of a companionway that steps down forward from the wheelhouse
  // floor, beside the helm (on the side away from a console against a wall). A V-berth across
  // her forward end. Its walls stand straight up from the sole, inside the trunk's walls and
  // inside her sides at the sole (where a V hull is narrowest), so they're inside her
  // everywhere above. Walked through extraFloors, hollows, floorHoles and deckOpening (as the
  // Alaskan 38's cabin is); drawn by hullMesh.ts from layout.cabin.
  //
  // Or under a raised foredeck the wheelhouse stands on (owner, Oct 2026: "the cabin below the
  // raised poop deck"; a fo'c'sle cabin, as on a trawler): the raised deck its ceiling (flat, at
  // its lowest along the cabin), her sides its walls, her deck not cut away (it's the ceiling).
  let cabinM2 = 0;
  const underForedeck = !deckhouse && !!foredeck && foredeck.z > aft;
  if (d.foreCabin && !deckhouse && !underForedeck) warnings.push(foredeck ? 'The cabin below goes under a raised foredeck only when the wheelhouse stands on it (make the raised foredeck reach aft past the wheelhouse): none.' : 'The cabin below needs a deckhouse forward of the wheelhouse, or a raised foredeck the wheelhouse stands on, over it: none.');
  else if (d.foreCabin && (deckhouse || underForedeck)) {
    const cc = CONFIG.shipyard.deckhouse.cabin;
    const why = (() => {
      // Her hull's half breadth at height y, at z between the stations either side; her bottom there.
      const between = (z: number, f: (poly: readonly (readonly [number, number])[]) => number) => {
        let i = 0;
        while (i < st.length - 2 && st[i + 1].z > z) i++;
        const t = Math.min(1, Math.max(0, (z - st[i].z) / (st[i + 1].z - st[i].z || 1)));
        return f(st[i].polygon) * (1 - t) + f(st[i + 1].polygon) * t;
      };
      const hullHalf = (z: number, y: number) => between(z, (p) => halfBreadthAt(p, y));
      const keelAt = (z: number) => between(z, (p) => p[2][1]);
      // Its trunk: the deckhouse, its top flat aft of its front's rake (hullMesh.ts buildDeckhouse:
      // the same slope); or the raised foredeck from where her bow allows forward, its deck the
      // ceiling at its lowest (her sheer rises forward) less the deck's thickness.
      const fcFrom = stem + CONFIG.shipyard.deckhouse.fromStem;
      const foot = deckhouse ? q.deckY(deckhouse.z0) - 0.06 : 0;
      const flat = deckhouse ? deckhouse.z0 + (deckhouse.top - foot) * Math.tan((deckhouse.rakeDeg * Math.PI) / 180) : fcFrom;
      let zFront = deckhouse ? Math.max(flat, deckhouse.z0 + 0.1) + cc.wall : fcFrom + cc.wall;
      const trunkCeil = deckhouse ? deckhouse.top - 0.05 : rnd(Math.min(...Array.from({ length: 9 }, (_, i) => q.deckY(fcFrom + ((front - fcFrom) * i) / 8))) - 0.08);
      const houseCeil = floorY - 0.1;
      // The companionway: beside the helm, on the side away from a console against a wall.
      const comSide = side === 2 ? -1 : 1;
      const xOut = comSide * (hw - wall - 0.03);
      const [sx0, sx1] = comSide > 0 ? [xOut - cc.stairWidth, xOut] : [xOut, xOut + cc.stairWidth];
      if (hw - wall - 0.03 - cc.stairWidth < cc.helmRoom) return 'her wheelhouse is too narrow for a companionway beside the helm';
      // Its sole: `headroom` under the trunk's top, raised until it's wide enough and clear of her bottom.
      const zs = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
      const along = zs((zFront + front) / 2, Math.min(front + 1, aft), 8);
      let sole = trunkCeil - cc.headroom;
      const fits = (y: number) => along.every((z) => hullHalf(z, y) - cc.hullClear >= cc.minHalf && y >= keelAt(z) + cc.keelClear);
      while (!fits(sole) && sole < deckLo) sole += 0.05;
      sole = rnd(sole);
      if (trunkCeil - sole < cc.minHeadroom - 1e-6) return `there'd be only ${(trunkCeil - sole).toFixed(2)} m of headroom under the trunk (${cc.minHeadroom} m at least): make the deckhouse higher`;
      // Its half width at z: inside the trunk's walls (the wheelhouse's, under it), and her sides at the sole.
      const half = (z: number) => Math.min(z < front ? (deckhouse ? deckhouseHalfWidth(deckhouse, Math.min(z, deckhouse.z1)) : q.halfBeam(z)) - cc.wall : hw - wall, hullHalf(z, sole + 0.02) - cc.hullClear);
      // Its forward end: where it's wide enough to be worth having (the V-berth's narrow end).
      while (zFront < front && half(zFront) < 0.3) zFront += 0.05;
      // The steps: down from the wheelhouse floor to the sole, the opening just aft of the console.
      const drop = floorY - sole;
      const n = Math.ceil(drop / cc.rise - 1e-6);
      const r = drop / n;
      const zs0 = rnd(cf + sb((sx0 + sx1) / 2) + 0.5 + 0.1);
      const zs1 = rnd(zs0 + n * cc.tread);
      const room = (saloonL ? helmAft : aft - wall) - 0.15;
      if (zs1 > room) return `her wheelhouse is too short for the companionway's ${n} steps aft of the console (${(n * cc.tread).toFixed(2)} m)`;
      if (comSide < 0 && chartTableAt && zs1 > chartTableAt[2] && zs0 < chartTableAt[2] + ctab.depth) return 'the chart table is where the companionway would come down (put the console to port, or no chart table)';
      if (comSide < 0 && sideDoor && zs1 > sideDoor.z0 - 0.1 && zs0 < sideDoor.z1 + 0.1) return 'the side door is where the companionway would come down';
      if (zs0 - zFront < cc.minAhead) return 'the deckhouse doesn’t reach far enough forward of the wheelhouse for a cabin (make it longer)';
      if (!outboards && engZ1 > zFront - 0.1 && engZ0 < zs1 + 0.1) return 'her engine is under the wheelhouse, where the cabin would be (pod drives, stern drives or outboards put it aft)';
      // Its plan, every 0.25 m and at the wheelhouse front (where its ceiling steps).
      const pz = [...zs(zFront, zs1, Math.max(1, Math.ceil((zs1 - zFront) / 0.25))), front].filter((z) => z >= zFront && z <= zs1).sort((a, b) => a - b);
      const plan = pz.map((z): [number, number] => [rnd(z), rnd(half(z))]);
      const treads = Array.from({ length: n - 1 }, (_, k) => ({ z0: rnd(zs1 - (k + 1) * cc.tread), z1: rnd(zs1 - k * cc.tread), y: rnd(floorY - (k + 1) * r) }));
      const berth = zs0 - zFront >= cc.berth.minCabin ? { z1: rnd(zFront + cc.berth.length), top: rnd(sole + cc.berth.top) } : undefined;
      const cabin: CabinBelow = { z0: rnd(zFront), z1: zs1, sole, plan, ceiling: { front, trunk: rnd(trunkCeil), house: rnd(houseCeil) }, stair: { x0: rnd(sx0), x1: rnd(sx1), z0: zs0, z1: zs1, treads }, ...(berth ? { berth } : {}) };
      layout.cabin = cabin;
      layout.wheelhouse!.floorHoles = [{ x0: cabin.stair.x0, x1: cabin.stair.x1, z0: zs0, z1: zs1 }];
      // Walked: the treads, and the sole (aft of the berth, up to the foot of the steps), in
      // strips each as wide as the cabin's narrowest along it.
      const soleZ0 = berth ? berth.z1 : cabin.z0;
      const soleZ1 = rnd(zs0 + cc.tread);
      const strips = zs(soleZ0, soleZ1, Math.max(1, Math.ceil((soleZ1 - soleZ0) / 0.5)));
      const soles: FloorPatch[] = strips.slice(1).map((z, i) => {
        const w = rnd(Math.min(half(strips[i]), half(z)));
        return { x0: -w, x1: w, z0: rnd(strips[i]), z1: rnd(z), y: sole };
      });
      // (The top tread reaches back under the floor's edge, by the half body the walk keeps off an
      // opening's edge (vessel/layout.ts floorHoles): so the floor and it meet.)
      const treadPatches = treads.map((t, k): FloorPatch => ({ x0: cabin.stair.x0, x1: cabin.stair.x1, ...t, ...(k === 0 ? { z1: rnd(t.z1 + BODY_RADIUS * 0.5 + 0.03) } : {}) }));
      layout.extraFloors = [...(layout.extraFloors ?? []), ...treadPatches, ...soles];
      // Open space: the companionway (up through the floor), and the cabin under its ceiling.
      const hollows: Hollow[] = [{ x0: cabin.stair.x0, x1: cabin.stair.x1, y0: sole - 0.1, y1: floorY + 0.5, z0: zs0, z1: zs1 }];
      for (let i = 1; i < plan.length; i++) {
        const [za, wa] = plan[i - 1];
        const [zb, wb] = plan[i];
        const w = Math.min(wa, wb);
        hollows.push({ x0: -w, x1: w, y0: sole - 0.1, y1: (za + zb) / 2 < front ? trunkCeil : houseCeil, z0: za, z1: zb });
      }
      layout.hollows = [...(layout.hollows ?? []), ...hollows];
      // The deck cut away over it (its plan), so it isn't across the cabin (under a deckhouse:
      // under a raised foredeck that deck is its ceiling, left as it is).
      if (deckhouse) layout.deckOpening = { front: cabin.z0, inset: 0, plan };
      // Its lining (sole, sides, the bulkheads at each end) and the berth, for its weight.
      for (let i = 1; i < plan.length; i++) {
        const [za, wa] = plan[i - 1];
        const [zb, wb] = plan[i];
        const ceil = (za + zb) / 2 < front ? trunkCeil : houseCeil;
        cabinM2 += (zb - za) * (wa + wb) + 2 * (zb - za) * (ceil - sole);
      }
      cabinM2 += 2 * plan[0][1] * (trunkCeil - sole) + 2 * plan[plan.length - 1][1] * (houseCeil - sole) + (berth ? 2 * half(berth.z1) * (berth.z1 - cabin.z0) * 2 : 0);
      return '';
    })();
    if (why) warnings.push(`There's no cabin below: ${why}.`);
  }
  // The places inside it offers (P4b): the chart table, the side door's buttons.
  const interiorSockets: Socket[] = [
    ...(chartTableAt ? [{ id: 'chartTable', type: 'cabin.furniture' as const, transform: { position: chartTableAt }, capacity: { size: [ctab.width, roofAt(chartTableAt[2]) - chartTableAt[1], ctab.depth] as V3 }, label: 'Port wall, aft: the chart table' }] : []),
    ...(sideDoor
      ? ([
          { id: 'sideDoorIn', type: 'wall.panel', transform: { position: [r2(hx - hw + wall), r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, -90, 0] }, label: 'Side door jamb, inside' },
          { id: 'sideDoorOut', type: 'wall.panel', transform: { position: [r2(hx - hw), r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, 90, 0] }, label: 'Side door jamb, outside' },
        ] as Socket[])
      : []),
  ];
  return { interiorSockets, cabinM2, chartTableAt, ctab, sideDoor };
}
export type InteriorPart = ReturnType<typeof interiorPart>;
