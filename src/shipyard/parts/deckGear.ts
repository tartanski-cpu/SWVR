/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her deck gear, and what hangs on the wheelhouse outside.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import { inertiaFromGyradius } from '../../modular/massProperties';
import { deckhouseHalfWidth } from '../../vessel/deckhouse';
import { PLACE_GRID, placeOf, type PlaceKey } from '../design';
import type { Socket } from '../../modular/socket';
import type { BuildArgs, V3 } from './common';
import { TUG_HULL } from './catalog';
import type { DesignedBoat } from '../build';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';

/** Her deck gear, each piece where it stands, clear of what's already placed: the winch, the A-frame, the deck crane, the skiff and its crane, the searchlight and fire monitor, the fender basket, the anchor. */
export function deckGearPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart) {
  const { d } = a;
  const { aft, at, bowCleat, bowRamp, cg, cleat, deckMid, deckhouse, foreEndAt, foredeck, front, gyradius, hw, hx, layout, mass, midCleat, prot, q, roofBack, roofFront, roofTopAt, saloonRoof, sb, stem, steps, sternCleat, transom, warnings, wl } = p;
  // ── Hull definition ──
  const weighed = { massKg: mass, cg, inertia: inertiaFromGyradius(mass, gyradius) };
  const freeboard = deckMid;
  // ── Deck gear: where each piece stands (owner) ──
  // In this order, each kept clear of what's already placed (`taken`, in plan):
  //   1. the stern gear at its fixed places (the stern roller, the A-frame's feet);
  //   2. the gear placed by hand (design.ts PLACE_FIELDS: a pin puts it on the 25 cm grid):
  //      the tow winch, the crane, the searchlight and the fire monitor, each on its pinned
  //      cell if it stands there, else the nearest cell within a metre that does, else (with
  //      a warning) its usual place;
  //   3. the rest at their usual places: the winch forward of the transom, the crane at the
  //      deck edge (the foredeck's to starboard, the aft deck's to port), the searchlight's
  //      and monitor's poles off the house (the searchlight to starboard, the monitor to port),
  //      or on the roof.
  const cr = CONFIG.modules.deckCrane;
  const dp = CONFIG.modules.deckPole;
  const dg = CONFIG.shipyard.deckGear;
  const twc = CONFIG.vessels.workboat.towWinch;
  const afc = CONFIG.vessels.workboat.fishing.aFrame;
  type Rect = { x0: number; x1: number; z0: number; z1: number };
  const taken: Rect[] = [];
  const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const bowClear = stem + (bowRamp ? 1.8 : 1.0);
  // A raised foredeck (house.ts raisedForedeck): each piece stands wholly on one deck or the
  // other (its plan shape's margin reaching at most `gearReach` past the break), and off the
  // ladders up to it (taken below). `raisedAhead`: its break lies forward of the house, a lower
  // deck between them.
  const fdc = CONFIG.shipyard.foredeck;
  const breakZ = foredeck?.z ?? null;
  const onRaised = (r: { z1: number }) => breakZ !== null && r.z1 <= breakZ + fdc.gearReach;
  const oneLevel = (r: { z0: number; z1: number }) => breakZ === null || onRaised(r) || r.z0 >= breakZ - fdc.gearReach;
  const raisedAhead = breakZ !== null && breakZ < foreEndAt;

  // 1. The stern gear.
  const sternRoller = !!d.sternRoller;
  if (sternRoller) taken.push({ x0: -0.3, x1: 0.3, z0: transom - 0.3, z1: transom }); // the roller in the transom bulwark
  for (const t of layout.deckSteps ?? []) taken.push({ x0: t.x0 - 0.1, x1: t.x1 + 0.1, z0: t.z0 - 0.1, z1: t.z1 + 0.1 }); // the ladders up to a raised foredeck
  // (The A-frame's warps lead off the tow winch, unless she has trawl winches of her own.)
  const wantWinch = !!(d.towWinch || (d.aFrame && !d.trawlWinches));
  const aFrameFeet: Rect[] = [];
  if (d.aFrame) {
    const fz = transom - afc.footFromTransom;
    const fx = q.halfBeam(fz) - afc.footInset;
    for (const sd of [-1, 1]) aFrameFeet.push({ x0: sd * fx - 0.2, x1: sd * fx + 0.2, z0: fz - 0.25, z1: fz + 0.25 });
    // Its rams' feet forward of them, and its control box's post inboard of the starboard foot.
    const rz = fz - afc.braceForward;
    for (const sd of [-1, 1]) aFrameFeet.push({ x0: sd * fx - 0.15, x1: sd * fx + 0.15, z0: rz - 0.15, z1: rz + 0.15 });
    aFrameFeet.push({ x0: fx - afc.box.inboard - 0.25, x1: fx - afc.box.inboard + 0.25, z0: fz - afc.box.forward - 0.4, z1: fz - afc.box.forward + 0.2 });
    taken.push(...aFrameFeet);
  }
  if ((d.netDrum || d.trawlWinches) && !d.aFrame) warnings.push(`The ${d.netDrum && d.trawlWinches ? 'net drum and trawl winches need' : d.netDrum ? 'net drum needs' : 'trawl winches need'} the trawl A-frame: left off.`);

  // Plan shapes, in a piece's own axes (x to its starboard, z aft), turned by its facing
  // (quarter turns, as the socket's yaw: -90 deg each) and set at (x, z).
  const turn = (lx: number, lz: number, face: number): [number, number] => {
    const a = (-Math.PI / 2) * face;
    return [lx * Math.cos(a) + lz * Math.sin(a), -lx * Math.sin(a) + lz * Math.cos(a)];
  };
  const placeRect = (r: Rect, x: number, z: number, face: number): Rect => {
    const pts = [turn(r.x0, r.z0, face), turn(r.x1, r.z0, face), turn(r.x0, r.z1, face), turn(r.x1, r.z1, face)];
    return { x0: x + Math.min(...pts.map((p) => p[0])), x1: x + Math.max(...pts.map((p) => p[0])), z0: z + Math.min(...pts.map((p) => p[1])), z1: z + Math.max(...pts.map((p) => p[1])) };
  };
  // Each piece's plan: the winch (drum, cheeks, housing; room to stand forward of it, the
  // side away from its lead), the crane (plinth; its post on its starboard side, aft, with
  // room to stand), a pole (the pole, its box aft, room to stand aft of that).
  const winchShape: Rect[] = [{ x0: -twc.drumWidth / 2 - 0.12, x1: twc.drumWidth / 2 + 0.1 + twc.housing.width, z0: -0.25 - dg.standRoom, z1: 0.25 }];
  const cranePlinth = cr.plinthRadius + 0.1;
  const craneShape = (postX: number, postZ: number): Rect[] => [
    { x0: -cranePlinth, x1: cranePlinth, z0: -cranePlinth, z1: cranePlinth },
    { x0: postX - 0.3, x1: postX + 0.3, z0: postZ - 0.5, z1: postZ + 0.5 },
  ];
  const poleShape: Rect[] = [{ x0: -dp.box.width / 2 - 0.05, x1: dp.box.width / 2 + 0.05, z0: -0.12, z1: dp.box.depth + 0.45 }];
  // The house in plan with a margin, and its door's steps aft.
  const dhW = deckhouse ? Math.max(...deckhouse.plan.map(([, w]) => w)) : 0;
  // (Across from its middle: a wheelhouse offset across her stands at `hx`; a deckhouse keeps it on her centreline.)
  /**
   * The aft end of what stands on her deck amidships: the wheelhouse's aft wall, or a deckhouse
   * run on aft of it (design.dhAft) and the ladder down its aft face. Gear on the aft deck keeps aft of it.
   */
  const aftEnd = deckhouse?.houseAft !== undefined ? deckhouse.z1 + (deckhouse.walk?.ladder.depth ?? 0) + 0.1 : aft;
  const houseRect: Rect = { x0: hx - Math.max(hw, dhW) - 0.3, x1: hx + Math.max(hw, dhW) + 0.3, z0: foreEndAt - 0.3, z1: Math.max(aft + 0.7, aftEnd + 0.3) };
  /** The forward end of what stands on her deck amidships: the deckhouse's front, or the wheelhouse's. */
  const foreEnd = foreEndAt;
  /**
   * Why a piece's plan won't stand on her deck there, in a few words (the Shipyard says it as you
   * move the piece over her: owner, Oct 2026, placing made easy); null if it stands.
   */
  const whyNotOnDeck = (rects: Rect[]): string | null => {
    for (const r of rects) {
      if (!oneLevel(r)) return 'across the break of her raised foredeck';
      if (r.z0 <= bowClear) return 'too near her bow';
      if (r.z1 >= transom - 0.15) return 'too near her transom';
      if (![r.z0, r.z1].every((z) => Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= q.halfBeam(z) - 0.15)) return 'over her side';
      if (overlaps(r, houseRect)) return 'against the wheelhouse';
      if (taken.some((o) => overlaps(o, r))) return 'on her other gear or a ladder';
    }
    return null;
  };
  const standsOnDeck = (rects: Rect[]) => whyNotOnDeck(rects) === null;

  // 1b. The trawl deck gear (owner, Oct 2026: step 2 toward a trawler), with the A-frame: the
  // trawl winches at the deck edges forward of its rams' feet, then the net drum on the
  // centreline forward of them; each moved forward in 10 cm steps until it stands clear.
  const tdg = dg.trawlWinches;
  const twm = CONFIG.modules.trawlWinches;
  const ndm = CONFIG.modules.netDrum;
  const ramZ = transom - afc.footFromTransom - afc.braceForward;
  let trawlWinchesAt: { x: number; z: number; deck: number } | null = null;
  if (d.aFrame && d.trawlWinches) {
    // (Its motor stands outboard of its base: the drum's half width, the cheek and the motor.)
    const outboard = twm.drumWidth / 2 + 0.21;
    for (let z = ramZ - 0.15 - tdg.gap - twm.base.length / 2; z > ramZ - tdg.search; z -= 0.1) {
      const x = q.halfBeam(z) - tdg.edge - outboard - 0.15;
      const rects = [-1, 1].map((sd): Rect => ({ x0: sd * x - Math.max(twm.base.width / 2, sd < 0 ? outboard : 0), x1: sd * x + Math.max(twm.base.width / 2, sd > 0 ? outboard : 0), z0: z - twm.base.length / 2 - 0.05, z1: z + twm.base.length / 2 + 0.05 }));
      if (x > 0.5 && standsOnDeck(rects)) {
        trawlWinchesAt = { x: r2(x), z: r2(z), deck: q.deckY(z) };
        taken.push(...rects);
        break;
      }
    }
    if (!trawlWinchesAt) warnings.push('There\'s no room at her deck edges forward of the A-frame for the trawl winches: left off (the warps lead off the tow winch).');
  }
  let netDrumAt: V3 | null = null;
  if (d.aFrame && d.netDrum) {
    const half = ndm.length / 2 + ndm.stand + 0.3;
    for (let z = ramZ - 0.15 - dg.netDrum.gap - ndm.flange; z > ramZ - dg.netDrum.search; z -= 0.1) {
      const rect: Rect = { x0: -half, x1: half, z0: z - ndm.flange - 0.05, z1: z + ndm.flange + 0.05 };
      if (standsOnDeck([rect])) {
        netDrumAt = [0, q.deckY(z), r2(z)];
        taken.push(rect);
        break;
      }
    }
    if (!netDrumAt) warnings.push('There\'s no room on her aft deck forward of the A-frame for the net drum: left off.');
  }
  // The roof: its edges, the masthead light's pole and the horn, and what's already on it.
  const roofTaken: [number, number, number][] = [
    [hx, roofFront + 0.475, 0.45],
    [hx, roofFront + 0.775, 0.3],
    // The deck floods (advanced controls).
    ...(d.controls ? ([at.floodFore, at.floodAft].map(([x, , z]) => [x, z, wl.flood.keepClear]) as [number, number, number][]) : []),
  ];
  const onRoof = (x: number, z: number) => Math.abs(x - hx) < hw && z > front && z < aft;
  // (Not on the step down to a lower saloon roof.)
  const standsOnRoof = (x: number, z: number) => Math.abs(x - hx) <= Math.min(hw - 0.2, hw + 0.15 - roofBack - 0.15) && z >= roofFront + 0.2 + sb(Math.abs(x - hx) + 0.2) && z <= aft - 0.2 && (!saloonRoof || Math.abs(z - saloonRoof.z) >= 0.3) && roofTaken.every(([ox, oz, r]) => Math.hypot(x - ox, z - oz) >= r);
  /** The pinned cell, or the nearest within a metre where `stands` (x, z: boat axes); null if none, and why not the pinned cell (`placeWhy`). */
  const seat = (key: PlaceKey, stands: (x: number, z: number, face: number) => boolean, why?: (x: number, z: number, face: number) => string | null): { x: number; z: number; face: number; moved: boolean } | null => {
    const p = placeOf(key, d[key]);
    if (!p) return null;
    placeWhy[key] = why?.(p.x, transom - p.fromTransom, p.face) ?? 'no room there';
    const ring: [number, number][] = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) ring.push([i, j]);
    ring.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [i, j] of ring) {
      const x = p.x + i * PLACE_GRID.step;
      const z = transom - (p.fromTransom + j * PLACE_GRID.step);
      if (stands(x, z, p.face)) {
        if (i === 0 && j === 0) delete placeWhy[key];
        return { x: r2(x), z: r2(z), face: p.face, moved: i !== 0 || j !== 0 };
      }
    }
    return null;
  };
  const placed: DesignedBoat['placed'] = {};
  /** Why a piece placed by hand won't stand where it was put (the pinned cell), if it won't. */
  const placeWhy: DesignedBoat['placeWhy'] = {};
  const usual = (key: PlaceKey, what: string) => {
    placed[key] = null;
    warnings.push(`The ${what} won't stand where it's pinned (nor within a metre of it): it's in its usual place.`);
  };

  // 2 and 3: the tow winch.
  let winchAt: V3 | null = null;
  let winchFace = 0;
  if (wantWinch && d.winchAt) {
    const s = seat('winchAt', (x, z, f) => standsOnDeck(winchShape.map((r) => placeRect(r, x, z, f))), (x, z, f) => whyNotOnDeck(winchShape.map((r) => placeRect(r, x, z, f))));
    if (s) {
      winchAt = [s.x, q.deckY(s.z), s.z];
      winchFace = s.face;
      placed.winchAt = { x: s.x, z: s.z, moved: s.moved };
    } else usual('winchAt', 'tow winch');
  }
  // A tug's towing hook (CONFIG.shipyard.deckGear.tug): her tow point near amidships, on a
  // pedestal on the centreline, clear aft of her wheelhouse; her winch's usual place just
  // forward of it, the line off the drum aft through the hook. Moved aft (both) until they
  // stand clear of the house's door and what's placed; no room on her deck, she tows from
  // the stern roller as other boats do.
  let towHook: { z: number; height: number } | null = null;
  let tugWinchZ: number | null = null;
  if (sternRoller && d.hull === TUG_HULL) {
    const tg = dg.tug.hook;
    const hookRect = (z: number): Rect => ({ x0: -0.3, x1: 0.3, z0: z - 0.3, z1: z + 0.3 });
    const winchHere = (z: number) => standsOnDeck(winchShape.map((r) => placeRect(r, 0, z, 0)));
    const usualWinch = wantWinch && !winchAt;
    // With her winch just forward of it if both fit; else (a small tug's short deck, owner,
    // Oct 2026) the hook alone, her winch finding its own place below.
    for (const withWinch of usualWinch ? [true, false] : [false]) {
      for (let z = Math.max((stem + transom) / 2 + tg.aftOfMidships * (transom - stem), aftEnd + tg.clearOfHouse); z < transom - 1.5; z += 0.1) {
        if (!standsOnDeck([hookRect(z)]) || (withWinch && !winchHere(z - tg.winchGap))) continue;
        towHook = { z: r2(z), height: tg.height };
        if (withWinch) tugWinchZ = r2(z - tg.winchGap);
        taken.push(hookRect(z));
        break;
      }
      if (towHook) break;
    }
    if (!towHook) warnings.push('There\'s no room on her deck for a towing hook aft of the wheelhouse: she tows from the stern roller.');
  }
  if (wantWinch && !winchAt && tugWinchZ !== null) winchAt = [0, q.deckY(tugWinchZ), tugWinchZ];
  if (wantWinch && !winchAt) {
    // Its usual place: on the centreline just forward of the transom, room forward of it to
    // stand at its buttons, clear of the house's door.
    const z = transom - dg.winchFromTransom;
    if (standsOnDeck(winchShape.map((r) => placeRect(r, 0, z, 0)))) winchAt = [0, q.deckY(z), r2(z)];
    else warnings.push(`Her aft deck is too short for the tow winch${d.aFrame && !trawlWinchesAt ? ' (the A-frame’s warps lead off it, so the A-frame is left off too)' : ''}: left off.`);
  }
  if (winchAt) taken.push(...winchShape.map((r) => placeRect(r, winchAt![0], winchAt![2], winchFace)));
  const aFrame = !!d.aFrame && (!!winchAt || !!trawlWinchesAt);

  // The deck crane: its socket where its column stands, so the crane module keeps it there
  // (placed by hand: 'socket'; at the deck edge: its 'auto' keeps an off-centre socket), and
  // the clash checks and its designed-in weight are where it really is. Its control post
  // stands inboard of it at the edge; placed by hand, on its own starboard side.
  let craneAt: V3 | null = null;
  let craneYaw = 0;
  let cranePlaced = false;
  if (d.deckCrane && d.craneAt) {
    const s = seat('craneAt', (x, z, f) => standsOnDeck(craneShape(cr.post.x, cr.post.z).map((r) => placeRect(r, x, z, f))), (x, z, f) => whyNotOnDeck(craneShape(cr.post.x, cr.post.z).map((r) => placeRect(r, x, z, f))));
    if (s) {
      craneAt = [s.x, q.deckY(s.z), s.z];
      craneYaw = -90 * s.face;
      cranePlaced = true;
      taken.push(...craneShape(cr.post.x, cr.post.z).map((r) => placeRect(r, s.x, s.z, s.face)));
      placed.craneAt = { x: s.x, z: s.z, moved: s.moved };
    } else usual('craneAt', 'deck crane');
  }
  if (d.deckCrane && !craneAt) {
    const fore = d.deckCrane === 1;
    const edgeShape = (z: number) => {
      const x = (fore ? 1 : -1) * (q.halfBeam(z) - cr.edgeInset);
      // At the edge its post stands inboard; the aft one faces aft (its boom resting over the aft deck, not the house).
      return { x, shape: craneShape(-Math.sign(x) * Math.abs(cr.post.x), (fore ? 1 : -1) * cr.post.z).map((r) => placeRect(r, x, z, 0)) };
    };
    // On the foredeck, just forward of the house; with a raised foredeck forward of the house,
    // up on it as near its break as it stands clear (else on the deck below it, as near the
    // house as it stands clear of the break and the ladders).
    let z = fore ? foreEnd - 0.9 : aftEnd + 0.9;
    let nowhere = false;
    if (fore && raisedAhead) {
      const clear = (zz: number, level: (r: Rect) => boolean) => zz - cr.plinthRadius - 0.3 > bowClear && edgeShape(zz).shape.every((r) => level(r) && !taken.some((o) => overlaps(o, r)));
      let found: number | null = null;
      for (let zz = breakZ!; zz - cr.plinthRadius - 0.3 > bowClear && found === null; zz -= 0.05) if (clear(zz, onRaised)) found = zz;
      if (found === null) {
        for (let zz = foreEnd - 0.9; zz > breakZ! && found === null; zz -= 0.05) if (clear(zz, (r) => r.z0 >= breakZ! - fdc.gearReach)) found = zz;
        if (found !== null) warnings.push('There\'s no room up on her raised foredeck for the deck crane: it stands on the deck below it, forward of the wheelhouse.');
      }
      if (found !== null) z = r2(found);
      else nowhere = true;
    }
    const { x, shape } = edgeShape(z);
    const room = fore ? z - cr.plinthRadius - 0.3 > bowClear : z + 0.4 < transom - 0.3;
    if (nowhere) warnings.push('There\'s no room on her foredeck for the deck crane, up on the raised foredeck or on the deck below it clear of its ladders: left off (a longer raised foredeck, or the wheelhouse further aft, makes room).');
    else if (!room) warnings.push(`There's no room on her ${fore ? 'foredeck' : 'aft deck'} for the deck crane: left off.`);
    else if (!shape.every(oneLevel)) warnings.push('The deck crane would stand across the break of her raised foredeck: left off.');
    else if (shape.some((r) => taken.some((o) => overlaps(o, r)))) warnings.push(`The deck crane would stand on her ${fore ? 'foredeck' : 'aft deck'} gear: left off.`);
    else {
      craneAt = [x, q.deckY(z), z];
      craneYaw = fore ? 0 : 180;
      taken.push(...shape);
    }
  }

  // The skiff in her cradle and its crane (owner; module deck.tender-crane, its socket the
  // foot of the column): the cradle forward of the column (as on the workboat's foredeck),
  // the column at its aft end to one side, the skiff going over that side. On the foredeck
  // the column just forward of the house, on the aft deck as far aft as it fits. The cradle
  // is off the centreline toward the crane's side, as the deck crane is (owner: not central;
  // the skiff and crane together over to the side picked), as far over as fits; only if
  // there's no room off the centreline does it sit nearer the middle.
  // (The dinghy's crane, or the rescue boat's bigger one: design.rescueBoat.)
  const tc = d.rescueBoat ? CONFIG.vessels.rib.crane : CONFIG.vessels.workboat.tenderCrane;
  const boatName = d.rescueBoat ? "the rescue boat's" : "the skiff's";
  let skiffAt: V3 | null = null;
  if (d.skiff) {
    const fore = d.skiff <= 2;
    const side = d.skiff % 2 === 1 ? 1 : -1;
    const ahead = tc.column[1] - tc.cradle.z0; // the cradle reaches this far forward of the column
    const outset = tc.column[0] - tc.stow[0]; // the column this far out from the cradle's middle
    const shape = (cx: number, cz: number): Rect[] => [
      { x0: cx - side * outset - tc.cradle.halfWidth - 0.1, x1: cx - side * outset + tc.cradle.halfWidth + 0.1, z0: cz - ahead - 0.1, z1: cz + (tc.cradle.z1 - tc.column[1]) + 0.1 },
      { x0: cx - 0.35, x1: cx + 0.35, z0: cz - 0.35, z1: cz + 0.35 },
    ];
    // Its own check (the cradle is long): inside her beam at each end and the middle, 0.5 m
    // clear of the stem and 0.15 of the transom, clear of the house itself and of its aft
    // doorway (and the steps there, if any), and of her other gear.
    const body: Rect = { x0: hx - Math.max(hw, dhW) - 0.2, x1: hx + Math.max(hw, dhW) + 0.2, z0: foreEnd - 0.2, z1: Math.max(aft, aftEnd) + 0.15 };
    const doorway: Rect = { x0: hx - 0.6, x1: hx + 0.6, z0: aft, z1: aft + 0.3 + Math.max(0, ...steps.map((st) => st.z1 - aft)) };
    const fits = (r: Rect) =>
      oneLevel(r) && r.z0 > stem + 0.5 && r.z1 < transom - 0.15 && [r.z0, (r.z0 + r.z1) / 2, r.z1].every((z) => Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= q.halfBeam(z) - 0.15) && !overlaps(r, body) && !overlaps(r, doorway) && !taken.some((o) => overlaps(o, r));
    let zs: number[] = [];
    if (fore) for (let z = foreEnd - 0.55; z - ahead > stem + 0.5; z -= 0.25) zs.push(z);
    else for (let z = transom - 0.5; z - ahead > aftEnd; z -= 0.25) zs.push(z);
    // With a raised foredeck forward of the house: up on it first, as near its break as fits;
    // on the deck below it only if there's no room up there.
    const up = (z: number) => shape(0, z).every(onRaised);
    if (fore && raisedAhead) zs = [...zs.filter(up), ...zs.filter((z) => !up(z))];
    // The cradle's middle shifted toward the column's side: as far over as fits (to 1.5 m),
    // at least `skiffOffset` off the centreline; nearer the middle only as a last resort.
    const least = CONFIG.shipyard.skiffOffset;
    const mids: number[] = [];
    for (let m = 1.5; m >= least - 1e-9; m -= 0.05) mids.push(Math.round(m * 100) / 100);
    const fallback = [0.2, 0.1, 0].filter((m) => m < least);
    search: for (const pass of [mids, fallback])
      for (const z of zs)
        for (const mid of pass) {
          const cx = side * (outset + mid);
          if (shape(cx, z).every(fits)) {
            skiffAt = [r2(cx), q.deckY(z), r2(z)];
            taken.push(...shape(cx, z));
            break search;
          }
        }
    if (skiffAt && fore && raisedAhead && !up(skiffAt[2])) warnings.push(`There's no room up on her raised foredeck for ${boatName} cradle: it's on the deck below it, forward of the wheelhouse.`);
    if (!skiffAt) warnings.push(`There's no room on her ${fore ? 'foredeck' : 'aft deck'} for ${boatName} cradle (${(ahead + 0.3).toFixed(1)} m long, ${(2 * tc.cradle.halfWidth + outset).toFixed(1)} m across with the crane) clear of her other gear: move the wheelhouse ${fore ? 'aft' : 'forward'}, or make her longer. Left off.`);
  }

  // The searchlight and the fire monitor: placed by hand, on the roof if the pin's on it
  // (clear of the masthead light, the horn and each other), else on a pole on deck; at their
  // usual places, on the roof (choice 1) or a pole a little off the house (2 fore, 3 aft).
  const roofOrPole = (key: 'lampAt' | 'monitorAt', what: string): { pole: V3 | null; roof: [number, number] | null } => {
    const s = seat(
      key,
      (x, z) => (onRoof(x, z) ? standsOnRoof(x, z) : standsOnDeck(poleShape.map((r) => placeRect(r, x, z, 0)))),
      (x, z) => (onRoof(x, z) ? (standsOnRoof(x, z) ? null : 'too near the roof’s edge, the masthead light or other gear on the roof') : whyNotOnDeck(poleShape.map((r) => placeRect(r, x, z, 0)))),
    );
    if (!s) {
      usual(key, what);
      return { pole: null, roof: null };
    }
    placed[key] = { x: s.x, z: s.z, moved: s.moved, onRoof: onRoof(s.x, s.z) };
    if (onRoof(s.x, s.z)) {
      roofTaken.push([s.x, s.z, 0.6]);
      return { pole: null, roof: [s.x, s.z] };
    }
    taken.push(...poleShape.map((r) => placeRect(r, s.x, s.z, 0)));
    return { pole: [s.x, q.deckY(s.z), s.z], roof: null };
  };
  const lampHand = d.searchlight && d.lampAt ? roofOrPole('lampAt', 'searchlight') : { pole: null, roof: null };
  const monitorHand = d.fireMonitor && d.monitorAt ? roofOrPole('monitorAt', 'fire monitor') : { pole: null, roof: null };
  const lampByHand = !!(lampHand.pole || lampHand.roof);
  const monitorByHand = !!(monitorHand.pole || monitorHand.roof);
  /** A pole's foot on deck 1 (fore) or 2 (aft), starting on `side`; null (and a warning) if there's no room. */
  /** The inboard edge of a raised foredeck's ladders, from her centreline (m); null without them. */
  const ladderIn = layout.deckSteps?.length ? Math.min(...layout.deckSteps.map((t) => Math.min(Math.abs(t.x0), Math.abs(t.x1)))) : null;
  const poleFoot = (deck: number, side: number, what: string): V3 | null => {
    // (Further forward, past a raised foredeck's ladders and up on it, if need be.)
    for (const step of breakZ === null ? [0, 1] : [0, 1, 2, 3])
      for (const sd of [side, -side]) {
        const z = deck === 1 ? foreEnd - dp.fromHouse - 0.85 * step : aftEnd + dp.fromHouse + 0.85 * step;
        const room = deck === 1 ? z - 0.2 > bowClear : z + dp.box.depth + 0.5 < transom - 0.2;
        if (!room) continue;
        // At the deck edge; else just inboard of a raised foredeck's ladders.
        const xs = [sd * (q.halfBeam(z) - dp.inset), ...(ladderIn === null ? [] : [sd * (ladderIn - 0.15 - dp.box.width / 2 - 0.05)])];
        for (const x of xs) {
          if (Math.abs(x) < 0.5) continue;
          const rect = placeRect(poleShape[0], x, z, 0);
          if (!oneLevel(rect) || taken.some((o) => overlaps(o, rect))) continue;
          taken.push(rect);
          return [r2(x), q.deckY(z), r2(z)];
        }
      }
    warnings.push(`There's no room on her ${deck === 1 ? 'foredeck' : 'aft deck'} for the ${what}'s pole: left off.`);
    return null;
  };
  const lampFoot = lampByHand ? lampHand.pole : d.searchlight >= 2 ? poleFoot(d.searchlight - 1, 1, 'searchlight') : null;
  const monitorFoot = monitorByHand ? monitorHand.pole : d.fireMonitor >= 2 ? poleFoot(d.fireMonitor - 1, -1, 'fire monitor') : null;
  const lampOnRoof = lampByHand ? !!lampHand.roof : d.searchlight === 1;
  const monitorOnRoof = monitorByHand ? !!monitorHand.roof : d.fireMonitor === 1;
  const hasLamp = lampOnRoof || !!lampFoot;
  const hasMonitor = monitorOnRoof || !!monitorFoot;

  // On the roof: the searchlight forward on the centreline, the monitor centred aft of the
  // masthead light's pole, clear of its barrel's swing; or where they're placed.
  const lampRoof: V3 = lampHand.roof ? [lampHand.roof[0], r2(roofTopAt(lampHand.roof[1]) + 0.13), lampHand.roof[1]] : at.searchlight;
  const monitorRoof: V3 = monitorHand.roof ? [monitorHand.roof[0], r2(roofTopAt(monitorHand.roof[1]) + 0.38), monitorHand.roof[1]] : [hx, roofTopAt(0) + 0.38, r2(Math.min(roofFront + 1.25, aft - 0.3))];
  /** Where a deck piece is, in words: "Foredeck, port", "Aft deck, centreline". */
  const deckWords = (p: V3) => `${p[2] < front ? 'Foredeck' : p[2] > aft ? 'Aft deck' : 'Side deck'}, ${Math.abs(p[0]) < 0.2 ? 'centreline' : p[0] < 0 ? 'port' : 'starboard'}`;

  // The fender basket (owner: the crew's fenders): on deck against the bulwark, aft to
  // starboard where the starting workboat's is, else the next clear spot (port, then just
  // aft of the house, then the foredeck). The fenders hang over the side at three stations
  // spread along her, each side, when they're out.
  const pc = CONFIG.shipyard.protection;
  let basketAt: [number, number] | null = null;
  // (A station where a deckhouse covers the deck by the bulwark, where they're stowed, moves
  // to the open deck just forward or aft of it, whichever is nearer: else they lay inside it.)
  const fenderZs = [0.3, 0.55, 0.825].slice(0, pc.fenders).map((f) => {
    const z = stem + f * (transom - stem);
    if (!deckhouse) return r2(z);
    const covered = z > deckhouse.z0 - 0.3 && z < deckhouse.z1 + 0.3 && q.halfBeam(z) - 0.25 < deckhouseHalfWidth(deckhouse, Math.min(Math.max(z, deckhouse.z0), deckhouse.z1)) + 0.15;
    if (!covered) return r2(z);
    const [fwd, back] = [deckhouse.z0 - 0.4, deckhouse.z1 + 0.4];
    return r2(z - fwd < back - z && fwd > stem + 1 ? fwd : back);
  });
  if (prot.fenders) {
    for (const [sd, z] of [[1, transom - 0.6], [-1, transom - 0.6], [1, aftEnd + 1.0], [-1, aftEnd + 1.0], [1, foreEnd - 0.6], [-1, foreEnd - 0.6]]) {
      const x = sd * (q.halfBeam(z) - 0.45);
      const rect = { x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25 };
      if (!standsOnDeck([rect])) continue;
      basketAt = [r2(x), r2(z)];
      taken.push(rect);
      break;
    }
    if (!basketAt) warnings.push('There\'s no clear deck for the fender basket: the fenders are left off.');
  }

  // The anchor, last, on what deck's left (owner; module deck.anchor-windlass, its socket the roller where the chain
  // leaves her): at the bow, its roller on the bulwark's top just aft of the stem and the
  // windlass on the deck behind it; on a ramp-bow boat (the ramp is her bow) a kedge on the
  // port quarter, the roller on the transom facing aft.
  const ac = dg.anchor;
  const awc = CONFIG.modules.anchorWindlass;
  let anchorAt: { at: V3; yaw: number } | null = null;
  if (!d.noAnchor) {
    const z = bowRamp ? transom - 0.05 : stem + ac.fromStem;
    // The kedge on the port quarter, else the starboard, else along the transom toward the
    // middle, last on the centreline (if no stern roller's there), wherever there's room.
    const xs: number[] = [];
    const outer = q.halfBeam(transom - 0.3) - ac.fromSide;
    for (let k = outer; k >= 0.6; k -= 0.25) xs.push(-k, k);
    if (!sternRoller) xs.push(0);
    for (const x of bowRamp ? xs : [0]) {
      // The roller and the windlass behind it (forward of it, for the kedge), with room to work it.
      const rect: Rect = bowRamp ? { x0: x - 0.25, x1: x + 0.25, z0: z - ac.kedgeAft - 0.15, z1: z } : { x0: -0.25, x1: 0.25, z0: z, z1: z + awc.aft + 0.15 };
      // Clear of the house and of its aft door's steps (only the doorway: the margin the
      // other gear keeps round the house is more than a windlass needs).
      const clearOfHouse = !overlaps(rect, { ...houseRect, z1: aft + 0.15 }) && !overlaps(rect, { x0: hx - 0.6, x1: hx + 0.6, z0: aft, z1: aft + 0.8 });
      if (!clearOfHouse || taken.some((o) => overlaps(o, rect))) continue;
      anchorAt = { at: [r2(x), r2(q.bulwarkTop(z)), r2(z)], yaw: bowRamp ? 180 : 0 };
      taken.push(rect);
      break;
    }
    if (!anchorAt) warnings.push(`There's no room for the anchor's windlass ${bowRamp ? 'along her transom (clear of the stern gear)' : 'behind her bow roller (clear of the deckhouse)'}: left off.`);
  }


  // The places on deck (P4b): each piece of deck gear where it stands, the cleats on the bulwark tops.
  const deckSockets: Socket[] = [
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
          { id: 'trawl', type: 'deck.equipment' as const, transform: { position: netDrumAt ?? winchAt ?? [0, q.deckY(transom - 1), transom - 1] }, label: 'Aft deck: the net (nominal)' },
          ...(netDrumAt ? [{ id: 'netDrum', type: 'deck.equipment' as const, transform: { position: netDrumAt }, label: 'Aft deck, centreline, forward of the A-frame: the net drum' }] : []),
          ...(trawlWinchesAt ? [{ id: 'trawlWinches', type: 'deck.equipment' as const, transform: { position: [trawlWinchesAt.x, trawlWinchesAt.deck, trawlWinchesAt.z] as V3 }, label: 'Aft deck, at her edges forward of the A-frame: the trawl winches (starboard; port its mirror)' }] : []),
        ]
      : []),
    ...(craneAt
      ? [
          // The aft one faces aft (its boom rests over the aft deck, not the house).
          { id: 'deckCrane', type: 'deck.equipment' as const, transform: { position: craneAt, ...(craneYaw ? { rotationDeg: [0, craneYaw, 0] as V3 } : {}) }, capacity: { loadRatingKg: 1000 }, label: cranePlaced ? `${deckWords(craneAt)}: the deck crane` : d.deckCrane === 1 ? 'Foredeck, starboard edge: the deck crane' : 'Aft deck, port edge: the deck crane' },
        ]
      : []),
    // Hull protection: the fender basket on deck; the strake or tyres along her sides.
    ...(basketAt ? [{ id: 'fenders', type: 'deck.fitting' as const, transform: { position: [basketAt[0], q.deckY(basketAt[1]), basketAt[1]] as V3 }, label: `${deckWords([basketAt[0], 0, basketAt[1]])}: the fender basket` }] : []),
    // The deck hydraulics' pump on the engine's power take-off, for the crane and the winch.
    ...(anchorAt ? [{ id: 'anchor', type: (bowRamp ? 'deck.equipment' : 'bow.windlass') as 'deck.equipment', transform: { position: anchorAt.at, rotationDeg: [0, anchorAt.yaw, 0] as V3 }, label: bowRamp ? 'The stern roller for the kedge anchor, port quarter' : 'The bow roller and the windlass behind it' }] : []),
    ...(skiffAt ? [{ id: 'tenderCrane', type: 'deck.equipment' as const, transform: { position: skiffAt }, label: 'The skiff crane\'s column (her cradle forward of it)' }] : []),
  ];
  return { towHook, deckSockets, aFrame, netDrumAt: aFrame ? netDrumAt : null, trawlWinchesAt: aFrame ? trawlWinchesAt : null, ac, afc, anchorAt, basketAt, cr, craneAt, cranePlaced, craneYaw, deckWords, dg, dhW, dp, fenderZs, freeboard, hasLamp, hasMonitor, lampFoot, lampHand, lampOnRoof, lampRoof, monitorFoot, monitorOnRoof, monitorRoof, pc, placed, placeWhy, r2, skiffAt, sternRoller, taken, weighed, winchAt, winchFace };
}
export type DeckGearPart = ReturnType<typeof deckGearPart>;

/** What hangs on the wheelhouse outside: the life ring and the boat-hook clips, the fishing rods' rack. */
export function houseGearPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart) {
  const { d } = a;
  const { F, FA, aft, bulwarkHeight, cleat, deckhouse, dg, front, hw, hx, q, r2, sideDoor, sill, sternCleat, warnings } = p;
  // The life ring on the house's aft wall at the chosen side, its line made fast to that
  // quarter's cleat; the boat-hook clips along that bulwark, aft.
  const ringSide = d.lifeRing === 1 ? -1 : d.lifeRing === 2 ? 1 : 0;
  // The aft wall the ring and the rod rack go on: the house's, or a deckhouse's run on aft of it (design.dhAft).
  const aftWall = deckhouse?.houseAft !== undefined ? deckhouse.z1 + 0.02 : aft;
  // Clear of a stair across that face (house.ts transverseStair): `half` either side of x, moved
  // beyond its foot, or past its landing to port if there's no room there.
  const stair = deckhouse?.walk?.stair;
  const offStair = (x: number, half: number) => {
    if (!stair) return x;
    const [s0, s1] = [Math.min(...stair.map((t) => t.x0)), Math.max(...stair.map((t) => t.x1))];
    if (x + half < s0 - 0.1 || x - half > s1 + 0.1) return x;
    const room = deckhouseHalfWidth(deckhouse!, deckhouse!.z1) - 0.1;
    return s1 + 0.1 + half <= room ? s1 + 0.1 + half : s0 - 0.1 - half;
  };
  const ring = ringSide
    ? {
        // At hand height off the deck (on the deckhouse's aft face if she has one, the house's floor being up on it).
        // (Across from the house's middle: an offset house's, `hx`.)
        stow: [r2(offStair(hx + ringSide * Math.max(0.75, hw - dg.ringFromCorner), 0.4)), r2(deckhouse?.houseAft !== undefined ? q.deckY(aftWall) + 1.15 : Math.min((deckhouse ? q.deckY(aft) : FA) + 1.15, F + sill - 0.3)), r2(aftWall + 0.06)] as V3,
        cleat: cleat(ringSide, sternCleat),
        hook: [r2(ringSide * (q.halfBeam(sternCleat - 1.2) - 0.08)), r2(q.deckY(sternCleat - 1.2) + bulwarkHeight - 0.05), r2(Math.max(aft + 0.2, sternCleat - 2.6)), r2(sternCleat - 0.3)] as [number, number, number, number],
      }
    : null;
  // The rod rack (owner, Oct 2026; design.rodRack: 1 aft wall port, 2 aft wall starboard, 3
  // port wall, 4 starboard wall): CONFIG.rod.perRack rods standing upright in cups on the deck
  // against the wall, spaced along it, the bucket on deck at the end of the row. A side wall
  // needs a side deck to stand on (0.25 m: the cups are against the wall) and a port wall its
  // door clear: no room, the aft wall.
  const rc = CONFIG.rod;
  const rackRow = rc.spacing * (rc.perRack - 1);
  let rodRack: { rods: V3[]; yawDeg: number; bucket: V3; side: -1 | 1 } | null = null;
  if (d.rodRack) {
    const rodSide: -1 | 1 = d.rodRack === 1 || d.rodRack === 3 ? -1 : 1;
    let onSide = d.rodRack >= 3;
    // The side wall: the row's middle, aft of the door if the port door is there.
    let zc = aft - 0.9 - rackRow / 2;
    if (onSide && rodSide < 0 && sideDoor && zc - rackRow / 2 - 0.3 < sideDoor.z1 && zc + rackRow / 2 + 0.3 > sideDoor.z0) zc = sideDoor.z0 - 0.4 - rackRow / 2;
    // (Its side deck: from that wall, `hx` across from her centreline, out to her deck edge.)
    if (onSide && (q.halfBeam(zc) - hw - rodSide * hx < 0.25 || zc - rackRow / 2 < front + 0.2)) {
      warnings.push(`No room on the ${rodSide < 0 ? 'port' : 'starboard'} side deck for the rod rack: it's on the aft wall.`);
      onSide = false;
    }
    const rods: V3[] = [];
    if (onSide) {
      const x = hx + rodSide * (hw + 0.09);
      for (let i = 0; i < rc.perRack; i++) rods.push([r2(x), r2(q.deckY(zc) + 0.02), r2(zc - rackRow / 2 + i * rc.spacing)]);
      rodRack = { rods, yawDeg: rodSide * 90, bucket: [r2(hx + rodSide * (hw + 0.25)), r2(q.deckY(zc + rackRow / 2 + 0.45)), r2(zc + rackRow / 2 + 0.45)], side: rodSide };
    } else {
      const xc = offStair(hx + rodSide * Math.max(0.55 + rackRow / 2, hw - 0.3 - rackRow / 2), rackRow / 2 + 0.5);
      const y = r2(q.deckY(aftWall + 0.1) + 0.02);
      for (let i = 0; i < rc.perRack; i++) rods.push([r2(xc - rodSide * rackRow / 2 + rodSide * i * rc.spacing), y, r2(aftWall + 0.09)]);
      rodRack = { rods, yawDeg: 0, bucket: [r2(xc + rodSide * (rackRow / 2 + 0.4)), r2(q.deckY(aftWall + 0.3)), r2(aftWall + 0.3)], side: rodSide };
    }
  }
  // The places on the house outside (P4b): the life ring and the boat-hook clips, the rod rack.
  const houseGearSockets: Socket[] = [
    ...(rodRack ? [{ id: 'rodRack', type: 'deck.fitting' as const, transform: { position: rodRack.rods[0] }, label: `Wheelhouse ${rodRack.yawDeg ? (rodRack.side < 0 ? 'port' : 'starboard') : 'aft'} wall${rodRack.yawDeg ? '' : rodRack.side < 0 ? ', port of the door' : ', starboard of the door'}: the fishing rods' rack, the bucket beside it` }] : []),
    ...(ring
      ? [
          { id: 'lifeRing', type: 'deck.fitting' as const, transform: { position: ring.stow }, label: `Wheelhouse aft wall, ${ringSide < 0 ? 'port' : 'starboard'}: the life ring (its line on that quarter's cleat)` },
          { id: 'boatHook', type: 'deck.fitting' as const, transform: { position: [ring.hook[0], ring.hook[1], ring.hook[2]] as V3 }, label: `${ringSide < 0 ? 'Port' : 'Starboard'} bulwark, aft: the boat-hook clips` },
        ]
      : []),
  ];
  return { houseGearSockets, ring, ringSide, rodRack };
}
export type HouseGearPart = ReturnType<typeof houseGearPart>;
