import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Tiller } from '../src/controls/Tiller';
import type { Pointer } from '../src/controls/Control';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

function setup() {
  const t = new Tiller('s', VESSEL_DEFS.skiff.outboard!);
  t.root.updateMatrixWorld(true);
  const sent: Record<string, number> = {};
  t.bind({ emit: (ch, v) => (sent[ch] = v), haptic: () => {} });
  // Hand on the grip: straight forward of the pivot.
  const grip = t.grabPoint(new THREE.Vector3());
  const p: Pointer = { position: grip.clone(), trigger: 0 };
  return { t, sent, p, grip };
}

describe('outboard tiller (VR)', () => {
  it('the trigger of the hand on it is the throttle; easing off idles', () => {
    const { t, sent, p } = setup();
    t.grabStart(p);
    p.trigger = 1;
    for (let i = 0; i < 60; i++) t.grabMove(p);
    expect(sent['s:lever']).toBe(1);
    p.trigger = 0.5;
    for (let i = 0; i < 60; i++) t.grabMove(p);
    expect(sent['s:lever']).toBeCloseTo(0.5, 1);
    p.trigger = 0;
    t.grabMove(p);
    expect(sent['s:lever']).toBe(0);
  });

  it('letting go of the tiller closes the throttle', () => {
    const { t, sent, p } = setup();
    t.grabStart(p);
    p.trigger = 1;
    for (let i = 0; i < 60; i++) t.grabMove(p);
    t.grabEnd(p);
    expect(sent['s:lever']).toBe(0);
  });

  it('ignores a tracking jump of the hand when steering', () => {
    const { t, sent, p, grip } = setup();
    t.grabStart(p);
    t.grabMove(p);
    const before = sent['s:helm'] ?? 0;
    p.position = grip.clone().add(new THREE.Vector3(2, 0, 0));
    t.grabMove(p);
    expect(sent['s:helm'] ?? 0).toBe(before);
  });
});
