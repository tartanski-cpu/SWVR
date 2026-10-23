/**
 * A boat's effects leave nothing behind when she goes (owner, Oct 2026: changing boat left
 * her mooring lines on the quay, "a kind of spider web of docking lines"): the wake and
 * spray, and her smoke, anchor chain and mooring lines, which live in the world.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { VesselEffects } from '../src/vessel/view/vesselEffects';

// The effects draw small textures on a canvas: a stand-in page whose 2D context takes any call.
beforeAll(() => {
  const anything: unknown = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : anything), apply: () => anything, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => anything, style: {} }) });
});

describe("a boat's effects", () => {
  it('are all taken out of the world when she goes, the mooring lines too', () => {
    const world = new THREE.Group();
    const root = new THREE.Group();
    const before = world.children.length;
    const fx = new VesselEffects(VESSEL_DEFS.pilotBoat, root, world, {});
    // Wake, spray, smoke, chain and mooring lines: the pilot boat has them all.
    expect(world.children.length - before).toBe(5);
    fx.dispose();
    expect(world.children.length).toBe(before);
  });
});
