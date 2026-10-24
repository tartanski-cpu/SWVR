// SCRATCH (review, voyage-events): delete before finishing.
import { describe, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(map: string) {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
  vi.resetModules();
  const chunked = map === 'clyde' || map === 'syros';
  if (chunked) {
    const cr = await import('../src/world/coastRegion');
    cr.setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', map, 'package.json'), 'utf8')));
  }
  const m = {
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    arch: await import('../src/world/archipelago'),
    coast: await import('../src/world/coastTerrain'),
    terrain: await import('../src/world/terrain'),
    world: await import('../src/core/world'),
    ids: await import('../src/core/ids'),
    vc: await import('../src/vessel/vesselControl'),
    sos: await import('../src/rescue/sos'),
    rescue: await import('../src/rescue/rescue'),
    tow: await import('../src/tow/tow'),
    fire: await import('../src/fire/fire'),
    salvage: await import('../src/salvage/salvage'),
    sim: await import('../src/core/simulation'),
    potting: await import('../src/potting/potting'),
    cargo: await import('../src/cargo/cargo'),
    vdef: await import('../src/vessel/vesselDef'),
    sims: await import('../src/boats/sims'),
  };
  const reg = m.regions.regionById(map)!;
  const c = reg.coast!;
  const t = c.pkg.terrain as any;
  if (t.chunked) {
    const bin = readFileSync(join(root, 'public', 'regions', map, t.coarse.file));
    m.coast.registerChunkedCoast(map, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  } else {
    const bin = readFileSync(join(root, 'public', t.dir, t.file));
    m.coast.registerCoastTerrain(map, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  }
  return { m, reg };
}

function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

describe('review probes', { timeout: 600000 }, () => {
  for (const map of ['oban', 'tayvallich', 'clyde', 'syros']) {
    it(map, async () => {
      const { m, reg } = await load(map);
      const out: string[] = [];
      const gh = m.terrain.groundHeight;
      const PORTS = m.arch.PORTS;
      out.push(`ports ${PORTS.length}`);
      // Potting pallet.
      const pal = m.config.CONFIG.potting.pallet;
      const b = reg.bounds;
      const inside = pal.x >= b.x0 && pal.x <= b.x1 && pal.z >= b.z0 && pal.z <= b.z1;
      const np = m.rescue.nearestPort(pal.x, pal.z);
      out.push(`pallet inside=${inside} ground=${gh(pal.x, pal.z).toFixed(1)} nearestPort=${np.port.id} ${np.dist.toFixed(0)}m`);
      // World.
      const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), m.config.CONFIG.voyage.boat, { tender: true, cold: true, weather: true, tows: true, fires: true, logs: true, harbour: true, voyage: true });
      const v = world.vessels[vesselId];
      out.push(`boat ${v.defId} rescueGear=${!!m.vdef.VESSEL_DEFS[v.defId].rescueGear} towPoint=${!!m.sims.gearOf(v, 'towPoint')} fireMonitor=${!!m.sims.gearOf(v, 'fireMonitor')}`);
      out.push(`sosYard at start: ${JSON.stringify(m.sos.sosYard(v))}`);
      out.push(`beachSpots ${m.salvage.beachSpots().length}`);
      out.push(`cargo items ${Object.keys(world.cargo).length}; world JSON ${(JSON.stringify(world).length / 1024).toFixed(0)} KB; cargo JSON ${(JSON.stringify(world.cargo).length / 1024).toFixed(0)} KB`);
      // Enable potting: where do pots go?
      m.potting.enablePotting(world);
      const pots = Object.values(world.cargo).filter((c: any) => c.from === 'pots') as any[];
      out.push(`pots ${pots.length} at y=${pots.map((p) => p.at.ground[1].toFixed(1)).join(',')}`);
      // SOS capsized at start.
      m.vc.placeVessel(v, v.position[0], 0, v.position[2], 0, 170);
      m.sim.stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'sos', value: 1 } as any], 1 / 60);
      out.push(`after SOS capsized: cond=${m.sos.sosCondition(v)} radio=${world.rescue?.radio?.text ?? 'none'}`);

      // Spawn sampling.
      let samples = 0;
      let towLand = 0;
      let incLand = 0;
      let fireNull = 0;
      let fireTotal = 0;
      let towFar = 0;
      let incFar = 0;
      let unreachTow = 0;
      let unreachInc = 0;
      const span = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
      // Water connectivity: BFS at 40 m cells, depth > 2.5 m, within 2.5 km box round the boat.
      const reach = (bx: number, bz: number, tx: number, tz: number) => {
        const cell = 40;
        const R = 2600;
        const n = Math.ceil((2 * R) / cell);
        const seen = new Uint8Array(n * n);
        const idx = (x: number, z: number) => Math.floor((x - (bx - R)) / cell) + Math.floor((z - (bz - R)) / cell) * n;
        const ti = idx(tx, tz);
        const si = idx(bx, bz);
        const q = [si];
        seen[si] = 1;
        while (q.length) {
          const i = q.pop()!;
          if (i === ti) return true;
          const ix = i % n;
          const iz = Math.floor(i / n);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
            const j = jx + jz * n;
            if (seen[j]) continue;
            seen[j] = 1;
            const wx = bx - R + (jx + 0.5) * cell;
            const wz = bz - R + (jz + 0.5) * cell;
            if (gh(wx, wz) < -2.5) q.push(j);
          }
        }
        return false;
      };
      for (let k = 0; samples < 40 && k < 4000; k++) {
        const x = span.x0 + hash(k + 0.1) * (span.x1 - span.x0);
        const z = span.z0 + hash(k + 0.2) * (span.z1 - span.z0);
        if (gh(x, z) > -6) continue;
        if (m.rescue.nearestPort(x, z).dist < m.config.CONFIG.rescue.harbourRadius) continue;
        // Within 3 km of some port (where people sail).
        if (m.rescue.nearestPort(x, z).dist > 3000) continue;
        samples++;
        const { world: w, vesselId: id } = m.world.createWorld(new m.ids.IdFactory(), 'workboat', { tows: true, fires: true, voyage: true });
        const s = w.vessels[id];
        m.vc.placeVessel(s, x, 0, z, hash(k + 0.3) * 360);
        w.tow!.seq = k * 7;
        const job = m.tow.startTowCall(w, s);
        const tv = w.vessels[job.vesselId];
        if (gh(tv.position[0], tv.position[2]) > -m.config.CONFIG.tow.minDepth) towLand++;
        if (!reach(x, z, tv.position[0], tv.position[2])) unreachTow++;
        if (Math.hypot(tv.position[0] - x, tv.position[2] - z) > 1200) towFar++;
        w.rescue!.seq = k * 5;
        const inc = m.rescue.startIncident(w, s, null);
        if (gh(inc.x, inc.z) > -m.config.CONFIG.rescue.minDepth) incLand++;
        const tg = inc.targets[0];
        if (gh(tg.x, tg.z) > -0.5) incFar++;
        if (!reach(x, z, inc.x, inc.z)) unreachInc++;
        w.fire!.seq = k * 3;
        fireTotal++;
        const fj = m.fire.startFireCall(w, s);
        if (!fj) fireNull++;
      }
      out.push(`samples ${samples}: tow on land/shoal ${towLand}, tow not reachable by water within 2.6km ${unreachTow}, tow >1.2km ${towFar}; incident centre on land ${incLand}, first target on land ${incFar}, incident unreachable ${unreachInc}; fire none found ${fireNull}/${fireTotal}`);
      console.log(`\n=== ${map}\n` + out.join('\n'));
    });
  }
});
