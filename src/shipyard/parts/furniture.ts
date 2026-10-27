/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): her furniture
 * (parametric boats P5; owner: "berth, settee, galley run, seat, locker, head with a door:
 * placed on a floor level, each a furniture part with its footprint for walking").
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import { lightshipOf, type PointMass } from '../../modular/massProperties';
import type { Mount } from '../../modular/recipe';
import type { Socket } from '../../modular/socket';
import type { FurnitureConfig, FurnitureKind } from '../../modules/furniture';
import { planHalfWidth } from '../../vessel/vesselDef';
import { FURNITURE_SLOTS, furnitureAt, SEAT_FACES, seatYawDeg, type FurnitureKey } from '../design';
import type { BuildArgs, V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, InteriorPart } from './house';
import type { HullDefPart } from './hullDef';
import type { EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';

/** A floor furniture can stand on: its name, its height, its extent along her, its half width at z (inside its walls), its ceiling at z, and whether its aft end is a wall. */
interface Floor {
  name: string;
  y: number;
  z0: number;
  z1: number;
  half: (z: number) => number;
  ceiling: (z: number) => number;
  aftWall: boolean;
}

/** A seat's facing in words (design.seatFace: 45 degree steps clockwise from forward). */
const FACINGS = ['forward', 'forward to starboard', 'to starboard', 'aft to starboard', 'aft', 'aft to port', 'to port', 'forward to port'];

/** A rectangle in plan (the boat's x and z). */
type Rect = [number, number, number, number];
const overlaps = (a: Rect, b: Rect) => a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];

/**
 * The pieces, in the order they're placed (the biggest first; of a kind, the first placed
 * first), their field, their place's id and their name in words: "the berth", the second
 * one "berth 2" (furnitureSocketId, furnitureName).
 */
const PIECES: { kind: FurnitureKind; key: FurnitureKey; id: string; name: string }[] = (['head', 'shower', 'locker', 'bunk', 'galley', 'mess', 'settee', 'berth', 'seat', 'tv'] as const).flatMap((kind) =>
  FURNITURE_SLOTS[kind].map((key, i) => ({ kind, key, id: furnitureSocketId(kind, i), name: furnitureName(kind, i) })),
);
/** A piece's place id: furniture.berth for the first, furniture.berth2 for the second. */
export function furnitureSocketId(kind: FurnitureKind, i: number): string {
  return `furniture.${kind}${i ? i + 1 : ''}`;
}
/** A piece's name in words: berth, berth 2 (a TV: TV, TV 2). */
export function furnitureName(kind: FurnitureKind, i: number): string {
  return `${kind === 'tv' ? 'TV' : kind}${i ? ` ${i + 1}` : ''}`;
}

/**
 * Her furniture, each piece where its pin is: on the floor the pin lands on (the wheelhouse's,
 * the saloon's a step or more down, or the cabin below's sole), with its back to the wall of
 * that floor nearest the pin (port, starboard or aft; the seat stands free, facing forward),
 * along it as near the pin as it fits. It keeps clear of the console and the helm's standing
 * room, the doorways, the side door, the chart table, the companionway, an engine hatch in the
 * floor, the exhaust stacks, the panels on the wall by the helm (the breakers and the helm
 * assist: owner, 27 Oct 2026, the solar catamaran's head stood over the breakers), and the
 * pieces placed before it (CONFIG.shipyard.furniture). If
 * it fits nowhere along either wall within reach of its pin, it's left off and she says why.
 * The head and the locker stand to just under the ceiling. Each is a furniture.piece module on
 * a place of its own (P4b): her hull definition gets the places, her recipe the modules.
 */
export function furniturePart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & EngineHatchPart & InteriorPart & HullDefPart & PlacesPart) {
  const { d } = a;
  const { at, helmAssist, FA, aft, cf, chartTableAt, ctab, cx, floorY, helmAft, hull, hw, hx, layout, levels, roofAt, saloonL, sb, sideDoor, stack, transom, warnings, wall } = p;
  const fc = CONFIG.shipyard.furniture;
  const mf = CONFIG.modules.furniture;
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  // ── Her floors ──
  const inside = hw - wall;
  const houseFloor = (name: string, y: number, z0: number, z1: number, aftWall: boolean): Floor => ({ name, y, z0, z1, half: () => inside, ceiling: (z) => roofAt(z), aftWall });
  const consoleAft = cf + sb(inside) + 0.5;
  const floors: Floor[] = [];
  if (levels.length) {
    floors.push(houseFloor('the wheelhouse', floorY, consoleAft, helmAft, false));
    floors.push(houseFloor('the saloon', FA, levels[levels.length - 1].z0, aft - wall, true));
  } else floors.push(houseFloor(saloonL ? 'the wheelhouse and saloon' : 'the wheelhouse', floorY, consoleAft, aft - wall, true));
  const cabin = layout.cabin;
  if (cabin) {
    // The sole: aft of the V-berth, forward of the foot of the companionway.
    const z0 = cabin.berth ? cabin.berth.z1 : cabin.z0;
    floors.push({ name: 'the cabin below', y: cabin.sole, z0, z1: cabin.stair.z0, half: (z) => planHalfWidth(cabin.plan, z), ceiling: (z) => (z < cabin.ceiling.front ? cabin.ceiling.trunk : cabin.ceiling.house), aftWall: false });
  }
  // ── What's in the way (in plan), on the wheelhouse's floors (`house`) or the cabin's sole ──
  // (`tall`: in the way of a TV on the wall over it too: a doorway, a piece to the ceiling, another TV.
  // A TV hangs over the rest: a settee, a berth, the chart table.)
  const blocked: { rect: Rect; house: boolean; tall?: boolean }[] = [];
  const inHouse = (...rects: Rect[]) => blocked.push(...rects.map((rect) => ({ rect, house: true })));
  // The helm's standing room behind the console, and the aft door's way in (and its steps inside).
  inHouse([cx - fc.helmRoom.halfWidth, cx + fc.helmRoom.halfWidth, cf, cf + 0.5 + fc.helmRoom.depth]);
  blocked.push({ rect: [-fc.doorWay.halfWidth, fc.doorWay.halfWidth, aft - wall - fc.doorWay.depth, aft + 0.1], house: true, tall: true });
  if (sideDoor) blocked.push({ rect: [-inside - 0.1, -inside + fc.doorWay.depth, sideDoor.z0 - 0.15, sideDoor.z1 + 0.15], house: true, tall: true });
  // (Laid out in the house's own frame: what's in her axes, the chart table and the hatch, taken across into it; housePart `hx`.)
  if (chartTableAt) inHouse([chartTableAt[0] - hx, chartTableAt[0] - hx + ctab.width + fc.chartRoom, chartTableAt[2] - 0.05, chartTableAt[2] + ctab.depth + 0.05]);
  for (const h of layout.wheelhouse?.floorHoles ?? []) inHouse([h.x0 - fc.holeClear, h.x1 + fc.holeClear, h.z0 - fc.holeClear, h.z1 + fc.holeClear + 0.4]);
  const eh = layout.engineHatch;
  if (eh && eh.y === undefined) inHouse([eh.x0 - hx - 0.1, eh.x1 - hx + 0.1, eh.z0 - 0.1, eh.z1 + 0.1]);
  for (const pipe of stack?.pipes ?? []) blocked.push({ rect: [pipe.x - 0.3, pipe.x + 0.3, pipe.z - 0.3, pipe.z + 0.3], house: true, tall: true });
  // The panels on the wall by the helm (in the house's frame), and room to stand at them: the
  // breakers, and the helm assist aft of them, on the starboard wall.
  const panel = (z: number, width: number) => blocked.push({ rect: [inside - fc.panelRoom, inside + 0.1, z - width / 2 - 0.05, z + width / 2 + 0.05], house: true, tall: true });
  panel(at.breakerPanel[2], CONFIG.modules.breakerPanel.width);
  if (helmAssist) panel(at.helmAssist[2], CONFIG.modules.helmAssist.width);

  const furnitureSockets: Socket[] = [];
  const furnitureMounts: Mount[] = [];
  /** Where each piece went (boat axes), and whether off its pin; null: left off. */
  const furniturePlaced: Partial<Record<FurnitureKey, { x: number; z: number; moved: boolean } | null>> = {};
  /** Why a piece left off won't go where it was put, in a few words. */
  const furnitureWhy: Partial<Record<FurnitureKey, string>> = {};
  let furnitureKg = 0;
  const furnitureMasses: PointMass[] = [];
  for (const piece of PIECES) {
    const pin = furnitureAt(d[piece.key] ?? 0);
    if (!pin) continue;
    // (Its pin in her axes; the house's floors in its own frame: an offset house's, across from its middle.)
    const px = pin.x - hx;
    const pz = transom - pin.fromTransom;
    const floor = floors.find((f) => pz >= f.z0 - 0.3 && pz <= f.z1 + 0.3 && Math.abs(px) <= f.half(Math.min(f.z1, Math.max(f.z0, pz))) + 0.3);
    if (!floor) {
      warnings.push(`The ${piece.name}'s pin isn't inside the wheelhouse${saloonL ? ', the saloon' : ''}${cabin ? ' or the cabin below' : ''}: left off.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = `not inside the wheelhouse${saloonL ? ', the saloon' : ''}${cabin ? ' or the cabin below' : ''}`;
      continue;
    }
    const size = mf[piece.kind];
    const [L, D] = [size.length, size.depth];
    // A seat turns (design.seatFace...: 45 degree steps): its plan the square round it, turned.
    const face = piece.kind === 'seat' ? (d[SEAT_FACES[FURNITURE_SLOTS.seat.indexOf(piece.key)]] ?? 0) % 8 : 0;
    const [pL, pD] = face % 2 ? [(L + D) / Math.SQRT2, (L + D) / Math.SQRT2] : face % 4 === 2 ? [D, L] : [L, D];
    if (piece.kind !== 'seat' && L > floor.z1 - floor.z0 && !floor.aftWall) {
      warnings.push(`The ${piece.name} is longer (${L.toFixed(2)} m) than ${floor.name}'s floor has room for (${(floor.z1 - floor.z0).toFixed(2)} m): left off.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = `longer than ${floor.name}'s floor`;
      continue;
    }
    // Its back against which wall: the nearest of port, starboard and (if it's a wall) aft; the seat stands free.
    type Wall = 'port' | 'starboard' | 'aft' | 'free';
    const halfAt = floor.half(Math.min(floor.z1, Math.max(floor.z0, pz)));
    const walls: Wall[] = piece.kind === 'seat' ? ['free'] : (['port', 'starboard', ...(floor.aftWall ? (['aft'] as const) : [])] as Wall[]).sort((u, v) => dist(u) - dist(v));
    function dist(w: Wall): number {
      return w === 'port' ? px + halfAt : w === 'starboard' ? halfAt - px : w === 'aft' ? floor!.z1 - pz : 0;
    }
    /** Its plan against a wall, centred `c` along it (z for a side wall, x for the aft wall). */
    const rectAt = (w: Wall, c: number): Rect | null => {
      if (w === 'aft') {
        const x0 = c - L / 2;
        if (x0 < -floor.half(floor.z1) || x0 + L > floor.half(floor.z1)) return null;
        return [x0, x0 + L, floor.z1 - D, floor.z1];
      }
      const z0 = (w === 'free' ? pz : c) - (w === 'free' ? pD : L) / 2;
      const z1 = z0 + (w === 'free' ? pD : L);
      if (z0 < floor.z0 || z1 > floor.z1) return null;
      const half = Math.min(floor.half(z0), floor.half(z1), floor.half((z0 + z1) / 2));
      if (w === 'free') {
        const x0 = Math.max(-half, Math.min(half - pL, c - pL / 2));
        return x0 < -half ? null : [x0, x0 + pL, z0, z1];
      }
      return w === 'port' ? [-half, -half + D, z0, z1] : [half - D, half, z0, z1];
    };
    const onHouse = floor !== floors.find((f) => f.name === 'the cabin below');
    const tv = piece.kind === 'tv';
    const clear = (r: Rect) => !blocked.some((b) => b.house === onHouse && (!tv || b.tall) && overlaps(r, b.rect));
    let found: { wall: Wall; rect: Rect } | null = null;
    for (const w of walls) {
      const along = w === 'aft' ? px : w === 'free' ? px : pz;
      // As near the pin as it fits, sliding along the wall up to `reach` each way.
      for (let k = 0; k <= Math.round(fc.reach / 0.05) && !found; k++) {
        for (const s of k ? [1, -1] : [1]) {
          const r = rectAt(w, along + s * k * 0.05);
          if (r && clear(r)) {
            found = { wall: w, rect: r };
            break;
          }
        }
      }
      if (found) break;
    }
    if (!found) {
      warnings.push(`There's no room for the ${piece.name} in ${floor.name} near its pin (clear of the helm, the doorways and what's there already): left off.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = 'no room here, clear of the helm, the doorways and what’s there already';
      continue;
    }
    const [x0, x1, z0, z1] = found.rect;
    const mid: V3 = [r2((x0 + x1) / 2), r2(floor.y), r2((z0 + z1) / 2)];
    // The head and the locker stand to just under the ceiling.
    const ceiling = Math.min(floor.ceiling(z0), floor.ceiling(z1), floor.ceiling(mid[2])) - floor.y;
    if ((piece.kind === 'head' || piece.kind === 'shower') && ceiling < fc.headroom) {
      warnings.push(`There's only ${ceiling.toFixed(2)} m of headroom for the ${piece.name} in ${floor.name} (${fc.headroom} m at least): left off.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = `only ${ceiling.toFixed(2)} m of headroom here`;
      continue;
    }
    // Two-high bunks want room to sit up in the top one.
    const bunkRoom = mf.bunk.upper + mf.bunk.cushion + mf.bunk.sitUp;
    if (piece.kind === 'bunk' && ceiling < bunkRoom) {
      warnings.push(`There's only ${ceiling.toFixed(2)} m under the ceiling in ${floor.name} for the ${piece.name} (${bunkRoom.toFixed(2)} m to sit up in the top one): left off. A berth fits lower.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = `only ${ceiling.toFixed(2)} m under the ceiling here (a berth fits lower)`;
      continue;
    }
    // A TV's height is its middle's over the floor: its own, or lower to clear a low ceiling.
    const tvMid = Math.min(mf.tv.centre, ceiling - mf.tv.screenH / 2 - fc.tvCeiling);
    if (tv && tvMid - mf.tv.screenH / 2 < fc.tvLowest) {
      warnings.push(`There's only ${ceiling.toFixed(2)} m of headroom for the ${piece.name} in ${floor.name}: left off.`);
      furniturePlaced[piece.key] = null;
      furnitureWhy[piece.key] = `only ${ceiling.toFixed(2)} m of headroom here`;
      continue;
    }
    const height = r2(tv ? tvMid : piece.kind === 'head' || piece.kind === 'locker' || piece.kind === 'shower' ? ceiling - mf.ceilingGap : piece.kind === 'berth' ? mf.berth.top + mf.berth.cushion : piece.kind === 'settee' ? mf.settee.back : piece.kind === 'galley' ? mf.galley.top : piece.kind === 'bunk' ? mf.bunk.upper + mf.bunk.cushion + mf.bunk.rail : piece.kind === 'mess' ? mf.mess.back : mf.seat.back);
    // Its turn: its back (+z its axes) to the wall.
    // (A seat as it's turned: design.seatFace.)
    const yaw = found.wall === 'starboard' ? 90 : found.wall === 'port' ? -90 : piece.kind === 'seat' ? seatYawDeg(face) : 0;
    blocked.push({ rect: [x0 - 0.02, x1 + 0.02, z0 - 0.02, z1 + 0.02], house: onHouse, tall: tv || piece.kind === 'head' || piece.kind === 'shower' || piece.kind === 'locker' || piece.kind === 'bunk' });
    const id = piece.id;
    const where = `${floor.name[0].toUpperCase()}${floor.name.slice(1)}, ${found.wall === 'free' ? `standing free, facing ${FACINGS[face]}` : `against the ${found.wall} wall`}`;
    const put: V3 = [r2(mid[0] + hx), mid[1], mid[2]];
    furnitureSockets.push({ id, type: 'cabin.furniture', transform: { position: put, rotationDeg: [0, yaw, 0] }, label: `${where}: the ${piece.name}` });
    const config: FurnitureConfig = { kind: piece.kind, length: L, depth: D, height };
    furnitureMounts.push({ socket: id, module: 'furniture.piece', config: config as unknown as Record<string, unknown> });
    furnitureKg += size.kg;
    furnitureMasses.push({ massKg: size.kg, at: [put[0], r2(mid[1] + height / 2), put[2]] });
    // Moved: along its wall (put back against the wall it's always; a free seat, any way).
    const off = found.wall === 'free' ? Math.hypot(mid[0] - px, mid[2] - pz) : found.wall === 'aft' ? Math.abs(mid[0] - px) : Math.abs(mid[2] - pz);
    furniturePlaced[piece.key] = { x: put[0], z: mid[2], moved: off > fc.movedOver };
  }
  // The cabin below's V-berth (drawn with her, hullMesh.ts): a place to lie down in it and rest
  // (owner, Oct 2026: "the berth ... in the cabin which appears under the wheelhouse"; modules/furniture REST_SPOT).
  if (cabin?.berth) {
    const zm = (cabin.z0 + cabin.berth.z1) / 2;
    const id = 'furniture.cabinBerth';
    furnitureSockets.push({ id, type: 'cabin.furniture', transform: { position: [0, r2(cabin.berth.top), r2(zm)], rotationDeg: [0, 90, 0] }, label: 'The cabin below: the V-berth' });
    const spot = { length: r2(cabin.berth.z1 - cabin.z0), width: r2(1.6 * planHalfWidth(cabin.plan, zm)), top: 0 };
    furnitureMounts.push({ socket: id, module: 'furniture.restSpot', config: spot });
  }
  // Her places include the furniture's (P4b: gathered into her hull definition).
  hull.sockets.push(...furnitureSockets);
  // Each piece weighs itself in the game (modules/furniture `physical`): her lightship, weighed
  // with it (weights.ts), is without it, as with her engines (hullDef.ts lightshipLess); else
  // she'd carry its weight twice.
  if (furnitureMasses.length) hull.lightship = lightshipOf(hull.lightship, furnitureMasses);
  return { furnitureKg, furnitureMounts, furniturePlaced, furnitureWhy };
}
export type FurniturePart = ReturnType<typeof furniturePart>;
