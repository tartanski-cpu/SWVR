/**
 * Harbour boats (the settlements brief, Part C; world/harbourBoats.ts, the coast pipeline's
 * boats stage): every Voyage map's moorings in water deep enough and clear of the piers;
 * the named berths kept free; a moored boat swung to the wind; a hull bumps off one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import { setRemotePackage, type CoastPackage, type ChunkedCoastTerrain, type WholeCoastTerrain } from '../src/world/coastRegion';
import { clearCoastTerrains, coastHeight, registerChunkedCoast, registerCoastTerrain } from '../src/world/coastTerrain';
import { CoastStreamer } from '../src/world/coastStream';
import type { BerthDef, BlockDef, RegionDef } from '../src/world/defs';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { BLOCKS } from '../src/world/archipelago';
import { boatBoxContact, buildHarbourBoats, clearHarbourBoats, harbourBoatPose, useHarbourBoats, type HarbourBoat } from '../src/world/harbourBoats';
import { groundHeight } from '../src/world/terrain';
import { mapRegion, VOYAGE_MAPS } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buf = (p: string) => {
  const b = readFileSync(join(root, 'public', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const blockDist = (k: BlockDef, x: number, z: number) => {
  const a = (k.yawDeg * Math.PI) / 180;
  const dx = x - k.x;
  const dz = z - k.z;
  const l = dx * Math.sin(a) - dz * Math.cos(a);
  const w = dx * Math.cos(a) + dz * Math.sin(a);
  return Math.hypot(Math.max(0, Math.abs(l) - k.halfLength), Math.max(0, Math.abs(w) - k.halfWidth));
};

describe('harbour boats on the Voyage maps', () => {
  for (const m of VOYAGE_MAPS) {
    it(`${m.id}: moorings in water, clear of the piers and the start berth`, async () => {
      clearCoastTerrains();
      if (m.remote) setRemotePackage(JSON.parse(readFileSync(join(root, 'public', 'regions', m.id, 'package.json'), 'utf8')) as CoastPackage);
      const r = mapRegion(m);
      expect(r.harbourBoats, 'the map has harbour boats').toBeTruthy();
      const spots = r.harbourBoats!.spots;
      expect(spots.length).toBeGreaterThan(3);
      const c = r.coast!;
      const t = c.pkg.terrain;
      const streamer = new CoastStreamer('/', () => t.dir, async (url) => buf(url.replace(/^\//, '')));
      if (t.chunked) registerChunkedCoast(r.id, buf(t.dir + (t as ChunkedCoastTerrain).coarse.file), t as ChunkedCoastTerrain, c.pkg.box, c.x, c.z);
      else registerCoastTerrain(r.id, buf(t.dir + (t as WholeCoastTerrain).file), t as WholeCoastTerrain, c.pkg.box, c.x, c.z);
      const start = r.berths.find((b) => b.id === m.startBerth)!;
      const bad: string[] = [];
      // The game's own ground (the detailed mesh, streamed in for a big map): under water there.
      if (t.chunked) await streamer.preload(spots.map((s) => ({ x: s.x, z: s.z })));
      for (const s of spots) {
        const g = coastHeight(s.x, s.z) ?? -40;
        if (g > -1) bad.push(`${s.harbour} at ${s.x},${s.z}: ground ${g.toFixed(1)} m`);
        else if (r.blocks.some((k) => blockDist(k, s.x, s.z) < 25)) bad.push(`${s.harbour} at ${s.x},${s.z}: by a pier`);
        else if (Math.hypot(s.x - start.x, s.z - start.z) < 50) bad.push(`${s.harbour}: by the start berth`);
      }
      // (The pipeline's grid is 10 m: a stray one at a shallow edge is tolerated, not more.)
      expect(bad.length, bad.join('\n')).toBeLessThanOrEqual(Math.ceil(spots.length * 0.02));
    }, 120000);
  }
});

describe('harbour boats: the rules', () => {
  const region = {
    id: 't',
    bounds: { x0: -1000, x1: 1000, z0: -1000, z1: 1000 },
    harbourBoats: {
      style: { alongside: [['creel', 1]], moored: [['yacht', 1]], anchored: [['yacht', 1]], hulls: [0x123456], moorings: 1 },
      spots: [{ x: 100, z: 100, depth: 6, harbour: 'h', kind: 'mooring' }],
    },
  } as unknown as RegionDef;
  const berth = (id: string, x: number, deckY = 0.5): BerthDef => ({ id, portId: 'p', name: id, x, z: 0, headingDeg: 90, shoreX: 0, shoreZ: 1, shoreDist: 2.5, deckY });

  it('fills a share of the berths, none by a named berth', () => {
    const berths = Array.from({ length: 200 }, (_, i) => berth(`b${i}`, i * 12 - 1200 + 6));
    const named = [berth('cargo', 6)];
    const boats = buildHarbourBoats([region], berths, named).filter((b) => b.how === 'alongside');
    const inRegion = berths.filter((b) => b.x >= -1000 && b.x < 1000).length;
    expect(boats.length / inRegion).toBeGreaterThan(CONFIG.harbourBoats.pontoonShare - 0.15);
    expect(boats.length / inRegion).toBeLessThan(CONFIG.harbourBoats.pontoonShare + 0.15);
    expect(boats.some((b) => Math.abs(b.x - 6) < CONFIG.harbourBoats.namedClear)).toBe(false);
    // The same boats every time.
    expect(buildHarbourBoats([region], berths, named).flatMap((b) => (b.berthId ? [b.berthId] : []))).toEqual(boats.map((b) => b.berthId));
  });

  it('a moored boat lies downwind of her buoy, bow to the wind', () => {
    const b = buildHarbourBoats([region], [], []).find((x) => x.how === 'moored') as HarbourBoat;
    const pose = { x: 0, z: 0, heading: 0 };
    // A westerly (from 270 deg), strong: her bow points west, her middle east of the buoy.
    harbourBoatPose(b, 270, 10, pose);
    const head = ((pose.heading * 180) / Math.PI + 360) % 360;
    expect(Math.abs(head - 270)).toBeLessThan(1);
    expect(pose.x).toBeGreaterThan(b.x + b.r * 0.9);
    expect(Math.hypot(pose.x - b.x, pose.z - b.z)).toBeCloseTo(b.r, 5);
    // The wind backs to the south: she swings round.
    harbourBoatPose(b, 180, 10, pose);
    expect(pose.z).toBeLessThan(b.z - b.r * 0.9);
  });

  it("a hull's point inside a boat is pushed out through her nearer side", () => {
    const k = CONFIG.harbourBoats.kinds.yacht;
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    // Lying north-south, bow north, at the origin: a point 0.5 m in from her starboard (east) side, amidships.
    const pose = { x: 0, z: 0, heading: 0 };
    expect(boatBoxContact('yacht', pose, k.beam / 2 - 0.5, 0.5, 0, hit)).toBe(true);
    expect(hit.depth).toBeCloseTo(0.5, 5);
    expect(hit.nx).toBeCloseTo(1, 5);
    expect(hit.fendered).toBe(true);
    // Clear of her: beyond her side, above her deck, under her keel, past her stem.
    expect(boatBoxContact('yacht', pose, k.beam / 2 + 0.1, 0.5, 0, hit)).toBe(false);
    expect(boatBoxContact('yacht', pose, 0, k.freeboard + 0.1, 0, hit)).toBe(false);
    expect(boatBoxContact('yacht', pose, 0, -k.draught - 0.1, 0, hit)).toBe(false);
    expect(boatBoxContact('yacht', pose, 0, 0.5, -k.length / 2 - 0.1, hit)).toBe(false);
    // Near her stem she is narrow: a point a beam's third out is clear there, not amidships.
    expect(boatBoxContact('yacht', pose, k.beam / 3, 0.5, -k.length * 0.45, hit)).toBe(false);
    expect(boatBoxContact('yacht', pose, k.beam / 3, 0.5, 0, hit)).toBe(true);
  });

  it('a vessel driven at a moored boat stops against her, not through her', () => {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    // Open water, deep, well clear of any pier (searched outward from the start).
    let at: [number, number] | null = null;
    for (let r = 200; r < 6000 && !at; r += 100)
      for (let a = 0; a < 16 && !at; a++) {
        const x = v.position[0] + Math.sin((a / 16) * Math.PI * 2) * r;
        const z = v.position[2] - Math.cos((a / 16) * Math.PI * 2) * r;
        const clear = [-60, 0, 60].every((d) => groundHeight(x + d, z) < -10) && BLOCKS.every((b) => Math.hypot(b.x - x, b.z - z) > 200);
        if (clear) at = [x, z];
      }
    expect(at).not.toBeNull();
    const [x, z] = at!;
    // A yacht on a mooring 30 m east of her, lying north-south in a calm (no weather here).
    const yacht: HarbourBoat = { index: 0, kind: 'yacht', how: 'alongside', colour: 0xffffff, x: x + 30, z, heading: 0, r: 0, calm: 0, seed: 0 };
    useHarbourBoats([yacht]);
    v.mooring.phase = 'free';
    v.position[0] = x;
    v.position[2] = z;
    let touched = false;
    for (let i = 0; i < 40 * 60; i++) {
      // Pushed east at 2 m/s until she meets the yacht.
      if (!touched) v.linearVelocity[0] = 2;
      stepWorld(world, [], 1 / 60);
      if (v.contact.force > 0) touched = true;
    }
    clearHarbourBoats();
    expect(touched).toBe(true);
    // She's still on her own side: her middle west of the yacht's side by at least her own half-beam or so.
    expect(v.position[0]).toBeLessThan(yacht.x - CONFIG.harbourBoats.kinds.yacht.beam / 2);
  }, 60000);
});

describe('at anchor (owner)', () => {
  it('she swings about where her chain lies, 15-20 m ahead of her bow, keeping that spot as the wind goes round', () => {
    const region = {
      id: 'a',
      bounds: { x0: -1000, x1: 1000, z0: -1000, z1: 1000 },
      harbourBoats: {
        style: { alongside: [['creel', 1]], moored: [['yacht', 1]], anchored: [['yacht', 1]], hulls: [0x123456], moorings: 1 },
        // A shallow anchorage and a deep one.
        spots: [{ x: 100, z: 100, depth: 3, harbour: 'h', kind: 'anchorage' }, { x: 400, z: 100, depth: 12, harbour: 'h', kind: 'anchorage' }],
      },
    } as unknown as RegionDef;
    const both = buildHarbourBoats([region], [], []).filter((x) => x.how === 'anchored');
    expect(both.length).toBe(2);
    const L = CONFIG.harbourBoats.kinds[both[0].kind].length;
    // Shallow: the least; deep: the most (not 36 m, the chain's scope).
    expect(both.map((x) => x.r - L / 2)).toEqual(CONFIG.harbourBoats.anchorPivot);
    const b = both[1];
    const ahead = b.r - L / 2;
    expect(ahead).toBeGreaterThanOrEqual(CONFIG.harbourBoats.anchorPivot[0]);
    expect(ahead).toBeLessThanOrEqual(CONFIG.harbourBoats.anchorPivot[1]);
    const pose = { x: 0, z: 0, heading: 0 };
    for (const from of [0, 90, 200, 300]) {
      harbourBoatPose(b, from, 10, pose);
      // Her bow points at the pivot, half her length plus that much from her middle.
      const bowX = pose.x + Math.sin(pose.heading) * (L / 2 + ahead);
      const bowZ = pose.z - Math.cos(pose.heading) * (L / 2 + ahead);
      expect(Math.hypot(bowX - b.x, bowZ - b.z)).toBeLessThan(1e-6);
    }
  });
});
