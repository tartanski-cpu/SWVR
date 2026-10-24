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

describe('review 3: timber site', () => {
  it('oban hotspot vs harbour boats', async () => {
    vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
    vi.resetModules();
    await import('../src/boats/library');
    const regions = await import('../src/world/regions');
    const coast = await import('../src/world/coastTerrain');
    const terrain = await import('../src/world/terrain');
    const hb = await import('../src/world/harbourBoats');
    const timber = await import('../src/voyage/timber');
    const mv = await import('../src/voyage/metaverse');
    const cfg = (await import('../src/config')).CONFIG;
    const r = regions.REGIONS[0];
    const c = r.coast!;
    const t = c.pkg.terrain as any;
    coast.registerCoastTerrain(r.id, buf(t.dir + t.file), t, c.pkg.box, c.x, c.z);
    const out: string[] = [];
    for (const s of mv.SITES) {
      const at = timber.hotspotAt(s)!;
      const spawn = mv.worldOf(s.mapId, s.bargeSpawn.lat, s.bargeSpawn.lon)!;
      out.push(`${s.id} hotspot (${at.x.toFixed(0)},${at.z.toFixed(0)}) r${s.radiusM} depth ${(-terrain.groundHeight(at.x, at.z)).toFixed(1)}; barge spawn (${spawn.x.toFixed(0)},${spawn.z.toFixed(0)}) depth ${(-terrain.groundHeight(spawn.x, spawn.z)).toFixed(1)}, ${Math.hypot(spawn.x - at.x, spawn.z - at.z).toFixed(0)} m from centre`);
      // depth over the hotspot disc
      let shallow = 0, land = 0, n = 0;
      for (let dx = -s.radiusM; dx <= s.radiusM; dx += 5) for (let dz = -s.radiusM; dz <= s.radiusM; dz += 5) {
        if (Math.hypot(dx, dz) > s.radiusM) continue;
        n++;
        const g = terrain.groundHeight(at.x + dx, at.z + dz);
        if (g > 0) land++;
        else if (g > -2) shallow++;
      }
      out.push(`  disc: ${n} pts, ${land} land, ${shallow} under 2 m`);
      const near = hb.harbourBoats().filter((b) => Math.hypot(b.x - at.x, b.z - at.z) < s.radiusM + b.r + cfg.harbourBoats.kinds[b.kind].length);
      out.push(`  harbour boats whose swing reaches the hotspot: ${near.length}: ${near.map((b) => `${b.kind} ${b.how} @${Math.hypot(b.x - at.x, b.z - at.z).toFixed(0)}m r${b.r.toFixed(0)}`).join('; ')}`);
      const nearSpawn = hb.harbourBoats().filter((b) => Math.hypot(b.x - spawn.x, b.z - spawn.z) < b.r + cfg.harbourBoats.kinds[b.kind].length / 2 + 6);
      out.push(`  harbour boats whose swing reaches the barge spawn: ${nearSpawn.length}: ${nearSpawn.map((b) => `${b.kind} ${b.how} @${Math.hypot(b.x - spawn.x, b.z - spawn.z).toFixed(0)}m r${b.r.toFixed(0)}`).join('; ')}`);
    }
    // merchant berth
    for (const m of cfg.voyage.timber.merchants) out.push(`merchant ${m.berthId}`);
    writeFileSync(`${OUT}vx3-timber.txt`, out.join('\n'));
  }, 120000);
});
