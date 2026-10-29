import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Tiller } from '../src/controls/Tiller';
import type { Pointer } from '../src/controls/Control';
import { CONFIG } from '../src/config';

const WIRING = { helm: 'helm.demand', throttle: 'throttle.demand' };

function setup() {
  const t = new Tiller(CONFIG.vessels.skiff.outboard, WIRING);
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
    expect(sent['throttle.demand']).toBe(1);
    p.trigger = 0.5;
    for (let i = 0; i < 60; i++) t.grabMove(p);
    expect(sent['throttle.demand']).toBeCloseTo(0.5, 1);
    p.trigger = 0;
    t.grabMove(p);
    expect(sent['throttle.demand']).toBe(0);
  });

  it('letting go of the tiller closes the throttle', () => {
    const { t, sent, p } = setup();
    t.grabStart(p);
    p.trigger = 1;
    for (let i = 0; i < 60; i++) t.grabMove(p);
    t.grabEnd(p);
    expect(sent['throttle.demand']).toBe(0);
  });

  it('ignores a tracking jump of the hand when steering', () => {
    const { t, sent, p, grip } = setup();
    t.grabStart(p);
    t.grabMove(p);
    const before = sent['helm.demand'] ?? 0;
    p.position = grip.clone().add(new THREE.Vector3(2, 0, 0));
    t.grabMove(p);
    expect(sent['helm.demand'] ?? 0).toBe(before);
  });
});

describe('outboard tiller (desktop)', () => {
  it('holding S from ahead runs straight through neutral into astern (owner, 29 Oct 2026: "full forward, full reverse without it stopping")', () => {
    const { t, sent } = setup();
    t.keySteer(0, 1);
    for (let i = 0; i < 90; i++) t.tick(1 / 60); // ahead
    expect(sent.obGear).toBe(1);
    t.keySteer(0, -1);
    for (let i = 0; i < 180; i++) t.tick(1 / 60); // held, 3 s
    expect(sent.obGear).toBe(-1); // astern, without letting go
    expect(sent['throttle.demand']).toBeGreaterThan(0.3);
  });

  it('with stopAtNeutral on (the old way, a setting): holding S from ahead stops in neutral; let go and press again for astern', () => {
    const was = CONFIG.debugDriving.stopAtNeutral;
    (CONFIG.debugDriving as { stopAtNeutral: boolean }).stopAtNeutral = true;
    try {
      oldWay();
    } finally {
      (CONFIG.debugDriving as { stopAtNeutral: boolean }).stopAtNeutral = was;
    }
  });
  function oldWay(): void {
    const { t, sent } = setup();
    t.keySteer(0, 1);
    for (let i = 0; i < 90; i++) t.tick(1 / 60); // ahead
    expect(sent['throttle.demand']).toBeGreaterThan(0.3);
    t.keySteer(0, -1);
    for (let i = 0; i < 600; i++) t.tick(1 / 60); // held for 10 s
    expect(sent['throttle.demand']).toBe(0);
    expect(sent.obGear ?? 0).toBe(0); // in neutral, not astern
    t.keySteer(0, 0);
    t.tick(1 / 60);
    t.keySteer(0, -1);
    for (let i = 0; i < 60; i++) t.tick(1 / 60);
    expect(sent['throttle.demand']).toBeGreaterThan(0.2);
    expect(sent.obGear).toBe(-1); // astern now
  }

  it("a click on the gear lever takes the whole outboard into keyboard steering (so WASD doesn't walk)", async () => {
    const { InteractionSystem } = await import('../src/controls/InteractionSystem');
    const t = new Tiller(CONFIG.vessels.skiff.outboard, WIRING);
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
