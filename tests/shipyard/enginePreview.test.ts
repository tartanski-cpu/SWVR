// The Engine step's machinery (owner, Oct 2026): the engine type she has, singly or twin,
// with its shafts, propellers at her design's diameter, and rudders. Shipyard only.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENGINES } from '../../src/shipyard/build';
import { buildEngine, buildMachinery, ENGINE_LOOKS } from '../../src/shipyard/enginePreview';

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
const base = { bed: [0, 0.2, -1] as const, twinX: 1.1, propD: 0.9, prop: [0, -0.8, 3.5] as const, rudder: [0, -0.75, 3.9] as const };

describe('engine previews', () => {
  it('has a look for every engine, the tug diesel the biggest', () => {
    expect(ENGINE_LOOKS).toHaveLength(ENGINES.length);
    const lengths = ENGINES.map((_, i) => buildEngine(i).length);
    expect(Math.max(...lengths)).toBe(lengths[3]);
    // The gearbox's output flange is the engine's origin: the engine is all forward of it.
    expect(new THREE.Box3().setFromObject(buildEngine(1).group).max.z).toBeLessThan(0.05);
  });

  it('draws one or two of everything, the propeller at her diameter', () => {
    const props = (g: THREE.Object3D) => g.children.filter((c) => c.name === 'propeller');
    const single = buildMachinery({ ...base, engine: 0, twin: false });
    const twin = buildMachinery({ ...base, engine: 2, twin: true });
    expect(props(single)).toHaveLength(1);
    expect(props(twin)).toHaveLength(2);
    expect(props(twin).map((p) => p.position.x)).toEqual([-1.1, 1.1]);
    const d = size(props(single)[0]);
    expect(Math.max(d.x, d.y)).toBeGreaterThan(0.8);
    expect(Math.max(d.x, d.y)).toBeLessThanOrEqual(0.92);
  });
});
