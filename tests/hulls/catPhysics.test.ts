/**
 * Two hulls in the game's physics (owner, Oct 2026: the fast catamaran workboat). A hull-study
 * catamaran becomes the game's stations: each one ten-point section across both demihulls and
 * the bridge deck, the tunnel a notch (vessel/hullForm.ts Station.demihull). She floats on her
 * lines, her stability is the hull study's, she's far stiffer in roll than a monohull, her wet
 * deck adds buoyancy only once it's driven under, and she's drawn with her tunnel open.
 * (Monohulls are unchanged: the golden runs hold to a millionth.)
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { DESIGNS } from '../../src/hulls/designs';
import { hydrostatics, loft } from '../../src/hulls/loft';
import { hullFormFromDesign, type HullForm } from '../../src/vessel/hullForm';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { submergedSection, type SubmergedSection } from '../../src/vessel/physics/sectionClip';
import { stepVessel } from '../../src/vessel/physics/vesselPhysics';
import { buildVesselMesh } from '../../src/vessel/view/hullMesh';
import { VESSEL_DEFS, wettedSurfaceAtDWL, type VesselDef } from '../../src/vessel/vesselDef';
import { createVesselState } from '../../src/vessel/vesselState';

const design = DESIGNS.find((d) => d.id === 'workCat')!;
const form = hullFormFromDesign(design);
const rho = CONFIG.ocean.density;

/** Her volume and its centre (z, y) at a waterline `s` m over her DWL, level. */
function immersed(f: HullForm, s = 0): { vol: number; z: number; y: number } {
  const out: SubmergedSection = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
  let vol = 0;
  let mz = 0;
  let my = 0;
  for (const st of f.stations) {
    submergedSection(st.polygon, st.polygon.map(([, y]) => s - y), out);
    vol += out.area * st.weight;
    mz += out.area * st.weight * st.z;
    my += out.area * st.weight * out.cy;
  }
  return { vol, z: mz / vol, y: my / vol };
}

/** A vessel definition for her: floating on her lines, her CG over her LCB at 60 % of her depth, the landing craft's handling. */
function catDef(): VesselDef {
  const lc = VESSEL_DEFS.landingCraft;
  const b = immersed(form);
  const mass = rho * b.vol;
  const keel = form.params.keelY;
  const depth = Math.max(...form.stations.map((s) => s.polygon[0][1])) - keel;
  const beam = form.params.beamDeck;
  const L = form.params.length;
  return {
    ...lc,
    id: 'catTest',
    hull: form,
    mass,
    cg: [0, keel + 0.6 * depth, b.z],
    inertia: [mass * (0.28 * L) ** 2, mass * (0.29 * L) ** 2, mass * (0.37 * beam) ** 2],
    designVolume: b.vol,
    wettedSurface: wettedSurfaceAtDWL(form),
    layout: { ...lc.layout, wheelhouse: undefined },
  } as VesselDef;
}

describe('two hulls in the game: the fast catamaran workboat', () => {
  it('her stations: ten points, both demihulls and the tunnel between, her deck the full width', () => {
    expect(form.catamaran).toEqual(design.catamaran);
    for (const st of form.stations) {
      expect(st.polygon).toHaveLength(10);
      expect(st.demihull?.offset).toBeCloseTo(design.catamaran!.spacing / 2, 9);
      // Symmetric, the deck edges first and last, the wet deck's corners at the tunnel's height.
      for (let k = 0; k < 5; k++) expect(st.polygon[9 - k][0]).toBeCloseTo(-st.polygon[k][0], 9);
      expect(st.polygon[0][0]).toBeCloseTo(-st.halfBeamDeck, 9);
      expect(st.polygon[4][1]).toBeLessThanOrEqual(design.catamaran!.tunnel + 1e-9);
    }
    expect(form.params.beamDeck).toBeGreaterThan(5.4);
  });

  it('her volume and stability as the hull study works them out', () => {
    const study = hydrostatics(loft(design));
    const def = catDef();
    const h = uprightHydrostatics(def);
    expect(def.mass / 1000).toBeCloseTo(study.displacementT, 0);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.01);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.01);
    // KM: each hull's waterplane about her centreline (not one strip across the tunnel).
    expect(Math.abs(h.kmt - study.km) / study.km).toBeLessThan(0.03); // both above her keel
    expect(h.gmt).toBeGreaterThan(5);
    expect(h.awp).toBeLessThan(0.5 * form.params.beamDeck * form.params.length);
  });

  it('her wet deck adds buoyancy only when it\'s driven under', () => {
    const mid = form.stations[Math.floor(form.stations.length / 2)];
    const area = (s: number) => submergedSection(mid.polygon, mid.polygon.map(([, y]) => s - y), { area: 0, cx: 0, cy: 0, maxDepth: 0 }).area;
    const t = design.catamaran!.tunnel;
    // Below the wet deck, a little more depth adds only the two hulls' waterline width...
    const hulls = (area(t - 0.05) - area(t - 0.15)) / 0.1;
    // ...above it, the full width.
    const deck = (area(t + 0.15) - area(t + 0.05)) / 0.1;
    expect(hulls).toBeLessThan(0.75 * form.params.beamDeck);
    expect(deck).toBeGreaterThan(0.95 * 2 * mid.halfBeamDeck - 0.3);
  });

  it('afloat in the game: settles on her lines, and rolls back far quicker than a monohull', { timeout: 60000 }, () => {
    const period = (def: VesselDef, defId: string) => {
      const s = createVesselState('v', defId);
      // Heeled 5 deg, let go in calm water.
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (5 * Math.PI) / 180);
      s.orientation = [q.x, q.y, q.z, q.w];
      const dt = 1 / 120;
      const roll: number[] = [];
      for (let i = 0; i < 12 / dt; i++) {
        stepVessel(s, def, [], dt, undefined, false);
        const o = new THREE.Quaternion(...s.orientation);
        roll.push(new THREE.Euler().setFromQuaternion(o, 'YXZ').z);
      }
      const ups: number[] = [];
      for (let i = 1; i < roll.length; i++) if (roll[i - 1] < 0 && roll[i] >= 0) ups.push(i * dt);
      return { period: ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : Infinity, y: s.position[1] };
    };
    const cat = period(catDef(), 'landingCraft');
    const mono = period(VESSEL_DEFS.landingCraft, 'landingCraft');
    expect(Math.abs(cat.y)).toBeLessThan(0.03); // on her lines
    expect(cat.period).toBeLessThan(2.5);
    expect(cat.period).toBeLessThan(0.75 * mono.period);
  });

  it('drawn: both hulls, the bridge deck, and the tunnel open between them at her transom', () => {
    const mesh = buildVesselMesh(form, { ...VESSEL_DEFS.landingCraft.layout, wheelhouse: undefined } as VesselDef['layout']);
    const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(pos.count).toBeGreaterThan(300);
    // No face across the tunnel's mouth at the transom: nothing at her transom's z between the
    // demihulls' inner sides, below the wet deck.
    const st0 = form.stations[0];
    const inner = Math.abs(st0.polygon[3][0]);
    const wet = st0.polygon[4][1];
    let blocked = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const c = new THREE.Vector3();
      for (let j = 0; j < 3; j++) c.add(new THREE.Vector3(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)));
      c.divideScalar(3);
      if (Math.abs(c.z - st0.z) < 1e-3 && Math.abs(c.x) < inner - 0.05 && c.y < wet - 0.05) blocked++;
    }
    expect(blocked).toBe(0);
  });
});
