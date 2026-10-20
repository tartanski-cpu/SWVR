import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Joystick } from '../src/controls/Joystick';
import type { ControlContext } from '../src/controls/Control';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { CONFIG } from '../src/config';
import { createVesselState } from '../src/vessel/vesselState';

// The light's travel (its own config) and the stick's rates (the joystick module's).
const opts = { ...CONFIG.vessels.workboat.spotlight, ...CONFIG.modules.joystick };

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

describe('searchlight joystick on the desktop', () => {
  it('click it, then WASD steer it at the same rates; a second click lets go', async () => {
    const { InteractionSystem } = await import('../src/controls/InteractionSystem');
    const sent: Record<string, number> = {};
    const j = new Joystick('j', opts);
    j.root.position.set(0, 0, -1);
    j.root.updateMatrixWorld(true);
    j.sync(createVesselState('v', 'workboat'));
    const sys = new InteractionSystem([j], (c, v) => (sent[c] = v), () => {});
    // Reticle ray from 0.5 m above, straight down the stick to its knob.
    const knob = new THREE.Vector3(0, 0.105 + 0.035, -1);
    const ray = new THREE.Ray(knob.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, -1, 0));
    const dragging = sys.updateDesktop(ray, true, true, false, 0, 0);
    expect(dragging).toBe(false); // mouse-look stays free
    expect(sys.steering).toBe(j);
    sys.updateDesktop(ray, false, false, true, 0, 0);
    for (let i = 0; i < 10; i++) {
      sys.steerKeys(1, 0); // D held
      j.tick(0.1);
    }
    expect(sent.spotPan).toBeCloseTo(opts.panRateDeg, 0);
    expect(sys.desktopHoverLabel).toMatch(/W A S D/);
    sys.updateDesktop(null, true, true, false, 0, 0); // click anywhere: let go
    expect(sys.steering).toBeNull();
    const pan = sent.spotPan;
    j.tick(1);
    expect(sent.spotPan).toBe(pan);
  });

  it('keys work a steered joystick\'s companion buttons (the deck crane\'s): held while held, let go with it', async () => {
    const { InteractionSystem } = await import('../src/controls/InteractionSystem');
    const { Button } = await import('../src/controls/Button');
    const sent: [string, number][] = [];
    const j = new Joystick('j', opts);
    j.root.position.set(0, 0, -1);
    j.root.updateMatrixWorld(true);
    const up = new Button('up', 'crane.hook', 'HOOK', 'momentary', 0xc0302a);
    j.keyExtras = [{ code: 'Space', key: 'Space', does: 'hook', target: up }];
    const sys = new InteractionSystem([j, up], (c, v) => sent.push([c, v]), () => {});
    const knob = new THREE.Vector3(0, 0.105 + 0.035, -1);
    const ray = new THREE.Ray(knob.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, -1, 0));
    sys.updateDesktop(ray, true, true, false, 0, 0);
    sys.updateDesktop(ray, false, false, true, 0, 0);
    expect(sys.steeringCodes).toEqual(['Space']);
    expect(sys.desktopHoverLabel).toMatch(/Space hook/);
    let r = true;
    sys.steerExtras((code) => code === 'Space' && r);
    sys.steerExtras((code) => code === 'Space' && r); // still held: pressed once
    expect(sent.filter(([c]) => c === 'crane.hook')).toEqual([['crane.hook', 1]]);
    r = false;
    sys.steerExtras(() => false);
    expect(sent.at(-1)).toEqual(['crane.hook', 0]);
    // Held when the joystick is let go: let go too.
    r = true;
    sys.steerExtras((code) => code === 'Space' && r);
    sys.updateDesktop(null, true, true, false, 0, 0);
    expect(sys.steering).toBeNull();
    expect(sent.at(-1)).toEqual(['crane.hook', 0]);
    expect(sys.steeringCodes).toEqual([]);
  });
});
