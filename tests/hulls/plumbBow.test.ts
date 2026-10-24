/**
 * The Shipyard's bows, as the game draws them (owner, Oct 2026: "the straight bow rake or
 * the plumb bow doesn't resolve the geometry correctly in some of the hull forms ... missing
 * facets", and "the plumb bow should be straight down, and then a nice radius at the bottom";
 * on the pilot boat, the gillnetter, the trawler and the catamaran, not the tug).
 * - No face of her sides or bottom turned in (a face drawn the wrong way round can't be seen
 *   from outside: a hole). The pilot boat's plumb bow and the gillnetter's first rake had one.
 * - A plumb stem straight down from her stem head, rounded into her keel by a forefoot radius
 *   (CONFIG.shipyard.bow), with stations round it so it reads as a curve.
 * - The line between her bottom paint and her topsides straight on to her stem (owner: "like
 *   the pilot boat"), though her chine sweeps up her stem with her forefoot (Station.paintY).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS, bowKeel } from '../../src/shipyard/parts/catalog';
import { hullFormFromDesign, type HullForm } from '../../src/vessel/hullForm';
import { buildVesselMesh } from '../../src/vessel/view/hullMesh';
import { VESSEL_DEFS, type VesselDef } from '../../src/vessel/vesselDef';
import type { HullDesign } from '../../src/hulls/loft';

// The hull types with the bow choice: the gillnetter, the pilot boat, the trawler, the catamaran.
const BOWED = [1, 3, 5, 6];
const designOf = (hull: number, bow: number, k = [1, 1, 1], sheer = 0): HullDesign => (DESIGN_HULLS[hull].form(k[0], k[1], k[2], bow, sheer) as { design: HullDesign }).design;

/** Her side and bottom faces (not her deck, bulwarks or end plates) that face in, toward her centreline (a demihull's). */
function facingIn(form: HullForm): number {
  const mesh = buildVesselMesh(form, { ...VESSEL_DEFS.landingCraft.layout, wheelhouse: undefined } as VesselDef['layout']);
  const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position');
  const st = form.stations;
  const deckAt = (z: number) => {
    for (let j = 0; j < st.length - 1; j++)
      if ((st[j].z - z) * (st[j + 1].z - z) <= 0) {
        const u = (z - st[j].z) / (st[j + 1].z - st[j].z || 1);
        return st[j].polygon[0][1] + u * (st[j + 1].polygon[0][1] - st[j].polygon[0][1]);
      }
    // (Past her ends: her deck at that end.)
    return (Math.abs(z - st[0].z) < Math.abs(z - st[st.length - 1].z) ? st[0] : st[st.length - 1]).polygon[0][1];
  };
  const ends = [st[0].z, st[st.length - 1].z];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let n = 0;
  for (let k = 0; k < pos.count; k += 3) {
    a.fromBufferAttribute(pos, k);
    b.fromBufferAttribute(pos, k + 1);
    c.fromBufferAttribute(pos, k + 2);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const cen = a.clone().add(b).add(c).divideScalar(3);
    // Her side or bottom: its corners on her stations, below her deck edge, leaning out
    // sideways, not in an end plate (fittings and bulwarks are drawn on their own).
    if (![a, b, c].every((v) => st.some((s) => Math.abs(s.z - v.z) < 1e-5))) continue;
    if (cen.y > deckAt(cen.z) - 0.005 || Math.abs(nrm.x) < 0.1) continue;
    if (ends.some((z) => Math.abs(a.z - z) < 1e-6 && Math.abs(b.z - z) < 1e-6 && Math.abs(c.z - z) < 1e-6)) continue;
    const off = form.catamaran ? cen.x - (Math.sign(cen.x) * form.catamaran.spacing) / 2 : cen.x;
    if (Math.abs(off) > 0.02 && nrm.x * off < 0) n++;
  }
  return n;
}

describe('the Shipyard\'s bows as the game draws them', () => {
  it('no face of her sides or bottom turned in: every bow, every size, with more sheer or none', { timeout: 120000 }, () => {
    for (const hull of BOWED)
      for (let bow = 0; bow < 5; bow++)
        for (const k of [[0.8, 0.8, 1.175], [1, 1, 1], [1.175, 1.175, 0.8], [1, 0.8, 1.175]])
          for (const sheer of [0, 1.2]) expect(facingIn(hullFormFromDesign(designOf(hull, bow, k, sheer))), `hull ${hull} bow ${bow} ${k} sheer ${sheer}`).toBe(0);
  });

  it('a plumb stem: straight down from her stem head, then a forefoot radius into her keel, with stations round it', () => {
    const c = CONFIG.shipyard.bow;
    for (const hull of BOWED) {
      const d = designOf(hull, 0);
      const form = hullFormFromDesign(d);
      const st = [...form.stations].sort((p, q) => p.z - q.z); // stem first
      const keel = (s: (typeof st)[number]) => Math.min(...s.polygon.map(([, y]) => y));
      const stem = st[0];
      // Her keel line under the stem: carried forward from the first two stations aft of the
      // radius (its stem's height, R = forefootRadius x rise, solved for: line + R + 0.15 + ... = deck).
      // (Her stem head from her deck as drawn: a whaleback's raise isn't in her stem.)
      const head = d.sheer[d.sheer.length - 1][1] - 0.15;
      const Rguess = c.forefootRadius * (head - keel(st[8]));
      const aft = st.filter((s) => s.z - stem.z > Rguess * 1.3);
      const [p, q] = [aft[0], aft[1]];
      const line = keel(p) + ((keel(p) - keel(q)) * (stem.z - p.z)) / (p.z - q.z);
      const rise = head - line;
      const R = c.forefootRadius * rise;
      // The stem itself is upright: it stands from the radius's top (R over her keel) up to her deck.
      expect(keel(stem) - line, `hull ${hull}`).toBeCloseTo(R, 1);
      // Round the radius: stations within it, the keel falling to her keel line, each step less steep.
      const inR = st.filter((s) => s.z - stem.z > 1e-6 && s.z - stem.z < R * 1.01);
      expect(inR.length, `hull ${hull}`).toBeGreaterThanOrEqual(c.radiusStations);
      const pts = [stem, ...inR].map((s) => [s.z - stem.z, keel(s) - line]);
      for (let i = 1; i < pts.length; i++) expect(pts[i][1], `hull ${hull}`).toBeLessThan(pts[i - 1][1]);
      for (let i = 2; i < pts.length; i++) {
        const s0 = (pts[i - 1][1] - pts[i - 2][1]) / (pts[i - 1][0] - pts[i - 2][0]);
        const s1 = (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0]);
        expect(s1, `hull ${hull}`).toBeGreaterThan(s0);
      }
      // A few stations more, not many: she stays cheap on the Quest.
      expect(form.stations.length - 25 - (d.forecastle ? 2 : 0), `hull ${hull}`).toBeLessThanOrEqual(c.radiusStations + 1);
    }
  });

  it('the first rake a straight stem too, rounded into the keel; more rake, the full curved stem as before', () => {
    const keel: [number, number][] = [
      [0, -1],
      [1, -1],
    ];
    // A 2 m stem on a 10 m keel line.
    const at = (deg: number, d: number) => {
      const k = bowKeel(keel, 1.15, 10, deg);
      const t = 1 - d / 10;
      const i = k.keel.findIndex(([u]) => u >= t - 1e-9);
      const [t0, y0] = k.keel[i - 1] ?? k.keel[i];
      const [t1, y1] = k.keel[i];
      return t1 === t0 ? y1 : y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
    };
    // 12.5 deg: straight from the stem head (0.15 m under the deck), raked 12.5 deg, then rounded.
    const tan = Math.tan((12.5 * Math.PI) / 180);
    expect(at(12.5, 0)).toBeCloseTo(1, 6);
    expect(at(12.5, 0.4 * tan)).toBeCloseTo(0.6, 2);
    expect(bowKeel(keel, 1.15, 10, 12.5).stations.length).toBeGreaterThan(0);
    // 25 deg and more: the curved stem, no extra stations.
    expect(bowKeel(keel, 1.15, 10, 25).stations).toEqual([]);
  });

  it('her bottom paint stops at a line run on straight to her stem, not dragged up it by her chine', () => {
    const colourAt = (g: THREE.BufferGeometry, k: number) => {
      const c = g.getAttribute('color');
      return [c.getX(k), c.getY(k), c.getZ(k)].map((v) => v.toFixed(3)).join();
    };
    for (const hull of [1, 5, 6])
      for (const bow of [0, 1, 2]) {
        const form = hullFormFromDesign(designOf(hull, bow));
        const g = buildVesselMesh(form, { ...VESSEL_DEFS.landingCraft.layout, wheelhouse: undefined } as VesselDef['layout']).geometry as THREE.BufferGeometry;
        const pos = g.getAttribute('position');
        const st = [...form.stations].sort((p, q) => p.z - q.z); // stem first
        const L = st[st.length - 1].z - st[0].z;
        // Her bottom's colour: the lowest vertex amidships.
        let low = -1;
        for (let k = 0; k < pos.count; k++) if (Math.abs(pos.getZ(k) - (st[0].z + L / 2)) < L / 8 && (low < 0 || pos.getY(k) < pos.getY(low))) low = k;
        const bottom = colourAt(g, low);
        // Her chine (the paint line, where it isn't dragged up) a tenth of her length aft of her
        // stem, aft of her forefoot.
        const ref = st.reduce((a, b) => (Math.abs(b.z - st[0].z - 0.1 * L) < Math.abs(a.z - st[0].z - 0.1 * L) ? b : a));
        const chineY = ref.polygon[1][1];
        // Forward of it the paint line rises gently on, as her chine had (about 2 % of her length
        // in that tenth): nothing of her bottom's colour much above her chine there.
        let top = -Infinity;
        for (let k = 0; k < pos.count; k++) if (pos.getZ(k) < ref.z && colourAt(g, k) === bottom) top = Math.max(top, pos.getY(k));
        expect(top - chineY, `hull ${hull} bow ${bow}`).toBeLessThan(0.02 * L);
      }
  });
});
