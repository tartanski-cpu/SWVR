/**
 * The bollards stand where the mooring lines tie (owner, Oct 2026: on the start quay they
 * didn't): each berth's two tie points, on the hand-built quays and on a coast map's.
 */
import { describe, expect, it, vi } from 'vitest';
import { BERTHS, BLOCKS } from '../src/world/archipelago';
import { BOLLARD_HALF_SPACING, berthBollards, faceBollards, type BlockFace } from '../src/world/berths';
import type { BlockDef } from '../src/world/defs';

/** The faces of a block as the world view walks them. */
function faces(b: BlockDef): BlockFace[] {
  const L = b.halfLength;
  const W = b.halfWidth;
  return [
    { nx: 1, nz: 0, half: L, offset: W, alongX: false },
    { nx: -1, nz: 0, half: L, offset: W, alongX: false },
    { nx: 0, nz: 1, half: W, offset: L, alongX: true },
    { nx: 0, nz: -1, half: W, offset: L, alongX: true },
  ];
}

describe('bollards at the lines\' tie points', () => {
  it('Calder Haven quay: a bollard at each tie point of the cargo and fuel berths, none on the landward faces', () => {
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    const quay = BLOCKS.find((b) => b.kind === 'quay' && Math.abs(b.x - berth.x) < 30 && Math.abs(b.z - berth.z) < 40)!;
    const west = faces(quay).find((f) => f.nx === -1)!; // the face she lies along (her shore is +x)
    const at = faceBollards(quay, west);
    for (const k of [-1, 1]) expect(at.some((s) => Math.abs(quay.z + s - (berth.z + k * BOLLARD_HALF_SPACING)) < 0.05)).toBe(true);
    const fuel = BERTHS.find((b) => b.id === 'calder-fuel')!;
    for (const k of [-1, 1]) expect(at.some((s) => Math.abs(quay.z + s - (fuel.z + k * BOLLARD_HALF_SPACING)) < 0.05)).toBe(true);
    // The east face (land behind) has no berth: the old 12 m grid stays for its look.
    const east = faceBollards(quay, faces(quay).find((f) => f.nx === 1)!);
    expect(east[0]).toBe(-quay.halfLength + 3);
  });

  it('Calder Haven quay: bollards on along the face past a 24 m boat\'s ends, 12 m apart at most', () => {
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    const h = (berth.headingDeg * Math.PI) / 180;
    const along = berthBollards(berth)
      .map((p) => (p.x - berth.x) * Math.sin(h) - (p.z - berth.z) * Math.cos(h))
      .sort((a, b) => a - b);
    expect(along.some((s) => s > 13)).toBe(true);
    expect(along.some((s) => s < -13)).toBe(true);
    for (let i = 1; i < along.length; i++) expect(along[i] - along[i - 1]).toBeLessThanOrEqual(12.01);
  });

  it('a pier with no named berth keeps its generated berths\' bollards: 12 m apart from 3 m in', () => {
    const pier = BLOCKS.find((b) => b.kind === 'pier' && b.halfLength > 30)!;
    for (const f of faces(pier).filter((f) => !f.alongX)) {
      const at = faceBollards(pier, f);
      if (at.length < 2) continue;
      expect(at[1] - at[0]).toBeCloseTo(12, 5);
    }
  });

  it('a coast map (Oban): the start berth\'s tie points have bollards, 16 m berths or not', async () => {
    vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
    vi.resetModules();
    const a = await import('../src/world/archipelago');
    const w = await import('../src/world/berths');
    const berth = a.BERTHS.find((b) => b.id === 'oban-cargo')!;
    let found = 0;
    for (const b of a.BLOCKS) {
      for (const f of faces(b)) {
        const at = w.faceBollards(b, f);
        const yaw = (b.yawDeg * Math.PI) / 180;
        for (const s of at) {
          const lx = f.alongX ? s : f.nx * (f.offset - 0.5);
          const lz = f.alongX ? f.nz * (f.offset - 0.5) : s;
          const x = b.x + lx * Math.cos(yaw) - lz * Math.sin(yaw);
          const z = b.z + lx * Math.sin(yaw) + lz * Math.cos(yaw);
          // Her tie points: 6 m along her heading either way from her centre, half a metre in from the face.
          const h = (berth.headingDeg * Math.PI) / 180;
          for (const k of [-1, 1]) {
            const tx = berth.x + Math.sin(h) * k * 6 + berth.shoreX * (berth.shoreDist + 0.5);
            const tz = berth.z - Math.cos(h) * k * 6 + berth.shoreZ * (berth.shoreDist + 0.5);
            if (Math.hypot(x - tx, z - tz) < 0.6) found++;
          }
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });
});
