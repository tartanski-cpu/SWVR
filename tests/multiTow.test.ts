/**
 * Multi-boat towing (owner, Oct 2026: "anything that's towable towed by more vessels at the
 * same time", "two tugboats pushing [the ship] into position"). Every boat with a stern
 * roller has her own towline (TowState.lines, by her id); several can be on one tow and
 * their pulls add up. Pushing needs nothing new: hull against hull is worked out between
 * every pair of boats (vessel/physics/vesselContact.ts), so two tugs push harder than one.
 */
import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld, type WorldState } from '../src/core/world';
import { createPlayerState } from '../src/player/playerState';
import { lineOf, linesOn, towStatus } from '../src/tow/tow';
import { compassHeading } from '../src/vessel/autopilot';
import { hullPlan } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import type { VesselState } from '../src/vessel/vesselState';

const DT = 1 / 60;

/** The career world's workboat in open water, and a crew-mate's small tug launched beside her. */
function setup(withSecond = true) {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.players['player-2'] = createPlayerState('player-2', 'Bosun');
  const home = world.vessels[vesselId];
  placeVessel(home, 0, 0, -600, 0);
  const send = (targetId: string, control: string, value = 1, ref?: string, playerId = 'p') => stepWorld(world, [{ playerId, targetId, control, value, ref } as Intent], DT);
  let second: VesselState | undefined;
  if (withSecond) {
    send(ENVIRONMENT_ID, 'launchBoat', 1, 'smallTug', 'player-2');
    second = Object.values(world.vessels).find((v) => v.owner === 'player-2')!;
    world.players['player-2'].aboardVesselId = second.id;
  }
  // A helmsman on each boat in `steer`: the wheel put over to hold her heading, as the
  // autopilot does (helm = k e - c r, e the heading error, r the rate of turn), hard over at most.
  const steer: { boat: VesselState; heading: number }[] = [];
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      for (const { boat, heading } of steer) {
        const e = ((((heading - compassHeading(boat)) % 360) + 540) % 360) - 180;
        const r = (-boat.angularVelocity[1] * 180) / Math.PI;
        boat.controls.helm = Math.max(-1, Math.min(1, 0.08 * e - 0.4 * r));
      }
      stepWorld(world, [], DT);
    }
  };
  return { world, home, second, send, run, steer };
}

/** Bow direction (world x, z) of a boat (her bow is -z in her own axes). */
function ahead(v: VesselState): [number, number] {
  const [qx, qy, qz, qw] = v.orientation;
  const x = -(2 * (qx * qz + qw * qy));
  const z = -(1 - 2 * (qx * qx + qy * qy));
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/**
 * A tow of a kind astern of the workboat (the debug tow) on her line; the second boat, if
 * given, 9 m to starboard of her and `aft` m further aft, on a line to it too.
 */
function bargeTow(world: WorldState, home: VesselState, second: VesselState | undefined, send: ReturnType<typeof setup>['send'], kind = 'barge', aft = 1) {
  send(home.id, 'towDebugNear', 1, kind);
  const barge = world.vessels[world.tow!.job!.vesselId];
  send(home.id, 'towMake', 1, `v:${barge.id}`);
  if (second) {
    placeVessel(second, home.position[0] + 9, 0, home.position[2] + aft, 0);
    send(second.id, 'towMake', 1, `v:${barge.id}`, 'player-2');
  }
  return barge;
}

/**
 * Engines running, levers ahead, each held on her heading by a helmsman (the test's own,
 * steering as the autopilot does). (Left unsteered, two boats on one tow sheer apart: each line pulls her stern in
 * toward the tow and swings her bow out, until they lie across it pulling against each
 * other. On one boat the line pulls straight astern and she tracks on her own.)
 */
function fullAhead(g: Pick<ReturnType<typeof setup>, 'send' | 'steer'>, boats: VesselState[], lever = 0.8) {
  for (const b of boats) g.send(b.id, 'quickStart');
  for (const b of boats) {
    g.send(b.id, 'lever', lever);
    g.steer.push({ boat: b, heading: compassHeading(b) });
  }
}

describe('multi-boat towing', { timeout: 120000 }, () => {
  it('two boats on one heavy tow, side by side: the second line on her starboard fairlead; she gets going faster and they hold their course', () => {
    const speed = (kind: string, n: 1 | 2, s: number, aft: number) => {
      const g = setup();
      const tow = bargeTow(g.world, g.home, n === 2 ? g.second : undefined, g.send, kind, aft);
      if (n === 1) placeVessel(g.second!, 300, 0, -300, 0);
      else {
        // The first line on her bow eye, the second boat's on the fairlead on her side.
        expect(linesOn(g.world, `v:${tow.id}`).map((o) => o.line.at ?? 0).sort()).toEqual([0, 1]);
      }
      fullAhead(g, n === 2 ? [g.home, g.second!] : [g.home]);
      g.run(s);
      // Both lines still on, and each boat within a few degrees of her course.
      expect(linesOn(g.world, `v:${tow.id}`)).toHaveLength(n);
      for (const b of n === 2 ? [g.home, g.second!] : [g.home]) expect(Math.abs((((compassHeading(b) % 360) + 540) % 360) - 180)).toBeLessThan(10);
      return Math.hypot(tow.linearVelocity[0], tow.linearVelocity[2]);
    };
    // The coaster (1,400 t): a minute after full ahead, much faster with two.
    const c1 = speed('coaster', 1, 60, 8);
    const c2 = speed('coaster', 2, 60, 8);
    expect(c2).toBeGreaterThan(c1 * 1.3);
    // The crane pontoon: a steady tow a little faster.
    const p1 = speed('pontoon', 1, 90, 1);
    const p2 = speed('pontoon', 2, 90, 1);
    expect(p2).toBeGreaterThan(p1 * 1.05);
  });

  it('in tandem: the second boat on the first boat\'s bow eye, the tow a little faster and both straight', () => {
    const g = setup();
    const tow = bargeTow(g.world, g.home, undefined, g.send, 'pontoon');
    const stem = hullPlan(VESSEL_DEFS[g.home.defId]).stem;
    placeVessel(g.second!, g.home.position[0], 0, g.home.position[2] + stem - 14, 0);
    g.send(g.second!.id, 'towMake', 1, `v:${g.home.id}`, 'player-2');
    expect(lineOf(g.world, g.second!.id)?.target).toBe(`v:${g.home.id}`);
    fullAhead(g, [g.home, g.second!]);
    g.run(60);
    expect(lineOf(g.world, g.second!.id)!.tension).toBeGreaterThan(5000);
    expect(Math.hypot(tow.linearVelocity[0], tow.linearVelocity[2])).toBeGreaterThan(2.95); // one boat alone: 2.8 m/s
  });

  it("each boat's line is her own: status, casting off one, the job's delivery and a boat handed back", () => {
    const { world, home, second, send } = setup();
    const barge = bargeTow(world, home, second, send);
    expect(towStatus(world, second!.id)).toMatch(/one other boat on her too/);
    // The crew-mate casts off: only her line goes.
    send(second!.id, 'towCast', 1, undefined, 'player-2');
    expect(lineOf(world, second!.id)).toBeNull();
    expect(lineOf(world, home.id)?.target).toBe(`v:${barge.id}`);
    // Without her line on, she's told the tow is under way and she can add her pull.
    expect(towStatus(world, second!.id)).toMatch(/Under tow by another boat/);
    // Back on (the fairlead on her side), then handed back: her line goes with her.
    send(second!.id, 'towMake', 1, `v:${barge.id}`, 'player-2');
    expect(linesOn(world, `v:${barge.id}`)).toHaveLength(2);
    send(ENVIRONMENT_ID, 'withdrawBoat', 1, undefined, 'player-2');
    stepWorld(world, [], DT);
    expect(linesOn(world, `v:${barge.id}`).map((o) => o.boat.id)).toEqual([home.id]);
    // A boat can't make two lines fast at once, nor one to herself.
    send(home.id, 'towMake', 1, `v:${home.id}`);
    expect(Object.keys(world.tow!.lines)).toEqual([home.id]);
  });

  it('debris on two lines is pulled by both; cleared into a harbour, every line on it is cast off', () => {
    const { world, home, second, send, run, steer } = setup();
    world.traffic!.debris.push({ id: 'dx', x: home.position[0], z: home.position[2] + 14, vx: 0, vz: 0 } as never);
    send(home.id, 'towMake', 1, 'd:dx');
    placeVessel(second!, home.position[0] + 6, 0, home.position[2], 0);
    send(second!.id, 'towMake', 1, 'd:dx', 'player-2');
    expect(linesOn(world, 'd:dx')).toHaveLength(2);
    fullAhead({ send, steer }, [home, second!], 0.5);
    run(30);
    const d = world.traffic!.debris.find((o) => o.id === 'dx')!;
    // Both lines on it and both pulling; its velocity the same on each.
    const [a, b] = linesOn(world, 'd:dx').map((o) => o.line);
    expect(a.tension + b.tension).toBeGreaterThan(50);
    expect(a.vel).toEqual(b.vel);
    expect(d.z).toBeLessThan(-600);
  });

  it('two tugs pushing a ship on her side shift her further than one', () => {
    const push = (n: number) => {
      const { world, home, second, send, run, steer } = setup();
      send(home.id, 'towDebugNear', 1, 'ship');
      const ship = world.vessels[world.tow!.job!.vesselId];
      placeVessel(ship, 0, 0, -900, 0);
      const halfBeam = Math.max(...VESSEL_DEFS[ship.defId].hull.stations.map((s) => s.halfBeamDeck));
      const tugs = [second!];
      // A second small tug for the crew-mate's pair (the workboat stays clear).
      if (n === 2) {
        world.players['player-3'] = createPlayerState('player-3', 'Deckie');
        send(ENVIRONMENT_ID, 'launchBoat', 1, 'smallTug', 'player-3');
        tugs.push(Object.values(world.vessels).find((v) => v.owner === 'player-3')!);
      }
      placeVessel(home, 300, 0, -600, 0);
      tugs.forEach((t, i) => {
        // On the ship's starboard side, bows to her (heading 270: bow toward -x), stem just touching.
        const stem = -hullPlan(VESSEL_DEFS[t.defId]).stem;
        placeVessel(t, halfBeam + stem + 0.1, 0, -900 + (i === 0 ? -8 : 8), 270);
        expect(ahead(t)[0]).toBeLessThan(-0.9);
      });
      fullAhead({ send, steer }, tugs, 0.6);
      run(60);
      return -ship.position[0];
    };
    const one = push(1);
    const two = push(2);
    expect(one).toBeGreaterThan(0.5);
    expect(two).toBeGreaterThan(one * 1.4);
  });
});
