/**
 * The starter workboat (owner, Oct 2026): a new career starts in the workboat without some
 * of her equipment (the trawl gear, the skiff and her crane), bought later at the yard
 * (CONFIG.career.upgrades `fit`). The tests' workboat is the whole boat, as before: the
 * fit-out is only for the game's career.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gearOf, hasModule, useDesign, useWorkboatFit } from '../src/boats/sims';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { buyBlocker, createCareer, equipmentWithout, hasUpgrade, parseCareer, serializeCareer, socketsWithout } from '../src/career/career';
import { flattenMounts, validateRecipe } from '../src/modular/recipe';
import { DEFAULT_DESIGN } from '../src/shipyard/design';

const DT = 1 / 60;
const starter = () => useWorkboatFit(socketsWithout(equipmentWithout([])));
const mounted = () => flattenMounts(RECIPES.workboat, LIBRARY.hulls, LIBRARY.modules).mounted;

// Every test leaves the workboat whole again, as the other files expect her.
afterEach(() => useWorkboatFit([]));

describe('the starter workboat', () => {
  it('a new career has none of her equipment: the trawl gear and the skiff are left off', () => {
    expect(equipmentWithout(createCareer().upgrades)).toEqual(['trawlGear', 'skiff']);
    expect(socketsWithout(['trawlGear', 'skiff']).sort()).toEqual(['aFrame', 'helm/trawl', 'tenderCrane', 'trawl']);
  });

  it('built without them: a valid boat, no A-frame, net, TRAWL switch or skiff crane; the rest of her as she was', () => {
    const whole = mounted().map((m) => m.path);
    starter();
    expect(validateRecipe(RECIPES.workboat, LIBRARY)).toEqual([]);
    const ids = mounted().map((m) => m.def.id);
    for (const id of ['fishing.trawl', 'deck.a-frame', 'deck.tender-crane']) expect(ids).not.toContain(id);
    expect(mounted().some((m) => m.path.endsWith('trawl') && m.def.id === 'control.toggle')).toBe(false);
    // Towing, rescue, the radio, the searchlight and fire monitor, her lights: all still aboard.
    for (const id of ['deck.tow-winch', 'deck.stern-roller', 'rescue.life-ring-station', 'rescue.boat-hook-rack', 'radio.vhf', 'deck.searchlight', 'deck.fire-monitor', 'light.flood', 'propulsion.diesel-inboard']) expect(ids, id).toContain(id);
    expect(gearOf({ defId: 'workboat' }, 'towPoint')).not.toBeNull();
    expect(gearOf({ defId: 'workboat' }, 'trawl')).toBeNull();
    expect(gearOf({ defId: 'workboat' }, 'tenderCrane')).toBeNull();
    expect(whole.length - mounted().length).toBe(4);
  });

  it('the game in her: no skiff in a cradle; the TRAWL switch does nothing; she gets under way', () => {
    starter();
    const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true, harbour: true });
    expect(Object.values(world.vessels).some((v) => v.defId === 'skiff')).toBe(false);
    const v = world.vessels[vesselId];
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'trawl', value: 1 } as Intent], DT);
    for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
    expect(world.fishing?.net ?? 'stowed').toBe('stowed');
  });

  it('each piece of equipment bought brings back its own gear only', () => {
    useWorkboatFit(socketsWithout(equipmentWithout(['skiff'])));
    expect(hasModule('workboat', 'deck.tender-crane')).toBe(true);
    expect(hasModule('workboat', 'fishing.trawl')).toBe(false);
    useWorkboatFit(socketsWithout(equipmentWithout(['trawlGear'])));
    expect(hasModule('workboat', 'deck.tender-crane')).toBe(false);
    expect(hasModule('workboat', 'fishing.trawl')).toBe(true);
    expect(hasModule('workboat', 'deck.a-frame')).toBe(true);
  });

  it('the whole workboat again with nothing left off (the tests\' reference boat)', () => {
    starter();
    useWorkboatFit([]);
    for (const id of ['fishing.trawl', 'deck.a-frame', 'deck.tender-crane']) expect(hasModule('workboat', id)).toBe(true);
    const { world } = createWorld(new IdFactory(), 'workboat', { tender: true });
    expect(Object.values(world.vessels).some((v) => v.defId === 'skiff')).toBe(true);
  });
});

describe('the starter workboat in the career', () => {
  it('a career saved before the starter boat has all her equipment; a new one saved and read back keeps none', () => {
    const old = JSON.stringify({ money: 900, ledger: [], rep: {}, upgrades: ['radar'], contractsDone: 2 });
    const c = parseCareer(old)!;
    expect(equipmentWithout(c.upgrades)).toEqual([]);
    expect(c.upgrades).toContain('radar');
    const fresh = parseCareer(serializeCareer(createCareer()))!;
    expect(equipmentWithout(fresh.upgrades)).toEqual(['trawlGear', 'skiff']);
    // Bought, it's kept.
    const later = createCareer();
    later.upgrades.push('skiff');
    expect(equipmentWithout(parseCareer(serializeCareer(later))!.upgrades)).toEqual(['trawlGear']);
  });

  it('the yard sells it in port to the workboat; a bigger trawl or the ice machine needs the trawl gear aboard first', () => {
    starter();
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
    const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
    send('teleportToPort', 'calder', vesselId);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    send('careerDebugCash');
    expect(buyBlocker(world, 'trawl')).toBe('Needs the trawl gear');
    expect(buyBlocker(world, 'ice')).toBe('Needs the trawl gear');
    expect(buyBlocker(world, 'trawlGear')).toBeNull();
    const m = world.career!.money;
    send('careerBuy', 'trawlGear');
    expect(hasUpgrade(world, 'trawlGear')).toBe(true);
    expect(m - world.career!.money).toBe(CONFIG.career.upgrades.find((u) => u.id === 'trawlGear')!.price);
    expect(buyBlocker(world, 'trawlGear')).toBe('Fitted');
  });

  it('a Shipyard boat has her own gear: the workboat\'s equipment isn\'t for her', () => {
    useDesign(DEFAULT_DESIGN);
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design');
    const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
    send('teleportToPort', 'calder', vesselId);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    send('careerDebugCash');
    expect(buyBlocker(world, 'skiff')).toBe('Workboat only');
  });
});
