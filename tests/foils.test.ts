/**
 * Hydrofoils (vessel/physics/foils.ts; owner, Oct 2026: a small foiling electric ferry, the
 * hull study's `foilFerry`: 12 m, about 9 t, 25 kn foilborne). Her hull's catamaran physics
 * with her foils and their flight computer, pushed by a thrust at her motor pod (her drive
 * comes later): she runs on her hulls below take-off, climbs steadily onto her foils, flies
 * level at her ride height at 25 kn on about 110 kW, banks into a turn, rides the game's
 * usual sea without a foil breaking the surface, and lands level.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { DESIGNS } from '../src/hulls/designs';
import { prepareWaves, type WaveComponent } from '../src/ocean/waves';
import { catamaranHandling } from '../src/vessel/catamaran';
import { hullFormFromDesign } from '../src/vessel/hullForm';
import { foilTelemetry } from '../src/vessel/physics/foils';
import { submergedSection } from '../src/vessel/physics/sectionClip';
import { stepVessel } from '../src/vessel/physics/vesselPhysics';
import { VESSEL_DEFS, wettedSurfaceAtDWL, type VesselDef } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';

const KN = 0.5144;
const design = DESIGNS.find((d) => d.id === 'foilFerry')!;

/** Her vessel definition: floating on her lines, her CG over her LCB, a catamaran's handling, her foils. */
function ferryDef(): VesselDef {
  const f = hullFormFromDesign(design);
  let vol = 0;
  let mz = 0;
  for (const st of f.stations) {
    const a = submergedSection(st.polygon, st.polygon.map(([, y]) => -y), { area: 0, cx: 0, cy: 0, maxDepth: 0 }).area;
    vol += a * st.weight;
    mz += a * st.weight * st.z;
  }
  const lc = VESSEL_DEFS.landingCraft;
  const wet = f.stations.filter((s) => s.polygon.some(([, y]) => y < 0)).map((s) => s.z);
  const h = catamaranHandling(f, Math.max(...wet) - Math.min(...wet), f.params.keelY / 2);
  const mass = vol * CONFIG.ocean.density;
  const L = design.length;
  return {
    ...lc,
    id: 'foilTest',
    hull: f,
    mass,
    cg: [0, 0.6, mz / vol],
    inertia: [mass * (0.28 * L) ** 2, mass * (0.29 * L) ** 2, mass * h.rollGyradius ** 2],
    addedAngular: [lc.addedAngular[0], lc.addedAngular[1], h.addedRoll],
    designVolume: vol,
    wettedSurface: wettedSurfaceAtDWL(f),
    resistance: h.resistance,
    planing: undefined,
    foils: design.foils,
    layout: { ...lc.layout, wheelhouse: undefined },
  } as VesselDef;
}

interface Sample {
  t: number;
  kn: number;
  pitch: number;
  heel: number;
  yawRate: number;
  keelClear: number;
  depth: number[];
  flaps: number[];
  thrust: number;
}

/**
 * Run her `seconds`: `thrust(t, kn)` (N at her pod, forward; a negative: hold 25 kn) and a side
 * push at her stern `side(t)` (N, + to starboard: a steering stand-in), in `sea`.
 */
function run(seconds: number, thrust: (t: number, kn: number) => number, side: (t: number) => number = () => 0, sea: WaveComponent[] = []): Sample[] {
  const def = ferryDef();
  const s = createVesselState('v', 'landingCraft');
  const dt = 1 / 60;
  const q = new THREE.Quaternion();
  const keelY = Math.min(...def.hull.stations.map((st) => st.polygon[2][1]));
  let held = 6000;
  const out: Sample[] = [];
  for (let i = 0; i < seconds / dt; i++) {
    const t = i * dt;
    q.fromArray(s.orientation);
    const vF = new THREE.Vector3(...s.linearVelocity).applyQuaternion(q.clone().invert());
    const kn = -vF.z / KN;
    let T = thrust(t, kn);
    if (T < 0) {
      held += 300 * (25 - kn) * dt;
      T = Math.max(0, Math.min(16000, held + 2000 * (25 - kn)));
    }
    const at = new THREE.Vector3(0, -2.2, 5.6).applyQuaternion(q).add(new THREE.Vector3(...s.position));
    const ext = [
      { force: new THREE.Vector3(side(t), 0, -T).applyQuaternion(q), point: at },
    ] as unknown as Parameters<typeof stepVessel>[7];
    stepVessel(s, def, sea.length ? prepareWaves(sea, t) : [], dt, undefined, false, [], ext);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...s.orientation), 'YXZ');
    out.push({ t, kn, pitch: (e.x * 180) / Math.PI, heel: (e.z * 180) / Math.PI, yawRate: (s.angularVelocity[1] * 180) / Math.PI, keelClear: s.position[1] + keelY, depth: [...foilTelemetry.depth], flaps: [...foilTelemetry.flaps], thrust: T });
  }
  return out;
}

const after = (r: Sample[], t0: number, t1 = Infinity) => r.filter((x) => x.t >= t0 && x.t < t1);

describe('hydrofoils: the foiling ferry', () => {
  it('flies level at 25 kn at her ride depth, her hulls clear of the water, on about 110 kW', { timeout: 60000 }, () => {
    const r = run(60, (t) => (t < 12 ? 16000 : -1));
    const cruise = after(r, 40);
    for (const x of cruise) {
      expect(x.kn).toBeGreaterThan(24.5);
      expect(x.depth[0]).toBeGreaterThan(0.7);
      expect(x.depth[0]).toBeLessThan(0.9);
      expect(x.pitch).toBeGreaterThan(0);
      expect(x.pitch).toBeLessThan(2);
      expect(Math.abs(x.heel)).toBeLessThan(0.5);
      expect(x.keelClear).toBeGreaterThan(0.4);
    }
    // Her thrust's power at 25 kn, at the game's propulsive efficiency (0.55).
    const T = cruise.reduce((a, x) => a + x.thrust, 0) / cruise.length;
    const kw = (T * 25 * KN) / 0.55 / 1000;
    expect(kw).toBeGreaterThan(80);
    expect(kw).toBeLessThan(140);
  });

  it('below her take-off speed she runs on her hulls, her flaps level; given enough, she climbs onto her foils gently', { timeout: 60000 }, () => {
    const slow = after(run(40, () => 6000), 25);
    for (const x of slow) {
      expect(x.kn).toBeLessThan(12);
      expect(x.depth[0]).toBeGreaterThan(1.8);
      expect(Math.abs(x.flaps[0])).toBeLessThan(0.01);
    }
    const up = run(30, () => 13000);
    // Flying by 20 s, never leaping bow-high on the way.
    expect(after(up, 20).every((x) => x.depth[0] < 1.0 && x.keelClear > 0.3)).toBe(true);
    expect(Math.max(...up.map((x) => x.pitch))).toBeLessThan(5);
  });

  it('banks into a turn as a coordinated turn would, holding her height', { timeout: 60000 }, () => {
    // A push to port at her stern turns her to starboard. In these axes a turn to starboard is
    // a negative yaw rate (about y, up), and starboard down a negative heel (about z, aft).
    const r = run(60, (t) => (t < 12 ? 16000 : -1), (t) => (t > 30 ? -2500 : 0));
    const turning = after(r, 45);
    const yaw = turning.reduce((a, x) => a + x.yawRate, 0) / turning.length;
    const heel = turning.reduce((a, x) => a + x.heel, 0) / turning.length;
    expect(yaw).toBeLessThan(-1);
    // Leaning into the turn (starboard down), about her flight computer's bank: 0.7 of a
    // coordinated turn's atan(U r / g), about 2 deg here (her struts' side force, deep under
    // her, rolls her the other way: her roll gain holds her against it).
    const coordinated = (Math.atan((25 * KN * (Math.abs(yaw) * Math.PI) / 180) / CONFIG.ocean.gravity) * 180) / Math.PI;
    expect(heel).toBeLessThan(-0.5 * CONFIG.foils.control.bank * coordinated);
    expect(heel).toBeGreaterThan(-1.5 * CONFIG.foils.control.bank * coordinated);
    for (const x of turning) expect(Math.abs(x.depth[0] - 0.8)).toBeLessThan(0.1);
  });

  it('rides the game\'s usual sea on her foils, none breaking the surface', { timeout: 60000 }, () => {
    const r = after(run(70, (t) => (t < 12 ? 16000 : -1), undefined, CONFIG.ocean.waves.map((w) => ({ ...w }))), 30);
    for (const x of r) {
      expect(Math.min(...x.depth)).toBeGreaterThan(0.2);
      expect(Math.abs(x.heel)).toBeLessThan(12);
    }
  });

  it('lands level when her power comes off, settling onto her hulls', { timeout: 60000 }, () => {
    const r = run(70, (t) => (t < 12 ? 16000 : t < 40 ? -1 : 0));
    const landing = after(r, 40);
    for (const x of landing) expect(Math.abs(x.pitch)).toBeLessThan(4);
    const last = landing[landing.length - 1];
    expect(last.kn).toBeLessThan(10);
    expect(last.depth[0]).toBeGreaterThan(1.8);
  });
});

describe('a hull section\'s submerged centroid', () => {
  it('stays within the piece in the water, even a near-zero sliver (it threw a heeled catamaran in a steep sea)', () => {
    const poly: [number, number][] = [
      [-1, 1],
      [-1, -1],
      [1, -1],
      [1, 1],
    ];
    // Just touching the water at one corner: a sliver.
    const s = submergedSection(poly, [-2, 1e-5, -2, -2], { area: 0, cx: 0, cy: 0, maxDepth: 0 });
    expect(s.cx).toBeGreaterThanOrEqual(-1);
    expect(s.cx).toBeLessThanOrEqual(1);
    expect(s.cy).toBeGreaterThanOrEqual(-1);
    expect(s.cy).toBeLessThanOrEqual(1);
  });
});
