/**
 * The coast drawing on a long voyage (the review, 24 Oct 2026, world/view/coastView.ts): a big
 * map's far hills are merged into one mesh again only when they must be (not as the boat moves
 * or the visibility drifts), and the coarse copies and towns of chunks passed are freed.
 * A run down the Clyde, the frames given, the meshes counted. No graphics chip: the geometry only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { registerChunkedCoast } from '../src/world/coastTerrain';
import { mapRegion, voyageMap } from '../src/world/maps';
import { CoastTerrainView } from '../src/world/view/coastView';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', 'clyde');
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as CoastPackage;
const terrain = pkg.terrain as ChunkedCoastTerrain;
let view: CoastTerrainView;

beforeAll(() => {
  setRemotePackage(pkg);
  const region = mapRegion(voyageMap('clyde')!);
  const b = readFileSync(join(dir, terrain.coarse.file));
  registerChunkedCoast('clyde', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, terrain, pkg.box, region.coast!.x, region.coast!.z);
  // The towns as one small box a chunk: their count is what's checked here.
  view = new CoastTerrainView(region, () => new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
});

const named = (n: string) => view.root.children.filter((m) => m.name === n);

describe('the coast drawing on a long voyage', () => {
  it('a 30 km run at 10 m/s in drifting visibility: the far hills merged a handful of times, the passed chunks freed', async () => {
    const c = CONFIG.regions;
    // Every far copy made first (as at the quay while the map settles).
    for (let i = 0; i < 400 && !view.ready; i++) view.update(0, -15000, 2, 8000);
    let far = named('coast-far')[0];
    let merges = 0;
    let mostMid = 0;
    let mostSlices = 0;
    let mostTown = 0;
    const kept = () => (view as unknown as { chunks: { mid: unknown }[] }).chunks.filter((ch) => ch.mid).length;
    // 30 km north to south down the middle of the map, 10 frames a second of game (each frame 1 m),
    // the visibility wandering between 7 and 9 km.
    for (let s = 0; s <= 30000; s++) {
      view.update(0, -15000 + s, 2, 8000 + 1000 * Math.sin(s / 300));
      const f = named('coast-far')[0];
      if (f !== far) merges++;
      far = f;
      mostMid = Math.max(mostMid, kept());
      mostSlices = Math.max(mostSlices, named('coast-coarse').length);
      mostTown = Math.max(mostTown, named('coast-town').length);
    }
    // A chunk is 2 km: a row of them leaves the coarse ring each 2 km behind, another enters
    // it ahead (both take a merge: the far grid mustn't lie under nearer ground), and the fog
    // comes and goes. Merging for each chunk at every change took 166 merges on this run.
    expect(merges).toBeLessThan(100);
    // The coarse copies kept: those within 1.5 × 6 km (a 22 km wide disc of 2 km chunks), not every one passed.
    const ring = Math.PI * ((c.coastMidDistance * c.coastDropFactor + 2000) / 2000) ** 2;
    expect(mostMid).toBeLessThan(ring);
    // ...drawn merged, a draw call a slice round the viewer at most (owner, Oct 2026: Ålesund's draw calls).
    expect(mostSlices).toBeGreaterThan(0);
    expect(mostSlices).toBeLessThanOrEqual(c.coastCoarseWedges);
    expect(mostTown).toBeLessThan(Math.PI * ((c.coastBuildingDistance * c.coastDropFactor + 2000) / 2000) ** 2);
    // Settled (a moment later), no chunk drawn nearer is in the far mesh as well (owner, at
    // Naantali: the far grid stood as grey slopes over a narrow sound, and you sailed through it).
    await new Promise((r) => setTimeout(r, (CONFIG.regions.coastFarRebuild + 0.1) * 1000));
    view.update(0, 15000, 2, 8000);
    const v = view as unknown as { farSet: Set<number>; chunks: { k: number; fine: THREE.Mesh | null; midOn: boolean }[] };
    const nearer = v.chunks.filter((ch) => ch.fine?.visible || ch.midOn).map((ch) => ch.k);
    expect(nearer.length).toBeGreaterThan(0);
    expect(nearer.filter((k) => v.farSet.has(k))).toEqual([]);
  });
});
