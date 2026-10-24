import { describe, it, vi } from 'vitest';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = '/tmp/claude-0/-home-user-SWVR/94a4fac1-5e2d-51e9-aa66-7b4827e09f6c/scratchpad/review/vx5-tay.txt';
const buf = (p: string) => {
  const b = readFileSync(join(root, 'public', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const say = (s: string) => appendFileSync(LOG, s + '\n');

describe('review 5', () => {
  it('tayvallich timing', async () => {
    writeFileSync(LOG, '');
    vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=tayvallich', href: 'https://localhost/voyage.html?map=tayvallich' });
    vi.resetModules();
    let t = performance.now();
    const lap = (s: string) => {
      const n = performance.now();
      say(`${s}: ${(n - t).toFixed(0)} ms`);
      t = n;
    };
    await import('../src/boats/library');
    const regions = await import('../src/world/regions');
    const coast = await import('../src/world/coastTerrain');
    const world = await import('../src/core/world');
    const ids = await import('../src/core/ids');
    const arch = await import('../src/world/archipelago');
    const launch = await import('../src/core/launch');
    const table = await import('../src/voyage/planTable');
    const plan = await import('../src/voyage/plan');
    const spot = await import('../src/world/startSpot');
    const hb = await import('../src/world/harbourBoats');
    lap('imports');
    const r = regions.REGIONS[0];
    const c = r.coast!;
    const tt = c.pkg.terrain as any;
    coast.registerCoastTerrain(r.id, buf(tt.dir + tt.file), tt, c.pkg.box, c.x, c.z);
    lap('terrain');
    const s = table.planTableSpot(null);
    const q = spot.quaySpot(null);
    lap(`start table ${s ? Math.hypot(s.x - q.x, s.z - q.z).toFixed(1) + ' m' : 'NONE'}`);
    hb.harbourBoats();
    lap(`harbour boats ${hb.harbourBoats().length}`);
    say(`ports ${arch.PORTS.map((p) => `${p.id}(${p.kind})`).join(', ')}; blocks ${r.blocks.length}; buildings ${r.buildings.length}`);
    for (const port of arch.PORTS) {
      const w = world.createWorld(new ids.IdFactory(), 'pilotBoat', { harbour: true, voyage: true });
      lap(`createWorld`);
      const v = w.world.vessels[w.vesselId];
      const ok = launch.teleportToPortSlot(w.world, v, port.id);
      lap(`go ${port.id}: ${ok} ${v.mooring.phase} ${v.mooring.berthId ?? ''} anchor ${v.anchor.phase} at (${v.position[0].toFixed(0)},${v.position[2].toFixed(0)})`);
      plan.tableFollows(w.world, port.id);
      const tb = plan.tableBerthId(w.world);
      const ts = tb ? table.planTableSpot(tb) : null;
      lap(`table ${tb} ${ts ? 'ok' : 'NONE'}`);
    }
  }, 600000);
});
