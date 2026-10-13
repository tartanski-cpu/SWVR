import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Joystick } from '../src/controls/Joystick';
import type { ControlContext } from '../src/controls/Control';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { CONFIG } from '../src/config';
import { createVesselState } from '../src/vessel/vesselState';

const opts = CONFIG.vessels.workboat.spotlight;

function joystick() {
  const sent: Record<string, number> = {};
  const ctx: ControlContext = { emit: (c, v) => (sent[c] = v), haptic: () => {} };
  const j = new Joystick('j', opts);
  j.root.updateMatrixWorld(true);
  j.bind(ctx);
  j.sync(createVesselState('v', 'workboat'));
  return { j, sent };
}

describe('searchlight joystick', () => {
  it('full sideways deflection pans at the configured rate; forward raises the beam', () => {
    const { j, sent } = joystick();
    j.grabStart({ position: new THREE.Vector3(0, 0.14, 0) });
    j.grabMove({ position: new THREE.Vector3(0.08, 0.14, 0) }); // past full deflection to starboard
    for (let i = 0; i < 10; i++) j.tick(0.1);
    expect(sent.spotPan).toBeCloseTo(opts.panRateDeg, 0);
    j.grabMove({ position: new THREE.Vector3(0, 0.14, -0.08) }); // forward
    for (let i = 0; i < 5; i++) j.tick(0.1);
    expect(sent.spotTilt).toBeGreaterThan(-4); // started at -4 deg
  });

  it('springs back to centre on release: no more movement', () => {
    const { j, sent } = joystick();
    j.grabStart({ position: new THREE.Vector3(0, 0.14, 0) });
    j.grabMove({ position: new THREE.Vector3(-0.08, 0.14, 0) });
    j.tick(0.5);
    const pan = sent.spotPan;
    j.grabEnd({ position: new THREE.Vector3() });
    j.tick(1);
    expect(sent.spotPan).toBe(pan);
    expect(pan).toBeLessThan(0); // port
  });

  it('the vessel clamps pan and tilt to the light\'s travel', () => {
    const { world, vesselId } = createWorld(new IdFactory());
    const v = world.vessels[vesselId];
    stepWorld(world, [{ playerId: 't', targetId: v.id, control: 'spotTilt', value: 80 }, { playerId: 't', targetId: v.id, control: 'spotPan', value: -400 }], 1 / 60);
    expect(v.controls.spotTilt).toBe(opts.tiltMaxDeg);
    expect(v.controls.spotPan).toBe(-opts.panLimitDeg);
  });
});
