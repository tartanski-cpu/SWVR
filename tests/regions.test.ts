/**
 * Regions (the regions brief, milestone 1): the world is a list of regions, each a data
 * file; the flat lists the game reads are their concatenation. Home is the whole of v1.0's
 * world, unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  BERTHS,
  BLOCKS,
  FISHING_GROUNDS,
  FOG_BANKS,
  ISLANDS,
  LIGHTS,
  MARKS,
  PORTS,
  POTTING_GROUNDS,
  SHELTERS,
  SLIPWAYS,
  WRECKS,
} from '../src/world/archipelago';
import { HOME } from '../src/world/regions/home';
import { REGIONS, distanceToBounds, inRegion, regionAt, regionById } from '../src/world/regions';
import { chartBounds } from '../src/nav/geo';
import { groundHeight } from '../src/world/terrain';

describe('regions', () => {
  it('home is the first region and is found by id', () => {
    expect(REGIONS[0]).toBe(HOME);
    expect(regionById('home')).toBe(HOME);
    expect(regionById('nowhere')).toBeUndefined();
  });

  it('region ids are unique, and so are port, berth and slipway ids across regions', () => {
    const unique = (ids: string[]) => expect(new Set(ids).size).toBe(ids.length);
    unique(REGIONS.map((r) => r.id));
    unique(PORTS.map((p) => p.id));
    unique(BERTHS.map((b) => b.id));
    unique(SLIPWAYS.map((s) => s.id));
    unique(POTTING_GROUNDS.map((g) => g.id));
  });

  it("every region's data lies inside its footprint", () => {
    for (const r of REGIONS) {
      const inside = (x: number, z: number, what: string) => expect(inRegion(r, x, z), `${r.id}: ${what} (${x}, ${z})`).toBe(true);
      for (const i of r.islands) {
        inside(i.x - i.radius, i.z - i.radius, i.name);
        inside(i.x + i.radius, i.z + i.radius, i.name);
      }
      for (const p of r.ports) inside(p.x, p.z, p.name);
      for (const b of r.berths) inside(b.x, b.z, b.name);
      for (const m of r.marks) inside(m.x, m.z, m.name);
      for (const l of r.lights) inside(l.x, l.z, l.name);
      for (const l of r.landmarks) inside(l.x, l.z, l.name);
      for (const g of r.fishingGrounds) {
        inside(g.x - g.radius, g.z - g.radius, g.name);
        inside(g.x + g.radius, g.z + g.radius, g.name);
      }
      for (const f of r.fogBanks) {
        inside(f.x - f.r, f.z - f.r, 'fog bank');
        inside(f.x + f.r, f.z + f.r, 'fog bank');
      }
      for (const s of r.shelters) inside(s.x, s.z, 'shelter');
      for (const w of r.wrecks) inside(w.x, w.z, w.name);
    }
  });

  it("a region's berths, slipways and floods name its own ports", () => {
    for (const r of REGIONS) {
      const ids = new Set(r.ports.map((p) => p.id));
      for (const b of r.berths) expect(ids.has(b.portId), b.id).toBe(true);
      for (const s of r.slipways) expect(ids.has(s.portId), s.id).toBe(true);
      for (const f of r.portFloods) expect(ids.has(f.portId), f.portId).toBe(true);
    }
  });

  it('regionAt: inside home anywhere in it, and nearest from the open sea beyond it', () => {
    expect(regionAt(570, 646).id).toBe('home'); // Calder Haven
    expect(regionAt(-553, 317).id).toBe('home'); // Brannock Pier
    expect(regionAt(0, 3000).id).toBe('home'); // far out at sea to the south: the nearest region
    expect(regionAt(0, -3000).id).toBe('sounds'); // in the sound, nearer the Sounds' footprint than home's
    expect(distanceToBounds(HOME, 0, 0)).toBe(0);
    expect(distanceToBounds(HOME, 0, -1700)).toBeCloseTo(1000);
    expect(distanceToBounds(HOME, 2400, 2200)).toBeCloseTo(500);
  });

  it('the flat lists are the regions joined, home first', () => {
    const flat = REGIONS.flatMap((r) => r.islands);
    expect(ISLANDS).toEqual(flat);
    expect(PORTS.slice(0, HOME.ports.length)).toEqual(HOME.ports);
    expect(BLOCKS.length).toBe(REGIONS.reduce((n, r) => n + r.blocks.length, 0));
    expect(MARKS.length).toBe(REGIONS.reduce((n, r) => n + r.marks.length, 0));
    expect(FOG_BANKS.length).toBe(REGIONS.reduce((n, r) => n + r.fogBanks.length, 0));
    expect(FISHING_GROUNDS.length).toBe(REGIONS.reduce((n, r) => n + r.fishingGrounds.length, 0));
  });

  it('home is v1.0 world, unchanged: the same places in the same spots', () => {
    // A few fixed points, so a slip while moving the data would show.
    expect(PORTS.map((p) => p.id)).toEqual(['calder', 'brannock', 'selkie', 'tarsk', 'garbh', 'camas']);
    expect(ISLANDS.find((i) => i.name === 'Calder Holm')).toMatchObject({ x: 960, z: 650, radius: 330, height: 44 });
    expect(LIGHTS.find((l) => l.tower === 'lighthouse')).toMatchObject({ x: 1400, z: -250, period: 10 });
    expect(WRECKS[0]).toMatchObject({ name: 'Margaret Ann', x: 41, z: 478 });
    expect(SHELTERS[0]).toMatchObject({ x: 665, z: 650, factor: 0.08 });
    expect(FOG_BANKS[0]).toMatchObject({ x: 380, z: 430, r: 260, visibility: 160 });
    expect(FISHING_GROUNDS.slice(0, 3).map((g) => g.name)).toEqual(['Calder Bank', 'Skerry Ground', 'The Hollows']);
    // Ground where it was: Calder Haven's dredged basin, the quay, the open sea.
    expect(groundHeight(665, 650)).toBeCloseTo(-4.5, 1);
    expect(groundHeight(0, 4000)).toBe(-40);
    expect(groundHeight(960, 650)).toBeGreaterThan(20);
    // The chart still covers the same sheet.
    expect(chartBounds()).toEqual({ x0: -1630, x1: 2170, z0: -1088, z1: 2340 });
  });
});
