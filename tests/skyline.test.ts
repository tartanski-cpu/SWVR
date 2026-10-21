/**
 * The coast extras plan, C2: fish farms and the skyline from the map data. A coast map's
 * mapped farm becomes a farm the game draws and collides with (cages for a fish farm, mussel
 * lines otherwise) with a lit yellow mark at each corner; farm blocks offer no berth; the
 * skyline's landmarks stand at the map's height or their kind's.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { BERTHS, BLOCKS, FARMS } from '../src/world/archipelago';
import { allBerths } from '../src/world/berths';
import { farmBlocks, lineEnds, ringCentres } from '../src/world/farms';
import { OBAN } from '../src/world/regions/oban';
import { skylineHeight } from '../src/world/view/skylineView';

describe('fish farms from the map (C2)', () => {
  it("Oban's two: a fish farm of cages, an unknown kind as mussel lines, each with four lit corner marks", () => {
    const farms = OBAN.farms!;
    expect(farms.length).toBe(2);
    const fish = farms.find((f) => f.name === 'Fish farm')!;
    expect(fish.kind).toBe('cages');
    expect(ringCentres(fish).length).toBe(fish.rows * fish.cols);
    const other = farms.find((f) => f.kind === 'lines')!;
    expect(other.name).toBe('Marine farm');
    expect(lineEnds(other).length).toBe(other.rows);
    for (const f of farms) {
      expect(f.corners?.length).toBe(4);
      // Each corner's light, Fl Y 5s, among the region's lights.
      for (const [x, z] of f.corners!) expect(OBAN.lights.some((l) => l.color === 'yellow' && l.period === 5 && Math.hypot(l.x - x, l.z - z) < 0.5)).toBe(true);
      // The cages or lines lie inside the lease (its corners' box, a little slack).
      const xs = f.corners!.map((c) => c[0]);
      const zs = f.corners!.map((c) => c[1]);
      const pts = f.kind === 'lines' ? lineEnds(f).flat() : ringCentres(f);
      for (const [x, z] of pts) {
        expect(x).toBeGreaterThan(Math.min(...xs) - 1);
        expect(x).toBeLessThan(Math.max(...xs) + 1);
        expect(z).toBeGreaterThan(Math.min(...zs) - 1);
        expect(z).toBeLessThan(Math.max(...zs) + 1);
      }
    }
  });

  it('mussel lines are solid strips, one a line; farm blocks are no place to tie up', () => {
    const other = OBAN.farms!.find((f) => f.kind === 'lines')!;
    const blocks = farmBlocks(other);
    expect(blocks.length).toBe(other.rows);
    for (const b of blocks) {
      expect(b.farm).toBe(true);
      expect(b.halfLength).toBeCloseTo(other.lineLength! / 2, 5);
    }
    // The world's farms (the Fjord's, here): no berth along any ring.
    const rings = FARMS.flatMap((f) => (f.kind === 'lines' ? [] : ringCentres(f)));
    expect(rings.length).toBeGreaterThan(0);
    expect(BLOCKS.some((b) => b.farm)).toBe(true);
    const named = new Set(BERTHS.map((b) => b.id));
    for (const b of allBerths()) if (!named.has(b.id)) for (const [x, z] of rings) expect(Math.hypot(b.x - x, b.z - z)).toBeGreaterThan(14);
  });
});

describe('the skyline (C2)', () => {
  it("Oban's: its monument, masts and turbines; no lighthouse twice, no kit church twice", () => {
    const sky = OBAN.skyline!;
    expect(sky.some((s) => s.name === "Hutcheson's Monument")).toBe(true);
    expect(sky.some((s) => s.kind === 'mast')).toBe(true);
    expect(sky.some((s) => s.kind === 'turbine')).toBe(true);
    expect(sky.some((s) => (s.kind as string) === 'lighthouse')).toBe(false);
    for (const s of sky.filter((x) => x.kind === 'church')) expect(OBAN.buildings.some((b) => b.kind === 'church' && Math.hypot(b.x - s.x, b.z - s.z) < 40)).toBe(false);
  });

  it("stands at the map's height where tagged, else its kind's", () => {
    expect(skylineHeight({ kind: 'mast', name: '', x: 0, z: 0, height: 120 })).toBe(120);
    expect(skylineHeight({ kind: 'mast', name: '', x: 0, z: 0 })).toBe(CONFIG.skyline.heights.mast);
    expect(skylineHeight({ kind: 'turbine', name: '', x: 0, z: 0 })).toBe(CONFIG.skyline.heights.turbine);
  });
});
