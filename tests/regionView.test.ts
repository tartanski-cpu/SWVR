/**
 * Regions, milestone 2: the land as plain arrays (built in a worker in the game), the far
 * outline of a region, the trees' places, the sight rule, and the teleport to a region.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { gridCoordinates } from '../src/ocean/oceanGeometry';
import { applyVesselIntent } from '../src/vessel/vesselControl';
import { createVesselState } from '../src/vessel/vesselState';
import type { RegionDef } from '../src/world/defs';
import { HOME } from '../src/world/regions/home';
import { SOUNDS } from '../src/world/regions/sounds';
import { seenRange, sightDistance } from '../src/world/sight';
import { groundHeight } from '../src/world/terrain';
import { CELL, SILHOUETTE_FLOOR, SKIP_BELOW, buildSilhouetteArrays, buildTerrainArrays, summitNear, treeSpots } from '../src/world/view/terrainMesh';

const triangles = (a: { position: Float32Array }) => a.position.length / 9;

describe('terrain arrays', () => {
  it("home's terrain: every triangle has a corner above the skip line, on the grid, finite", () => {
    const t = buildTerrainArrays(HOME);
    expect(triangles(t)).toBeGreaterThan(20000);
    expect(t.color.length).toBe(t.position.length);
    let onGrid = 0;
    for (let i = 0; i < t.position.length; i += 9) {
      const ys = [t.position[i + 1], t.position[i + 4], t.position[i + 7]];
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(SKIP_BELOW);
      for (let k = 0; k < 9; k++) expect(Number.isFinite(t.position[i + k])).toBe(true);
      if (Math.abs(t.position[i] / CELL - Math.round(t.position[i] / CELL)) < 1e-6) onGrid++;
    }
    // Nearly all corners sit on the 6 m grid (the rest are the fine cells round the slipways).
    expect(onGrid / triangles(t)).toBeGreaterThan(0.9);
  });

  it('lean high ground draws fewer triangles than the full grid, and only above the line', () => {
    const full: RegionDef = { ...SOUNDS, leanTerrain: undefined };
    const a = buildTerrainArrays(full);
    const b = buildTerrainArrays(SOUNDS);
    expect(triangles(b)).toBeLessThan(triangles(a) * 0.8);
    // A big (coarse) triangle lies wholly above the line.
    const span = SOUNDS.leanTerrain!.cells * CELL;
    for (let i = 0; i < b.position.length; i += 9) {
      const xs = [b.position[i], b.position[i + 3], b.position[i + 6]];
      if (Math.max(...xs) - Math.min(...xs) > CELL + 1e-6) {
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(span, 3);
        expect(Math.min(b.position[i + 1], b.position[i + 4], b.position[i + 7])).toBeGreaterThan(SOUNDS.leanTerrain!.above);
      }
    }
  });

  it('lean terrain is stitched: every fine vertex on a coarse edge lies on that edge (no cracks)', () => {
    const p = buildTerrainArrays(SOUNDS).position;
    const span = SOUNDS.leanTerrain!.cells * CELL;
    const key = (a: number, b: number) => `${Math.round(a * 100)}|${Math.round(b * 100)}`;
    // The coarse blocks' edges: axis-aligned triangle edges a block long.
    const hEdges = new Map<string, [number, number, number, number]>();
    const vEdges = new Map<string, [number, number, number, number]>();
    for (let i = 0; i < p.length; i += 9) {
      const v = [0, 1, 2].map((k) => [p[i + k * 3], p[i + k * 3 + 1], p[i + k * 3 + 2]]);
      for (let a = 0; a < 3; a++) {
        const [x0, y0, z0] = v[a];
        const [x1, y1, z1] = v[(a + 1) % 3];
        if (Math.abs(z0 - z1) < 1e-6 && Math.abs(Math.abs(x1 - x0) - span) < 1e-6) hEdges.set(key(z0, Math.min(x0, x1)), x0 < x1 ? [x0, x1, y0, y1] : [x1, x0, y1, y0]);
        if (Math.abs(x0 - x1) < 1e-6 && Math.abs(Math.abs(z1 - z0) - span) < 1e-6) vEdges.set(key(x0, Math.min(z0, z1)), z0 < z1 ? [z0, z1, y0, y1] : [z1, z0, y1, y0]);
      }
    }
    expect(hEdges.size).toBeGreaterThan(0);
    let checked = 0;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      const h = hEdges.get(key(z, Math.floor(x / span) * span));
      if (h && x > h[0] + 1e-6 && x < h[1] - 1e-6) {
        checked++;
        expect(y).toBeCloseTo(h[2] + ((h[3] - h[2]) * (x - h[0])) / (h[1] - h[0]), 2);
      }
      const vv = vEdges.get(key(x, Math.floor(z / span) * span));
      if (vv && z > vv[0] + 1e-6 && z < vv[1] - 1e-6) {
        checked++;
        expect(y).toBeCloseTo(vv[2] + ((vv[3] - vv[2]) * (z - vv[0])) / (vv[1] - vv[0]), 2);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('a silhouette is land only, a few thousand triangles, never below its floor', () => {
    const s = buildSilhouetteArrays(SOUNDS);
    expect(triangles(s)).toBeGreaterThan(200);
    expect(triangles(s)).toBeLessThan(6000);
    for (let i = 1; i < s.position.length; i += 3) expect(s.position[i]).toBeGreaterThanOrEqual(SILHOUETTE_FLOOR);
    const h = buildSilhouetteArrays(HOME);
    expect(triangles(h)).toBeLessThan(8000);
  });

  it('trees stand on gentle land between 3 and 40 m, clear of the waterfronts', () => {
    const t = treeSpots(HOME);
    expect(t.length / 4).toBeGreaterThan(500);
    for (let i = 0; i < t.length; i += 4) {
      const h = groundHeight(t[i], t[i + 2]);
      expect(h).toBeGreaterThanOrEqual(3);
      expect(h).toBeLessThanOrEqual(40);
      expect(t[i + 1]).toBeCloseTo(h - 0.2, 3);
      for (const p of HOME.ports) expect(Math.hypot(t[i] - p.x, t[i + 2] - p.z)).toBeGreaterThanOrEqual(p.clearRadius);
    }
  });

  it("the summit search finds the hill's top near the landmark", () => {
    const l = SOUNDS.landmarks[0];
    const top = summitNear(l.x, l.z);
    expect(top.h).toBeGreaterThan(100);
    expect(top.h).toBeGreaterThanOrEqual(groundHeight(l.x, l.z));
    expect(Math.hypot(top.x - l.x, top.z - l.z)).toBeLessThanOrEqual(60 * Math.SQRT2 + 1e-6);
  });
});

describe('sight', () => {
  it("follows the owner's rule of thumb: 100 m from ~40 km, 10 m from ~16 km, the sea from 5 km", () => {
    expect(sightDistance(0)).toBe(5000);
    expect(sightDistance(100)).toBeCloseTo(40000, -2);
    expect(sightDistance(10)).toBeGreaterThan(12000);
    expect(sightDistance(10)).toBeLessThan(20000);
  });
  it('is cut by the visibility, a light a little less', () => {
    expect(seenRange(150, 220)).toBe(220);
    expect(seenRange(150, 220, CONFIG.regions.lightVisFactor)).toBeCloseTo(220 * CONFIG.regions.lightVisFactor);
    expect(seenRange(150, 60000)).toBe(sightDistance(150));
  });
  it("the Sounds' hill is in sight from Calder Haven on a clear day, not in fog", () => {
    const l = SOUNDS.landmarks[0];
    const d = Math.hypot(l.x - 570, l.z - 646);
    expect(d).toBeGreaterThan(4000);
    expect(seenRange(l.height, 20000)).toBeGreaterThan(d);
    expect(seenRange(l.height, 220)).toBeLessThan(d);
  });
});

describe('the far view', () => {
  it('the ocean tile reaches past the haze and the sky dome sits inside the far plane', () => {
    const c = gridCoordinates();
    expect(c[c.length - 1]).toBe(CONFIG.ocean.mesh.farRadius);
    expect(CONFIG.ocean.mesh.farRadius).toBeGreaterThanOrEqual(CONFIG.environment.hazeFar);
    expect(CONFIG.environment.skyRadius).toBeLessThan(CONFIG.render.far);
    expect(CONFIG.environment.skyRadius).toBeGreaterThan(CONFIG.environment.hazeFar);
    // The far rings are few: the tile grows by a handful of rows, not hundreds.
    expect(c.length).toBeLessThan(260);
  });
});

describe('teleport to a region', () => {
  it("puts the boat at the region's first port's cargo berth, afloat", () => {
    const ids = new IdFactory();
    const v = createVesselState(ids.next('vessel'), 'workboat');
    applyVesselIntent(v, { playerId: 'p', targetId: v.id, control: 'teleportToRegion', value: 1, ref: 'sounds' });
    const berth = SOUNDS.berths.find((b) => b.id === 'tarsk-cargo')!;
    expect(v.position[0]).toBeCloseTo(berth.x);
    expect(v.position[2]).toBeCloseTo(berth.z);
    expect(groundHeight(v.position[0], v.position[2])).toBeLessThan(-4);
    applyVesselIntent(v, { playerId: 'p', targetId: v.id, control: 'teleportToRegion', value: 1, ref: 'home' });
    expect(v.position[0]).toBeCloseTo(708.5);
    expect(v.position[2]).toBeCloseTo(660);
    applyVesselIntent(v, { playerId: 'p', targetId: v.id, control: 'teleportToRegion', value: 1, ref: 'nowhere' });
    expect(v.position[0]).toBeCloseTo(708.5);
  });
});
