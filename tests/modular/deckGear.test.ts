/**
 * Modular boats M5a: the deck gear (the tender crane, the tow winch and stern roller, the
 * A-frame and trawl, the anchor windlass) are modules. The world's systems ask a boat for
 * her gear ("has she a tow point? where?") instead of reading her vessel config. These
 * tests check the gear's facts are where v1.0 had them, that taking a module out takes its
 * job with it, and the mechanism library's geometry.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MODULES, RECIPES } from '../../src/boats/library';
import { gearOf, setVesselRecipe, vesselRuntime } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { armJoints, reachOver } from '../../src/mechanisms/arm';
import { drumAxleY, drumLead } from '../../src/mechanisms/drum';
import { sagOf } from '../../src/mechanisms/line';
import { hullQueries } from '../../src/modular/hull';
import type { Recipe } from '../../src/modular/recipe';
import { towReach } from '../../src/tow/tow';
import { hullPlan } from '../../src/vessel/layout';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { FISHING_GROUNDS, PORTS } from '../../src/world/archipelago';
import { startEngine } from '../helpers/engine';

const DT = 1 / 60;
const def = VESSEL_DEFS.workboat;
const plan = hullPlan(def);
const boat = { defId: 'workboat' };

/** The starter recipe without the modules on these sockets. */
const without = (...sockets: string[]): Recipe => ({ ...RECIPES.workboat, modules: RECIPES.workboat.modules.filter((m) => !sockets.includes(m.socket)) });

function setup() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  world.tow!.calls = false;
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, targetId = v.id) => stepWorld(world, [{ playerId: 'p', targetId, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

afterEach(() => setVesselRecipe('workboat', null));

describe('the gear\'s facts are where v1.0 had them', () => {
  it('the tow point: the top of the stern roller', () => {
    const f = CONFIG.tow.fairlead;
    const z = plan.transom - f.inset;
    expect(gearOf(boat, 'towPoint')!.point).toEqual([0, plan.deckY(z) + f.height, z]);
  });

  it('the tow winch\'s lead: off the top of the drum, aft side', () => {
    const tw = CONFIG.vessels.workboat.towWinch;
    const axle = plan.deckY(tw.z) + 0.18 + tw.drumRadius;
    expect(gearOf(boat, 'towWinch')!.lead).toEqual([0, axle + tw.drumRadius * 0.7, tw.z + tw.drumRadius * 0.7]);
  });

  it('the trawl gantry: the A-frame\'s feet, head and blocks', () => {
    const a = CONFIG.vessels.workboat.fishing.aFrame;
    const footZ = plan.transom - a.footFromTransom;
    const deck = plan.deckY(footZ);
    expect(gearOf(boat, 'trawlGantry')).toEqual({
      x: plan.halfBeam(footZ) - a.footInset,
      footZ,
      deck,
      headZ: plan.transom + a.headAft,
      top: deck + a.height,
      blockX: a.blockX,
      braceZ: footZ - a.braceForward,
      buttonY: deck + a.buttonHeight,
    });
  });

  it('the tender crane and the anchor: the vessel\'s own figures', () => {
    const { consoleButton, ...crane } = gearOf(boat, 'tenderCrane') as NonNullable<ReturnType<typeof gearOf<'tenderCrane'>>> & { consoleButton: unknown };
    expect(crane).toEqual(CONFIG.vessels.workboat.tenderCrane);
    expect(consoleButton).toEqual(CONFIG.vessels.workboat.bridge.craneButton);
    expect(gearOf(boat, 'anchor')).toEqual({ hawse: CONFIG.vessels.workboat.anchor.hawse, chainM: CONFIG.vessels.workboat.anchor.chainM });
    expect(gearOf(boat, 'trawl')).toEqual({});
  });

  it('every module that gives gear says so in what it provides, and gives just that', () => {
    const hull = hullQueries(def);
    for (const m of MODULES.all()) {
      const said = (m.provides?.(m.defaults) ?? []).flatMap((p) => ('gear' in p && p.gear ? [p.gear] : []));
      const given = Object.keys(m.gear?.(m.defaults, hull, (q) => [q[0], q[1], q[2]]) ?? {});
      expect(given.sort(), m.id).toEqual(said.sort());
    }
  });
});

describe('take a module out and its job goes with it', { timeout: 30000 }, () => {
  it('without the stern roller she has no tow point: no tow calls, no reach', () => {
    setVesselRecipe('workboat', without('sternRoller'));
    expect(gearOf(boat, 'towPoint')).toBeNull();
    const { world, run } = setup();
    world.tow!.calls = true;
    run(2);
    expect(towReach(world)).toBe(Infinity);
    expect(world.tow!.nextAt).toBeNull(); // nothing tows: no calls come
  });

  it('without the tow winch the line stays as made fast', () => {
    const heave = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { world, v, send, run } = setup();
      startEngine(world, v);
      placeVessel(v, 0, 0, -400, 0);
      run(1);
      send('towDebugNear', 1);
      send('towMake');
      const line = world.tow!.line!;
      const made = line.length!;
      send('winch.heaveIn', 1);
      run(3);
      return made - line.length!;
    };
    expect(heave(null)).toBeCloseTo(CONFIG.tow.winch.heaveSpeed * 3, 1);
    expect(heave(without('towWinch'))).toBe(0);
  });

  it('without the trawl there\'s no fishing (and without the A-frame, no trawl: refused in words)', () => {
    const shoot = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { world, v, send, run } = setup();
      const g = FISHING_GROUNDS[1];
      placeVessel(v, g.x, 0, g.z + 100, 0);
      startEngine(world, v);
      send('trawl.shoot', 1);
      run(2);
      return world.fishing?.t ?? 0;
    };
    expect(shoot(null)).toBeGreaterThan(0);
    expect(shoot(without('trawl'))).toBe(0);
    expect(() => setVesselRecipe('workboat', without('aFrame'))).toThrow(/trawl: fishing.trawl needs a trawl gantry \(an A-frame\), and nothing on this boat gives it/);
  });

  it('without the anchor windlass the ANCHOR switch does nothing, and draws nothing', () => {
    const letGo = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { world, v, send, run } = setup();
      // At an anchorage, among the islands (the sea bed is the archipelago's).
      world.geography = 'archipelago';
      const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
      placeVessel(v, a.x, 0, a.z, 0);
      send('anchor.letGo', 1);
      run(1);
      return { phase: v.anchor.phase, amps: vesselRuntime(v)!.loadAmps() };
    };
    const fitted = letGo(null);
    const bare = letGo(without('anchor'));
    expect(fitted.phase).toBe('paying');
    expect(bare.phase).toBe('stowed');
    expect(fitted.amps - bare.amps).toBeCloseTo(CONFIG.modules.anchorWindlass.amps, 9);
  });

  it('without the crane (and its cradle) she carries no skiff (M7); LAUNCH / RECOVER does nothing', () => {
    setVesselRecipe('workboat', without('tenderCrane'));
    const { world, v, send, run } = setup();
    expect(Object.values(world.vessels).some((x) => x.defId === 'skiff')).toBe(false);
    startEngine(world, v);
    send('crane', 1);
    run(2);
    expect(Object.keys(world.vessels)).toEqual([v.id]);
  });
});

describe('the mechanism library', () => {
  it('the arm puts the jib head over its target (law of cosines, knuckle up)', () => {
    const links = { boom: 2.4, jib: 2.1 };
    const shoulder = new THREE.Vector3(1.25, 2.6, -2.25);
    const target = new THREE.Vector3(2.9, 2.0, -1.0); // the head 1.2 m over it: clear of the 0.3 m minimum rise
    const a = reachOver(shoulder, target, links, 1.2, 0.3);
    const elbow = new THREE.Vector3();
    const head = new THREE.Vector3();
    armJoints(shoulder, a, links, elbow, head);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(links.boom, 9);
    expect(head.distanceTo(elbow)).toBeCloseTo(links.jib, 9);
    expect(head.x).toBeCloseTo(target.x, 9);
    expect(head.z).toBeCloseTo(target.z, 9);
    expect(head.y).toBeCloseTo(target.y + 1.2, 9);
    expect(elbow.y).toBeGreaterThan(shoulder.y + (head.y - shoulder.y) * (elbow.distanceTo(shoulder) / head.distanceTo(shoulder))); // knuckle up
  });

  it('the drum\'s lead sits on its top, aft side, and a slack line\'s sag makes its length', () => {
    expect(drumAxleY(1, 0.2)).toBeCloseTo(1.38, 12);
    drumLead(1.38, 5, 0.2).forEach((x, i) => expect(x).toBeCloseTo([0, 1.52, 5.14][i], 12));
    // A parabola of span d and sag s is about d + 8 s^2 / (3 d) long.
    const d = 30;
    const L = 34;
    const s = sagOf(d, L);
    expect(d + (8 * s * s) / (3 * d)).toBeCloseTo(L, 9);
    expect(sagOf(L, L)).toBe(0);
  });
});
