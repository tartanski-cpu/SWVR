// The Engine step's machinery (owner, Oct 2026): the engine type she has, singly or twin,
// with its shafts, propellers at her design's diameter, and rudders. Shipyard only.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { ENGINES } from '../../src/shipyard/build';
import { buildEngine, buildMachinery, ENGINE_LOOKS } from '../../src/shipyard/enginePreview';
import { bottomAt, CLEAR, FLANGE_SHARE, layShaft } from '../../src/shipyard/machinery';

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
// A box-section hull, flat bottom at -1 m, 3 m beam, 2 m deep: the floor 1 m over the bottom.
const station = (z: number) => ({ z, weight: 1, halfBeamChine: 1.5, halfBeamDeck: 1.5, polygon: [[-1.5, 1], [-1.5, -1], [0, -1], [1.5, -1], [1.5, 1]] as [number, number][] });
// Her bottom rises aft over the last 5 m, from -1 to -0.5 at the transom (as hulls do).
const rising = (z: number) => {
  const k = z > 0 ? -1 + 0.1 * z : -1;
  return { ...station(z), polygon: [[-1.5, 1], [-1.5, k], [0, k], [1.5, k], [1.5, 1]] as [number, number][] };
};
const form = { stations: [-5, 0, 5].map(rising) };
const ceiling = () => 0; // the floor 1 m over her bottom
const lay = (engine: number, x = 0, propX = 0) => layShaft(form, ENGINES[engine].size, x, { x: propX, z: 3.5, d: 0.9 }, ceiling, 10);
const base = { form, twinX: 1.1, propD: 0.9, propZ: 3.5, rudderZ: 3.9 };
describe('engine previews', () => {
  it('has a look for every engine, the 750 kW the biggest and the tug diesel next', () => {
    expect(ENGINE_LOOKS).toHaveLength(ENGINES.length);
    const lengths = ENGINES.map((_, i) => buildEngine(i).length);
    expect(Math.max(...lengths)).toBe(lengths[4]);
    expect(Math.max(...lengths.slice(0, 4))).toBe(lengths[3]);
    // The gearbox's output flange is the engine's origin: the engine is all forward of it.
    expect(new THREE.Box3().setFromObject(buildEngine(1).group).max.z).toBeLessThan(0.05);
  });

  it('draws one or two of everything, the propeller at her diameter', () => {
    const props = (g: THREE.Object3D) => g.children.filter((c) => c.name === 'propeller');
    const single = buildMachinery({ ...base, shaft: lay(0), engine: 0, twin: false });
    const twin = buildMachinery({ ...base, shaft: lay(2, 0.9, 1.1), engine: 2, twin: true });
    expect(props(single)).toHaveLength(1);
    expect(props(twin)).toHaveLength(2);
    expect(props(twin).map((p) => p.position.x)).toEqual([-1.1, 1.1]);
    const d = size(props(single)[0]);
    expect(Math.max(d.x, d.y)).toBeGreaterThan(0.8);
    expect(Math.max(d.x, d.y)).toBeLessThanOrEqual(0.92);
  });

  it('a Kort nozzle round each propeller, clear of its blade tips, the rudder aft of its outlet', () => {
    const g = buildMachinery({ ...base, shaft: lay(2, 0.9, 1.1), engine: 2, twin: true, nozzle: true });
    const nozzles: THREE.Object3D[] = [];
    g.traverse((o) => o.name === 'nozzle' && nozzles.push(o));
    expect(nozzles).toHaveLength(2);
    const k = CONFIG.nozzle.look;
    g.updateMatrixWorld(true);
    for (const [i, n] of nozzles.entries()) {
      const b = new THREE.Box3().setFromObject(n);
      const across = b.getSize(new THREE.Vector3()).x;
      // Wider than the propeller by its tip gap and its section; about lengthD × D long.
      expect(across).toBeGreaterThan(0.9 * (1 + 2 * k.tipGap));
      expect(across).toBeLessThan(0.9 * 1.6);
      expect(b.getCenter(new THREE.Vector3()).x).toBeCloseTo(i ? 1.1 : -1.1, 1);
      const rudder = new THREE.Box3().setFromObject(g.children.filter((c) => c.name === 'rudder')[i]);
      expect(rudder.min.z).toBeGreaterThan(b.max.z - 0.02);
    }
    // None without it.
    const open: THREE.Object3D[] = [];
    buildMachinery({ ...base, shaft: lay(0), engine: 0, twin: false }).traverse((o) => o.name === 'nozzle' && open.push(o));
    expect(open).toHaveLength(0);
  });
});

describe('the machinery in her hull', () => {
  it('lays the shaft at its angle from a propeller under her bottom, the engine on it clear of her bottom', () => {
    const sh = lay(1);
    // The propeller's tip under her bottom (-0.65 m there).
    expect(sh.propY + 0.45).toBeLessThan(-0.65);
    // The shaft rises forward at 10°.
    expect((sh.flangeY - sh.propY) / (3.5 - sh.flangeZ)).toBeCloseTo(Math.tan((10 * Math.PI) / 180), 3);
    // The engine's underside at its flange is at least CLEAR over her bottom.
    expect(sh.flangeY - FLANGE_SHARE * ENGINES[1].size[2]).toBeGreaterThanOrEqual(-1 + CLEAR - 0.01);
    const g = buildMachinery({ ...base, shaft: sh, engine: 1, twin: false });
    const engineBox = new THREE.Box3().setFromObject(g.children[0]);
    expect(engineBox.min.y).toBeGreaterThan(-1 + CLEAR - 0.02);
    const rudder = new THREE.Box3().setFromObject(g.children.find((c) => c.name === 'rudder')!);
    expect(rudder.max.y).toBeCloseTo(bottomAt(form, 0, 3.9), 2);
  });

  it('says so when the engine is too tall for her: the tug diesel in a shallow hull', () => {
    const sh = lay(3);
    expect(sh.fits).toBe(false);
    expect(sh.shortM).toBeGreaterThan(0.2);
    // Tilted to its shaft its forward end stands higher: the small six fits under a floor 1.4 m up.
    expect(layShaft(form, ENGINES[0].size, 0, { x: 0, z: 3.5, d: 0.9 }, () => 0.4, 10).fits).toBe(true);
    // Twin engines set out over a V bottom sit higher than one on the keel.
    const vee = { stations: [-5, 5].map((z) => ({ ...station(z), polygon: [[-1.5, 1], [-1.5, -0.6], [0, -1], [1.5, -0.6], [1.5, 1]] as [number, number][] })) };
    const v = (x: number) => layShaft(vee, ENGINES[1].size, x, { x, z: 3.5, d: 0.5 }, ceiling, 10);
    expect(v(0.7).flangeY).toBeGreaterThan(v(0).flangeY);
    expect(bottomAt(vee, 0.75, 0)).toBeCloseTo(-0.8);
  });
});
