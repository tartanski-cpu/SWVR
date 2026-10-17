/**
 * Pins that ask for equipment (owner, Oct 2026: "you say, this is the location, and then you
 * pull down from a drop-down menu of equipment that you'd like there"). Sketches are for
 * talking it over; once the crew agree, a pin goes on her with the equipment picked from
 * this list, and at the Deck gear step the Shipyard puts each piece it can fit at the place
 * it offers nearest the pin: on the wheelhouse roof, on the foredeck, or on the aft deck.
 *
 * Equipment the Shipyard can't fit yet (a door, a tow winch...) can still be pinned: it
 * stays on the to-do list, marked as not in the Shipyard yet, for when its module comes.
 * Pure: the page gives the pin's point and her wheelhouse.
 */
import type { ShipDesign } from './design';

export type Spot = 'roof' | 'fore' | 'aft';

export interface Equipment {
  id: string;
  name: string;
  /** The design field that places it, and its value at each place it can go (none: not in the Shipyard yet). */
  field?: keyof ShipDesign;
  spots?: Partial<Record<Spot, number>>;
}

/** The list on the pin, the gear the Shipyard can place first (design.ts fields; page.ts Deck gear options). */
export const EQUIPMENT: Equipment[] = [
  { id: 'fireMonitor', name: 'Fire monitor', field: 'fireMonitor', spots: { roof: 1, fore: 2, aft: 3 } },
  { id: 'searchlight', name: 'Searchlight', field: 'searchlight', spots: { roof: 1, fore: 2, aft: 3 } },
  { id: 'deckCrane', name: 'Deck crane', field: 'deckCrane', spots: { fore: 1, aft: 2 } },
  { id: 'towWinch', name: 'Tow winch' },
  { id: 'towPost', name: 'Tow post / stern roller' },
  { id: 'aFrame', name: 'Trawl A-frame' },
  { id: 'potHauler', name: 'Pot hauler' },
  { id: 'lifeRing', name: 'Life ring' },
  { id: 'door', name: 'Door' },
];

export function equipmentOf(id: string | undefined): Equipment | undefined {
  return id ? EQUIPMENT.find((e) => e.id === id) : undefined;
}

export const SPOT_NAMES: Record<Spot, string> = { roof: 'on the wheelhouse roof', fore: 'on the foredeck', aft: 'on the aft deck' };

/** Her wheelhouse in the boat's axes (z forward negative): its ends, half width, roof height (m). */
export interface HouseBox {
  front: number;
  aft: number;
  halfWidth: number;
  roofY: number;
}

/**
 * Where a piece of equipment goes for a pin at `p` (boat axes, m): the roof if the pin is on
 * or just over the house's roof, else the deck forward or aft of the house, whichever side
 * of it the pin is (beside the house: the nearer end). If the gear can't go on the roof (the
 * crane), the nearer deck. Null if the Shipyard can't fit it.
 */
export function placeGear(eq: Equipment, p: readonly number[], house: HouseBox | undefined): { patch: Partial<ShipDesign>; spot: Spot } | null {
  if (!eq.field || !eq.spots) return null;
  const [x, y, z] = p;
  const mid = house ? (house.front + house.aft) / 2 : 0;
  const onRoof = !!house && z > house.front - 0.3 && z < house.aft + 0.3 && Math.abs(x) < house.halfWidth + 0.3 && y > house.roofY - 0.4;
  let spot: Spot = onRoof ? 'roof' : z < mid ? 'fore' : 'aft';
  if (eq.spots[spot] === undefined) spot = z < mid ? 'fore' : 'aft';
  const value = eq.spots[spot];
  if (value === undefined) return null;
  return { patch: { [eq.field]: value } as Partial<ShipDesign>, spot };
}
