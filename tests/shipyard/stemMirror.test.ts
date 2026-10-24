/**
 * Her hull drawn the same both sides (owner, Oct 2026: a plumb stem looked raked from
 * starboard, and head on a face was missing): each panel's triangles mirror the other side's,
 * and a stem head with a little width is closed across.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { VESSEL_DEFS, wetOutlet } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';

afterAll(() => useDesign(DEFAULT_DESIGN));

const pilot = DESIGN_HULLS.findIndex((h) => /pilot/i.test(h.name));

/** Her hull's panels between stations (each triangle's corners on two neighbouring stations), as text, x mirrored by `m`. */
function panels(bow: number) {
  useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[pilot].defaults, hull: pilot, bow } as ShipDesign);
  const def = VESSEL_DEFS.design;
  const pos = buildVesselMeshParts(def.hull, def.layout, wetOutlet(def), def.livery).hull.geometry.attributes.position;
  const zs = def.hull.stations.map((s) => s.z);
  const station = (z: number) => zs.findIndex((s) => Math.abs(s - z) < 1e-4);
  const side = { port: new Set<string>(), stbd: new Set<string>() };
  let stemHead = 0;
  const e = def.hull.stations[zs.length - 1];
  for (let i = 0; i < pos.count; i += 3) {
    const v = [0, 1, 2].map((j) => [pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)]);
    const at = v.map(([, , z]) => station(z));
    // A triangle in the stem's own plane reaching her deck's edge there: the stem head's plate.
    if (at.every((k) => k === zs.length - 1) && v.some(([x, y]) => Math.abs(Math.abs(x) - e.halfBeamDeck) < 1e-3 && y > e.polygon[0][1] - 1e-3)) stemHead++;
    if (at.some((k) => k < 0) || Math.max(...at) - Math.min(...at) !== 1) continue;
    // (Her deck, across both sides, and zero-area slivers, which draw nothing: left out.)
    if (v.some(([x]) => x < -1e-6) && v.some(([x]) => x > 1e-6)) continue;
    const [p, q, r] = v;
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    if (Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) < 1e-8) continue;
    const sx = v.reduce((a, [x]) => a + x, 0);
    if (Math.abs(sx) < 1e-6) continue;
    const key = v.map(([x, y, z]) => [Math.abs(x), y, z].map((n) => n.toFixed(3)).join(',')).sort().join(' ');
    side[sx < 0 ? 'port' : 'stbd'].add(key);
  }
  return { ...side, stemHead, stemWidth: e.halfBeamDeck };
}

describe('her hull drawn the same both sides', () => {
  for (const bow of [0, 2, 4])
    it(`the pilot boat, bow ${bow}: starboard's panels mirror port's; her stem head closed`, () => {
      const p = panels(bow);
      expect(p.port.size).toBeGreaterThan(100);
      expect([...p.stbd].filter((k) => !p.port.has(k))).toEqual([]);
      expect([...p.port].filter((k) => !p.stbd.has(k))).toEqual([]);
      if (p.stemWidth > 1e-4) expect(p.stemHead).toBeGreaterThan(0);
    });
});
