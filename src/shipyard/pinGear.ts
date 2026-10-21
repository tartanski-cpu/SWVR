/**
 * Pins that ask for equipment (owner, Oct 2026: "you say, this is the location, and then you
 * pull down from a drop-down menu of equipment that you'd like there"). Sketches are for
 * talking it over; once the crew agree, a pin goes on her with the equipment picked from
 * this list, and it's put there at once:
 *
 *   on the grid     the deck crane, the searchlight, the fire monitor and the tow winch stand
 *                   where the pin is, snapped to the 25 cm grid (owner; design.ts PLACE_GRID):
 *                   on deck, or (the searchlight and monitor) on the wheelhouse roof if the
 *                   pin's on it. The builder checks it stands there, and moves it to the
 *                   nearest cell that does if not (shipyard/build.ts);
 *   at the transom  the stern roller and the trawl A-frame, wherever on her the pin is;
 *   by side         the life ring and boat hook, on the side of the house the pin's on;
 *   in the wall     the side door, in the wheelhouse's port wall;
 *   the anchor      at the bow roller (a kedge at the stern on a ramp-bow boat), wherever
 *                   the pin is (every boat should have one: it's fitted unless taken off);
 *   the skiff       on the foredeck or the aft deck, whichever the pin's on, the crane's
 *                   column on the side the pin's on; the builder finds where it fits;
 *   inside          furniture (P5): on the floor the pin's over (the wheelhouse's, the
 *                   saloon's, the cabin below's), against its nearest wall; the builder
 *                   finds where it fits (shipyard/parts/furniture.ts).
 *
 * Pure: the page gives the pin's point, her wheelhouse and her transom.
 */
import { furnitureCell, placeValue, type PlaceKey, type ShipDesign } from './design';

export interface Equipment {
  id: string;
  name: string;
  /** How a pin places it (see above). */
  how: 'grid' | 'transom' | 'side' | 'wall' | 'anchor' | 'skiff' | 'rack' | 'inside';
  /** The design choice that fits it, and (on the grid) where it's placed by hand. */
  field: keyof ShipDesign;
  key?: PlaceKey;
  /** It can be turned on its spot (quarter turns). */
  turns?: boolean;
  /** The choice's value with it off, if not 0 (the anchor's is 'no anchor': 1). */
  off?: number;
}

/** The list on the pin. */
export const EQUIPMENT: Equipment[] = [
  { id: 'fireMonitor', name: 'Fire monitor', how: 'grid', field: 'fireMonitor', key: 'monitorAt' },
  { id: 'searchlight', name: 'Searchlight', how: 'grid', field: 'searchlight', key: 'lampAt' },
  { id: 'deckCrane', name: 'Deck crane', how: 'grid', field: 'deckCrane', key: 'craneAt', turns: true },
  { id: 'towWinch', name: 'Tow winch', how: 'grid', field: 'towWinch', key: 'winchAt', turns: true },
  { id: 'sternRoller', name: 'Stern roller (tow point)', how: 'transom', field: 'sternRoller' },
  { id: 'aFrame', name: 'Trawl A-frame and net', how: 'transom', field: 'aFrame' },
  { id: 'rodRack', name: 'Fishing rods and bucket', how: 'rack', field: 'rodRack' },
  { id: 'lifeRing', name: 'Life ring and boat hook', how: 'side', field: 'lifeRing' },
  { id: 'sideDoor', name: 'Side door (port wall)', how: 'wall', field: 'sideDoor' },
  { id: 'anchor', name: 'Anchor and windlass', how: 'anchor', field: 'noAnchor', off: 1 },
  { id: 'skiff', name: 'Skiff and crane', how: 'skiff', field: 'skiff' },
  // Furniture (P5): its pin's field is its place (0: none).
  { id: 'berth', name: 'Berth', how: 'inside', field: 'berthAt' },
  { id: 'settee', name: 'Settee', how: 'inside', field: 'setteeAt' },
  { id: 'galley', name: 'Galley', how: 'inside', field: 'galleyAt' },
  { id: 'seat', name: 'Seat', how: 'inside', field: 'seatAt' },
  { id: 'locker', name: 'Locker', how: 'inside', field: 'lockerAt' },
  { id: 'head', name: 'Head (toilet) with a door', how: 'inside', field: 'headAt' },
];

/** Does she carry it? */
export function fitted(eq: Equipment, d: ShipDesign): boolean {
  return (d[eq.field] ?? 0) !== (eq.off ?? 0);
}

/** Ids pins had before these were placeable (they still read). */
const OLD_IDS: Record<string, string> = { towPost: 'sternRoller', door: 'sideDoor' };

export function equipmentOf(id: string | undefined): Equipment | undefined {
  if (!id) return undefined;
  const real = OLD_IDS[id] ?? id;
  return EQUIPMENT.find((e) => e.id === real);
}

/** Her wheelhouse in the boat's axes (z forward negative): its ends, half width. */
export interface HouseBox {
  front: number;
  aft: number;
  halfWidth: number;
}

/**
 * The design change that puts a piece of equipment where a pin is (`p`: boat axes, m), and
 * where that is, in words. On the grid: its choice set (for the searchlight and monitor:
 * the roof if the pin's on it, else a pole on that deck; for the crane, that deck, facing
 * forward on the foredeck and aft on the aft deck) and its cell from the transom.
 */
export function placeGear(eq: Equipment, p: readonly number[], house: HouseBox | undefined, transom: number): { patch: Partial<ShipDesign>; words: string } {
  const [x, , z] = p;
  const mid = house ? (house.front + house.aft) / 2 : 0;
  const fore = z < mid;
  const roof = !!house && Math.abs(x) < house.halfWidth && z > house.front && z < house.aft;
  if (eq.how === 'grid' && eq.key) {
    const base = eq.field === 'deckCrane' ? (fore ? 1 : 2) : eq.field === 'towWinch' ? 1 : roof ? 1 : fore ? 2 : 3;
    const face = eq.field === 'deckCrane' && !fore ? 2 : 0;
    const words = roof ? 'on the wheelhouse roof' : house && z < house.front ? 'on the foredeck' : house && z > house.aft ? 'on the aft deck' : 'beside the wheelhouse';
    return { patch: { [eq.field]: base, [eq.key]: placeValue(eq.key, x, transom - z, face) } as Partial<ShipDesign>, words };
  }
  if (eq.how === 'inside') return { patch: { [eq.field]: furnitureCell(x, transom - z) } as Partial<ShipDesign>, words: roofOrInside(house, x, z) };
  if (eq.how === 'side') return { patch: { [eq.field]: x < 0 ? 1 : 2 } as Partial<ShipDesign>, words: `on the ${x < 0 ? 'port' : 'starboard'} side of the wheelhouse's aft wall, its line on that quarter's cleat` };
  if (eq.how === 'anchor') return { patch: { noAnchor: 0 }, words: 'at her bow roller (a kedge at the stern on a ramp-bow boat)' };
  if (eq.how === 'skiff') {
    const fore = !house || z < mid;
    return { patch: { skiff: (fore ? 1 : 3) + (x < 0 ? 1 : 0) }, words: `on the ${fore ? 'foredeck' : 'aft deck'}, its crane to ${x < 0 ? 'port' : 'starboard'}` };
  }
  if (eq.how === 'wall') return { patch: { [eq.field]: 1 } as Partial<ShipDesign>, words: "in the wheelhouse's port wall" };
  if (eq.how === 'rack') {
    // The rack on the wall nearest the pin: the aft wall (port or starboard of the door) when
    // the pin is aft of the house or near its aft end, else that side's wall.
    const aftWall = !house || z > house.aft - 1.0;
    const choice = aftWall ? (x < 0 ? 1 : 2) : x < 0 ? 3 : 4;
    const words = aftWall ? `on the wheelhouse's aft wall, ${x < 0 ? 'port' : 'starboard'} of the door` : `on the wheelhouse's ${x < 0 ? 'port' : 'starboard'} wall`;
    return { patch: { rodRack: choice }, words: `${words}, the rods standing upright, the bucket on deck beside them` };
  }
  return { patch: { [eq.field]: 1 } as Partial<ShipDesign>, words: 'at the transom' };
}

/** The design change that takes a piece of equipment off again. */
export function removeGear(eq: Equipment): Partial<ShipDesign> {
  return { [eq.field]: eq.off ?? 0, ...(eq.key ? { [eq.key]: 0 } : {}) } as Partial<ShipDesign>;
}

/** Where a furniture pin is, in words: in the wheelhouse, or forward of it (over the cabin below). */
function roofOrInside(house: HouseBox | undefined, x: number, z: number): string {
  if (house && Math.abs(x) < house.halfWidth && z > house.front && z < house.aft) return 'in the wheelhouse, against its nearest wall';
  return 'below, against the nearest wall of the cabin';
}
