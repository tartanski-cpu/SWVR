/** Pins that ask for equipment: where the Shipyard puts it. */
import { describe, expect, it } from 'vitest';
import { placeOf } from '../../src/shipyard/design';
import { EQUIPMENT, equipmentOf, placeGear, removeGear } from '../../src/shipyard/pinGear';

// A house from 1.5 m forward of amidships to 1.5 m aft (z forward negative); her transom at z 6.
const HOUSE = { front: -1.5, aft: 1.5, halfWidth: 1.4 };
const TRANSOM = 6;
const put = (id: string, p: number[]) => placeGear(equipmentOf(id)!, p, HOUSE, TRANSOM);

describe('pinned equipment', () => {
  it('grid gear goes on the pin’s 25 cm cell, measured from the transom: on deck, or on the roof', () => {
    const fore = put('fireMonitor', [0.55, 1.2, -4.1]);
    expect(fore.patch.fireMonitor).toBe(2); // a pole on the foredeck
    expect(placeOf('monitorAt', fore.patch.monitorAt!)).toEqual({ x: 0.5, fromTransom: 10, face: 0 });
    expect(fore.words).toBe('on the foredeck');
    const roof = put('searchlight', [0.2, 3.4, 0.4]);
    expect(roof.patch.searchlight).toBe(1);
    expect(placeOf('lampAt', roof.patch.lampAt!)).toEqual({ x: 0.25, fromTransom: 5.5, face: 0 });
    expect(roof.words).toBe('on the wheelhouse roof');
    expect(put('searchlight', [-0.5, 1.2, 4]).patch.searchlight).toBe(3); // a pole on the aft deck
  });

  it('the crane faces forward on the foredeck and aft on the aft deck; the winch’s wire leads aft', () => {
    expect(placeOf('craneAt', put('deckCrane', [1, 1.2, -4]).patch.craneAt!)!.face).toBe(0);
    const aft = put('deckCrane', [-1, 1.2, 4]);
    expect(aft.patch.deckCrane).toBe(2);
    expect(placeOf('craneAt', aft.patch.craneAt!)!.face).toBe(2);
    expect(placeOf('winchAt', put('towWinch', [0, 1.2, 5.2]).patch.winchAt!)).toEqual({ x: 0, fromTransom: 0.75, face: 0 });
  });

  it('stern gear at the transom, the life ring by side, the side door in the port wall; off again', () => {
    expect(put('sternRoller', [1, 1, -3]).patch).toEqual({ sternRoller: 1 });
    expect(put('aFrame', [0, 1, 5]).patch).toEqual({ aFrame: 1 });
    expect(put('lifeRing', [-0.8, 2, 1.6]).patch).toEqual({ lifeRing: 1 });
    expect(put('lifeRing', [0.8, 2, 1.6]).patch).toEqual({ lifeRing: 2 });
    expect(put('sideDoor', [1.4, 2, 0]).patch).toEqual({ sideDoor: 1 });
    expect(removeGear(equipmentOf('deckCrane')!)).toEqual({ deckCrane: 0, craneAt: 0 });
    expect(removeGear(equipmentOf('aFrame')!)).toEqual({ aFrame: 0 });
  });

  it('every piece on the list can be placed; older pins’ ids still read', () => {
    expect(EQUIPMENT.map((e) => e.id)).toEqual(['fireMonitor', 'searchlight', 'deckCrane', 'towWinch', 'sternRoller', 'aFrame', 'netDrum', 'trawlWinches', 'diveFrame', 'lineHauler', 'rodRack', 'lifeRing', 'sideDoor', 'anchor', 'skiff', 'skiff2']);
    // Furniture has its own step (furnishing.ts), not a pin's.
    expect(equipmentOf('galley')).toBeUndefined();
    expect(equipmentOf('towPost')!.id).toBe('sternRoller');
    expect(equipmentOf('door')!.id).toBe('sideDoor');
    expect(equipmentOf('potHauler')).toBeUndefined();
  });
});
