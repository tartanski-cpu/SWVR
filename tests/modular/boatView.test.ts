/**
 * Modular boats M6c: each boat drawn and worked from her recipe (app/boatView.ts; it was the
 * hand-built Bridge). The lights are modules that draw themselves; the engine under the
 * hatch is the diesel's; the skiff's tiller is a module whose controls work the skiff.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BoatView } from '../../src/app/boatView';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { InteractionSystem } from '../../src/controls/InteractionSystem';
import { IdFactory } from '../../src/core/ids';
import { createWorld } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { hasWheelhouse, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from './fakes';

beforeAll(fakeCanvas);

const world = () => createWorld(new IdFactory(), undefined, { tender: true }).world;
const boatOf = (defId: string, home: boolean) => {
  const w = world();
  const v = Object.values(w.vessels).find((x) => x.defId === defId)!;
  const view = new BoatView(v.id, VESSEL_DEFS[defId], assembleView(RECIPES[defId], VESSEL_DEFS[defId], LIBRARY), home);
  view.root.updateMatrixWorld(true);
  return { v, view };
};
const night = { darkness: 1, viewer: new THREE.Vector3(0, 2, -30) };
const spotlights = (o: THREE.Object3D) => {
  const out: THREE.SpotLight[] = [];
  o.traverse((x) => x instanceof THREE.SpotLight && out.push(x));
  return out;
};

describe('the workboat as drawn from her recipe', () => {
  it('her floods light only when switched on with 12 V on the deck lights circuit', () => {
    const { v, view } = boatOf('workboat', true);
    const flood = view.moduleRoot('light.flood')!;
    expect(spotlights(flood)).toHaveLength(1);
    v.controls.deckFore = 1;
    view.update(v, 0.1, false, null, night);
    expect(spotlights(flood)[0].visible).toBe(true);
    v.electrics!.breakers.deckLights = 0;
    view.update(v, 0.1, false, null, night);
    expect(spotlights(flood)[0].visible).toBe(false);
  });

  it('the cabin lamp goes red at night on its switch; the nav lights glow only when on', () => {
    const { v, view } = boatOf('workboat', true);
    const cabin = view.moduleRoot('light.cabin')!;
    const lamp = (): THREE.PointLight => cabin.getObjectsByProperty('isPointLight', true)[0] as THREE.PointLight;
    v.controls.cabinLight = 2;
    view.update(v, 0.1, false, null, night);
    expect(lamp().visible).toBe(true);
    expect(lamp().color.getHex()).toBe(0xff2008);
    const nav = view.moduleRoot('light.navigation')!;
    const glow = () => nav.getObjectsByProperty('isPoints', true)[0];
    view.update(v, 0.1, false, null, night);
    expect(glow().visible).toBe(false);
    v.controls.navLights = 1;
    view.update(v, 0.1, false, null, night);
    expect(glow().visible).toBe(true);
  });

  it('the engine under the hatch is the diesel\'s: its parts go in her one fixed mesh', () => {
    const a = assembleView(RECIPES.workboat, VESSEL_DEFS.workboat, LIBRARY);
    const engine = a.modules.find((m) => m.id === 'propulsion.diesel-inboard')!;
    expect(engine.instance.staticParts.length).toBeGreaterThan(10);
    const { view } = boatOf('workboat', true);
    expect(view.root.getObjectsByProperty('name', 'bridgeFixed')).toHaveLength(1);
  });

  it('her doors and gate are her hull\'s, built where she has them; her controls go to the home boat', () => {
    const { view } = boatOf('workboat', true);
    expect(hasWheelhouse(VESSEL_DEFS.workboat)).toBe(true);
    expect(view.door && view.sideGate && view.rainGlass).toBeTruthy();
    expect(view.controls.every((c) => c.route === null)).toBe(true);
  });
});

describe('the skiff as drawn from her recipe', () => {
  it('her tiller is a module on her outboard; no doors, no glass', () => {
    expect(RECIPES.skiff.modules[0].modules?.map((m) => m.module)).toEqual(['control.tiller']);
    const { view } = boatOf('skiff', false);
    expect(view.moduleList).toEqual(['outboard/tiller: control.tiller', 'bowCleat: deck.boat-cleat', 'sternCleat: deck.boat-cleat', 'tubes: hull.tubes']);
    expect(view.controls.map((c) => c.id)).toEqual(['tiller', 'outboardGear', 'outboardPower', 'painter', 'sternPainter']);
    expect(view.door).toBeNull();
    expect(view.rainGlass).toBeNull();
    // At the motor's pivot on her transom, where the app hung it (the boat's axes).
    const tiller = view.controls[0];
    expect(tiller.root.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([...CONFIG.vessels.skiff.outboard.tiller.pivot]);
  });

  it('its controls work the skiff, not the workboat: the motor button sends to her', () => {
    const { v, view } = boatOf('skiff', false);
    expect(view.controls.every((c) => c.route === v.id)).toBe(true);
    const sent: string[] = [];
    const sys = new InteractionSystem(view.controls, (ch) => sent.push(ch), () => {});
    const button = view.controls.find((c) => c.id === 'outboardPower')!;
    const at = button.hitObjects[0].getWorldPosition(new THREE.Vector3());
    const eye = at.clone().add(new THREE.Vector3(0, 0.6, 0.3));
    const ray = new THREE.Ray(eye, at.clone().sub(eye).normalize());
    sys.updateDesktop(ray, false, false, false, 0, 0);
    sys.updateDesktop(ray, true, true, false, 0, 0);
    expect(sent).toContain(`${v.id}:obPower`);
  });

  it('under her tarpaulin she is neither drawn nor usable', () => {
    const { view } = boatOf('skiff', false);
    view.setCovered(true);
    expect(view.root.visible).toBe(false);
    expect(view.controls.every((c) => !c.enabled)).toBe(true);
    view.setCovered(false);
    expect(view.controls.every((c) => c.enabled)).toBe(true);
  });
});

describe('the FM set on its own under a cabin roof (the landing craft)', () => {
  it('hangs under her roof to starboard, in its own box on a strap up to the roof, its switch and TUNE there to work', async () => {
    const view = assembleView(RECIPES.landingCraft, VESSEL_DEFS.landingCraft, LIBRARY);
    const fm = view.modules.find((m) => m.id === 'radio.fm')!;
    expect(fm).toBeDefined();
    fm.root.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(fm.root.matrixWorld);
    expect(at.x).toBeGreaterThan(0.2); // to starboard, opposite the VHF
    expect(at.y).toBeLessThan(VESSEL_DEFS.landingCraft.layout.wheelhouse!.roofY);
    const ids = view.controls.map((c) => c.id);
    for (const id of ['fmOn', 'fmTune']) expect(ids).toContain(id);
  });
});

describe('the pull-down whiteboard (a design with the advanced controls)', () => {
  it('rolled up in its box under the roof; its handle pulls it down, and again rolls it up; written on only when down', async () => {
    const { useDesign } = await import('../../src/boats/sims');
    const { DEFAULT_DESIGN } = await import('../../src/shipyard/design');
    const { createVesselState } = await import('../../src/vessel/vesselState');
    useDesign({ ...DEFAULT_DESIGN, hull: 2, controls: 1 });
    const view = assembleView(RECIPES.design, VESSEL_DEFS.design, LIBRARY);
    const wb = view.modules.find((m) => m.id === 'furniture.whiteboard')!;
    const board = view.api<import('../../src/board/boardView').BoardView>('furniture.whiteboard')!;
    const s = createVesselState('v', 'design');
    const handle = view.controls.find((c) => c.id === 'whiteboardPull')!;
    expect(handle).toBeDefined();
    view.update(s, 0.1, null);
    expect(board.root.visible).toBe(false); // rolled up
    // Pull: the handle asks for it down; the state says so; it unrolls over its roll time.
    const sent: [string, number][] = [];
    handle.bind({ emit: (c: string, v: number) => sent.push([c, v]), haptic: () => {} } as never);
    handle.pressStart();
    expect(sent).toEqual([['whiteboard.down', 1]]);
    s.controls.boardDown = 1;
    for (let i = 0; i < 12; i++) view.update(s, 0.1, null);
    expect(board.root.visible).toBe(true);
    expect(board.root.scale.y).toBe(1);
    // Hanging from the roof: its top just under it, its face toward her bow (the board faces +z, turned).
    wb.root.updateMatrixWorld(true);
    const top = new THREE.Vector3(0, 0, 0).applyMatrix4(wb.root.matrixWorld);
    expect(top.y).toBeCloseTo(VESSEL_DEFS.design.layout.wheelhouse!.roofY, 6);
    // And back up.
    s.controls.boardDown = 0;
    for (let i = 0; i < 12; i++) view.update(s, 0.1, null);
    expect(board.root.visible).toBe(false);
    expect(board.rayDistance(new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)))).toBeNull();
  });
});
