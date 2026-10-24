import { describe, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/tmp/claude-0/-home-user-SWVR/94a4fac1-5e2d-51e9-aa66-7b4827e09f6c/scratchpad/review/';
const buf = (p: string) => {
  const b = readFileSync(join(root, 'public', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

async function loadMap(map: string) {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
  vi.resetModules();
  const cr = await import('../src/world/coastRegion');
  const maps = await import('../src/world/maps');
  const vm = maps.voyageMap(map);
  if (vm?.remote) cr.setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', map, 'package.json'), 'utf8')));
  await import('../src/boats/library');
  const m = {
    vm,
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    coast: await import('../src/world/coastTerrain'),
    stream: await import('../src/world/coastStream'),
    terrain: await import('../src/world/terrain'),
    world: await import('../src/core/world'),
    ids: await import('../src/core/ids'),
    arch: await import('../src/world/archipelago'),
    launch: await import('../src/core/launch'),
    plan: await import('../src/voyage/plan'),
    table: await import('../src/voyage/planTable'),
    ferries: await import('../src/traffic/ferries'),
    slots: await import('../src/world/slots'),
    spot: await import('../src/world/startSpot'),
    berths: await import('../src/world/berths'),
    sim: await import('../src/core/simulation'),
    hb: await import('../src/world/harbourBoats'),
    weather: await import('../src/environment/weather'),
    walk: await import('../src/world/landWalkArea'),
  };
  const r = m.regions.REGIONS[0];
  const c = r.coast!;
  const t = c.pkg.terrain as any;
  let streamer: any = null;
  if (t.chunked) {
    m.coast.registerChunkedCoast(r.id, buf(t.dir + t.coarse.file), t, c.pkg.box, c.x, c.z);
    streamer = new m.stream.CoastStreamer('/', () => t.dir, async (url: string) => buf(url.replace(/^\//, '')));
  } else m.coast.registerCoastTerrain(r.id, buf(t.dir + t.file), t, c.pkg.box, c.x, c.z);
  return { ...m, r, streamer, chunked: !!t.chunked };
}

describe('review 2', () => {
  for (const id of ['oban', 'tayvallich', 'syros', 'clyde']) {
    it(`ferries vs berths ${id}`, async () => {
      const m = await loadMap(id);
      const lines: string[] = [];
      const say = (s: string) => lines.push(s);
      const routes = m.arch.FERRY_ROUTES;
      say(`${routes.length} ferry routes`);
      // berths that matter: start + every port's Go berth (computed on full ground for whole maps; chunk preload for chunked)
      const used: { why: string; b: any }[] = [{ why: 'START', b: m.berths.berthWithId(m.vm!.startBerth) }];
      for (const port of m.arch.PORTS) {
        if (m.chunked) await m.streamer.preload([{ x: port.x, z: port.z }]);
        const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true });
        const v = world.vessels[vesselId];
        m.launch.teleportToPortSlot(world, v, port.id);
        if (v.mooring.phase === 'moored') used.push({ why: `GO ${port.id}`, b: m.berths.berthWithId(v.mooring.berthId!) });
      }
      const pose = { x: 0, z: 0, heading: 0 };
      for (const { why, b } of used) {
        if (!b) continue;
        for (const r of routes) {
          const k = m.config.CONFIG.ferries.classes[r.cls];
          const [s0, s1] = m.ferries.stops(r);
          for (const [end, s, dir] of [[0, s0, -1], [1, s1, 1]] as const) {
            if (!r.ends[end].dock) continue;
            // berthed pose
            m.ferries.ferryPose(r, { s, dir: dir as 1 | -1 }, pose);
            const dBerthed = Math.hypot(pose.x - b.x, pose.z - b.z);
            // approach: check hold box at points along last 300 m
            let blockedAt: number | null = null;
            const hold = m.config.CONFIG.ferries.hold;
            for (let back = 0; back <= 300; back += 5) {
              const sa = dir > 0 ? s - back : s + back;
              m.ferries.ferryPose(r, { s: sa, dir: dir as 1 | -1 }, pose);
              const fx = Math.sin(pose.heading);
              const fz = -Math.cos(pose.heading);
              const dx = b.x - pose.x;
              const dz = b.z - pose.z;
              const along = dx * fx + dz * fz;
              if (along > k.length * 0.3 && along < k.length / 2 + hold.ahead && Math.abs(-dx * fz + dz * fx) < k.beam / 2 + hold.side) {
                blockedAt = back;
                break;
              }
            }
            if (dBerthed < k.length / 2 + 15 || blockedAt !== null)
              say(`${why} ${b.id}: ferry ${r.id} (${r.cls}, ${r.ends[end].name}) berthed ${dBerthed.toFixed(0)} m away; ${blockedAt !== null ? `HOLDS the inbound ferry ${blockedAt} m short of her berth` : 'not in hold box'}`);
          }
        }
      }
      // Chunked: the table placement on coarse ground right after Go.
      if (m.chunked) {
        for (const port of m.arch.PORTS) {
          for (const tt of m.coast.coastTerrains()) for (const k of [...tt.pieces.keys()]) m.coast.removeCoastChunk(tt.id, k);
          const { world } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true });
          m.plan.tableFollows(world, port.id);
          const tb = m.plan.tableBerthId(world);
          if (!tb) continue;
          const coarse = m.table.planTableSpot(tb);
          await m.streamer.preload([{ x: port.x, z: port.z }]);
          const fine = m.table.planTableSpot(tb);
          const fy = coarse ? m.walk.landFloor(coarse.x, coarse.z) : null;
          say(`TABLE ${port.id} ${tb}: coarse ${coarse ? `(${coarse.x.toFixed(0)},${coarse.z.toFixed(0)}) y=${coarse.y.toFixed(2)}, real floor there ${fy?.toFixed(2) ?? 'NONE(water/steep)'}` : 'NONE'} | fine ${fine ? `(${fine.x.toFixed(0)},${fine.z.toFixed(0)}) y=${fine.y.toFixed(2)}` : 'NONE'}${coarse && fine ? ` d=${Math.hypot(coarse.x - fine.x, coarse.z - fine.z).toFixed(1)}` : ''}`);
        }
      }
      writeFileSync(`${OUT}vx2-${id}.txt`, lines.join('\n'));
    }, 900000);
  }

  it('bogus map id', async () => {
    const m = await loadMap('bogus');
    const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true });
    const v = world.vessels[vesselId];
    const p = world.players[localPlayerId];
    const out = [
      `region ${m.r.id}; startBerthId ${m.spot.startBerthId()}; berth found ${!!m.berths.berthWithId(m.spot.startBerthId())}`,
      `boat at (${v.position[0].toFixed(0)},${v.position[2].toFixed(0)}) mooring ${v.mooring.phase} ground ${m.terrain.groundHeight(v.position[0], v.position[2]).toFixed(1)}`,
      `player at (${p.position.map((n: number) => n.toFixed(1)).join(',')}) floor ${m.walk.landFloor(p.position[0], p.position[2])} ground ${m.terrain.groundHeight(p.position[0], p.position[2]).toFixed(1)}`,
      `table ${JSON.stringify(m.table.planTableSpot(null))}`,
    ];
    writeFileSync(`${OUT}vx2-bogus.txt`, out.join('\n'));
  }, 120000);

  it('Go to an anchorage with a harbour boat on it, in a blow (oban dunbeg)', async () => {
    const m = await loadMap('oban');
    const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true, weather: true });
    const out: string[] = [];
    for (const preset of ['Squall', 'Overcast'] as const) {
      const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true, weather: true });
      world.environment.weather = m.weather.createWeather(preset);
      const v = world.vessels[vesselId];
      m.sim.stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'teleportToPort', value: 1, ref: 'dunbeg-anchorage' } as any], 1 / 60);
      const L = m.slots.vesselLength(v.defId);
      const hbs = m.hb.harbourBoats().filter((b) => b.how !== 'alongside' && Math.hypot(b.x - v.position[0], b.z - v.position[2]) < 80);
      let minGap = Infinity;
      const pose = { x: 0, z: 0, heading: 0 };
      const hp0 = JSON.stringify((v as any).damage ?? null);
      for (let i = 0; i < 60 * 300; i++) {
        m.sim.stepWorld(world, [], 1 / 60);
        if (i % 30) continue;
        const w = m.hb.boatWind(world);
        for (const b of hbs) {
          m.hb.harbourBoatPose(b, w.from, w.speed, pose);
          minGap = Math.min(minGap, Math.hypot(pose.x - v.position[0], pose.z - v.position[2]) - L / 2 - m.config.CONFIG.harbourBoats.kinds[b.kind].length / 2);
        }
      }
      out.push(`${preset}: ${hbs.length} harbour boats within 80 m (${hbs.map((b) => `${b.kind} ${b.how} r${b.r.toFixed(0)} @${Math.hypot(b.x - v.position[0], b.z - v.position[2]).toFixed(0)}`).join('; ')}); min centre gap less half-lengths over 5 min ${minGap.toFixed(1)} m; anchor ${v.anchor.phase}; hull before ${hp0} after ${JSON.stringify((v as any).damage ?? null)}`);
    }
    void world; void vesselId;
    writeFileSync(`${OUT}vx2-dunbeg.txt`, out.join('\n'));
  }, 600000);
});
