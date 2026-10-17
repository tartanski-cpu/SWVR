/**
 * Modular boats M2: the throttle lever is the first module, mounted on the workboat from
 * her recipe. It must behave exactly as the hand-built lever did.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import starter from '../../src/boats/starterWorkboat.json';
import { CONFIG } from '../../src/config';
import type { ControlContext } from '../../src/controls/Control';
import type { Lever } from '../../src/controls/Lever';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld, type WorldState } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { holdGroup } from '../../src/modular/bus';
import { validateRecipe, type Recipe } from '../../src/modular/recipe';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from './fakes';

beforeAll(fakeCanvas);

const DT = 1 / 60;
const build = (recipe: Recipe = RECIPES.workboat) => assembleView(recipe, VESSEL_DEFS.workboat, LIBRARY);
/** Where the hand-built lever stood, before the modules (vessel axes, m). */
const OLD_LEVER: [number, number, number] = [0.45, 2.16, -1.15];
/** The starter recipe with only a console and its lever, configured / wired as given. */
const withLever = (lever: Partial<Recipe['modules'][number]>): Recipe => ({
  ...(starter as Recipe),
  modules: [{ socket: 'helm', module: 'console.standard', modules: [{ socket: 'throttle', module: 'control.throttle-lever', ...lever }] }],
  interlocks: [],
});
const leverOf = (a: ReturnType<typeof build>) => a.controls.find((c) => c.id === 'lever') as Lever;

function world() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (playerId: string, control: string, value: number, ref?: string) => stepWorld(world, [{ playerId, targetId: vesselId, control, value, ref } as Intent], DT);
  return { world, v: world.vessels[vesselId], send };
}

describe('the starter workboat recipe', () => {
  it('is valid, and mounts the throttle lever on the console\'s throttle slot', () => {
    expect(validateRecipe(RECIPES.workboat, LIBRARY)).toEqual([]);
    const a = build();
    expect(a.has('helm/throttle')).toBe(true);
    expect(a.modules.find((m) => m.path === 'helm/throttle')?.id).toBe('control.throttle-lever');
  });

  it('a bad lever config is caught with a readable message', () => {
    const bad = withLever({ config: { maxAngleDeg: 100 } });
    expect(validateRecipe(bad, LIBRARY)).toEqual(['helm/throttle: control.throttle-lever: maxAngleDeg should be between 0 and 80']);
    expect(() => build(bad)).toThrow(/maxAngleDeg should be between 0 and 80/);
  });
});

describe('the throttle lever module', () => {
  it('stands where the hand-built lever stood, and is still "the lever" to everything else', () => {
    const a = build();
    const lever = leverOf(a);
    expect(lever.id).toBe('lever');
    expect(lever.channel).toBe('throttle.demand');
    expect(lever.root.name).toBe('control:lever'); // the wheelhouse never hides it
    const p = lever.root.getWorldPosition(new THREE.Vector3());
    p.toArray().forEach((x, i) => expect(x).toBeCloseTo(OLD_LEVER[i], 6));
  });

  it('pushed forward it sends throttle.demand, with the same feel and detent', () => {
    const a = build();
    const lever = leverOf(a);
    for (const m of a.modules) m.root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const ctx: ControlContext = { emit: (c, v) => sent.push([c, v]), haptic: () => {} };
    lever.bind(ctx);
    // The hand on the knob, moved forward by the arc for 20 deg of a 40 deg travel: half ahead.
    const at = new THREE.Vector3(...OLD_LEVER);
    const hand = (deg: number) => ({ position: at.clone().add(new THREE.Vector3(0, 0.24, CONFIG.modules.throttleLever.length * ((deg * Math.PI) / 180))) });
    lever.grabStart(hand(0));
    lever.grabMove(hand(-20));
    expect(sent.at(-1)?.[0]).toBe('throttle.demand');
    expect(sent.at(-1)?.[1]).toBeCloseTo(0.5, 2);
    lever.grabMove(hand(-1.5)); // inside the neutral notch
    expect(sent.at(-1)?.[1]).toBe(0);
  });

  it('its neutral notch is easy to find in VR: wide, sticky, and a firm click going in (owner)', () => {
    const a = build();
    const lever = leverOf(a);
    for (const m of a.modules) m.root.updateMatrixWorld(true);
    const sent: number[] = [];
    const pulses: [number, number][] = [];
    lever.bind({ emit: (_c, v) => sent.push(v), haptic: (i, ms) => pulses.push([i, ms]) });
    const at = new THREE.Vector3(...OLD_LEVER);
    const hand = (deg: number) => ({ position: at.clone().add(new THREE.Vector3(0, 0.24, CONFIG.modules.throttleLever.length * ((deg * Math.PI) / 180))) });
    const tl = CONFIG.modules.throttleLever;
    lever.grabStart(hand(0));
    lever.grabMove(hand(-20)); // half ahead: out of the notch, a light pulse
    expect(pulses.at(-1)).toEqual([tl.release.strength, tl.release.ms]);
    lever.grabMove(hand(-5)); // 5 deg of 40: within the 6 deg notch
    expect(sent.at(-1)).toBe(0);
    expect(pulses.at(-1)).toEqual([tl.click.strength, tl.click.ms]);
    expect(tl.click.strength).toBe(1);
    lever.grabMove(hand(-8)); // past the notch's edge, but it holds (sticky to 8.4 deg)
    expect(sent.at(-1)).toBe(0);
    lever.grabMove(hand(-9)); // pushed through
    expect(sent.at(-1)).toBeCloseTo(9 / 40, 2);
  });

  it('its intents drive the boat exactly like the old channel', () => {
    const a = world();
    const b = world();
    a.send('p1', 'engineStartStop', 1);
    b.send('p1', 'engineStartStop', 1);
    a.send('p1', 'throttle.demand', 0.7);
    b.send('p1', 'lever', 0.7);
    for (let i = 0; i < 600; i++) {
      stepWorld(a.world, [], DT);
      stepWorld(b.world, [], DT);
    }
    expect(a.v.controls.lever).toBe(0.7);
    expect(a.v.engine.rpm).toBe(b.v.engine.rpm);
    expect(a.v.position).toEqual(b.v.position);
    // Out of range or junk, as before: clamped, or ignored.
    a.send('p1', 'throttle.demand', 3);
    expect(a.v.controls.lever).toBe(1);
    a.send('p1', 'throttle.demand', NaN);
    expect(a.v.controls.lever).toBe(1);
  });

  it('multiplayer: the hand on it keeps it, whichever name the others use', () => {
    expect(holdGroup('throttle.demand')).toBe('lever');
    expect(holdGroup('lever')).toBe('lever');
    expect(holdGroup('navLights')).toBeNull();
    const { v, send } = world();
    send('p1', 'hold', 1, 'throttle.demand');
    expect(v.holds.lever).toBe('p1');
    send('p2', 'throttle.demand', 0.5);
    send('p2', 'lever', 0.5);
    expect(v.controls.lever).toBe(0);
    send('p1', 'throttle.demand', 0.3);
    expect(v.controls.lever).toBe(0.3);
    send('p2', 'hold', 0, 'throttle.demand'); // can't let go of someone else's hold
    expect(v.holds.lever).toBe('p1');
    send('p1', 'hold', 0, 'throttle.demand');
    expect(v.holds.lever).toBeUndefined();
    send('p2', 'throttle.demand', -0.4);
    expect(v.controls.lever).toBe(-0.4);
  });

  it('its position round-trips through a save or a snapshot, and the lever shows it', () => {
    const { world: w, v, send } = world();
    send('p1', 'throttle.demand', 0.55);
    const back = JSON.parse(JSON.stringify(w)) as WorldState;
    const restored = back.vessels[v.id];
    expect(restored.controls.lever).toBe(0.55);
    const lever = leverOf(build());
    lever.sync(restored);
    expect(lever.value).toBeCloseTo(0.55, 6);
  });

  it('a recipe can wire it to another key (a second engine, say): it sends that instead', () => {
    const r = withLever({ bind: { demand: 'helm.demand' } });
    expect(validateRecipe(r, LIBRARY)).toEqual([]);
    expect(leverOf(build(r)).channel).toBe('helm.demand');
  });
});
