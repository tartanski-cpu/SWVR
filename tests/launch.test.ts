/**
 * Multi-boat M3 (docs/MULTI_BOAT.md): each player's own boat. A `launchBoat` intent puts a
 * boat at the game's harbour: moored at a free berth her length fits (world/slots.ts), else
 * at anchor; she is her player's; launching again replaces her; `withdrawBoat` hands her
 * back; a player who leaves takes her with them. Oban (a coast map, Voyage mode).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 20;

async function loadOban() {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
  vi.resetModules();
  const m = {
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    coast: await import('../src/world/coastTerrain'),
    terrain: await import('../src/world/terrain'),
    world: await import('../src/core/world'),
    sim: await import('../src/core/simulation'),
    ids: await import('../src/core/ids'),
    launch: await import('../src/core/launch'),
    slots: await import('../src/world/slots'),
    berths: await import('../src/world/berths'),
    player: await import('../src/player/playerState'),
    library: await import('../src/boats/library'),
    design: await import('../src/shipyard/design'),
    doc: await import('../src/shipyard/designDoc'),
  };
  const c = m.regions.regionById('oban')!.coast!;
  const t = c.pkg.terrain;
  if (t.chunked) throw new Error('whole-mesh map expected');
  const bin = readFileSync(join(root, 'public', t.dir, t.file));
  m.coast.registerCoastTerrain('oban', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  return m;
}

describe('launching your own boat (multi-boat M3)', { timeout: 90000 }, () => {
  let m: Awaited<ReturnType<typeof loadOban>>;
  beforeAll(async () => {
    m = await loadOban();
  });

  function game() {
    const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, weather: true });
    world.environment.waves = [];
    world.players['player-2'] = m.player.createPlayerState('player-2', 'Bosun');
    const send = (playerId: string, control: string, ref?: string) => m.sim.stepWorld(world, [{ playerId, targetId: 'env', control, value: 1, ref }], DT);
    return { world, vesselId, localPlayerId, send };
  }

  it('a crew-mate launches a fleet boat: moored at a free Oban berth her length fits, hers, lines fast', () => {
    const { world, vesselId, send } = game();
    expect(m.launch.gameHarbour(world)!.id).toBe('oban');
    send('player-2', 'launchBoat', 'lander');
    const mine = m.launch.ownedBoat(world, 'player-2')!;
    expect(mine).toBeTruthy();
    expect(mine.defId).toBe('lander');
    expect(mine.mooring.phase).toBe('moored');
    const berth = m.berths.berthWithId(mine.mooring.berthId!)!;
    expect(berth.portId).toBe('oban');
    expect(berth.id).not.toBe(world.vessels[vesselId].mooring.berthId);
    // Room for her on that face, and the home boat untouched.
    const face = m.slots.berthFace(berth)!;
    expect(face.face.half * 2).toBeGreaterThan(m.slots.vesselLength('lander'));
    expect(world.vessels[vesselId].mooring.phase).toBe('moored');
    // Settled where she was put.
    for (let i = 0; i < 3 / DT; i++) {
      m.sim.stepWorld(world, [], DT);
      world.environment.waves = [];
    }
    expect(Math.hypot(mine.position[0] - berth.x, mine.position[2] - berth.z)).toBeLessThan(6);
    // Afloat, not aground: water under her, lying still.
    expect(m.terrain.groundHeight(mine.position[0], mine.position[2])).toBeLessThan(-2);
    expect(Math.hypot(mine.linearVelocity[0], mine.linearVelocity[2])).toBeLessThan(0.3);
    expect(Math.abs(mine.angularVelocity[1])).toBeLessThan(0.1);
  });

  it('launching again replaces her; a design token launches a Shipyard boat; handing her back removes her', () => {
    const { world, send } = game();
    send('player-2', 'launchBoat', 'smallTug');
    const first = m.launch.ownedBoat(world, 'player-2')!;
    send('player-2', 'launchBoat', 'fishingBoat');
    const second = m.launch.ownedBoat(world, 'player-2')!;
    expect(world.vessels[first.id]).toBeUndefined();
    expect(second.defId).toBe('fishingBoat');
    expect(Object.values(world.vessels).filter((v) => v.owner === 'player-2')).toHaveLength(1);
    const token = m.doc.docToken({ ...m.design.DEFAULT_DESIGN, searchlight: 1 }, 'My boat');
    send('player-2', 'launchBoat', token);
    const designed = m.launch.ownedBoat(world, 'player-2')!;
    expect(m.library.isBoatType(designed.defId)).toBe(true);
    expect(designed.build).toBe(token);
    send('player-2', 'withdrawBoat');
    expect(m.launch.ownedBoat(world, 'player-2')).toBeUndefined();
    // A tow or nonsense is refused.
    send('player-2', 'launchBoat', 'coaster');
    send('player-2', 'launchBoat', 'not a boat');
    expect(m.launch.ownedBoat(world, 'player-2')).toBeUndefined();
  });

  it('two players get two different berths; a player who leaves takes her boat with them', () => {
    const { world, localPlayerId, send } = game();
    world.players['player-3'] = m.player.createPlayerState('player-3', 'Mate');
    send('player-2', 'launchBoat', 'pilotBoat');
    send('player-3', 'launchBoat', 'pilotBoat');
    const a = m.launch.ownedBoat(world, 'player-2')!;
    const b = m.launch.ownedBoat(world, 'player-3')!;
    expect(a.mooring.berthId).not.toBe(b.mooring.berthId);
    expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThan(m.slots.vesselLength('pilotBoat'));
    send(localPlayerId, 'launchBoat', 'lander'); // the host too: moored, or at anchor once the faces are full
    const h = m.launch.ownedBoat(world, localPlayerId)!;
    expect(h.mooring.phase === 'moored' || h.anchor.phase === 'set').toBe(true);
    delete world.players['player-3'];
    m.sim.stepWorld(world, [], DT);
    expect(world.vessels[b.id]).toBeUndefined();
    expect(world.vessels[a.id]).toBeTruthy();
  });

  it('no face with room for her: she lies at anchor off the harbour, in deep water, clear of the others', () => {
    const { world, send } = game();
    const port = m.launch.gameHarbour(world)!;
    // A boat longer than any Oban face has room for.
    // Even the 80 m coaster finds Oban's long quay; the check is by the face's length.
    const big = m.slots.freeBerthFor(world.vessels, port.id, 'coaster');
    expect(big && m.slots.berthFace(big)!.face.half * 2).toBeGreaterThan(m.slots.vesselLength('coaster'));
    const spot = m.slots.anchorSpotFor(world.vessels, port, 12)!;
    expect(spot).toBeTruthy();
    const depth = -m.terrain.groundHeight(spot.x, spot.z);
    expect(depth).toBeGreaterThanOrEqual(m.config.CONFIG.spawn.anchorDepth[0]);
    for (const v of Object.values(world.vessels)) expect(Math.hypot(v.position[0] - spot.x, v.position[2] - spot.z)).toBeGreaterThanOrEqual(m.config.CONFIG.spawn.anchorClear);
    // Fill the berths: launch boats for many players until one anchors.
    let anchored: string | null = null;
    for (let i = 0; i < 40 && !anchored; i++) {
      const id = `player-${10 + i}`;
      world.players[id] = m.player.createPlayerState(id, `Crew ${i}`);
      send(id, 'launchBoat', 'smallTug');
      const v = m.launch.ownedBoat(world, id)!;
      expect(v).toBeTruthy();
      if (v.anchor.phase === 'set') anchored = v.id;
    }
    expect(anchored).toBeTruthy();
    const v = world.vessels[anchored!];
    expect(v.mooring.phase).toBe('free');
    expect(v.controls.anchor).toBe(1);
    for (let i = 0; i < 5 / DT; i++) {
      m.sim.stepWorld(world, [], DT);
      world.environment.waves = [];
    }
    expect(v.anchor.phase).toBe('set');
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeLessThan(1);
  });
});
