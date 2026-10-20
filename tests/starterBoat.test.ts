/**
 * A new career starts in the fleet's beginner boat (owner, Oct 2026), as basic as she comes,
 * and buys her equipment at the yard: each add-on is a change to her Shipyard design
 * (CONFIG.career.upgrades `design`), and she's rebuilt with it (boats/sims.ts useStarterKit).
 * What doesn't fit her (the trawl: her house is right aft) the yard says so.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../src/boats/library';
import { gearOf, useStarterKit } from '../src/boats/sims';
import { buyBlocker, equipmentWithout, KIT_BOATS } from '../src/career/career';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';

const DT = 1 / 60;
const modules = () => RECIPES.starterBoat.modules.map((m) => m.module);

afterEach(() => useStarterKit(equipmentWithout([])));

describe('a new career in the beginner boat', () => {
  it('is the game’s start boat, and a boat the career kits out; she tows from day one (her stern roller)', () => {
    expect(CONFIG.career.boat).toBe('starterBoat');
    expect(KIT_BOATS).toContain('starterBoat');
    useStarterKit(equipmentWithout([]));
    expect(gearOf({ defId: 'starterBoat' }, 'towPoint')).toBeTruthy();
  });

  it('a new career’s: no searchlight, fire monitor or skiff; all bought, all fitted', () => {
    useStarterKit(equipmentWithout([]));
    for (const m of ['deck.searchlight', 'deck.fire-monitor', 'deck.tender-crane']) expect(modules()).not.toContain(m);
    useStarterKit(equipmentWithout(['searchlight', 'fireMonitor', 'skiff']));
    for (const m of ['deck.searchlight', 'deck.fire-monitor', 'deck.tender-crane']) expect(modules()).toContain(m);
    // The trawl doesn't fit her (no aft deck): never fitted.
    expect(modules()).not.toContain('deck.a-frame');
  });

  it('the yard sells her the searchlight, fire monitor and skiff; not the trawl gear', () => {
    useStarterKit(equipmentWithout([]));
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
    const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
    send('teleportToPort', 'calder', vesselId);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    send('careerDebugCash');
    for (const id of ['searchlight', 'fireMonitor', 'skiff']) expect(buyBlocker(world, id), id).toBeNull();
    expect(buyBlocker(world, 'trawlGear')).toBe('Not on this boat');
  });
});
