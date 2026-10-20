/**
 * Modular boats M3b: the overhead panel, the FM set, the breaker panel and the battery
 * switches are modules, mounted from the starter recipe; switch bats and button caps are
 * shared instanced parts. The boat must look and work exactly as the hand-built bridge did.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import type { Control } from '../../src/controls/Control';
import type { Toggle } from '../../src/controls/Toggle';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { resolveKey } from '../../src/modular/bus';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { BREAKERS } from '../../src/vessel/vesselState';
import { fakeCanvas } from './fakes';

beforeAll(fakeCanvas);

const wb = CONFIG.vessels.workboat;
const build = () => {
  const a = assembleView(RECIPES.workboat, VESSEL_DEFS.workboat, LIBRARY);
  // Hung on a bridge root, as the game does.
  const bridge = new THREE.Group();
  for (const m of a.modules) bridge.add(m.root);
  for (const m of a.shared) bridge.add(m);
  bridge.updateMatrixWorld(true);
  return { a, bridge };
};

/**
 * Where the hand-built bridge (v1.0 code) put each of these controls, and how it turned
 * them: rebuilt here the old way, as a reference.
 */
function before(): Map<string, { matrix: THREE.Matrix4; channel: string }> {
  const out = new Map<string, { matrix: THREE.Matrix4; channel: string }>();
  const add = (id: string, channel: string, o: THREE.Object3D) => {
    o.updateWorldMatrix(true, false); // its parents' too
    out.set(id, { matrix: o.matrixWorld.clone(), channel });
  };
  // The overhead panel: switches hung upside down at x along the panel.
  const [px, py, pz] = wb.overheadPanel.position;
  for (const [id, x] of [['deckFore', -0.32], ['deckAft', -0.21], ['railLights', -0.1], ['fmOn', 0.27], ['fmTune', 0.36]] as const) {
    const o = new THREE.Object3D();
    o.position.set(px + x, py, pz);
    o.rotation.x = Math.PI;
    add(id, id, o);
  }
  // The breaker panel: facing inboard, tilted back; two rows of four, scaled 0.8.
  const panel = new THREE.Object3D();
  panel.position.fromArray(wb.electrics.panel.position);
  panel.rotation.set((-40 * Math.PI) / 180, -Math.PI / 2, 0, 'YXZ');
  BREAKERS.forEach((k, i) => {
    const t = new THREE.Object3D();
    t.position.set(-0.27 + 0.235 + (i % 4) * 0.078, [0.075, -0.075][Math.floor(i / 4)] - 0.005, 0);
    t.rotation.x = Math.PI / 2;
    t.scale.setScalar(0.8);
    panel.add(t);
    add(`brk_${k}`, `brk_${k}`, t);
  });
  // The battery master and selector: on the aft wall, facing forward.
  // (Their ids are now their sockets' names; nothing else knew them by the old ones.)
  for (const [id, channel, at] of [['batteryMaster', 'master', wb.electrics.masterSwitch.position], ['batterySelector', 'batSelect', wb.electrics.selectorSwitch.position]] as const) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.rotation.y = Math.PI;
    add(id, channel, o);
  }
  return out;
}

const near = (got: THREE.Matrix4, want: THREE.Matrix4, what: string) => got.elements.forEach((x, i) => expect(x, `${what} [${i}]`).toBeCloseTo(want.elements[i], 6));

describe('the power controls, as modules', () => {
  it('the recipe mounts the overhead panel (three switches and the FM set), the breaker panel and the battery switches', () => {
    const { a } = build();
    const ids = Object.fromEntries(a.modules.map((m) => [m.path, m.id]));
    expect(ids).toMatchObject({
      overhead: 'panel.overhead',
      'overhead/deckFore': 'control.toggle',
      'overhead/deckAft': 'control.toggle',
      'overhead/railLights': 'control.toggle',
      'overhead/fm': 'radio.fm',
      breakerPanel: 'panel.breakers',
      batteryMaster: 'switch.battery-master',
      batterySelector: 'switch.battery-selector',
    });
  });

  it('every control stands, faces and scales as it did, under the same id, sending a key that means its old channel', () => {
    const { a } = build();
    const ref = before();
    expect(ref.size).toBe(14);
    for (const [id, { matrix, channel }] of ref) {
      const c = a.controls.find((x) => x.id === id) as Control;
      expect(c, id).toBeDefined();
      near(c.root.matrixWorld, matrix, id);
      expect(resolveKey(c.channel), `${id} sends ${c.channel}`).toBe(resolveKey(channel));
    }
  });

  it('the overhead legends lie under the panel, aft of their controls, sized as before', () => {
    const { a } = build();
    const [px, py, pz] = wb.overheadPanel.position;
    for (const [text, x] of [['FOREDECK', -0.32], ['AFT DECK', -0.21], ['RAIL', -0.1], ['FM', 0.27], ['TUNE', 0.36]] as const) {
      const l = a.labels.find((q) => q.text === text)!;
      expect(l, text).toBeDefined();
      expect(l.underside).toBe(true);
      expect(l.size).toEqual([0.09, 0.0225]);
      expect(l.offset).toBe(0.07);
      l.at.forEach((v, i) => expect(v).toBeCloseTo([px + x, py, pz][i], 6));
    }
  });
});

describe('shared parts: every switch bat one draw call, every button cap another', () => {
  it('draws the 19 toggle bats (console 7, overhead 3 + FM 1, breakers 7, chart lamp 1) and 6 button caps (2 on the console since HEAT went, 1 more, the chartplotter zoom 3) as two instanced meshes; the deck gear\'s 4 button caps (tow winch 2, A-frame 2) as a third', () => {
    const { a } = build();
    expect(a.sharedCounts).toEqual({ toggleBat: 7 + 3 + 1 + 7 + 1, buttonCap: 2 + 1 + 3, deckButtonCap: 2 + 2 });
    expect(a.shared.map((m) => [m.name, m.count])).toEqual([
      ['shared:toggleBat', 19],
      ['shared:buttonCap', 6],
      ['shared:deckButtonCap', 4],
    ]);
  });

  it('each instance stands exactly where its (hidden) part is, and follows it as the switch is thrown', () => {
    const { a, bridge } = build();
    const bats = a.shared.find((m) => m.name === 'shared:toggleBat')!;
    const toggles = a.controls.filter((c): c is Toggle => 'batMesh' in c);
    expect(toggles).toHaveLength(19);
    const check = () => {
      bridge.updateMatrixWorld(true);
      const m = new THREE.Matrix4();
      toggles.forEach((t, i) => {
        expect(t.batMesh.visible).toBe(false); // drawn by its instance instead
        bats.getMatrixAt(i, m);
        near(m.premultiply(bridge.matrixWorld), t.batMesh.matrixWorld, t.id);
      });
    };
    check();
    // Throw the radio breaker: its bat tips over; its instance follows on the next frame.
    const brk = toggles.find((t) => t.id === 'brk_radio')!;
    const s = createWorld(new IdFactory()).world;
    const v = Object.values(s.vessels)[0];
    v.electrics!.breakers.radio = 0;
    brk.sync(v);
    a.update(v, 1 / 60, null);
    check();
  });

  it('the hover glow and a lit button reach their instances', () => {
    const { a } = build();
    const caps = a.shared.find((m) => m.name === 'shared:buttonCap')!;
    const glow = caps.geometry.getAttribute('instanceEmissive');
    const s = createWorld(new IdFactory()).world;
    const v = Object.values(s.vessels)[0];
    const start = a.controls.find((c) => c.id === 'start')!;
    const i = a.modules.filter((m) => m.instance.controls.some((c) => 'cap' in c)).findIndex((m) => m.instance.controls.includes(start));
    a.update(v, 1 / 60, null);
    expect(glow.getX(i) + glow.getY(i) + glow.getZ(i)).toBe(0);
    start.setHover(true);
    a.update(v, 1 / 60, null);
    expect(glow.getY(i)).toBeGreaterThan(0); // the green hover highlight
    start.setHover(false);
    v.engine.phase = 'running'; // START glows while she runs
    start.sync(v);
    a.update(v, 1 / 60, null);
    expect(glow.getY(i)).toBeGreaterThan(0);
  });

  it('the wheelhouse\'s shared meshes hide with its small parts from outside; the deck gear\'s do not', () => {
    const { a } = build();
    expect(a.shared.map((m) => [m.name, m.userData.interiorDetail])).toEqual([
      ['shared:toggleBat', true],
      ['shared:buttonCap', true],
      ['shared:deckButtonCap', false],
    ]);
  });
});

describe('the power controls\' intents, by bus key and by old name', () => {
  function world() {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p1', targetId: vesselId, control, value } as Intent], 1 / 60);
    return { v: world.vessels[vesselId], send };
  }

  it('do exactly the same to the boat', () => {
    const steps: [string, string, number][] = [
      ['master', 'electrical.master', 1],
      ['batSelect', 'electrical.selector', 3],
      ['brk_deckLights', 'breaker.deckLights', 1],
      ['brk_radio', 'breaker.radio', 1],
      ['deckFore', 'lights.deckFore', 1],
      ['deckAft', 'lights.deckAft', 1],
      ['railLights', 'lights.rail', 1],
      ['fmOn', 'fm.on', 1],
      ['fmTune', 'fm.tune', 1],
      ['fmTune', 'fm.tune', 1],
      ['brk_hydraulics', 'breaker.hydraulics', 0],
    ];
    const a = world();
    const b = world();
    for (const [old, key, value] of steps) {
      a.send(old, value);
      b.send(key, value);
    }
    for (let i = 0; i < 60; i++) {
      a.send('lever', 0);
      b.send('throttle.demand', 0);
    }
    expect(b.v.controls.fmStation).toBe(2);
    expect(JSON.stringify(b.v)).toBe(JSON.stringify(a.v));
  });
});
