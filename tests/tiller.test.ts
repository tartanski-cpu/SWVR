import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Tiller } from '../src/controls/Tiller';
import type { Pointer } from '../src/controls/Control';
import { CONFIG } from '../src/config';

function setup() {
  const t = new Tiller('s', CONFIG.vessels.skiff.outboard);
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

describe('outboard tiller (desktop)', () => {
  it("a click on the gear lever takes the whole outboard into keyboard steering (so WASD doesn't walk)", async () => {
    const { InteractionSystem } = await import('../src/controls/InteractionSystem');
    const t = new Tiller('s', CONFIG.vessels.skiff.outboard);
    t.root.position.set(0, 0, -1);
    t.root.updateMatrixWorld(true);
    const sys = new InteractionSystem(t.parts, () => {}, () => {});
    const knob = t.gearLever.hitObjects[0].getWorldPosition(new THREE.Vector3());
    const eye = knob.clone().add(new THREE.Vector3(0.6, 0.3, 0.6));
    const ray = new THREE.Ray(eye, knob.clone().sub(eye).normalize());
    sys.updateDesktop(ray, false, false, false, 0, 0);
    expect(sys.desktopHoverLabel).toBe(t.gearLever.label);
    sys.updateDesktop(ray, true, true, false, 0, 0);
    expect(sys.steering).toBe(t);
    expect(sys.desktopHeld).toBe(t);
  });
});
