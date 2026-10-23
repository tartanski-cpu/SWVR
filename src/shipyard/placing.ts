/**
 * Placing gear and furniture on her by pointing (owner, Oct 2026: "people need an easy way to
 * place and move equipment"; the pins it went on before left warnings and pins all over).
 * Pick a piece, and a see-through copy of it follows the pointer over her: green where it
 * will stand, red where it won't, with a few words why; click to put it there. Nothing is
 * written anywhere until it's put down, and it's never put where it won't stand.
 *
 * What "will stand" means is the builder's own answer, not a second set of rules: each spot is
 * tried by building her with the piece there (build.ts buildDesign, about 40 ms), and the
 * builder says where it stood (`placed`: on the spot, or moved up to a metre to stand clear),
 * or why it won't (`placeWhy`), or (the skiff, the life ring, the rods) whether its socket was
 * made. The page asks again only when the pointer reaches a new 25 cm cell, and keeps the
 * answers until the design changes.
 *
 * Pure: the page gives the design, the point (boat axes, m) and her house and transom.
 */
import { CONFIG } from '../config';
import type { DesignedBoat } from './build';
import { furnitureSocketId } from './parts/furniture';
import { placeFurniture, slotOf } from './furnishing';
import { placeGear, type Equipment, type HouseBox } from './pinGear';
import { placeOf, placeValue, PLACE_GRID, type FurnitureKey, type ShipDesign } from './design';

/** What's being placed: a piece of deck gear, or a piece of furniture (its field). */
export type Target = { kind: 'gear'; eq: Equipment } | { kind: 'furniture'; key: FurnitureKey };

export interface Preview {
  /** The design change that puts it there (on the cell it took, if it moved to stand clear). */
  patch: Partial<ShipDesign>;
  /** Will it stand there? */
  ok: boolean;
  /** Where it stands (boat axes, m): where it would go, or (not ok) the point asked. */
  at: [number, number, number];
  /** Its turn about the vertical (deg), as its socket's. */
  yawDeg: number;
  /** In a few words: why not, or that it moved to stand clear (empty if it stands right there). */
  words: string;
}

/** The socket a piece of gear is drawn on (its own id, but the skiff's crane). */
export const gearSocketId = (eq: Equipment): string => (eq.id === 'skiff' ? 'tenderCrane' : eq.id);

/** The socket a target is drawn on. */
export function socketIdOf(t: Target): string {
  if (t.kind === 'gear') return gearSocketId(t.eq);
  const { kind, i } = slotOf(t.key);
  return furnitureSocketId(kind, i);
}

/** Where a piece is on her now (its socket), or null. */
export function whereIs(boat: DesignedBoat, t: Target): { at: [number, number, number]; yawDeg: number } | null {
  const s = boat.hull.sockets.find((x) => x.id === socketIdOf(t));
  const p = s?.transform?.position;
  return p ? { at: [p[0], p[1], p[2]], yawDeg: s.transform?.rotationDeg?.[1] ?? 0 } : null;
}

/**
 * The see-through copy's size (m), about the piece's own, in its socket's axes before its turn:
 * x across, y up, z along (a piece of furniture lies along its x, its back to the wall at +z).
 */
export function ghostSize(t: Target, onRoof = false): [number, number, number] {
  if (t.kind === 'furniture') {
    const f = CONFIG.modules.furniture[slotOf(t.key).kind] as { length: number; depth: number };
    const tall: Record<string, number> = { locker: 2, head: 2, shower: 2, bunk: 1.4, galley: 0.9, seat: 1.05, settee: 0.85, mess: 0.85, berth: 0.55 };
    return [f.length, tall[slotOf(t.key).kind] ?? 0.8, f.depth];
  }
  const sizes: Record<string, [number, number, number]> = {
    deckCrane: [1.2, 2.2, 1.2],
    towWinch: [1.4, 0.9, 1.0],
    searchlight: onRoof ? [0.5, 0.5, 0.5] : [0.4, 2.6, 0.4],
    fireMonitor: onRoof ? [0.5, 0.6, 0.5] : [0.4, 2.4, 0.4],
    skiff: [1.9, 0.9, 4.0],
    lifeRing: [0.8, 0.8, 0.2],
    rodRack: [0.5, 1.6, 0.7],
  };
  return sizes[t.eq.id] ?? [0.8, 0.8, 0.8];
}

/** The 25 cm cell a point is in (the grid gear stands on, and the key a preview is kept under). */
export function cellOf(p: readonly number[]): string {
  const g = PLACE_GRID.step;
  return `${Math.round(p[0] / g)},${Math.round(p[2] / g)}`;
}

/**
 * Try a piece at a point: the design change, and whether (and where) it stands, built as she'd
 * be (`build`: build.ts buildDesign). `face`: a turning piece's quarter turns (the crane's and
 * winch's); unset, as it would be put (the crane on the aft deck facing aft).
 */
export function previewPlace(
  design: ShipDesign,
  t: Target,
  point: readonly [number, number, number],
  house: HouseBox | undefined,
  transom: number,
  build: (d: ShipDesign) => DesignedBoat,
  face?: number,
): Preview {
  const miss = (patch: Partial<ShipDesign>, words: string): Preview => ({ patch, ok: false, at: [point[0], point[1], point[2]], yawDeg: 0, words });
  if (t.kind === 'furniture') {
    const patch = placeFurniture(t.key, point, transom);
    const b = build({ ...design, ...patch });
    const pl = b.placed[t.key];
    const where = whereIs(b, t);
    if (!pl || !where) return miss(patch, b.placeWhy[t.key] ?? 'no room here');
    return { patch, ok: true, at: where.at, yawDeg: where.yawDeg, words: pl.moved ? 'slid along the wall to fit' : '' };
  }
  const { eq } = t;
  let patch = placeGear(eq, point, house, transom).patch;
  if (eq.key && eq.turns && face !== undefined) {
    const at = placeOf(eq.key, patch[eq.key] as number);
    if (at) patch = { ...patch, [eq.key]: placeValue(eq.key, at.x, at.fromTransom, face) };
  }
  const d = { ...design, ...patch };
  const b = build(d);
  if (eq.key) {
    const pl = b.placed[eq.key];
    const where = whereIs(b, t);
    if (!pl || !where) return miss(patch, b.placeWhy[eq.key] ?? 'no room here');
    // Moved to stand clear: put on the cell it took (and its facing), so it stays there.
    if (pl.moved) {
      const f = placeOf(eq.key, d[eq.key])?.face ?? 0;
      patch = { ...patch, [eq.key]: placeValue(eq.key, pl.x, transom - pl.z, f) };
      return { patch, ok: true, at: where.at, yawDeg: where.yawDeg, words: `moved ${Math.hypot(pl.x - point[0], pl.z - point[2]).toFixed(1)} m to stand clear` };
    }
    return { patch, ok: true, at: where.at, yawDeg: where.yawDeg, words: '' };
  }
  // The skiff, the life ring, the rods: placed by the builder from the side or deck pointed at.
  const where = whereIs(b, t);
  if (!where) {
    const short = eq.id === 'skiff' ? 'skiff' : eq.id === 'rodRack' ? 'rod' : eq.id === 'lifeRing' ? 'life ring' : eq.name.toLowerCase();
    const w = b.warnings.find((x) => x.toLowerCase().includes(short));
    return miss(patch, w ? w.replace(/:? ?left off\.?.*$/i, '').replace(/^There's /, '') : 'no room here');
  }
  return { patch, ok: true, at: where.at, yawDeg: where.yawDeg, words: '' };
}
