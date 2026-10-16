/**
 * Modular boats M3a: the helm console and everything on it are modules, mounted from the
 * starter recipe. The boat must look and work exactly as the hand-built bridge did: each
 * control where it stood, sending a bus key that means what its old channel meant.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import type { Control, ControlContext } from '../../src/controls/Control';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { busOf, resolveKey } from '../../src/modular/bus';
import { validateRecipe } from '../../src/modular/recipe';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from './fakes';

beforeAll(fakeCanvas);

const build = () => assembleView(RECIPES.workboat, VESSEL_DEFS.workboat, LIBRARY);

/**
 * The hand-built bridge (V1.0 config): each control's id, where it stood (vessel axes),
 * the channel it sent and the label engraved by it.
 */
const BEFORE: [id: string, at: [number, number, number], channel: string, label: string | null][] = [
  ['wheel', [0, 2.32, -1.2], 'helm', null],
  ['lever', [0.45, 2.16, -1.15], 'lever', 'AHEAD ▲  ▼ ASTERN'],
  ['navLights', [-1.29, 2.16, -1.52], 'navLights', 'NAV LIGHTS'],
  ['cabinLight', [-1.14, 2.16, -1.52], 'cabinLight', 'CABIN'],
  ['wipers', [-0.99, 2.16, -1.52], 'wipers', 'WIPERS'],
  ['firePump', [-0.82, 2.16, -1.52], 'firePump', 'FIRE PUMP'],
  ['spotlight', [-0.48, 2.16, -1.52], 'spotlight', 'SPOT'],
  ['horn', [-0.28, 2.16, -1.52], 'horn', 'HORN'],
  ['anchor', [0.39, 2.16, -1.52], 'anchor', 'ANCHOR'],
  ['trawl', [0.52, 2.16, -1.52], 'trawl', 'TRAWL'],
  ['heat', [0.8, 2.16, -1.5], 'heat', 'HEAT'],
  ['start', [0.94, 2.16, -1.5], 'start', 'START'],
  ['key', [1.08, 2.16, -1.5], 'key', 'KEY'],
  ['spotJoystick', [-0.45, 2.16, -1.15], 'spotPan', 'SEARCHLIGHT'],
  ['monJoystick', [-0.85, 2.16, -1.15], 'monPan', 'MONITOR'],
];

const near = (got: THREE.Vector3 | [number, number, number], want: [number, number, number]) => {
  const g = Array.isArray(got) ? got : got.toArray();
  g.forEach((x, i) => expect(x).toBeCloseTo(want[i], 6));
};

describe('the helm console, as modules', () => {
  it('the recipe is valid and mounts the console with its 22 parts, and the nav display', () => {
    expect(validateRecipe(RECIPES.workboat, LIBRARY)).toEqual([]);
    const a = build();
    expect(a.modules[0].id).toBe('console.standard');
    expect(a.modules.filter((m) => m.path.startsWith('helm/'))).toHaveLength(22);
    expect(a.has('navDisplay')).toBe(true);
  });

  it('every control stands where it stood, under the same id, sending a key that means its old channel', () => {
    const a = build();
    for (const m of a.modules) m.root.updateMatrixWorld(true);
    expect(a.controls.map((c) => c.id).sort()).toEqual(BEFORE.map(([id]) => id).sort());
    for (const [id, at, channel] of BEFORE) {
      const c = a.controls.find((x) => x.id === id) as Control;
      near(c.root.getWorldPosition(new THREE.Vector3()), at);
      expect(resolveKey(c.channel), `${id} sends ${c.channel}`).toBe(resolveKey(channel));
    }
    // The wheel still leans back toward the helmsman by 22 deg.
    const wheel = a.controls.find((x) => x.id === 'wheel')!;
    const e = new THREE.Euler().setFromQuaternion(wheel.root.getWorldQuaternion(new THREE.Quaternion()));
    expect(e.x).toBeCloseTo((-22 * Math.PI) / 180, 6);
  });

  it('the warning lamps and the start-up card stand where they stood', () => {
    const a = build();
    const at = (path: string) => a.modules.find((m) => m.path === path)!.root.position.toArray() as [number, number, number];
    near(at('helm/lamps'), [0.95, 2.165, -1.6]);
    near(at('helm/card'), [1.25, 2.175, -1.47]);
  });

  it('each control keeps its engraved label beside it, and the group titles are there', () => {
    const a = build();
    for (const [id, at, , label] of BEFORE) {
      if (!label) continue;
      const l = a.labels.find((x) => x.text === label);
      expect(l, `${id}'s label`).toBeDefined();
      near(l!.at, at);
    }
    expect(a.labels.filter((l) => l.title).map((l) => l.text)).toEqual(['LIGHTS', 'SEARCH · FIRE', 'DECK', 'ENGINE']);
  });

  it('the six screens share one mesh (one draw call)', () => {
    const a = build();
    expect(a.screens?.name).toBe('instruments');
    expect(a.screens!.geometry.attributes.position.count).toBe(6 * 4);
  });

  it('the joysticks drive their own keys, at their own rates', () => {
    const a = build();
    const sent: Record<string, number> = {};
    const ctx: ControlContext = { emit: (c, v) => (sent[c] = v), haptic: () => {} };
    const s = createWorld(new IdFactory()).world;
    const v = Object.values(s.vessels)[0];
    for (const id of ['spotJoystick', 'monJoystick']) {
      const j = a.controls.find((x) => x.id === id)!;
      j.root.updateMatrixWorld(true);
      j.bind(ctx);
      j.sync(v);
      const base = j.root.getWorldPosition(new THREE.Vector3());
      j.grabStart({ position: base.clone().add(new THREE.Vector3(0, 0.14, 0)) });
      j.grabMove({ position: base.clone().add(new THREE.Vector3(0.08, 0.14, 0)) }); // full starboard
      for (let i = 0; i < 10; i++) j.tick(0.1);
      j.grabEnd({ position: base });
    }
    expect(sent['searchlight.pan']).toBeCloseTo(50, 0);
    expect(sent['monitor.pan']).toBeCloseTo(40, 0);
  });
});

describe('the console\'s intents, by bus key and by old name', () => {
  function world() {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p1', targetId: vesselId, control, value } as Intent], 1 / 60);
    return { world, v: world.vessels[vesselId], send };
  }

  it('do exactly the same to the boat', () => {
    const steps: [string, string, number][] = [
      ['key', 'ignition.key', 1],
      ['navLights', 'lights.nav', 1],
      ['cabinLight', 'lights.cabin', 2],
      ['wipers', 'wipers.on', 1],
      ['spotlight', 'searchlight.on', 1],
      ['spotPan', 'searchlight.pan', 30],
      ['monPan', 'monitor.pan', -20],
      ['anchor', 'anchor.letGo', 1],
      ['horn', 'horn.sound', 1],
      ['heat', 'ignition.heat', 1],
      ['helm', 'helm.demand', 0.4],
    ];
    const a = world();
    const b = world();
    for (const [old, key, value] of steps) {
      a.send(old, value);
      b.send(key, value);
    }
    for (let i = 0; i < 120; i++) {
      a.send('lever', 0);
      b.send('throttle.demand', 0);
    }
    expect(JSON.stringify(b.v)).toBe(JSON.stringify(a.v));
  });

  it('the warning lamps read as the old lamps did: key on, engine stopped -> oil, charge, neutral lit', () => {
    const { v, send } = world();
    send('ignition.key', 1);
    const bus = busOf(v);
    expect(['oil', 'charge', 'glow', 'neutral', 'bilge'].map((l) => bus.get(`lamp.${l}` as never))).toEqual(['on', 'on', 'off', 'on', 'off']);
  });
});
