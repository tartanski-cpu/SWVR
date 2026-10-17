/** Pins that ask for equipment: where the Shipyard puts it. */
import { describe, expect, it } from 'vitest';
import { EQUIPMENT, equipmentOf, placeGear } from '../../src/shipyard/pinGear';

// A house from 1.5 m forward of amidships to 1.5 m aft (z forward negative), roof at 3.3 m.
const HOUSE = { front: -1.5, aft: 1.5, halfWidth: 1.4, roofY: 3.3 };

describe('pinned equipment', () => {
  it('on the roof, the foredeck or the aft deck, by where the pin is', () => {
    const mon = equipmentOf('fireMonitor')!;
    expect(placeGear(mon, [0.2, 3.4, 0], HOUSE)).toEqual({ patch: { fireMonitor: 1 }, spot: 'roof' });
    expect(placeGear(mon, [0.5, 1.2, -4], HOUSE)).toEqual({ patch: { fireMonitor: 2 }, spot: 'fore' });
    expect(placeGear(mon, [-0.5, 1.2, 4], HOUSE)).toEqual({ patch: { fireMonitor: 3 }, spot: 'aft' });
    // Beside the house, low down: the deck at the nearer end.
    expect(placeGear(equipmentOf('searchlight')!, [1.8, 1.3, 1], HOUSE)!.spot).toBe('aft');
  });

  it('gear that can’t go on the roof goes to the nearer deck', () => {
    expect(placeGear(equipmentOf('deckCrane')!, [0, 3.4, -0.5], HOUSE)).toEqual({ patch: { deckCrane: 1 }, spot: 'fore' });
    expect(placeGear(equipmentOf('deckCrane')!, [0, 3.4, 0.5], HOUSE)).toEqual({ patch: { deckCrane: 2 }, spot: 'aft' });
  });

  it('equipment the Shipyard can’t fit yet isn’t placed', () => {
    expect(placeGear(equipmentOf('towWinch')!, [0, 1.2, 4], HOUSE)).toBeNull();
    expect(EQUIPMENT.filter((e) => e.field).map((e) => e.id)).toEqual(['fireMonitor', 'searchlight', 'deckCrane']);
  });
});
