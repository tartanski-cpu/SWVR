/**
 * The coast pipeline's harbour stage (tools/coast/src/harbours.ts; milestone 3): the Oban
 * region's harbours.json. Checks the kit pieces are the game's kinds and sit in the box,
 * every berth lies alongside a piece at its deck height with water under it in the mesh
 * (the dredged basins), the three spine roles are each played once, the hand edit (the town
 * harbour named Oban) survived, and the buildings stand near the harbours.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coastHeight, registerCoastTerrain } from '../src/world/coastTerrain';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', 'oban');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const H = JSON.parse(readFileSync(join(dir, 'harbours.json'), 'utf8'));
const inBox = (x: number, z: number) => x >= region.box.x0 && x <= region.box.x1 && z >= region.box.z0 && z <= region.box.z1;

// The terrain, to read the depth at a berth (the ground under a point, from the mesh's faces).
const bin = readFileSync(join(dir, 'terrain.bin'));
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
const t = region.terrain;
// The game's own lookup (coastTerrain.ts), the region at its own origin.
registerCoastTerrain('oban-test', ab, { ...t, chunks: region.chunks }, region.box, 0, 0);
function groundAt(x: number, z: number): number {
  return coastHeight(x, z) ?? -60;
}

describe('the Oban harbours (pipeline milestone 3)', () => {
  it('region.json points at harbours.json', () => {
    expect(region.harbours).toBe('harbours.json');
  });

  it('the kit is the game pieces, in the box, at sensible deck heights', () => {
    expect(H.blocks.length).toBeGreaterThan(30);
    for (const b of H.blocks) {
      expect(['quay', 'pier', 'pontoon', 'breakwater']).toContain(b.kind);
      expect(inBox(b.x, b.z)).toBe(true);
      expect(b.halfLength).toBeGreaterThan(0);
      expect(b.halfWidth).toBeGreaterThan(0);
      expect(b.top).toBeGreaterThan(b.kind === 'pontoon' ? 0.2 : 1.5);
      expect(b.top).toBeLessThan(5);
    }
    const kinds = new Set(H.blocks.map((b: { kind: string }) => b.kind));
    for (const k of ['quay', 'pier', 'pontoon']) expect(kinds.has(k)).toBe(true);
    expect(H.slipways.length).toBeGreaterThan(0);
  });

  it('every berth lies alongside its piece, at its deck height', () => {
    const bySource = new Map<string, { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; top: number }[]>();
    for (const b of H.blocks) bySource.set(b.source, [...(bySource.get(b.source) ?? []), b]);
    for (const berth of H.berths) {
      const pieces = bySource.get(berth.source)!;
      expect(pieces).toBeTruthy();
      // Its mooring point (the face) is on one of its source's pieces.
      const fx = berth.x + berth.shoreX * berth.shoreDist;
      const fz = berth.z + berth.shoreZ * berth.shoreDist;
      const near = pieces.some((p) => {
        const a = (p.yawDeg * Math.PI) / 180;
        const dx = fx - p.x;
        const dz = fz - p.z;
        return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) <= p.halfLength + 0.5 && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= p.halfWidth + 0.5 && p.top === berth.deckY;
      });
      expect(near).toBe(true);
    }
  });

  it("the town's quay and pier berths have working depth under them in the mesh (the dredged basin)", () => {
    const oban = H.harbours.find((h: { id: string }) => h.id === 'oban');
    const kind = new Map(H.blocks.map((b: { source: string; kind: string }) => [b.source, b.kind]));
    const fixed = H.berths.filter((b: { x: number; z: number; source: string }) => kind.get(b.source) !== 'pontoon' && Math.hypot(b.x - oban.x, b.z - oban.z) < 400);
    expect(fixed.length).toBeGreaterThan(5);
    let deep = 0;
    for (const b of fixed) if (groundAt(b.x, b.z) < -1.8) deep++;
    expect(deep / fixed.length).toBeGreaterThan(0.8);
  });

  it('the spine roles are each played once; the hand edit named the town harbour Oban', () => {
    for (const role of ['harbour.sheltered', 'pier.exposed', 'anchorage']) expect(H.harbours.filter((h: { role?: string }) => h.role === role)).toHaveLength(1);
    const oban = H.harbours.find((h: { name: string }) => h.name === 'Oban');
    expect(oban.id).toBe('oban');
    expect(oban.berths).toBeGreaterThanOrEqual(20);
    expect(H.harbours.some((h: { name: string }) => h.name === 'North Pier Pontoons')).toBe(false);
    const anchorage = H.harbours.find((h: { role?: string }) => h.role === 'anchorage');
    expect(groundAt(anchorage.x, anchorage.z)).toBeLessThan(-3);
  });

  it('buildings stand near the harbours, at believable sizes', () => {
    expect(H.buildings.length).toBeGreaterThan(200);
    const pieces = [...H.blocks, ...H.slipways];
    for (const b of H.buildings) {
      expect(pieces.some((p: { x: number; z: number }) => Math.hypot(p.x - b.x, p.z - b.z) < 420)).toBe(true);
      expect(b.height).toBeGreaterThanOrEqual(2);
      expect(b.height).toBeLessThanOrEqual(30);
      expect(b.base).toBeGreaterThan(0);
    }
  });
});
