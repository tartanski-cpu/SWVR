/**
 * The Port of Hamburg (owner, Oct 2026: "I'd like a Hamburg harbour map"): a river port for
 * Voyage mode only, in chunks (tools/coast/requests/hamburg.yaml), the first with the
 * Hanseatic theme and the first with no coastline in the map data: its water is the Elbe's,
 * the canals' and the docks' outlines (reconcile.ts `inlandWater`), held to a dredged depth.
 * Checks the files, the start at the Landungsbrücken, the water where the river is and the
 * land where the city is, the harbour ferry lines each once over water, and the
 * Köhlbrandbrücke standing high over the Köhlbrand. And its landmarks (owner: "Add landmarks
 * first"), modelled from the map's own 3D building parts: the Elbphilharmonie with its wave
 * crown, the main churches' spires, the Rathaus, the Landungsbrücken; the Köhlbrandbrücke
 * cable-stayed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { coastGeoOf, coastLatLon, coastWorld } from '../src/world/coastGeo';
import { mapRegion, voyageMap } from '../src/world/maps';
import { fleets } from '../src/traffic/ferries';
import { ferryGeometry } from '../src/traffic/ferryKit';
import * as THREE from 'three';
import { bridgeParts, floatingDockParts, gravingDockParts, landmarkModelParts, museumShipParts, structuresGeometry } from '../src/world/coastStructures';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'hamburg');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as CoastPackage & Record<string, unknown>;
const terrain = pkg.terrain as ChunkedCoastTerrain;
const buf = (f: string) => {
  const b = readFileSync(join(dir, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const S: CoastSample = { h: 0, r: 0, g: 0, b: 0, fine: false };
const h = (x: number, z: number) => (coastSample(x, z, S), S.h);

beforeAll(() => {
  setRemotePackage(pkg);
  registerChunkedCoast('hamburg', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('Hamburg: the pipeline files', () => {
  it('is the requested box, full scale, chunked, every chunk within the budget; the Hanseatic theme', () => {
    expect(region.bbox).toEqual([9.82, 53.49, 10.03, 53.56]);
    expect((pkg.box.x1 - pkg.box.x0) / 1000).toBeCloseTo(13.9, 0);
    expect((pkg.box.z1 - pkg.box.z0) / 1000).toBeCloseTo(7.8, 0);
    expect(terrain.chunked).toBe(true);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(pkg.skylineStyle).toBe('hanseatic');
    expect(pkg.credits).toMatch(/OpenStreetMap/);
  });

  it('its latitude and longitude: the Landungsbrücken read where they are (about 53.545 N, 9.97 E)', () => {
    const r = mapRegion(voyageMap('hamburg')!);
    const b = r.berths.find((x) => x.id === 'landungsbrucken-cargo')!;
    const ll = coastLatLon(coastGeoOf(r)!, b.x, b.z);
    expect(ll.lat).toBeCloseTo(53.545, 2);
    expect(ll.lon).toBeCloseTo(9.97, 1);
  });
});

describe('Hamburg: a river port from the map\'s water outlines', () => {
  const geo = () => coastGeoOf(mapRegion(voyageMap('hamburg')!))!;
  const at = (lat: number, lon: number) => {
    const p = coastWorld(geo(), lat, lon);
    return h(p.x, p.z);
  };

  it('the Elbe is water, dredged no deeper than 15 m; the city is land', () => {
    // The Norderelbe off the Landungsbrücken, and the river off Övelgönne.
    expect(at(53.5435, 9.968)).toBeLessThan(-5);
    expect(at(53.5435, 9.968)).toBeGreaterThanOrEqual(-15.5);
    expect(at(53.5425, 9.92)).toBeLessThan(-5);
    // St. Pauli (above the Landungsbrücken) and Wilhelmsburg are land.
    expect(at(53.552, 9.965)).toBeGreaterThan(0);
    expect(at(53.505, 10.0)).toBeGreaterThan(0);
  });
});

describe('Hamburg in Voyage', () => {
  it('starts at the Landungsbrücken, its berth in water deep enough; the harbour\'s quays and piers are ports', () => {
    const m = voyageMap('hamburg')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toBe('Landungsbrücken');
    expect(h(b.x, b.z)).toBeLessThan(-3);
    const names = r.ports.map((p) => p.name);
    for (const n of ['Finkenwerder', 'Blohm + Voss', 'Maritimes Museum', 'Burchardkai', 'Teufelsbrücker Hafen']) expect(names).toContain(n);
    expect(r.ports.length).toBeLessThan(100);
  });

  it('the harbour ferry lines, each once, every one over water; a line known by its number reads "Line 62"', () => {
    const ferries = pkg.ferries as { name: string; path: [number, number][] }[];
    expect(ferries.length).toBeGreaterThan(8);
    expect(ferries.length).toBeLessThan(20);
    expect(new Set(ferries.map((f) => f.name)).size).toBe(ferries.length);
    expect(ferries.map((f) => f.name)).toContain('Line 62');
    for (const f of ferries) {
      const mid = f.path[Math.floor(f.path.length / 2)];
      expect(h(mid[0], mid[1]), f.name).toBeLessThan(0);
    }
  });

  it('the Köhlbrandbrücke stands 55 m up, every piece of it, and crosses the Köhlbrand (the map gives no height; the request does)', () => {
    const k = (pkg.bridges as { name: string; deck: number; path: [number, number][] }[]).filter((b) => b.name === 'Köhlbrandbrücke');
    expect(k.length).toBeGreaterThan(0);
    for (const b of k) expect(b.deck).toBe(55);
    expect(k.some((b) => b.path.some(([x, z]) => h(x, z) < -8))).toBe(true);
  });
});

describe('Hamburg: its landmarks, from the map\'s own 3D building parts', () => {
  const bounds = (parts: THREE.BufferGeometry[]) => {
    let [y1, tris] = [-Infinity, 0];
    for (const p of parts) {
      p.computeBoundingBox();
      y1 = Math.max(y1, p.boundingBox!.max.y);
      tris += p.attributes.position.count / 3;
    }
    return { y1, tris };
  };
  const models = () => mapRegion(voyageMap('hamburg')!).landmarkModels!;

  it('all ten, each at its mapped height over its ground: the Michel 132 m, St. Nikolai 147 m, the Elbphilharmonie 110 m', () => {
    const ms = models();
    expect(ms.map((m) => m.name).sort()).toEqual(['Dockland', 'Elbphilharmonie', 'Old Elbe Tunnel', 'Rathaus', 'St. Jacobi', 'St. Katharinen', 'St. Michaelis', 'St. Nikolai', 'St. Pauli Landungsbrücken', 'St. Petri'].sort());
    const tall = (n: string) => {
      const m = ms.find((x) => x.name === n)!;
      return bounds(landmarkModelParts(m)).y1 - m.base;
    };
    expect(tall('St. Michaelis')).toBeCloseTo(132, 0);
    expect(tall('St. Nikolai')).toBeCloseTo(147, 0);
    expect(tall('St. Petri')).toBeCloseTo(132, 0);
    expect(tall('Rathaus')).toBeCloseTo(112, 0);
    expect(tall('Elbphilharmonie')).toBeCloseTo(110, 0);
  });

  it('the Elbphilharmonie: crowned in waves, its top dipping 22 m between crests; standing on flattened ground, not in its own mound in the height data', () => {
    const m = models().find((x) => x.name === 'Elbphilharmonie')!;
    expect(m.crown).toBe('wave');
    const ys = landmarkModelParts(m).flatMap((g) => Array.from(g.attributes.position.array).filter((_, i) => i % 3 === 1));
    const top = Math.max(...ys);
    expect(ys.some((y) => y < top - 20 && y > top - 23)).toBe(true);
    // The ground in the middle of its footprint: down near the quay's, not 25-30 m up.
    expect(h(m.x, m.z)).toBeLessThan(12);
  });

  it('every wall faces out (drawn one-sided): per part, no level face points into it', () => {
    for (const m of models())
      for (const part of m.parts) {
        const [cx, cz] = [part.outline.reduce((t, q) => t + q[0], 0) / part.outline.length, part.outline.reduce((t, q) => t + q[1], 0) / part.outline.length];
        // Only simple footprints (four corners, so convex enough to judge from the middle).
        if (part.outline.length > 5) continue;
        for (const g of landmarkModelParts({ ...m, crown: undefined, parts: [part] })) {
          const a = g.attributes.position.array;
          const n = g.attributes.normal.array;
          for (let t = 0; t < a.length; t += 9) {
            if (Math.abs(n[t + 1]) > 0.3) continue;
            const [fx, fz] = [(a[t] + a[t + 3] + a[t + 6]) / 3 - cx, (a[t + 2] + a[t + 5] + a[t + 8]) / 3 - cz];
            expect(n[t] * fx + n[t + 2] * fz, m.name).toBeGreaterThanOrEqual(-1e-6);
          }
        }
      }
  });

  it('the skyline\'s own church towers there are not drawn twice (still on the chart); all of it within the Quest\'s budget, one merged mesh', () => {
    const r = mapRegion(voyageMap('hamburg')!);
    expect(r.skyline!.filter((s) => s.modelled).length).toBeGreaterThan(2);
    const all = models().reduce((t, m) => t + bounds(landmarkModelParts(m)).tris, 0);
    expect(all).toBeLessThan(8000);
    expect(structuresGeometry(r.bridges ?? [], r.follies ?? [], (x, z) => h(x, z), r.gantries ?? [], r.yardShips ?? [], { landmarks: r.landmarkModels, museumShips: r.museumShips, floatingDocks: r.floatingDocks, gravingDocks: r.gravingDocks })).not.toBeNull();
  });

  it('the Köhlbrandbrücke cable-stayed: its span over the Köhlbrand carries pylons 135 m high, with their stays', () => {
    const r = mapRegion(voyageMap('hamburg')!);
    const main = r.bridges!.filter((b) => b.name === 'Köhlbrandbrücke' && b.pylons);
    expect(main).toHaveLength(1);
    expect(main[0].pylons).toBe(135);
    const b = bounds(bridgeParts(main[0], (x, z) => h(x, z)));
    expect(b.y1).toBeGreaterThan(134);
    expect(b.tris).toBeLessThan(3000);
  });
});

describe('Hamburg: the Dockland, the museum ships and the yards\' docks (owner)', () => {
  const r = () => mapRegion(voyageMap('hamburg')!);
  const tris = (parts: THREE.BufferGeometry[]) => parts.reduce((t, p) => t + p.attributes.position.count / 3, 0);
  const top = (parts: THREE.BufferGeometry[]) => Math.max(...parts.map((p) => (p.computeBoundingBox(), p.boundingBox!.max.y)));

  it('the Dockland leans 40 m out to the west at its top, over the Elbe', () => {
    const m = r().landmarkModels!.find((x) => x.name === 'Dockland')!;
    expect(m.lean).toBe(40);
    const pos = landmarkModelParts(m).flatMap((g) => Array.from({ length: g.attributes.position.count }, (_, i) => [g.attributes.position.getX(i), g.attributes.position.getY(i)]));
    const ys = pos.map((p) => p[1]);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    const westAt = (y: number) => Math.min(...pos.filter((p) => Math.abs(p[1] - y) < 0.5).map((p) => p[0]));
    // Its west end is further west at the roof than on the ground.
    expect(westAt(lo) - westAt(hi)).toBeGreaterThan(30);
  });

  it('the Cap San Diego, Rickmer Rickmers and Peking at their berths, to the map\'s hull outlines, afloat; no shed drawn over them', () => {
    const ships = r().museumShips!;
    const by = (n: string) => ships.find((x) => x.name === n)!;
    expect(by('Cap San Diego').length).toBeGreaterThan(150);
    expect(by('Cap San Diego').design).toBe('cargo');
    expect(by('Rickmer Rickmers').masts).toBe(3);
    expect(by('Peking').masts).toBe(4);
    for (const sh of ships) {
      expect(h(sh.x, sh.z), sh.name).toBeLessThan(-3);
      const parts = museumShipParts(sh);
      expect(tris(parts)).toBeLessThan(2500);
      // A barque's masts tower over her; the cargo liner's funnel over her decks.
      expect(top(parts)).toBeGreaterThan(sh.design === 'barque' ? 40 : 20);
      const a = (sh.yawDeg * Math.PI) / 180;
      const onHer = (pkg.buildings as { x: number; z: number }[]).filter((b) => Math.abs((b.x - sh.x) * Math.sin(a) - (b.z - sh.z) * Math.cos(a)) < sh.length / 2 && Math.abs((b.x - sh.x) * Math.cos(a) + (b.z - sh.z) * Math.sin(a)) < sh.beam / 2);
      expect(onHer, sh.name).toEqual([]);
    }
  });

  it('Blohm + Voss\'s floating docks (Dock 11 the biggest, 319 m) with their wing walls and cranes; Dock Elbe 17 with its gate onto the river', () => {
    const docks = r().floatingDocks!;
    expect(docks.length).toBeGreaterThanOrEqual(5);
    const d11 = docks.find((d) => d.name === 'Dock 11')!;
    expect(d11.length).toBeGreaterThan(300);
    for (const d of docks) expect(tris(floatingDockParts(d))).toBeLessThan(200);
    const g = r().gravingDocks!.find((x) => x.name === 'Dock Elbe 17')!;
    expect(g.length).toBeGreaterThan(340);
    // Its gate end opens onto deep water.
    const a = (g.yawDeg * Math.PI) / 180;
    const beyond = (sign: number) => h(g.x + Math.sin(a) * sign * (g.length / 2 + 30), g.z - Math.cos(a) * sign * (g.length / 2 + 30));
    expect(beyond(g.gate)).toBeLessThan(0);
    expect(beyond(-g.gate)).toBeGreaterThan(0);
    expect(top(gravingDockParts(g))).toBeGreaterThan(40);
  });
});

describe('Hamburg: big ships in and out, and the harbour ferries of its own kind (owner)', () => {
  const routes = () => mapRegion(voyageMap('hamburg')!).ferries!;

  it('container ships from the sea to Burchardkai, Predöhlkai and Altenwerder, their way all in water to the end alongside', () => {
    const ships = routes().filter((r) => r.cls === 'container');
    expect(ships.map((r) => r.ends[1].name).sort()).toEqual(['Ballinkai', 'Burchardkai', 'Predöhlkai']);
    for (const r of ships) {
      expect(r.ends[0].dock).toBe(false);
      expect(r.ends[1].dock).toBe(true);
      // Sampled every 50 m from inside the box's faded edge to the end of her berth: water.
      // (The pipeline found her way in its 10 m grid, 8 m deep; the game's overview grid,
      // which this reads, is coarser and draws no detail in deep water.)
      let s = 500;
      for (let i = 1; i < r.path.length; i++) {
        const [a, b] = [r.path[i - 1], r.path[i]];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (; s < seg; s += 50) expect(h(a[0] + ((b[0] - a[0]) * s) / seg, a[1] + ((b[1] - a[1]) * s) / seg), r.name).toBeLessThan(-1);
        s -= seg;
      }
    }
  });

  it('a fleet is one class: no harbour ferry sails a container ship\'s route', () => {
    for (const g of fleets(routes())) expect(new Set(g.routes.map((r) => r.cls)).size).toBe(1);
  });

  it('the harbour ferry lines are the harbour ferry design; each design within budget', () => {
    const rs = routes();
    expect(rs.filter((r) => r.cls === 'harbour').length).toBeGreaterThan(8);
    expect(rs.find((r) => r.name === 'Line 62')!.cls).toBe('harbour');
    expect(new Set(rs.filter((r) => r.cls === 'harbour').map((r) => r.livery))).toEqual(new Set(['harbour-yellow', 'harbour-red']));
    for (const [cls, livery] of [['harbour', 'harbour-yellow'], ['container', 'cargo-blue']] as const) expect(ferryGeometry(cls, livery).attributes.position.count / 3).toBeLessThan(4000);
  });
});
