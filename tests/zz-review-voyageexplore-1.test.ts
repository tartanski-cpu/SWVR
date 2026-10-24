import { describe, it, vi } from 'vitest';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
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
  const vm = maps.voyageMap(map)!;
  if (vm.remote) cr.setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', map, 'package.json'), 'utf8')));
  await import('../src/boats/library');
  const m = {
    vm,
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
    hb: await import('../src/world/harbourBoats'),
    slots: await import('../src/world/slots'),
    spot: await import('../src/world/startSpot'),
    berths: await import('../src/world/berths'),
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

describe('review: Go to every port, each map', () => {
  for (const id of ['tayvallich', 'syros', 'clyde']) {
    it(id, async () => {
      const m = await loadMap(id);
      const lines: string[] = [];
      writeFileSync(`${OUT}go-${id}.live.txt`, '');
      const say = (s: string) => (lines.push(s), appendFileSync(`${OUT}go-${id}.live.txt`, s + '\n'));
      const startB = m.vm.startBerth;
      if (m.streamer) {
        const b = m.berths.berthWithId(startB)!;
        await m.streamer.preload([{ x: b.x, z: b.z }]);
      }
      const st = m.table.planTableSpot(null);
      const q = m.spot.quaySpot(null);
      say(`START ${startB}: table ${st ? `${Math.hypot(st.x - q.x, st.z - q.z).toFixed(1)} m from spot, y=${st.y.toFixed(2)}` : 'NONE'}`);
      const hbs = m.hb.harbourBoats();
      say(`harbour boats: ${hbs.length} (${hbs.filter((b) => b.how === 'alongside').length} alongside)`);
      for (const port of m.arch.PORTS) {
        const res: string[] = [];
        for (const mode of m.chunked ? ['coarse', 'fine'] : ['fine']) {
          // drop all chunks: the coarse case
          if (m.chunked) {
            for (const tt of m.coast.coastTerrains()) for (const k of [...tt.pieces.keys()]) m.coast.removeCoastChunk(tt.id, k);
            if (mode === 'fine') await m.streamer.preload([{ x: port.x, z: port.z }, ...(port.cargo.berth ? [port.cargo.berth] : []), ...(port.cargo.anchorage ? [port.cargo.anchorage] : [])]);
          }
          const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true });
          const v = world.vessels[vesselId];
          let ok = false;
          try {
            ok = m.launch.teleportToPortSlot(world, v, port.id);
          } catch (e) {
            res.push(`${mode}: THROWS ${(e as Error).message}`);
            continue;
          }
          const L = m.slots.vesselLength(v.defId);
          let info = `${mode}: `;
          if (!ok) info += 'NO ROOM';
          else if (v.mooring.phase === 'moored') info += `moored ${v.mooring.berthId}`;
          else info += `anchored at (${v.position[0].toFixed(0)},${v.position[2].toFixed(0)}) depth ${(-m.terrain.groundHeight(v.position[0], v.position[2])).toFixed(1)}`;
          // hull points ground
          const h = Math.atan2(-(2 * (v.orientation[0] * v.orientation[2] + v.orientation[3] * v.orientation[1])), 1 - 2 * (v.orientation[0] ** 2 + v.orientation[1] ** 2));
          let minDepth = Infinity;
          for (let s = -L / 2; s <= L / 2; s += L / 4) {
            const x = v.position[0] + Math.sin(h) * s;
            const z = v.position[2] - Math.cos(h) * s;
            minDepth = Math.min(minDepth, -m.terrain.groundHeight(x, z));
          }
          info += ` minDepthUnderHull ${minDepth.toFixed(1)}`;
          const near = hbs.filter((b) => b.how !== 'alongside' && Math.hypot(b.x - v.position[0], b.z - v.position[2]) < b.r + L / 2 + 6);
          if (near.length) info += ` HB-NEAR:${near.map((b) => `${b.how}@${Math.hypot(b.x - v.position[0], b.z - v.position[2]).toFixed(0)}m(r${b.r.toFixed(0)})`).join(',')}`;
          if (mode === 'fine' || !m.chunked) {
            m.plan.tableFollows(world, port.id);
            const tb = m.plan.tableBerthId(world);
            const ts = tb ? m.table.planTableSpot(tb) : null;
            info += ` | tableBerth ${tb ?? 'null->start'} ${tb ? (ts ? 'table ok' : 'TABLE NONE') : ''}`;
          }
          res.push(info);
        }
        say(`${port.id} (${port.kind}, berth:${!!port.cargo.berth} anch:${!!port.cargo.anchorage}) :: ${res.join(' || ')}`);
      }
      writeFileSync(`${OUT}go-${id}.txt`, lines.join('\n'));
    }, 600000);
  }
});
