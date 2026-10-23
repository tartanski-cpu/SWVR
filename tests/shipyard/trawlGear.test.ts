/**
 * The trawl deck gear (owner, Oct 2026: step 2 toward a trawler): a net drum on the centreline
 * forward of the A-frame and a split pair of trawl winches at the deck edges (design.netDrum,
 * trawlWinches; modules/netDrum, modules/trawlWinches), each with the A-frame only. With the
 * winches she trawls without a tow winch. The net comes off and back on its drum as it's shot
 * and hauled (fishing.ts `drum`), the warps off and on the winches.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { gearOf, useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { busOf } from '../../src/modular/bus';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { placeVessel } from '../../src/vessel/vesselControl';
import { FISHING_GROUNDS } from '../../src/world/archipelago';
import { startEngine } from '../helpers/engine';

afterAll(() => useDesign(DEFAULT_DESIGN));

const GILL = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Gillnetter'));
const gill = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[GILL].defaults, hull: GILL, aFrame: 1, netDrum: 1, trawlWinches: 1, ...more });
const has = (b: ReturnType<typeof buildDesign>, id: string) => b.recipe.modules.some((m) => m.module === id);

describe('the trawl deck gear', () => {
  it('travels as a link or file (not in the short code); needs the A-frame, saying so', () => {
    expect(DEFAULT_DESIGN.netDrum).toBe(0);
    expect(DEFAULT_DESIGN.trawlWinches).toBe(0);
    expect(shortCode(gill())).toBeNull();
    expect(readDesign(designToken(gill()))).toMatchObject({ design: gill(), warnings: [] });
    const without = buildDesign(gill({ aFrame: 0 }));
    expect(has(without, 'deck.net-drum') || has(without, 'deck.trawl-winches')).toBe(false);
    expect(without.warnings.join(' ')).toMatch(/need the trawl A-frame/);
  });

  it('on the gillnetter: the winches at her edges and the drum on the centreline, forward of the A-frame; no tow winch needed; her recipe holds (hydraulics); weighed and priced', () => {
    const b = buildDesign(gill());
    expect(b.warnings).toEqual([]);
    expect(has(b, 'deck.a-frame') && has(b, 'deck.net-drum') && has(b, 'deck.trawl-winches') && has(b, 'hydraulics.pto-pump')).toBe(true);
    expect(has(b, 'deck.tow-winch')).toBe(false);
    useDesign(gill());
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const af = gearOf({ defId: 'design' }, 'trawlGantry')!;
    const drum = gearOf({ defId: 'design' }, 'netDrum')!;
    const winch = gearOf({ defId: 'design' }, 'trawlWinches')!;
    expect(drum.lead[0]).toBe(0);
    expect(drum.lead[2]).toBeLessThan(af.braceZ);
    expect(winch.lead[2]).toBeLessThan(af.braceZ);
    expect(winch.lead[0]).toBeGreaterThan(af.x - 0.6);
    const plain = buildDesign(gill({ netDrum: 0, trawlWinches: 0 }));
    expect(b.figures.price).toBeGreaterThan(plain.figures.price);
    expect(b.weights.items.find((i) => i.name === 'Deck gear')!.kg).toBeGreaterThan(plain.weights.items.find((i) => i.name === 'Deck gear')!.kg);
  });

  it('on every hull type: fitted with a recipe that holds, or left off saying why', () => {
    DESIGN_HULLS.forEach((t, i) => {
      const d: ShipDesign = { ...DEFAULT_DESIGN, ...t.defaults, hull: i, aFrame: 1, netDrum: 1, trawlWinches: 1, fishHold: 1 };
      const b = buildDesign(d);
      if (!has(b, 'deck.net-drum')) expect(b.warnings.join(' ')).toMatch(/net drum/);
      if (!has(b, 'deck.trawl-winches')) expect(b.warnings.join(' ')).toMatch(/trawl winches|A-frame/);
      useDesign(d);
      expect(validateRecipe(RECIPES.design, LIBRARY), t.name).toEqual([]);
    });
  });

  it('at sea: the net comes off its drum as it is shot, back on up the stern and as it is stowed; the warps off and on the winches', () => {
    useDesign(gill());
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    startEngine(world, v);
    const ground = FISHING_GROUNDS[1];
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    const DT = 1 / 60;
    const send = (control: string, value = 1) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
    const run = (s: number) => {
      for (let i = 0; i < s / DT; i++) {
        v.linearVelocity = [0, 0, -1.5];
        stepWorld(world, [], DT);
      }
    };
    const c = CONFIG.fishing;
    const bus = () => busOf(v);
    run(0.5);
    expect(bus().num('trawl.netOnDrum')).toBe(1);
    send('trawl', 1);
    run(c.shootTime * 0.1);
    const part = bus().num('trawl.netOnDrum');
    expect(part).toBeGreaterThan(0.3);
    expect(part).toBeLessThan(0.8);
    run(c.shootTime);
    expect(bus().num('trawl.netOnDrum')).toBe(0);
    expect(bus().num('trawl.warpOut')).toBe(1);
    send('trawl', 0);
    run(c.haulTime + 0.5);
    expect(bus().num('trawl.warpOut')).toBe(0);
    expect(bus().num('trawl.netOnDrum')).toBeLessThan(0.1); // the warps in, the net only starting up the stern
    run(c.liftTime + 0.5);
    expect(world.fishing!.net === 'aboard' || world.fishing!.net === 'stowing').toBe(true);
    expect(bus().num('trawl.netOnDrum')).toBeGreaterThan(0.8);
    run(c.stowTime + 0.5);
    expect(world.fishing!.net).toBe('stowed');
    expect(bus().num('trawl.netOnDrum')).toBe(1);
  });
});
