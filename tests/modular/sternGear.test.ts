/**
 * The stern gear as placeable modules (owner): the tow winch draws and works from its
 * socket (anywhere on deck, facing any way); the stern roller and the A-frame stand at
 * their socket, fitted to the hull there (her beam and deck). Here they're fitted to the
 * landing craft, which has none of them, through sockets added to her hull for the test,
 * and they tow and trawl there as on the workboat.
 */
import * as THREE from 'three';
import { FISHING_GROUNDS } from '../../src/world/archipelago';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { LANDING_CRAFT_HULL } from '../../src/boats/landingCraftHull';
import { footprintsOf, gearOf, setVesselRecipe } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { drumAxleY, drumLead } from '../../src/mechanisms/drum';
import { assembleView } from '../../src/modular/assemble';
import { validateRecipe, type Recipe } from '../../src/modular/recipe';
import type { Socket } from '../../src/modular/socket';
import { placeVessel } from '../../src/vessel/vesselControl';
import { hullPlan } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { startEngine } from '../helpers/engine';
import { fakeCanvas } from './fakes';
import { lineOf } from '../../src/tow/tow';

beforeAll(fakeCanvas);

const DT = 1 / 60;
const def = VESSEL_DEFS.landingCraft;
const plan = hullPlan(def);
const transom = plan.transom;
const tw = CONFIG.vessels.workboat.towWinch;
const winchZ = transom - 0.7;
const engineSpace = LANDING_CRAFT_HULL.sockets.find((s) => s.id === 'fuelTank')!.transform.position;

/** The landing craft's hull with stern sockets; the winch's turned `yawDeg` and `x` off the centreline. */
function sternSockets(yawDeg = 0, x = 0): Socket[] {
  return [
    { id: 'towWinch', type: 'deck.equipment', transform: { position: [x, plan.deckY(winchZ), winchZ], ...(yawDeg ? { rotationDeg: [0, yawDeg, 0] } : {}) }, label: 'test' },
    { id: 'trawl', type: 'deck.equipment', transform: { position: [0, plan.deckY(winchZ), winchZ] }, label: 'test' },
    { id: 'sternRoller', type: 'stern.gantry', transform: { position: [0, plan.deckY(transom), transom] }, label: 'test' },
    { id: 'aFrame', type: 'stern.gantry', transform: { position: [0, plan.deckY(transom), transom] }, label: 'test' },
    { id: 'hydraulicPump', type: 'engine.bay', transform: { position: engineSpace }, label: 'test' },
  ];
}
const recipe: Recipe = {
  ...RECIPES.landingCraft,
  modules: [
    ...RECIPES.landingCraft.modules,
    { socket: 'towWinch', module: 'deck.tow-winch' },
    { socket: 'sternRoller', module: 'deck.stern-roller' },
    { socket: 'aFrame', module: 'deck.a-frame' },
    { socket: 'trawl', module: 'fishing.trawl' },
    { socket: 'hydraulicPump', module: 'hydraulics.pto-pump' },
  ],
};

const original = [...LANDING_CRAFT_HULL.sockets];
const fit = (yawDeg = 0, x = 0) => {
  LANDING_CRAFT_HULL.sockets.splice(0, Infinity, ...original, ...sternSockets(yawDeg, x));
  setVesselRecipe('landingCraft', recipe);
};
beforeEach(() => fit());
afterEach(() => {
  LANDING_CRAFT_HULL.sockets.splice(0, Infinity, ...original);
  setVesselRecipe('landingCraft', null);
});

const boat = { defId: 'landingCraft' };

function setup() {
  const { world, vesselId } = createWorld(new IdFactory(), 'landingCraft');
  world.environment.waves = [];
  world.geography = 'openSea';
  world.tow!.calls = false;
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('the stern gear, placeable', () => {
  it('fits the landing craft: a valid boat, the gear where its sockets put it, fitted to her hull', () => {
    expect(validateRecipe(recipe, LIBRARY)).toEqual([]);
    // The winch's lead: off its drum, over the socket.
    const lead = drumLead(drumAxleY(plan.deckY(winchZ), tw.drumRadius), winchZ, tw.drumRadius);
    gearOf(boat, 'towWinch')!.lead.forEach((v, i) => expect(v).toBeCloseTo(lead[i], 9));
    // The tow point: on her transom, at her deck height there.
    const f = CONFIG.tow.fairlead;
    expect(gearOf(boat, 'towPoint')!.point).toEqual([0, plan.deckY(transom - f.inset) + f.height, transom - f.inset]);
    // The A-frame's feet on her quarters, inside her beam, its head over her transom.
    const g = gearOf(boat, 'trawlGantry')!;
    const a = CONFIG.vessels.workboat.fishing.aFrame;
    expect(g.footZ).toBeCloseTo(transom - a.footFromTransom, 9);
    expect(g.x).toBeCloseTo(plan.halfBeam(g.footZ) - a.footInset, 9);
    expect(g.deck).toBeCloseTo(plan.deckY(g.footZ), 9);
    expect(g.headZ).toBeCloseTo(transom + a.headAft, 9);
  });

  it('the winch turned on its socket: its lead and its footprint turn with it', () => {
    fit(90, 0.4);
    const lead = gearOf(boat, 'towWinch')!.lead;
    const local = drumLead(drumAxleY(0, tw.drumRadius), 0, tw.drumRadius);
    // Turned a quarter, the wire leaves to port or starboard instead of aft, as far from the drum.
    expect(lead[2]).toBeCloseTo(winchZ, 9);
    expect(Math.abs(lead[0] - 0.4)).toBeCloseTo(local[2], 9);
    expect(lead[1]).toBeCloseTo(plan.deckY(winchZ) + local[1], 9);
    // Its footprint (drum, cheeks and gearbox: long across the drum) now lies fore and aft.
    const box = footprintsOf(boat).find((f) => 'x0' in f && f.x0 < 0.4 && f.x1 > 0.4 && f.z0 < winchZ && f.z1 > winchZ)!;
    expect('x0' in box && box.z1 - box.z0 > 2 * (box.x1 - box.x0)).toBe(true);
    const views = assembleView(recipe, def, LIBRARY);
    const drum = views.modules.find((m) => m.id === 'deck.tow-winch')!.root;
    drum.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixPosition(drum.matrixWorld).toArray().map((v) => +v.toFixed(6))).toEqual([0.4, +plan.deckY(winchZ).toFixed(6), +winchZ.toFixed(6)]);
  });

  it('their controls are on her: the winch\'s HEAVE IN / PAY OUT, the A-frame\'s PAY OUT / HAUL', () => {
    const ids = assembleView(recipe, def, LIBRARY).controls.map((c) => c.id);
    for (const id of ['winchHeave', 'winchPayOut', 'netOut', 'netIn']) expect(ids).toContain(id);
  });

  it('she tows with them: the winch heaves the line in', () => {
    const { world, v, send, run } = setup();
    startEngine(world, v);
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1);
    send('towMake');
    const line = lineOf(world)!;
    const made = line.length!;
    send('winch.heaveIn', 1);
    run(3);
    expect(made - line.length!).toBeCloseTo(CONFIG.tow.winch.heaveSpeed * 3, 1);
  });

  it('she trawls with them: the net goes out on a fishing ground', () => {
    const { world, v, send, run } = setup();
    const g = FISHING_GROUNDS[1];
    placeVessel(v, g.x, 0, g.z + 100, 0);
    startEngine(world, v);
    send('trawl.shoot', 1);
    run(2);
    expect(world.fishing?.t ?? 0).toBeGreaterThan(0);
  });
});
