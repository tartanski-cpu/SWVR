/**
 * The skiff's crane and the anchor windlass are placeable (owner): each stands where its
 * socket is. The tender crane's socket is the foot of its column (the cradle, the launch path
 * and the buttons move with it; to port of the centreline it's mirrored); the anchor's socket
 * is its bow roller, the hawse. On the starting workboat both are where they always were.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/boats/library';
import { gearOf, setVesselRecipe } from '../../src/boats/sims';
import { WORKBOAT_HULL } from '../../src/boats/workboatHull';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import type { Recipe } from '../../src/modular/recipe';
import { launchPoint, launchTime, placeTenderCrane } from '../../src/vessel/tenderCrane';
import { placeVessel } from '../../src/vessel/vesselControl';
import { PORTS } from '../../src/world/archipelago';
import { startEngine } from '../helpers/engine';

const DT = 1 / 60;
const crane = CONFIG.vessels.workboat.tenderCrane;
const socketAt = (id: string) => WORKBOAT_HULL.sockets!.find((s) => s.id === id)!.transform.position;

/** The workboat with her tow gear off and `module` on the aft deck socket (the winch's). */
const onAftDeck = (module: string, from: string): Recipe => ({
  ...RECIPES.workboat,
  modules: [...RECIPES.workboat.modules.filter((m) => !['towWinch', 'trawl', 'aFrame', from].includes(m.socket)), { socket: 'towWinch', module }],
});

function setup() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  world.tow!.calls = false;
  const v = world.vessels[vesselId];
  const send = (control: string, value: number, targetId = v.id) => stepWorld(world, [{ playerId: 'p', targetId, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

afterEach(() => setVesselRecipe('workboat', null));

describe('the skiff crane, placed', () => {
  it('on the workboat\'s own socket it is exactly as it was', () => {
    expect(placeTenderCrane(crane, socketAt('tenderCrane'))).toEqual(crane);
  });

  it('to port of the centreline it is mirrored: the cradle to starboard of the column, out over the port side, round over the bow', () => {
    const at: [number, number, number] = [-1.3, 1.0, -1.6];
    const c = placeTenderCrane(crane, at);
    const dy = at[1] - crane.deckAtColumn;
    expect(c.column).toEqual([at[0], at[2]]);
    // Each point the same distance from the column as on the workboat, across mirrored.
    expect(c.stow[0] - at[0]).toBeCloseTo(-(crane.stow[0] - crane.column[0]), 9);
    expect(c.stow[2] - at[2]).toBeCloseTo(crane.stow[2] - crane.column[1], 9);
    expect(c.stow[1]).toBeCloseTo(crane.stow[1] + dy, 9);
    expect(c.shoulderY).toBeCloseTo(crane.shoulderY + dy, 9);
    expect(c.outboard[0] - at[0]).toBeCloseTo(-(crane.outboard[0] - crane.column[0]), 9);
    expect(c.cradle.z0 - at[2]).toBeCloseTo(crane.cradle.z0 - crane.column[1], 9);
    expect(c.button[0]).toBeLessThan(at[0]); // its control box on the outboard (port) side
    expect(c.waterY).toBe(crane.waterY); // she's still lowered to the water
    // The slew is the workboat's mirrored: each point's x mirrored about the column.
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let t = 0; t <= launchTime(c); t += 0.25) {
      launchPoint(c, t, p);
      launchPoint(crane, t, q);
      expect(p.x - at[0]).toBeCloseTo(-(q.x - crane.column[0]), 6);
      expect(p.z - at[2]).toBeCloseTo(q.z - crane.column[1], 6);
      // Up to the end of the slew her height moves with the deck; then down to the water.
      if (t <= crane.rigTime + crane.hoistTime + crane.slewTime) expect(p.y).toBeCloseTo(q.y + dy, 6);
    }
    expect(launchPoint(c, launchTime(c), p).y).toBe(crane.waterY);
  });

  it('on another socket she is carried, launched and let go under it', () => {
    setVesselRecipe('workboat', onAftDeck('deck.tender-crane', 'tenderCrane'));
    const at = socketAt('towWinch');
    const c = gearOf({ defId: 'workboat' }, 'tenderCrane')!;
    expect(c.column).toEqual([at[0], at[2]]);
    const { world, v, send, run } = setup();
    const skiff = Object.values(world.vessels).find((x) => x.defId === 'skiff')!;
    expect(skiff.tender?.phase).toBe('stowed');
    startEngine(world, v);
    send('crane', 1, skiff.id);
    run(launchTime(c) - 0.05);
    expect(skiff.tender?.phase).toBe('lowering');
    // At the water at the crane's outboard spot (her axes), moved with it; then let go.
    const local = new THREE.Vector3(...skiff.position).sub(new THREE.Vector3(...v.position)).applyQuaternion(new THREE.Quaternion(...v.orientation).invert());
    expect(Math.hypot(local.x - c.outboard[0], local.z - c.outboard[1])).toBeLessThan(0.3);
    expect(c.outboard[1] - c.column[1]).toBeCloseTo(crane.outboard[1] - crane.column[1], 9);
    run(0.2);
    expect(skiff.tender?.phase).toBe('free');
  });
});

describe('the anchor windlass, placed', () => {
  it('its hawse is its socket: on the workboat the bow roller', () => {
    expect(gearOf({ defId: 'workboat' }, 'anchor')!.hawse).toEqual([...socketAt('anchor')]);
  });

  it('on a deck socket the chain leaves her there, and the switch lets it go', () => {
    setVesselRecipe('workboat', onAftDeck('deck.anchor-windlass', 'anchor'));
    expect(gearOf({ defId: 'workboat' }, 'anchor')!.hawse).toEqual([...socketAt('towWinch')]);
    const { world, v, send, run } = setup();
    world.geography = 'archipelago';
    const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
    placeVessel(v, a.x, 0, a.z, 0);
    send('anchor.letGo', 1);
    run(1);
    expect(v.anchor.phase).toBe('paying');
  });
});
