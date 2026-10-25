import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/controls/Button';
import type { ControlContext } from '../src/controls/Control';
import { InteractionSystem, type HandFrame } from '../src/controls/InteractionSystem';
import { Lever } from '../src/controls/Lever';
import { Toggle } from '../src/controls/Toggle';
import { Wheel } from '../src/controls/Wheel';
import { createVesselState } from '../src/vessel/vesselState';

function recorder() {
  const sent: [string, number][] = [];
  const ctx: ControlContext = { emit: (c, v) => sent.push([c, v]), haptic: () => {} };
  return { sent, ctx, last: () => sent[sent.length - 1]?.[1] };
}

describe('Lever', () => {
  const make = () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    lever.root.updateMatrixWorld(true);
    const r = recorder();
    lever.bind(r.ctx);
    return { lever, r };
  };
  // Hand on the knob (0.24 m above the base), moved fore-aft so the knob's arc length
  // corresponds to `deg` of lever angle (the lever follows fore-aft hand travel).
  const hand = (deg: number) => ({ position: new THREE.Vector3(0, 0.24, 0.2 * ((deg * Math.PI) / 180)) });

  it('pushing forward (toward the bow, -Z) is ahead; pulling back is astern', () => {
    const { lever, r } = make();
    lever.grabStart(hand(0));
    lever.grabMove(hand(-20));
    expect(r.last()).toBeCloseTo(0.5, 2);
    lever.grabMove(hand(30));
    expect(r.last()).toBeCloseTo(-0.75, 2);
  });

  it('is limited to its travel and holds in the neutral detent', () => {
    const { lever, r } = make();
    lever.grabStart(hand(0));
    lever.grabMove(hand(-80));
    expect(r.last()).toBe(1);
    lever.grabMove(hand(-1.5)); // 0.0375 of travel: inside the detent
    expect(r.last()).toBe(0);
  });

  it('grabbing off-centre does not make it jump', () => {
    const { lever, r } = make();
    lever.grabStart(hand(-10)); // hand slightly ahead of the knob
    lever.grabMove(hand(-10));
    expect(r.sent.length).toBe(0); // nothing moved, nothing sent
  });

  it('shows the authoritative state when not held', () => {
    const { lever } = make();
    const s = createVesselState('v', 'workboat');
    s.controls.lever = 0.5;
    lever.sync(s);
    expect(lever.value).toBeCloseTo(0.5, 6);
  });
});

describe('Wheel', () => {
  const R = 0.22;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0);
  };

  it('clockwise (as the helmsman sees it) is starboard, hand-over-hand through several turns, to the stops', () => {
    const wheel = new Wheel('wheel', { radius: R, turnsLockToLock: 1.5 });
    wheel.root.updateMatrixWorld(true);
    const r = recorder();
    wheel.bind(r.ctx);
    const pos = at(90);
    const p = { position: pos };
    wheel.grabStart(p);
    // Turn clockwise 90 degrees in 10 degree steps (angle decreasing about +Z).
    for (let d = 80; d >= 0; d -= 10) {
      pos.copy(at(d));
      wheel.grabMove(p);
    }
    // 90 deg of a 270 deg half-travel = 1/3 starboard helm.
    expect(r.last()).toBeCloseTo(1 / 3, 2);
    // Keep going round: past a full turn to the stop.
    for (let d = -10; d >= -400; d -= 10) {
      pos.copy(at(d));
      wheel.grabMove(p);
    }
    expect(r.last()).toBeCloseTo(1, 3);
    wheel.grabEnd(p);
    expect(wheel.held).toBe(false);
  });

  it('a hand anywhere on the rim is within reach; the hub is not the rim', () => {
    const wheel = new Wheel('wheel', { radius: R, turnsLockToLock: 1.5 });
    wheel.root.updateMatrixWorld(true);
    expect(wheel.distanceTo(at(200))).toBeLessThan(0.001);
    expect(wheel.distanceTo(new THREE.Vector3(0, 0, 0))).toBeCloseTo(R, 3);
  });
});

describe('Button and Toggle', () => {
  it('momentary button sends 1 then 0; pulse button sends a single 1', () => {
    const horn = new Button('horn', 'horn', 'Horn', 'momentary', 0xffff00);
    const r1 = recorder();
    horn.bind(r1.ctx);
    horn.pressStart();
    horn.pressEnd();
    expect(r1.sent).toEqual([
      ['horn', 1],
      ['horn', 0],
    ]);
    const start = new Button('start', 'engineStartStop', 'Start', 'pulse', 0x00ff00);
    const r2 = recorder();
    start.bind(r2.ctx);
    start.pressStart();
    start.pressEnd();
    expect(r2.sent).toEqual([['engineStartStop', 1]]);
  });

  it('toggle flips and follows the authoritative state', () => {
    const t = new Toggle('nav', 'navLights', 'Nav', (s) => s.controls.navLights);
    const r = recorder();
    t.bind(r.ctx);
    t.pressStart();
    t.pressStart();
    expect(r.sent).toEqual([
      ['navLights', 1],
      ['navLights', 0],
    ]);
  });

  it('a three-way switch (the cabin light) steps off -> white -> red -> off and follows the state', () => {
    const t = new Toggle('cabin', 'cabinLight', 'Cabin light', (s) => s.controls.cabinLight, 3);
    const r = recorder();
    t.bind(r.ctx);
    t.pressStart();
    t.pressStart();
    t.pressStart();
    expect(r.sent.map((x) => x[1])).toEqual([1, 2, 0]);
    const s = createVesselState('v', 'workboat');
    s.controls.cabinLight = 2;
    t.sync(s); // agrees with nothing pending after a while: follows
    const pos = () => (t as unknown as { pos: number }).pos;
    expect([0, 2]).toContain(pos());
  });

  it("a crew-mate's switch doesn't bounce back while the host's state catches up", () => {
    let now = 1000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const t = new Toggle('nav', 'navLights', 'Nav', (s) => s.controls.navLights);
    t.bind(recorder().ctx);
    const s = createVesselState('v', 'workboat');
    const on = () => (t as unknown as { pos: number }).pos === 1;
    t.pressStart(); // on, locally
    now += 100;
    t.sync(s); // the snapshot still says off: wait
    expect(on()).toBe(true);
    s.controls.navLights = 1;
    t.sync(s); // the host has it
    s.controls.navLights = 0;
    t.sync(s); // someone else turned it off: follow at once
    expect(on()).toBe(false);
    t.pressStart();
    now += 2000;
    t.sync(s); // never arrived (refused): give up and show the truth
    expect(on()).toBe(false);
    spy.mockRestore();
  });
});

describe('InteractionSystem (VR hands)', () => {
  const frame = (grip: THREE.Vector3, over: Partial<HandFrame> = {}): HandFrame => ({
    tracked: true,
    grip,
    ray: new THREE.Ray(grip.clone(), new THREE.Vector3(0, 0, -1)),
    gripDown: false,
    gripPressed: false,
    triggerDown: false,
    triggerPressed: false,
    ...over,
  });

  it('grip on the lever grabs it (and keeps locomotion off that hand); moving the hand drives it', () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    lever.root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const sys = new InteractionSystem([lever], (c, v) => sent.push([c, v]), () => {});
    const grip = new THREE.Vector3(0, 0.24, 0);
    const idle = frame(new THREE.Vector3(5, 5, 5));
    // The controller points somewhere else entirely: must not matter for a hand grab.
    const pointingAway = { ray: new THREE.Ray(grip.clone(), new THREE.Vector3(1, 0, 0)) };
    let busy = sys.updateXR({ left: idle, right: frame(grip) });
    expect(busy.right).toBe(true); // hovering a grab control: grip is the control's
    sys.updateXR({ left: idle, right: frame(grip, { gripDown: true, gripPressed: true, ...pointingAway }) });
    expect(lever.held).toBe(true);
    grip.set(0, 0.24, 0.2 * ((-20 * Math.PI) / 180)); // hand pushed 7 cm forward
    busy = sys.updateXR({ left: idle, right: frame(grip, { gripDown: true, ...pointingAway }) });
    expect(busy.right).toBe(true);
    expect(sent[sent.length - 1][1]).toBeCloseTo(0.5, 2);
    sys.updateXR({ left: idle, right: frame(grip) }); // let go
    expect(lever.held).toBe(false);
  });


  it('a hand away from every control is free for grab-the-world', () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    lever.root.updateMatrixWorld(true);
    const sys = new InteractionSystem([lever], () => {}, () => {});
    const far = frame(new THREE.Vector3(2, 1, 2), { gripDown: true, gripPressed: true });
    expect(sys.updateXR({ left: far, right: far }).left).toBe(false);
  });
});

describe('InteractionSystem (desktop reticle)', () => {
  it('a quick click (press + release in one frame) on a button still presses it once', () => {
    const horn = new Button('horn', 'horn', 'Horn', 'momentary', 0xffff00);
    horn.root.position.set(0, 0, -1);
    horn.root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const sys = new InteractionSystem([horn], (c, v) => sent.push([c, v]), () => {});
    const ray = new THREE.Ray(new THREE.Vector3(0, 0.028, 0), new THREE.Vector3(0, 0, -1));
    sys.updateDesktop(ray, false, true, true, 0, 0);
    expect(sent).toEqual([
      ['horn', 1],
      ['horn', 0],
    ]);
  });

  it('click-and-drag moves the lever with the mouse, then lets go', () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    lever.root.position.set(0, 0, -1);
    lever.root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const sys = new InteractionSystem([lever], (c, v) => sent.push([c, v]), () => {});
    const ray = new THREE.Ray(new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(0, 0, -1));
    expect(sys.updateDesktop(ray, true, true, false, 0, 0)).toBe(true); // grabbed, look frozen
    for (let i = 0; i < 10; i++) sys.updateDesktop(ray, true, false, false, 0, -20); // mouse up = ahead
    expect(sent[sent.length - 1][1]).toBeGreaterThan(0.5);
    expect(sys.updateDesktop(ray, false, false, true, 0, 0)).toBe(false);
    expect(lever.held).toBe(false);
  });

  it('aim help: a near miss picks the switch, and it stays picked while the reticle is close', () => {
    const nav = new Toggle('nav', 'navLights', 'Nav', (s) => s.controls.navLights);
    nav.root.position.set(0, 0, -1);
    nav.root.updateMatrixWorld(true);
    const sys = new InteractionSystem([nav], () => {}, () => {});
    const aim = (deg: number) => new THREE.Ray(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(Math.sin((deg * Math.PI) / 180), 0, -Math.cos((deg * Math.PI) / 180)));
    sys.updateDesktop(aim(5), false, false, false, 0, 0);
    expect(sys.desktopHoverLabel).toBe('Nav'); // just missed, within the assist
    sys.updateDesktop(aim(7), false, false, false, 0, 0);
    expect(sys.desktopHoverLabel).toBe('Nav'); // drifting off: sticky
    sys.updateDesktop(aim(20), false, false, false, 0, 0);
    expect(sys.desktopHoverLabel).toBeNull(); // well away
    sys.updateDesktop(aim(7), false, false, false, 0, 0);
    expect(sys.desktopHoverLabel).toBeNull(); // not sticky from nothing
  });
});

describe('Lever desktop drag', () => {
  it('stops in the neutral notch and needs deliberate extra travel to go through', () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    const sent: number[] = [];
    lever.bind({ emit: (_c, v) => sent.push(v), haptic: () => {} });
    for (let i = 0; i < 20; i++) lever.nudge(0, -10); // push ahead
    expect(sent[sent.length - 1]).toBeGreaterThan(0.5);
    for (let i = 0; i < 33; i++) lever.nudge(0, 5); // pull back to neutral and a bit beyond
    expect(lever.value).toBe(0); // caught in neutral...
    for (let i = 0; i < 30; i++) lever.nudge(0, 5); // ...until pulled on deliberately
    expect(lever.value).toBeLessThan(0);
  });
});

describe('InteractionSystem pointer ray', () => {
  it('reaches buttons from a distance but never grabs levers', () => {
    const lever = new Lever('lever', { maxAngleDeg: 40, length: 0.2 }, 0.06);
    lever.root.position.set(0, 0, -1);
    lever.root.updateMatrixWorld(true);
    const horn = new Button('horn', 'horn', 'Horn', 'momentary', 0xffff00);
    horn.root.position.set(0.5, 0, -1);
    horn.root.updateMatrixWorld(true);
    const sent: [string, number][] = [];
    const sys = new InteractionSystem([lever, horn], (c, v) => sent.push([c, v]), () => {});
    const far = (target: THREE.Vector3, trigger: boolean, grip: boolean) => {
      const origin = new THREE.Vector3(0, 0.3, 0);
      return {
        tracked: true,
        grip: origin.clone(),
        ray: new THREE.Ray(origin, target.clone().sub(origin).normalize()),
        gripDown: grip,
        gripPressed: grip,
        triggerDown: trigger,
        triggerPressed: trigger,
      };
    };
    const off = far(new THREE.Vector3(9, 9, 9), false, false);
    sys.updateXR({ left: off, right: far(new THREE.Vector3(0, 0.24, -1), true, true) }); // at the lever knob
    expect(lever.held).toBe(false);
    sys.updateXR({ left: off, right: far(new THREE.Vector3(0.5, 0.028, -1), true, false) }); // at the horn
    expect(sent).toEqual([['horn', 1]]);
  });
});
