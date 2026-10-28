/**
 * The foiling ferry's helm (owner, 28 Oct 2026: "Do 1, 3 and 4, three ride heights"): FOIL /
 * HULL and her ride height on her switch panel, the FOILS screen on her dash whatever her
 * instruments, what the screen says she's doing, and her sound and feel lifting clear.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { FoilFeel, foilSoundLevels } from '../src/audio/foilAudio';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { foilPhase } from '../src/controls/instruments';
import { Toggle } from '../src/controls/Toggle';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import type { Mount } from '../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { FOIL_FERRY } from '../src/shipyard/parts/catalog';
import { createVesselState } from '../src/vessel/vesselState';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ferry: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[FOIL_FERRY].defaults, hull: FOIL_FERRY };

/** Every module in her recipe, those mounted on others (her console's) too. */
function allModules(mods: readonly Mount[]): Mount[] {
  return mods.flatMap((m) => [m, ...allModules(m.modules ?? [])]);
}

describe("the foiling ferry's helm", () => {
  it('her console carries FOIL / HULL, the ride height knob and the FOILS screen, in a FOILS group, whatever her instruments', () => {
    for (const v of [{}, { controls: 0 }, { controls: 1, touch: 1 }, { controls: 0, oldSchool: 1 }] as Partial<ShipDesign>[]) {
      const b = buildDesign({ ...ferry, ...v });
      const mods = allModules(b.recipe.modules);
      const by = (socket: string) => mods.find((m) => m.socket === socket);
      expect(by('foilMode')?.module, JSON.stringify(v)).toBe('control.toggle');
      expect(by('foilMode')?.bind).toEqual({ value: 'foils.mode' });
      expect(by('foilMode')?.config).toMatchObject({ positions: 3, sweep: true });
      expect(by('foilRide')?.module, JSON.stringify(v)).toBe('control.selector3');
      expect(by('foilRide')?.bind).toEqual({ value: 'foils.ride' });
      const screens = mods.filter((m) => m.module === 'instrument.screen').map((m) => m.config as { screen: string; pages?: string[] });
      // A screen of its own, or a page on her touchscreen.
      expect(screens.some((c) => c.screen === 'foil' || c.pages?.includes('foil')), JSON.stringify(v)).toBe(true);
      // Their own FOILS group: on the switch panel, or moved up onto the dash's face.
      const cc = mods.find((m) => m.module === 'console.standard')!.config as { groups?: { title: string }[]; faceGroups?: { title: string }[] };
      expect([...(cc.groups ?? []), ...(cc.faceGroups ?? [])].map((g) => g.title), JSON.stringify(v)).toContain('FOILS');
    }
  });

  it('no other boat gets them', () => {
    const mods = allModules(buildDesign(DEFAULT_DESIGN).recipe.modules);
    expect(mods.some((m) => ['foilMode', 'foilRide', 'foil'].includes(m.socket ?? ''))).toBe(false);
  });

  it('the switch and the knob work her: FOIL / HULL, and LOW, NORM, HIGH', () => {
    useDesign(ferry);
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], 1 / 60);
    send('foils.mode', 0);
    expect(v.controls.foilMode).toBe(0);
    send('foils.mode', 1);
    expect(v.controls.foilMode).toBe(1);
    send('foils.mode', 2);
    expect(v.controls.foilMode).toBe(2);
    send('foils.mode', 1);
    for (const r of [0, 2, 1]) {
      send('foils.ride', r);
      expect(v.controls.foilRide).toBe(r);
    }
  });

  it('the screen says what she is doing: on her hulls, taking off, flying, landing in HULL', () => {
    const s = createVesselState('v', 'workboat');
    const c = CONFIG.foilHelm;
    expect(foilPhase(s)).toBe('ON HER HULLS'); // (no foils)
    s.foil = { engaged: 0, flaps: [0, 0, 0], clear: 0.2 };
    expect(foilPhase(s)).toBe('ON HER HULLS');
    s.foil = { engaged: 0.4, flaps: [6, 6, 3], clear: (c.landedClear + c.flyingClear) / 2 };
    expect(foilPhase(s)).toBe('TAKING OFF');
    s.foil = { engaged: 1, flaps: [2, 2, 0], clear: 1 };
    expect(foilPhase(s)).toBe('FLYING');
    s.controls.foilMode = 0;
    expect(foilPhase(s)).toBe('LANDING');
    s.foil.clear = 0.1;
    expect(foilPhase(s)).toBe('ON HER HULLS');
  });

  it('her foils on the screen: raising and lowering, up in SHALLOW, landing first if she was flying', () => {
    const s = createVesselState('v', 'workboat');
    s.controls.foilMode = 2;
    s.foil = { engaged: 0, flaps: [0, 0, 0], clear: 1, deploy: 1, draught: 1.2 };
    expect(foilPhase(s)).toBe('LANDING');
    s.foil = { engaged: 0, flaps: [0, 0, 0], clear: 0.1, deploy: 0.5, draught: 1.8 };
    expect(foilPhase(s)).toBe('RAISING FOILS');
    s.foil.deploy = 0;
    expect(foilPhase(s)).toBe('FOILS UP');
    s.controls.foilMode = 1;
    s.foil.deploy = 0.3;
    expect(foilPhase(s)).toBe('LOWERING FOILS');
    s.foil.deploy = 1;
    expect(foilPhase(s)).toBe('ON HER HULLS');
  });

  it('the three-way switch sweeps along its travel: FOIL, HULL, SHALLOW, HULL, FOIL (never FOIL straight to SHALLOW)', () => {
    const t = new Toggle('t', 'foils.mode', 'FOIL / HULL / SHALLOW', () => 1, 3, true);
    const pos = () => (t as unknown as { pos: number }).pos;
    t.sync({ ...createVesselState('v', 'workboat') });
    const seen = [pos()];
    for (let i = 0; i < 5; i++) {
      t.pressStart();
      seen.push(pos());
    }
    expect(seen).toEqual([1, 0, 2, 0, 1, 0]);
  });

  it("her sound: the hull's rush fades and the foils' hiss comes in as she lifts clear, louder and higher with speed", () => {
    const hulls = foilSoundLevels(20, 0.1);
    const flying = foilSoundLevels(20, 1);
    expect(hulls.hiss).toBe(0);
    expect(hulls.washScale).toBe(1);
    expect(flying.hiss).toBeGreaterThan(0);
    expect(flying.washScale).toBeCloseTo(CONFIG.foilHelm.wash.floor, 6);
    expect(foilSoundLevels(25, 1).hiss).toBeGreaterThan(flying.hiss);
    expect(foilSoundLevels(25, 1).toneHz).toBeGreaterThan(flying.toneHz);
  });

  it('lifting clear and touching down are felt once each, not chattering on a wave', () => {
    const lo = CONFIG.foilHelm.liftOff;
    const feel = new FoilFeel();
    const events = [0.1, 0.3, lo.up + 0.01, lo.up - 0.05, lo.up + 0.02, 0.9, (lo.up + lo.down) / 2, lo.down - 0.01, 0.2, lo.up + 0.1].map((c) => feel.update(c));
    expect(events.filter(Boolean)).toEqual(['liftOff', 'touchDown', 'liftOff']);
  });
});
