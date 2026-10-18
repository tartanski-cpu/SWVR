/**
 * The starter workboat (owner, Oct 2026): a new career starts in the workboat without some
 * of her equipment (the trawl gear, the skiff and her crane, the searchlight, the fire
 * monitor), bought later at the yard
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
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;
const starter = () => useWorkboatFit(socketsWithout(equipmentWithout([])));
const mounted = () => flattenMounts(RECIPES.workboat, LIBRARY.hulls, LIBRARY.modules).mounted;

// Every test leaves the workboat whole again, as the other files expect her.
afterEach(() => useWorkboatFit([]));

describe('the starter workboat', () => {
  it('a new career has none of her equipment: the trawl gear, the skiff, the searchlight and the fire monitor are left off', () => {
    expect(equipmentWithout(createCareer().upgrades)).toEqual(['trawlGear', 'skiff', 'searchlight', 'fireMonitor']);
    expect(socketsWithout(['trawlGear', 'skiff']).sort()).toEqual(['aFrame', 'helm/trawl', 'tenderCrane', 'trawl']);
    expect(socketsWithout(['searchlight', 'fireMonitor']).sort()).toEqual(['fireMonitor', 'helm/firePump', 'helm/monJoystick', 'helm/spotJoystick', 'helm/spotlight', 'searchlight']);
  });

  it('built without them: a valid boat, none of that gear or its switches; the rest of her as she was', () => {
    const whole = mounted().map((m) => m.path);
    starter();
    expect(validateRecipe(RECIPES.workboat, LIBRARY)).toEqual([]);
    const ids = mounted().map((m) => m.def.id);
    for (const id of ['fishing.trawl', 'deck.a-frame', 'deck.tender-crane', 'deck.searchlight', 'deck.fire-monitor']) expect(ids).not.toContain(id);
    const helm = mounted().filter((m) => m.path.startsWith('helm/')).map((m) => m.path);
    for (const s of ['trawl', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick']) expect(helm).not.toContain(`helm/${s}`);
    // Towing, rescue, the radio, her lights, the horn: all still aboard.
    for (const id of ['deck.tow-winch', 'deck.stern-roller', 'rescue.life-ring-station', 'rescue.boat-hook-rack', 'radio.vhf', 'light.flood', 'propulsion.diesel-inboard']) expect(ids, id).toContain(id);
    expect(helm).toContain('helm/horn');
    expect(gearOf({ defId: 'workboat' }, 'towPoint')).not.toBeNull();
    for (const kind of ['trawl', 'tenderCrane', 'searchlight', 'fireMonitor'] as const) expect(gearOf({ defId: 'workboat' }, kind), kind).toBeNull();
    expect(whole.length - mounted().length).toBe(10);
    // The hand torch is still aboard, for finding people at night.
    expect(VESSEL_DEFS.workboat.stowage?.torch).toBeDefined();
  });

  it('her helm console: the SEARCH · FIRE plate with nothing left on it is left off; the others stay', () => {
    starter();
    const helm = RECIPES.workboat.modules.find((m) => m.socket === 'helm')!;
    const titles = (helm.config as { groups: { title: string }[] }).groups.map((g) => g.title);
    expect(titles).toEqual(['LIGHTS', 'DECK', 'ENGINE']);
    // Only the trawl gear left off: the DECK plate still has the ANCHOR switch, every plate stays.
    useWorkboatFit(socketsWithout(['trawlGear']));
    expect((RECIPES.workboat.modules.find((m) => m.socket === 'helm')!.config as { groups: unknown[] }).groups).toHaveLength(4);
    // The whole boat: her recipe's console as it was (no groups of its own).
    useWorkboatFit([]);
    expect(RECIPES.workboat.modules.find((m) => m.socket === 'helm')!.config).toBeUndefined();
  });

  it('no fire calls without the fire monitor; with it, they come', () => {
    starter();
    const a = createWorld(new IdFactory(), 'workboat');
    const v = a.world.vessels[a.vesselId];
    stepWorld(a.world, [{ playerId: 'p', targetId: v.id, control: 'fireDebugCall', value: 1, ref: 'boat' } as Intent], DT);
    expect(a.world.fire?.job ?? null).toBeNull();
    useWorkboatFit([]);
    const b = createWorld(new IdFactory(), 'workboat');
    stepWorld(b.world, [{ playerId: 'p', targetId: b.vesselId, control: 'fireDebugCall', value: 1, ref: 'boat' } as Intent], DT);
    expect(b.world.fire?.job).toBeTruthy();
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
    expect(equipmentWithout(fresh.upgrades)).toEqual(['trawlGear', 'skiff', 'searchlight', 'fireMonitor']);
    // Bought, it's kept.
    const later = createCareer();
    later.upgrades.push('skiff');
    expect(equipmentWithout(parseCareer(serializeCareer(later))!.upgrades)).toEqual(['trawlGear', 'searchlight', 'fireMonitor']);
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
