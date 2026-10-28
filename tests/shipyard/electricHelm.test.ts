/**
 * An electric boat's helm (owner, 28 Oct 2026: "the electric vessels don't need a start button
 * ... there should probably be a key to turn on the drive system ... we need a different set of
 * warning lights for electrical vessels"): no START, the key (DRIVE) switches her drive on, her
 * own lamps READY, NEUTRAL, BATT, SHORE, BILGE, HULL, her own start-up card; her instruments on
 * their breaker as every boat's.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { busOf } from '../../src/modular/bus';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { FOIL_FERRY, SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const typeOf = (hull: number, x: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...x });

describe('an electric boat\'s helm', () => {
  it('no START; the key engraved DRIVE; her own lamps and card (the solar cat and the ferry, basic and advanced controls)', () => {
    for (const d of [typeOf(SOLAR_CAT), typeOf(FOIL_FERRY), typeOf(SOLAR_CAT, { controls: 0 }), typeOf(FOIL_FERRY, { controls: 1 })]) {
      const b = useDesign(d);
      expect(b.warnings).toEqual([]);
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const mods = b.recipe.modules.flatMap((m) => [m, ...(m.modules ?? [])]);
      expect(mods.some((m) => m.socket === 'start' || m.socket === 'start2')).toBe(false);
      expect((mods.find((m) => m.socket === 'key')!.config as { engrave: string }).engrave).toBe('DRIVE');
      expect((mods.find((m) => m.socket === 'lamps')!.config as { electric?: boolean }).electric).toBe(true);
      expect((mods.find((m) => m.socket === 'card')!.config as { electric?: boolean }).electric).toBe(true);
    }
    // A diesel boat keeps hers.
    const diesel = useDesign(DEFAULT_DESIGN).recipe.modules.flatMap((m) => [m, ...(m.modules ?? [])]);
    expect(diesel.some((m) => m.socket === 'start')).toBe(true);
    expect((diesel.find((m) => m.socket === 'lamps')!.config as { electric?: boolean } | undefined)?.electric).toBeUndefined();
  });

  it('READY lights with the key, NEUTRAL in neutral, BATT when she runs low, SHORE plugged in; nothing of a diesel\'s', () => {
    useDesign(typeOf(SOLAR_CAT));
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
    const lamp = (k: string) => busOf(v).get(`lamp.${k}` as never);
    send('quickStart', 1);
    for (let i = 0; i < 60; i++) stepWorld(world, [], DT);
    expect(lamp('ready')).toBe('on');
    expect(lamp('neutral')).toBe('on');
    expect(lamp('batt')).toBe('off');
    expect(lamp('shore')).toBe('off');
    // The key off: her drive goes dead.
    send('ignition.key', 0);
    for (let i = 0; i < 10; i++) stepWorld(world, [], DT);
    expect(lamp('ready')).toBe('off');
    send('ignition.key', 1);
    for (let i = 0; i < 10; i++) stepWorld(world, [], DT);
    expect(lamp('ready')).toBe('on');
    // Low, then nearly flat.
    v.battery = 0.08;
    stepWorld(world, [], DT);
    expect(lamp('batt')).toBe('on');
    v.battery = 0.02;
    stepWorld(world, [], DT);
    expect(lamp('batt')).toBe('blink');
    // Plugged in.
    v.shore = { ratedKw: 22, chargeKw: 0, kWh: 0 };
    stepWorld(world, [], DT);
    expect(lamp('shore')).toBe('on');
  });
});
