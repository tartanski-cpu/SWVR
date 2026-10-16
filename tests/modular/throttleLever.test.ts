/**
 * Modular boats M2: the throttle lever is the first module, mounted on the workboat from
 * her recipe. It must behave exactly as the hand-built lever did.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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

const DT = 1 / 60;
const build = (recipe: Recipe = RECIPES.workboat) => assembleView(recipe, VESSEL_DEFS.workboat, LIBRARY);

function world() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (playerId: string, control: string, value: number, ref?: string) => stepWorld(world, [{ playerId, targetId: vesselId, control, value, ref } as Intent], DT);
  return { world, v: world.vessels[vesselId], send };
}

describe('the starter workboat recipe', () => {
  it('is valid, and mounts the throttle lever on the hull\'s throttle socket', () => {
    expect(validateRecipe(RECIPES.workboat, LIBRARY)).toEqual([]);
    const a = build();
    expect(a.has('throttle')).toBe(true);
    expect(a.modules.map((m) => `${m.path}: ${m.id}`)).toEqual(['throttle: control.throttle-lever']);
  });

  it('a bad lever config is caught with a readable message', () => {
    const bad = { ...(starter as Recipe), modules: [{ socket: 'throttle', module: 'control.throttle-lever', config: { maxAngleDeg: 100 } }] };
    expect(validateRecipe(bad, LIBRARY)).toEqual(['throttle: control.throttle-lever: maxAngleDeg should be between 0 and 80']);
    expect(() => build(bad)).toThrow(/maxAngleDeg should be between 0 and 80/);
  });
});

describe('the throttle lever module', () => {
  it('stands where the hand-built lever stood, and is still "the lever" to everything else', () => {
    const a = build();
    const lever = a.controls[0] as Lever;
    expect(lever.id).toBe('lever');
    expect(lever.channel).toBe('throttle.demand');
    expect(lever.root.name).toBe('control:lever'); // the wheelhouse never hides it
    const p = lever.root.getWorldPosition(new THREE.Vector3());
    expect(p.toArray()).toEqual(CONFIG.vessels.workboat.bridge.lever.position);
  });

  it('pushed forward it sends throttle.demand, with the same feel and detent', () => {
    const a = build();
    const lever = a.controls[0] as Lever;
    a.modules[0].root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const ctx: ControlContext = { emit: (c, v) => sent.push([c, v]), haptic: () => {} };
    lever.bind(ctx);
    // The hand on the knob, moved forward by the arc for 20 deg of a 40 deg travel: half ahead.
    const at = new THREE.Vector3(...CONFIG.vessels.workboat.bridge.lever.position);
    const hand = (deg: number) => ({ position: at.clone().add(new THREE.Vector3(0, 0.24, CONFIG.modules.throttleLever.length * ((deg * Math.PI) / 180))) });
    lever.grabStart(hand(0));
    lever.grabMove(hand(-20));
    expect(sent.at(-1)?.[0]).toBe('throttle.demand');
    expect(sent.at(-1)?.[1]).toBeCloseTo(0.5, 2);
    lever.grabMove(hand(-1.5)); // inside the neutral notch
    expect(sent.at(-1)?.[1]).toBe(0);
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
    const lever = build().controls[0] as Lever;
    lever.sync(restored);
    expect(lever.value).toBeCloseTo(0.55, 6);
  });

  it('a recipe can wire it to another key (a second engine, say): it sends that instead', () => {
    const r: Recipe = { ...RECIPES.workboat, modules: [{ socket: 'throttle', module: 'control.throttle-lever', bind: { demand: 'helm.demand' } }] };
    expect(validateRecipe(r, LIBRARY)).toEqual([]);
    expect(build(r).controls[0].channel).toBe('helm.demand');
  });
});
