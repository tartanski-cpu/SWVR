/**
 * The harbour tug (owner, Oct 2026: a larger harbour tug, from photographs and the particulars
 * of a 25 m azimuth stern drive tug; hull only for now). Our own lines of her size and type:
 * 25 m, very beamy, a round bilge, deep forward with her bottom rising aft to a shallow
 * transom for her drive pods. In the game her bilge is drawn as two chines and floated on one
 * that keeps each section's area (vessel/hullForm.ts bilgeChine), her bottom painted to her
 * waterline.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { DESIGNS } from '../../src/hulls/designs';
import { hydrostatics, loft } from '../../src/hulls/loft';
import { hullFormFromDesign } from '../../src/vessel/hullForm';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { submergedSection } from '../../src/vessel/physics/sectionClip';
import { buildVesselMesh } from '../../src/vessel/view/hullMesh';
import { VESSEL_DEFS, wettedSurfaceAtDWL, type VesselDef } from '../../src/vessel/vesselDef';

const design = DESIGNS.find((d) => d.id === 'harbourTug')!;
const study = hydrostatics(loft(design));
const form = hullFormFromDesign(design);

/** Her volume (m^3) and its centre's z, level at her DWL, from the game's stations. */
function immersed(): { vol: number; z: number } {
  let vol = 0;
  let mz = 0;
  for (const st of form.stations) {
    const o = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
    submergedSection(st.polygon, st.polygon.map(([, y]) => -y), o);
    vol += o.area * st.weight;
    mz += o.area * st.weight * st.z;
  }
  return { vol, z: mz / vol };
}

describe('the harbour tug (hull study)', () => {
  it('her size and type: 25 m, very beamy, 3.3 m draught, about 500 t', () => {
    expect(study.loa).toBeCloseTo(25, 6);
    // 10.5 m over her hull; 11.2 m over her fenders when they come.
    expect(study.beam).toBeCloseTo(10.5, 6);
    expect(study.loa / study.beam).toBeLessThan(2.5);
    expect(study.draught).toBeCloseTo(3.3, 6);
    expect(study.displacementT).toBeGreaterThan(450);
    expect(study.displacementT).toBeLessThan(540);
    // A tug's fullness: a full midship section (her round bilge), a fine enough entry and run.
    expect(study.cb).toBeGreaterThan(0.55);
    expect(study.cb).toBeLessThan(0.65);
    expect(study.cm).toBeGreaterThan(0.8);
    expect(study.cm).toBeLessThan(0.9);
  });

  it('stiff: KM over 5 m above her keel, a tug\'s GM with her weight 3.7 m up', () => {
    expect(study.km).toBeGreaterThan(5);
    expect(study.km - 3.7).toBeGreaterThan(1.5);
  });

  it('deep forward, her bottom rising aft to a shallow transom, her deck rising to a high bow', () => {
    const st = [...form.stations].sort((a, b) => b.z - a.z); // transom first
    const keel = (i: number) => st[i].polygon[2][1];
    const deck = (i: number) => st[i].polygon[0][1];
    const n = st.length;
    expect(keel(0)).toBeGreaterThan(-1); // her transom just under the water: room for her pods
    expect(Math.min(...st.map((_, i) => keel(i)))).toBeLessThan(-3.2);
    expect(keel(Math.round(0.7 * (n - 1)))).toBeLessThan(keel(Math.round(0.3 * (n - 1))));
    expect(deck(n - 1) - deck(Math.round(0.5 * (n - 1)))).toBeGreaterThan(1.2);
  });

  it('in the game: her bilge drawn as two chines, floated on one that keeps her lines\' volume and waterline', () => {
    for (const s of form.stations) {
      expect(s.polygon).toHaveLength(5);
      expect(s.bilge).toBeDefined();
      // Her physics chine on her side, at or outboard of the bilge's lower point.
      expect(s.polygon[3][0]).toBeGreaterThanOrEqual(s.bilge![0][0] - 1e-9);
    }
    const g = immersed();
    // (The game's stations are upright sections, the study's a little raked: within 3 %.)
    expect(Math.abs(g.vol - study.volume) / study.volume).toBeLessThan(0.03);
    // Her waterline breadth amidships as drawn.
    const mid = form.stations[Math.floor(form.stations.length / 2)];
    const o = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
    const half = (s: number) => submergedSection(mid.polygon, mid.polygon.map(([, y]) => s - y), o).area;
    const wlBreadth = (half(0.01) - half(-0.01)) / 0.02;
    expect(Math.abs(wlBreadth - study.beamWl) / study.beamWl).toBeLessThan(0.02);
  });

  it('floats level on her lines in the game', () => {
    const lc = VESSEL_DEFS.landingCraft;
    const g = immersed();
    const mass = CONFIG.ocean.density * g.vol;
    const def = { ...lc, id: 'tugTest', hull: form, mass, cg: [0, 0.5, g.z], designVolume: g.vol, wettedSurface: wettedSurfaceAtDWL(form), layout: { ...lc.layout, wheelhouse: undefined } } as VesselDef;
    const h = uprightHydrostatics(def);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.02);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.02);
    // (Her weight 0.5 m over her waterline, 3.8 m over her keel: a tug's GM, about 2 m.)
    expect(h.gmt).toBeGreaterThan(1.5);
  });

  it('drawn with her bottom painted to her waterline, her topsides above it', () => {
    const mesh = buildVesselMesh(form, { ...VESSEL_DEFS.landingCraft.layout, wheelhouse: undefined } as VesselDef['layout']);
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    const key = (k: number) => [col.getX(k), col.getY(k), col.getZ(k)].map((v) => v.toFixed(3)).join();
    let low = 0;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) < pos.getY(low)) low = k;
    const bottom = key(low);
    let top = -Infinity;
    for (let k = 0; k < pos.count; k++) if (key(k) === bottom) top = Math.max(top, pos.getY(k));
    expect(top).toBeLessThan(design.bootTop! + 1e-3);
    expect(top).toBeGreaterThan(design.bootTop! - 1e-3);
  });
});
