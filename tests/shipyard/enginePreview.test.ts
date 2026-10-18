// The Engine step's machinery (owner, Oct 2026): the engine type she has, singly or twin,
// with its shafts, propellers at her design's diameter, and rudders. Shipyard only.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENGINES } from '../../src/shipyard/build';
import { buildEngine, buildMachinery, ENGINE_LOOKS } from '../../src/shipyard/enginePreview';
import { bottomAt, CLEAR, fitEngine } from '../../src/shipyard/machinery';

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
// A box-section hull, flat bottom at -1 m, 3 m beam, 2 m deep: the floor 1 m over the bottom.
const station = (z: number) => ({ z, weight: 1, halfBeamChine: 1.5, halfBeamDeck: 1.5, polygon: [[-1.5, 1], [-1.5, -1], [0, -1], [1.5, -1], [1.5, 1]] as [number, number][] });
const form = { stations: [-5, 0, 5].map(station) };
const base = { form, bed: [0, -0.35, -1] as const, floorY: 0, twinX: 1.1, propD: 0.9, prop: [0, -0.8, 3.5] as const, rudder: [0, -0.75, 3.9] as const };

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
    const single = buildMachinery({ ...base, engine: 0, twin: false }).group;
    const twin = buildMachinery({ ...base, engine: 2, twin: true }).group;
    expect(props(single)).toHaveLength(1);
    expect(props(twin)).toHaveLength(2);
    expect(props(twin).map((p) => p.position.x)).toEqual([-1.1, 1.1]);
    const d = size(props(single)[0]);
    expect(Math.max(d.x, d.y)).toBeGreaterThan(0.8);
    expect(Math.max(d.x, d.y)).toBeLessThanOrEqual(0.92);
  });
});

describe('the machinery in her hull', () => {
  it('sits the engine on her bottom, drawn at its size, and hangs the propeller and rudder under her', () => {
    const { group, fit } = buildMachinery({ ...base, floorY: 0.1, engine: 1, twin: false });
    expect(fit.bottomY).toBeCloseTo(-1 + CLEAR);
    expect(fit.fits).toBe(true); // 0.8 m tall on 0.2 m of bearers, under a floor 1.1 m up
    const engineBox = new THREE.Box3().setFromObject(group.children[0]);
    expect(engineBox.min.y).toBeCloseTo(fit.bottomY, 2);
    expect(engineBox.max.y - engineBox.min.y).toBeCloseTo(ENGINES[1].size[2], 2);
    const prop = group.children.find((c) => c.name === 'propeller')!;
    expect(prop.position.y + 0.45).toBeLessThan(-1); // its tip under her bottom
    const rudder = new THREE.Box3().setFromObject(group.children.find((c) => c.name === 'rudder')!);
    expect(rudder.max.y).toBeCloseTo(-1, 2);
  });

  it("says so when the engine is too tall for her: the tug diesel in a shallow hull", () => {
    const fit = fitEngine(form, ENGINES[3].size, 0, -1, 0);
    expect(fit.fits).toBe(false);
    expect(fit.shortM).toBeCloseTo(-1 + CLEAR + ENGINES[3].size[2] + 0.03, 2);
    // Twin engines set out from a V bottom sit higher than one on the keel.
    const vee = { stations: [-5, 5].map((z) => ({ ...station(z), polygon: [[-1.5, 1], [-1.5, -0.6], [0, -1], [1.5, -0.6], [1.5, 1]] as [number, number][] })) };
    expect(fitEngine(vee, ENGINES[1].size, 0.7, 0, 0).bottomY).toBeGreaterThan(fitEngine(vee, ENGINES[1].size, 0, 0, 0).bottomY);
    expect(bottomAt(vee, 0.75, 0)).toBeCloseTo(-0.8);
  });
});
