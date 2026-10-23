/**
 * Multi-boat M5 (docs/MULTI_BOAT.md): the crew's boats in the game's systems. Every player's
 * boat counts: a fire is wetted by every monitor on it, the forecast is heard on any boat's
 * radio, each boat sells her own rod catch, the extinguisher is the holder's boat's; the Go
 * button takes a free berth; the chart and the lookout know whose boat is whose.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { boatOf, boatOwnerName, playerBoats, teleportToPortSlot } from '../src/core/launch';
import * as THREE from 'three';
import { stepWorld } from '../src/core/simulation';
import { jetPath } from '../src/fire/fire';
import type { WorldState } from '../src/core/world';
import type { VesselState } from '../src/vessel/vesselState';
import { createWorld } from '../src/core/world';
import { createPlayerState } from '../src/player/playerState';
import { placeVessel } from '../src/vessel/vesselControl';
import { createVesselState } from '../src/vessel/vesselState';
import { PORTS } from '../src/world/archipelago';
import { berthWithId } from '../src/world/berths';

const DT = 1 / 20;
const pts = Array.from({ length: 60 }, () => new THREE.Vector3());
/** Where a boat's jet comes down (its last point). */
function landing(world: WorldState, v: VesselState): THREE.Vector3 {
  const n = jetPath(world, v, pts);
  return pts[n - 1].clone();
}

function game() {
  const ids = new IdFactory();
  const { world, vesselId, localPlayerId } = createWorld(ids, 'pilotBoat', { harbour: true, weather: true });
  world.environment.waves = [];
  world.players['player-2'] = createPlayerState('player-2', 'Bosun');
  const send = (playerId: string, targetId: string, control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId, targetId, control, value, ref } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      world.environment.waves = [];
    }
  };
  return { world, ids, vesselId, localPlayerId, send, run };
}

describe("the crew's boats in the game's systems (multi-boat M5)", { timeout: 60000 }, () => {
  it('the players\' boats are the home boat and the launched ones; whose each is; the boat a player is aboard', () => {
    const { world, vesselId, localPlayerId, send } = game();
    send('player-2', ENVIRONMENT_ID, 'launchBoat', 1, 'smallTug');
    const tug = Object.values(world.vessels).find((v) => v.owner === 'player-2')!;
    const tow = createVesselState('tow-1', 'barge');
    world.vessels[tow.id] = tow;
    expect(playerBoats(world).map((v) => v.id).sort()).toEqual([tug.id, vesselId].sort());
    expect(boatOwnerName(world, tug)).toBe('Bosun');
    expect(boatOwnerName(world, world.vessels[vesselId])).toBe('the host');
    world.players[localPlayerId].aboardVesselId = vesselId;
    expect(boatOwnerName(world, world.vessels[vesselId])).toBe(world.players[localPlayerId].name);
    world.players['player-2'].aboardVesselId = tug.id;
    expect(boatOf(world, 'player-2')!.id).toBe(tug.id);
    expect(boatOf(world, localPlayerId)!.id).toBe(vesselId);
    world.players['player-2'].aboardVesselId = tow.id; // on a tow: not a player's boat, so the home boat
    expect(boatOf(world, 'player-2')!.id).toBe(vesselId);
  });

  it('the forecast is heard on any boat with the radio on; each boat sells her own rod catch', () => {
    const { world, vesselId, send, run } = game();
    const home = world.vessels[vesselId];
    send('player-2', ENVIRONMENT_ID, 'launchBoat', 1, 'fishingBoat');
    const fisher = Object.values(world.vessels).find((v) => v.owner === 'player-2')!;
    // Nobody's master on: no forecast received.
    home.electrics!.master = 0;
    fisher.electrics!.master = 0;
    const w = world.environment.weather!;
    w.forecastAt = world.time;
    const seq0 = world.forecast?.seq ?? 0;
    run(0.2);
    expect(world.forecast?.seq ?? 0).toBe(seq0);
    // The crew-mate's boat alone powers up: her radio hears it.
    fisher.electrics!.master = 1;
    w.forecastAt = world.time;
    run(0.2);
    expect(world.forecast?.seq ?? 0).toBeGreaterThan(seq0);
    expect(home.electrics!.master).toBe(0);
    // Rod fish in the crew-mate's bucket, moored at Oban's quay: sold from her.
    fisher.rodCatch = { count: 3, kg: 4.2 };
    const money = world.career?.money ?? 0;
    run(0.2);
    expect(fisher.rodCatch.count).toBe(0);
    expect((world.career?.money ?? 0) >= money).toBe(true);
  });

  it('a fire is wetted by every player boat\'s monitor; the Go button takes a free berth, or the bay', () => {
    const { world, vesselId, localPlayerId, send, run } = game();
    send('player-2', ENVIRONMENT_ID, 'launchBoat', 1, 'pilotBoat');
    const second = Object.values(world.vessels).find((v) => v.owner === 'player-2')!;
    // Both boats to the same port by the Go button: different berths, or one in the bay.
    const port = PORTS.find((p) => p.cargo.berth && p.id !== 'oban') ?? PORTS[0];
    expect(teleportToPortSlot(world, world.vessels[vesselId], port.id)).toBe(true);
    expect(teleportToPortSlot(world, second, port.id)).toBe(true);
    const d = Math.hypot(second.position[0] - world.vessels[vesselId].position[0], second.position[2] - world.vessels[vesselId].position[2]);
    expect(d).toBeGreaterThan(8);
    expect(teleportToPortSlot(world, second, 'no-such-port')).toBe(false);
    // A burning boat off the bow, accepted; both boats' monitors on it: the wetting counts
    // both, and the fire goes down faster than one boat's jet alone would have it.
    send(localPlayerId, ENVIRONMENT_ID, 'fireDebugNear', 1, 'boat');
    const job = world.fire!.job!;
    expect(job.phase).toBe('accepted');
    for (const v of [world.vessels[vesselId], second]) {
      // Both on the seaward side of her (the debug fire is a little off the bow, near Oban's shore).
      placeVessel(v, job.x - 18, 0, job.z + (v === second ? -14 : 14), v === second ? 120 : 60);
      send(localPlayerId, v.id, 'quickStart', 1);
    }
    run(4);
    // Each monitor aimed where its jet lands on her (the pan and tilt that bring it nearest).
    for (const v of [world.vessels[vesselId], second]) {
      send(localPlayerId, v.id, 'firePump', 1);
      let best: [number, number] = [0, 30];
      let bestD = Infinity;
      for (let pan = -90; pan <= 90; pan += 5) {
        for (let t = 0; t <= 55; t += 2.5) {
          v.controls.monPan = pan;
          v.controls.monTilt = t;
          const p = landing(world, v);
          const d = Math.hypot(p.x - job.x, p.z - job.z);
          if (d < bestD) [best, bestD] = [[pan, t], d];
        }
      }
      send(localPlayerId, v.id, 'monPan', best[0]);
      send(localPlayerId, v.id, 'monTilt', best[1]);
    }
    run(1);
    expect(job.wetting).toBeGreaterThan(0.5);
    // The home boat's pump off: the crew-mate's jet alone still wets it (it used to count the home boat only).
    send(localPlayerId, vesselId, 'firePump', 0);
    run(1);
    expect(job.wetting).toBeGreaterThan(0.3);
    send(localPlayerId, second.id, 'firePump', 0);
    run(1);
    expect(job.wetting).toBe(0);
    expect(CONFIG.lod.near).toBeGreaterThan(0);
    expect(berthWithId(second.mooring.berthId ?? '') ?? null).toBeNull(); // she was moved by Go: free of her berth
  });
});
