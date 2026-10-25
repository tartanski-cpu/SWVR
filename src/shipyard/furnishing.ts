/**
 * The Furniture step (owner, Oct 2026: "split furniture into a different part of the workflow,
 * keep it separate from deck equipment, where there usually is just one, but the furniture
 * should be allowed to place multiple"). Each piece can be added more than once (up to four;
 * one head; twelve seats, for rows of them: owner, Oct 2026, "like a bus"), each copy a field of its own (design.ts FURNITURE_SLOTS: berthAt, berthAt2...).
 * Adding one takes the piece's first empty field; taking one off moves those after it up, so
 * the copies are always numbered 1, 2, 3 with no gaps.
 *
 * Pure: the page gives the click's point (the boat's axes, m) and her transom.
 */
import { FURNITURE_SLOTS, furnitureCell, SEAT_FACES, type FurnitureKey, type FurniturePiece, type ShipDesign } from './design';

/** The Furniture step's pieces, in the menu's order, with their names. */
export const FURNITURE_MENU: { kind: FurniturePiece; name: string }[] = [
  { kind: 'berth', name: 'Berth' },
  { kind: 'settee', name: 'Settee' },
  { kind: 'galley', name: 'Galley' },
  { kind: 'seat', name: 'Seat' },
  { kind: 'locker', name: 'Locker' },
  { kind: 'head', name: 'Head (toilet) with a door' },
  { kind: 'bunk', name: 'Bunks, two high' },
  { kind: 'mess', name: 'Mess table and benches' },
  { kind: 'shower', name: 'Shower' },
  { kind: 'tv', name: 'TV on the wall' },
];

/** The fields of a piece that are set (placed), in order. */
export function placedOf(kind: FurniturePiece, d: ShipDesign): FurnitureKey[] {
  return FURNITURE_SLOTS[kind].filter((k) => d[k]);
}

/** The field a new piece of this kind goes in, or null if she has as many as she can. */
export function nextSlot(kind: FurniturePiece, d: ShipDesign): FurnitureKey | null {
  return FURNITURE_SLOTS[kind].find((k) => !d[k]) ?? null;
}

/** Which piece a field is, and which copy (0 the first). */
export function slotOf(key: FurnitureKey): { kind: FurniturePiece; i: number } {
  for (const [kind, keys] of Object.entries(FURNITURE_SLOTS) as [FurniturePiece, FurnitureKey[]][]) {
    const i = keys.indexOf(key);
    if (i >= 0) return { kind, i };
  }
  throw new Error(`not a furniture field: ${key}`);
}

/** The design change that puts a piece (its field `key`) where she was clicked (`p`: boat axes, m). */
export function placeFurniture(key: FurnitureKey, p: readonly number[], transom: number): Partial<ShipDesign> {
  return { [key]: furnitureCell(p[0], transom - p[2]) } as Partial<ShipDesign>;
}

/** The design change that takes a piece off: the copies after it move up a place. */
export function removeFurniture(key: FurnitureKey, d: ShipDesign): Partial<ShipDesign> {
  const { kind, i } = slotOf(key);
  const keys = FURNITURE_SLOTS[kind];
  const keep = keys.map((_, j) => j).filter((j) => j !== i && d[keys[j]]);
  const out = Object.fromEntries(keys.map((k, j) => [k, keep[j] !== undefined ? d[keys[keep[j]]] : 0])) as Partial<ShipDesign>;
  // (A seat's facing moves up with it.)
  if (kind === 'seat') for (const [j, f] of SEAT_FACES.entries()) out[f] = keep[j] !== undefined ? d[SEAT_FACES[keep[j]]] ?? 0 : 0;
  return out;
}

/** The design change that turns a seat (its field `key`) 45 degrees clockwise, seen from above. */
export function turnSeat(key: FurnitureKey, d: ShipDesign): Partial<ShipDesign> {
  const { kind, i } = slotOf(key);
  if (kind !== 'seat') return {};
  const f = SEAT_FACES[i];
  return { [f]: ((d[f] ?? 0) + 1) % 8 } as Partial<ShipDesign>;
}
