/**
 * Room for a boat at every Voyage map's named berths (owner, Oct 2026: "Some of the default
 * starting positions on the voyage maps are too close to the rocks"). Each map's start berth
 * and every cargo berth: where a boat lies (14 m, the biggest, centred on the berth, out from
 * the face), the ground is under water, not rocks or shore, and no other pier is in the way. Checked
 * against the game's own ground (the pipeline's mesh, streamed in for the big maps).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type CoastPackage, type ChunkedCoastTerrain, type WholeCoastTerrain } from '../src/world/coastRegion';
import { clearCoastTerrains, coastHeight, registerChunkedCoast, registerCoastTerrain } from '../src/world/coastTerrain';
import { CoastStreamer } from '../src/world/coastStream';
import { mapRegion, VOYAGE_MAPS } from '../src/world/maps';
import type { BerthDef, BlockDef } from '../src/world/defs';
import { quaySpotByBerth } from '../src/world/startSpot';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buf = (p: string) => {
  const b = readFileSync(join(root, 'public', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
/** Half a boat's length, and her beam out from the berth's line (m). */
const HALF = 7;
const OUT = 2;

/**
 * Points where a boat lying at `b` is blocked: by ground above the water (rocks, the shore),
 * or another pier. (The coast's own ground: the tests run in the career world, whose
 * hand-built islands lie where the maps are placed; in Voyage mode they aren't there.)
 */
function blockedAt(b: BerthDef, blocks: BlockDef[]): string[] {
  const ax = -b.shoreZ;
  const az = b.shoreX;
  // The pier she lies against: every block under a point just inside the face (a long pier is several boxes).
  const inside = (k: BlockDef, x: number, z: number) => {
    const a = (k.yawDeg * Math.PI) / 180;
    const dx = x - k.x;
    const dz = z - k.z;
    return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) < k.halfLength && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) < k.halfWidth;
  };
  const own = blocks.filter((k) => inside(k, b.x + b.shoreX * (b.shoreDist + 0.5), b.z + b.shoreZ * (b.shoreDist + 0.5)));
  const bad: string[] = [];
  for (let s = -HALF; s <= HALF; s += 1)
    for (const out of [0, OUT]) {
      const x = b.x + ax * s - b.shoreX * out;
      const z = b.z + az * s - b.shoreZ * out;
      const g = coastHeight(x, z) ?? -40;
      if (g > 0) bad.push(`ground ${g.toFixed(1)} m at ${s} m along, ${out} m out`);
      else if (blocks.some((k) => !own.includes(k) && inside(k, x, z))) bad.push(`another pier at ${s} m along, ${out} m out`);
    }
  return bad;
}

describe('Voyage maps: room for a boat at the named berths', () => {
  for (const m of VOYAGE_MAPS) {
    it(`${m.id}: the start berth and every cargo berth`, async () => {
      clearCoastTerrains();
      if (m.remote) setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', m.id, 'package.json'), 'utf8')) as CoastPackage);
      const r = mapRegion(m);
      const c = r.coast!;
      const t = c.pkg.terrain;
      const streamer = new CoastStreamer('/', () => t.dir, async (url) => buf(url.replace(/^\//, '')));
      if (t.chunked) registerChunkedCoast(r.id, buf(t.dir + (t as ChunkedCoastTerrain).coarse.file), t as ChunkedCoastTerrain, c.pkg.box, c.x, c.z);
      else registerCoastTerrain(r.id, buf(t.dir + (t as WholeCoastTerrain).file), t as WholeCoastTerrain, c.pkg.box, c.x, c.z);
      const named = r.berths.filter((b) => b.id === m.startBerth || b.id.endsWith('-cargo'));
      expect(named.some((b) => b.id === m.startBerth)).toBe(true);
      const problems: string[] = [];
      for (const b of named) {
        if (t.chunked) await streamer.preload([{ x: b.x, z: b.z }]);
        const bad = blockedAt(b, r.blocks);
        if (bad.length) problems.push(`${b.id}: ${bad.length} points (${bad[0]})`);
      }
      // The start berth must be clear; every other cargo berth too, bar a corner (two points).
      const start = problems.find((p) => p.startsWith(`${m.startBerth}:`));
      expect(start, start).toBeUndefined();
      expect(problems.filter((p) => Number(p.split(': ')[1].split(' ')[0]) > 2), problems.join('\n')).toEqual([]);
    }, 120000);
  }
});

/**
 * Where you're put ashore beside a berth (startSpot.ts, a step back from its face) is on her
 * quay's deck: the highest deck there, as geography.ts's blockTop takes it (owner, Oct 2026,
 * on the Clyde: "I seem to be on a concrete pier, but underneath the big wooden one": at
 * Rothesay a low pier lies inside the harbour pier's outline, and the game stood you on it).
 */
describe('Voyage maps: put ashore on the berth\'s own deck', () => {
  for (const m of VOYAGE_MAPS) {
    it(`${m.id}: every berth's spot ashore`, () => {
      if (m.remote) setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', m.id, 'package.json'), 'utf8')) as CoastPackage);
      const r = mapRegion(m);
      const covers = (k: BlockDef, x: number, z: number) => {
        const a = (k.yawDeg * Math.PI) / 180;
        const dx = x - k.x;
        const dz = z - k.z;
        return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) <= k.halfLength && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= k.halfWidth;
      };
      const wrong: string[] = [];
      for (const b of r.berths) {
        const q = quaySpotByBerth(b);
        const tops = r.blocks.filter((k) => covers(k, q.x, q.z)).map((k) => k.top);
        if (!tops.length) wrong.push(`${b.id}: no deck`);
        else if (b.deckY !== undefined && Math.abs(Math.max(...tops) - b.deckY) > 0.01) wrong.push(`${b.id}: deck ${Math.max(...tops)}, berth's ${b.deckY}`);
      }
      expect(wrong).toEqual([]);
    });
  }
});
