/**
 * Modular boats M3c: the rest of the wheelhouse as modules: the VHF, the chartplotter, the
 * chart table, the duty board, the whiteboard, the door buttons, the engine hatch, the
 * dipstick and the oil can; and the first recipe interlock (hatch shut: no dipstick, no
 * oil can). Everything must stand and work as the hand-built wheelhouse did.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BoardView } from '../../src/board/boardView';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import type { Control } from '../../src/controls/Control';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { DutyBoardView } from '../../src/duties/dutyBoardView';
import { assembleView } from '../../src/modular/assemble';
import { busOf, resolveKey } from '../../src/modular/bus';
import { ChartPlotter } from '../../src/nav/chartPlotter';
import { RadioSet } from '../../src/rescue/radioView';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { ChartTableView } from '../../src/vessel/view/chartTable';
import { fakeCanvas } from './fakes';

beforeAll(fakeCanvas);

const wb = CONFIG.vessels.workboat;
const wh = wb.layout.wheelhouse;
const build = () => {
  const a = assembleView(RECIPES.workboat, VESSEL_DEFS.workboat, LIBRARY);
  const bridge = new THREE.Group();
  for (const m of a.modules) bridge.add(m.root);
  bridge.updateMatrixWorld(true);
  return a;
};
const state = () => Object.values(createWorld(new IdFactory()).world.vessels)[0];

/** A transform as the old code set it: position, then rotation (Euler, its order). */
function placed(pos: readonly number[], rot: [number, number, number] = [0, 0, 0], order: THREE.EulerOrder = 'XYZ', scale = 1): THREE.Matrix4 {
  const o = new THREE.Object3D();
  o.position.set(pos[0], pos[1], pos[2]);
  o.rotation.set(...rot, order);
  o.scale.setScalar(scale);
  o.updateMatrix();
  return o.matrix;
}
const near = (got: THREE.Matrix4, want: THREE.Matrix4, what: string) => got.elements.forEach((x, i) => expect(x, `${what} [${i}]`).toBeCloseTo(want.elements[i], 6));
const control = (a: ReturnType<typeof build>, id: string) => {
  const c = a.controls.find((x) => x.id === id) as Control;
  expect(c, id).toBeDefined();
  return c;
};

describe('the rest of the wheelhouse, as modules', () => {
  it('the recipe mounts all ten kinds, and the app finds the ones it feeds', () => {
    const a = build();
    const ids = Object.fromEntries(a.modules.map((m) => [m.path, m.id]));
    expect(ids).toMatchObject({
      vhf: 'radio.vhf',
      chartplotter: 'nav.chartplotter',
      chartTable: 'furniture.chart-table',
      dutyBoard: 'furniture.duty-board',
      whiteboard: 'furniture.whiteboard',
      doorIn: 'control.door-button',
      doorOut: 'control.door-button',
      engineHatch: 'fitting.hatch-cover',
      dipstick: 'tool.dipstick',
      oilCan: 'tool.oil-can',
    });
    expect(a.api('radio.vhf')).toBeInstanceOf(RadioSet);
    expect(a.api('nav.chartplotter')).toBeInstanceOf(ChartPlotter);
    expect(a.api('furniture.chart-table')).toBeInstanceOf(ChartTableView);
    expect(a.api('furniture.duty-board')).toBeInstanceOf(DutyBoardView);
    expect(a.api('furniture.whiteboard')).toBeInstanceOf(BoardView);
    expect(a.api('no.such-module')).toBeNull();
  });

  it('the VHF and the chartplotter hang where they did, turned the same, their brackets up to the roof', () => {
    const a = build();
    const radio = a.api<RadioSet>('radio.vhf')!;
    near(radio.root.matrixWorld, placed(wb.bridge.radio.position, [0, (35 * Math.PI) / 180, 0]), 'VHF');
    const plotter = a.api<ChartPlotter>('nav.chartplotter')!;
    near(plotter.root.matrixWorld, placed(wb.bridge.chart.position, [0, (-35 * Math.PI) / 180, 0]), 'chartplotter');
    // The handset still on its clip, beside the set.
    const h = control(a, 'handset').root.getWorldPosition(new THREE.Vector3());
    expect(h.distanceTo(new THREE.Vector3(...wb.bridge.radio.position))).toBeLessThan(0.3);
    // Their fixed parts (case, brackets) are merged with the bridge's; the brackets reach the roof.
    for (const path of ['vhf', 'chartplotter']) {
      const m = a.modules.find((x) => x.path === path)!;
      const box = new THREE.Box3();
      for (const g of m.instance.staticParts) box.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
      expect(box.max.y, path).toBeCloseTo(wh.roofY, 6);
    }
  });

  it('the chart table stands where it stood: its chart, holder, lamp switch and leaf knob', () => {
    const a = build();
    const table = a.api<ChartTableView>('furniture.chart-table')!;
    // The old table, built in the boat's axes from the vessel config.
    const old = new ChartTableView(wb.chartTable, wh.floorY);
    old.root.updateMatrixWorld(true);
    const toBoat = (t: ChartTableView, x: number, y: number, z: number) => t.root.localToWorld(new THREE.Vector3(x, y, z));
    const r = table.chartRect;
    const o = old.chartRect;
    near(new THREE.Matrix4().setPosition(toBoat(table, r.x0, r.y, r.z0)), new THREE.Matrix4().setPosition(toBoat(old, o.x0, o.y, o.z0)), 'chart corner');
    near(new THREE.Matrix4().setPosition(toBoat(table, r.x1, r.y, r.z1)), new THREE.Matrix4().setPosition(toBoat(old, o.x1, o.y, o.z1)), 'chart far corner');
    near(new THREE.Matrix4().setPosition(toBoat(table, table.holderAt[0], table.top, table.holderAt[1])), new THREE.Matrix4().setPosition(toBoat(old, old.holderAt[0], old.top, old.holderAt[1])), 'pen holder');
    expect(table.scale).toBeCloseTo(old.scale, 9);
    near(table.lampSwitch.root.matrixWorld, old.lampSwitch.root.matrixWorld, 'lamp switch');
    near(table.leafHandle.root.matrixWorld, old.leafHandle.root.matrixWorld, 'leaf knob');
    // Its controls work its keys now; the old names mean the same.
    expect(resolveKey(table.lampSwitch.channel)).toBe(resolveKey('chartLamp'));
    expect(resolveKey(table.leafHandle.channel)).toBe(resolveKey('chartLeaf'));
  });

  it('its footprint is the walk area\'s table: the whole table unfolded, a strip along the wall folded', () => {
    const a = build();
    const s = state();
    const ct = wb.chartTable;
    const [open] = a.footprints(busOf(s));
    for (const [k, v] of Object.entries({ x0: ct.x0, x1: ct.x1, z0: ct.z0, z1: ct.z1, top: wh.floorY + ct.height })) expect(open[k as keyof typeof open], k).toBeCloseTo(v, 6);
    s.controls.chartLeaf = 0;
    const [folded] = a.footprints(busOf(s));
    expect(folded.x1).toBeCloseTo(ct.x0 + 0.1, 6);
  });

  it('the boards hang where they did, facing the same way', () => {
    const a = build();
    near(a.api<DutyBoardView>('furniture.duty-board')!.root.matrixWorld, placed(wb.dutyBoard.position, [0, -Math.PI / 2, 0]), 'duty board');
    near(a.api<BoardView>('furniture.whiteboard')!.root.matrixWorld, placed(wb.whiteboard.position, [0, Math.PI, 0]), 'whiteboard');
  });

  it('the door buttons, the hatch cover, the dipstick and the oil can stand where they did', () => {
    const a = build();
    const db = wb.layout.doorButtons;
    const eh = wb.layout.engineHatch;
    const mt = wb.maintenance;
    const ref: [string, THREE.Matrix4, string][] = [
      ['doorIn', placed([db.x, wh.floorY + db.height, wh.aft - wh.wall], [-Math.PI / 2, 0, 0]), 'door'],
      ['doorOut', placed([db.x, wh.floorY + db.height, wh.aft], [-Math.PI / 2, Math.PI, 0], 'YXZ'), 'door'],
      ['engineHatch', placed([eh.x1, wh.floorY, (eh.z0 + eh.z1) / 2]), 'engineHatch'],
      ['dipstick', placed([mt.dipstick[0], wh.floorY - 0.12 - 0.2, mt.dipstick[1]]), 'dipstick'],
      ['oilCan', placed([mt.oilCan[0], wh.floorY - mt.shelfDrop, mt.oilCan[1]], [0, Math.PI / 2, 0], 'XYZ', 0.85), 'oilTopUp'],
    ];
    for (const [id, m, channel] of ref) {
      const c = control(a, id);
      near(c.root.matrixWorld, m, id);
      expect(resolveKey(c.channel), `${id} sends ${c.channel}`).toBe(resolveKey(channel));
    }
    // (Not the console's ENGINE group title: the one on the floor, read from inboard.)
    const engine = a.labels.find((l) => l.text === 'ENGINE' && l.yaw === -Math.PI / 2)!;
    [eh.x0 + 0.2, wh.floorY + 0.002, eh.z1 - 0.1].forEach((v, i) => expect(engine.at[i]).toBeCloseTo(v, 6));
  });
});

describe('the first recipe interlock: hatch shut, no dipstick and no oil can', () => {
  it('disables them while the hatch is shut, and lets them be used once it is open', () => {
    const a = build();
    const s = state();
    const dip = control(a, 'dipstick');
    const can = control(a, 'oilCan');
    s.controls.engineHatch = 0;
    a.update(s, 1 / 60, null);
    expect([dip.enabled, can.enabled]).toEqual([false, false]);
    s.controls.engineHatch = 1;
    a.update(s, 1 / 60, null);
    expect([dip.enabled, can.enabled]).toEqual([true, true]);
    expect(control(a, 'engineHatch').enabled).toBe(true); // the hatch itself, always
  });

  it('a recipe whose interlock names a control she hasn\'t got is refused, in words', () => {
    const bad = { ...RECIPES.workboat, interlocks: [{ when: 'hatch.engine.open == false', disable: ['control:sparePump'] }] };
    expect(() => assembleView(bad, VESSEL_DEFS.workboat, LIBRARY)).toThrow(/disables 'sparePump', and no module on her has a control by that id/);
  });
});

describe('the wheelhouse\'s intents, by bus key and by old name', () => {
  it('do exactly the same to the boat', () => {
    const run = (names: [string, number][]) => {
      const { world, vesselId } = createWorld(new IdFactory());
      world.environment.waves = [];
      world.geography = 'openSea';
      const v = world.vessels[vesselId];
      v.engine.oil = 0.5;
      v.engine.sinceCheck = 500;
      for (const [control, value] of names) stepWorld(world, [{ playerId: 'p1', targetId: vesselId, control, value } as Intent], 1 / 60);
      return v;
    };
    const old = run([['engineHatch', 1], ['dipstick', 1], ['oilTopUp', 1], ['door', 0], ['chartLeaf', 0], ['chartLamp', 1]]);
    const now = run([['hatch.engine.open', 1], ['propulsion.oilCheck', 1], ['propulsion.oilTopUp', 1], ['door.aft.open', 0], ['chartTable.leafOpen', 0], ['chartTable.lamp', 1]]);
    expect([now.engine.oil, (now.engine.sinceCheck ?? 1e9) < 1, now.controls.door, now.controls.chartLeaf]).toEqual([1, true, 0, 0]);
    expect(JSON.stringify(now)).toBe(JSON.stringify(old));
  });
});
