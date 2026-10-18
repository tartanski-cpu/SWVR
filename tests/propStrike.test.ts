/**
 * A swimmer into a turning propeller (owner, Oct 2026: a bloody special effect). Struck only
 * by a propeller that's turning (in gear, over minRpm), within the blades' reach of its hub;
 * the host tells everyone (the red spray) and lets them out of the life ring.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { gearOf, useDesign } from '../src/boats/sims';
import { struckByPropeller, turningPropellers } from '../src/rescue/propStrike';
import { createPlayerState } from '../src/player/playerState';
import { vesselToWorld } from '../src/rescue/recovery';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { placeVessel } from '../src/vessel/vesselControl';
import { afterAll } from 'vitest';

const DT = 1 / 60;
afterAll(() => useDesign(DEFAULT_DESIGN));

function setup(defId?: string) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), defId);
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0);
  const send = (control: string, value = 1, args?: number[], player = localPlayerId, target = v.id) => stepWorld(world, [{ playerId: player, targetId: target, control, value, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run, me: localPlayerId };
}

describe('into the propeller', () => {
  it('only a turning propeller: stopped, idling in neutral, no; in gear, yes, within the blades\' reach of the hub', () => {
    const { world, v, send, run } = setup();
    // Just aft of her hub, wherever she's got to.
    const hubW = () => vesselToWorld(v, gearOf(v, 'diesel')!.propeller.position);
    const near = () => hubW().add(new THREE.Vector3(0, 0.3, 0.4));
    expect(turningPropellers(v)).toBeNull();
    expect(struckByPropeller(world, near())).toBeNull();
    send('quickStart');
    run(5);
    expect(v.engine.gear).toBe(0);
    expect(struckByPropeller(world, near())).toBeNull(); // in neutral: the shaft's still
    send('lever', 0.2);
    run(2);
    expect(v.engine.gear).toBe(1);
    expect(struckByPropeller(world, near())?.id).toBe(v.id);
    const R = gearOf(v, 'diesel')!.propeller.diameter / 2 + CONFIG.rescue.propStrike.reach;
    expect(struckByPropeller(world, hubW().add(new THREE.Vector3(R + 0.2, 0, 0)))).toBeNull();
    // Astern too.
    send('lever', -0.3);
    run(3);
    expect(v.engine.gear).toBe(-1);
    expect(struckByPropeller(world, near())?.id).toBe(v.id);
  });

  it('a twin-screw Shipyard boat has a propeller each side', () => {
    useDesign({ ...DEFAULT_DESIGN, twin: 1 } as typeof DEFAULT_DESIGN);
    const { v, send, run } = setup('design');
    expect(gearOf(v, 'diesel')!.twin).toBe(true);
    send('quickStart');
    run(5);
    send('lever', 0.2);
    run(2);
    const p = turningPropellers(v)!;
    expect(p.hubs.length).toBe(2);
    expect(p.hubs[0][0]).toBeCloseTo(-p.hubs[1][0], 6);
    expect(Math.abs(p.hubs[0][0])).toBeGreaterThan(0.2);
  });

  it('the host tells everyone where (the red spray) and who, and lets them out of the ring', () => {
    const { world, v, send } = setup();
    const mate = createPlayerState('player-2', 'Mate');
    world.players[mate.id] = mate;
    send('ringTake');
    send('ringThrow', 1, [3, 2, -390, 0, 0, 0]);
    for (let i = 0; i < 60; i++) stepWorld(world, [], DT);
    mate.position = [world.rescue!.ring!.pos[0], -1.4, world.rescue!.ring!.pos[2]];
    send('ringGrab', 1, undefined, mate.id);
    expect(world.rescue!.ring!.player).toBe(mate.id);
    send('rescuePropStrike', 1, [1, -0.6, -395], mate.id);
    expect(world.rescue!.strike).toEqual({ seq: 1, pos: [1, -0.6, -395], player: mate.id });
    expect(world.rescue!.ring!.player).toBeNull();
    expect(world.rescue!.shout?.text).toMatch(/Mate went into the propeller/);
    send('rescuePropStrike', 1, [Number.NaN, 0, 0], mate.id);
    expect(world.rescue!.strike!.seq).toBe(1); // junk ignored
    void v;
  });
});
