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

describe('review 4: the plan table chart cost', () => {
  it('groundHeight samples for one table chart', async () => {
    const out: string[] = [];
    for (const map of ['oban', 'clyde']) {
      vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
      vi.resetModules();
      const cr = await import('../src/world/coastRegion');
      if (map === 'clyde') cr.setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', map, 'package.json'), 'utf8')));
      await import('../src/boats/library');
      const regions = await import('../src/world/regions');
      const coast = await import('../src/world/coastTerrain');
      const terrain = await import('../src/world/terrain');
      const plan = await import('../src/voyage/plan');
      const cfg = (await import('../src/config')).CONFIG;
      const r = regions.REGIONS[0];
      const c = r.coast!;
      const t = c.pkg.terrain as any;
      if (t.chunked) coast.registerChunkedCoast(r.id, buf(t.dir + t.coarse.file), t, c.pkg.box, c.x, c.z);
      else coast.registerCoastTerrain(r.id, buf(t.dir + t.file), t, c.pkg.box, c.x, c.z);
      for (const label of ['whole', 'zoomed']) {
        const v = label === 'whole' ? plan.wholeView() : { cx: plan.wholeView().cx, cz: plan.wholeView().cz, span: cfg.voyage.plan.minSpan };
        const b = plan.viewBounds(v);
        const W = cfg.voyage.plan.drawPx;
        const ppm = W / (b.x1 - b.x0);
        const H = Math.round((b.z1 - b.z0) * ppm);
        const sw = Math.ceil(W / 3);
        const sh = Math.ceil(H / 3);
        const t0 = performance.now();
        let s = 0;
        for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) s += terrain.groundHeight(b.x0 + ((i + 0.5) * 3) / ppm, b.z0 + ((j + 0.5) * 3) / ppm);
        const ms = performance.now() - t0;
        out.push(`${map} ${label}: ${sw}x${sh} = ${sw * sh} groundHeight samples, ${ms.toFixed(0)} ms (node, desktop CPU) ${s > 0 ? '' : ''}`);
      }
    }
    writeFileSync(`${OUT}vx4-cost.txt`, out.join('\n'));
  }, 300000);
});
