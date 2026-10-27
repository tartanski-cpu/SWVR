/**
 * Azimuth drives and their twist-and-throttle levers (owner, Oct 2026: the harbour tug's ASD drives,
 * "transit mode too, harbour tug first"; "a twist and throttle ... one hand each"; modules/dieselInboard `azimuth`,
 * modules/azimuthLevers): the Shipyard fits them to the harbour tug; each drive turns at its
 * steering rate and pushes the way it points; the classic moves (ahead, astern, turning on the
 * spot, TRANSIT with the wheel); and the lever reads the twist and the push.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { azimuthDemand } from '../src/modules/dieselInboard';
import { AzimuthLever, snapTo } from '../src/modules/azimuthLevers/lever';
import { InteractionSystem, type HandFrame } from '../src/controls/InteractionSystem';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { matchGear } from '../src/shipyard/trial';
import { placeVessel } from '../src/vessel/vesselControl';
import { plantReady } from '../src/plant/plant';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const H = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Harbour tug'));
const tug0: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[H].defaults, hull: H };
let tug: ShipDesign | null = null;
/** Her design with her gearbox matched, as the Shipyard's sea trial matches it. */
const matched = () => (tug ??= { ...tug0, gear: matchGear(tug0).gear });

/** Her, started (both engines), afloat in open water. */
function underWay() {
  useDesign(matched());
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  // (Her engine room readied and handed to the bridge, as the quick start does: plant/plant.ts.)
  plantReady(v);
  send('electrical.master', 1);
  for (const b of ['instruments', 'chart', 'radio', 'navLights', 'hydraulics']) send(`breaker.${b}`, 1);
  send('ignition.key', 1);
  run(8);
  for (const k of ['ignition.start', 'ignition.start2']) {
    send(k, 1);
    run(6);
    send(k, 0);
    run(1);
  }
  const heading = () => {
    const [x, y, z, w] = v.orientation;
    // Clockwise seen from above (to starboard) positive, as a compass: a +y yaw turns her to port.
    return -(Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)) * 180) / Math.PI;
  };
  return { world, v, send, run, heading };
}

describe('azimuth drives', { timeout: 300000 }, () => {
  it('the Shipyard fits the harbour tug with them: no rudders, a lever each side of a small wheel, TRANSIT, a START each', () => {
    const b = buildDesign(tug0);
    expect(b.warnings).toEqual([]);
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as Record<string, any>;
    expect(engine.azimuth).toBeDefined();
    expect(engine.twin).toMatchObject({ split: true });
    expect(b.recipe.modules.some((m) => m.socket === 'rudder')).toBe(false);
    // A twist-and-throttle lever each side of the wheel (the port drive's to port), TRANSIT, a small wheel.
    const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
    const slots = (helm.config as Record<string, any>).slots;
    const ac = CONFIG.modules.azimuth.console;
    for (const [socket, side, x] of [['throttle', 'port', -ac.leverX], ['throttle2', 'stbd', ac.leverX]] as const) {
      const m = helm.modules!.find((q) => q.socket === socket)!;
      expect(m.module).toBe('control.azimuth-lever');
      expect(m.config).toMatchObject({ side });
      expect(slots[socket].position[0]).toBeCloseTo(x, 3);
    }
    expect(helm.modules!.find((m) => m.socket === 'aziTransit')!.bind).toEqual({ value: 'azimuth.transit' });
    expect(helm.modules!.find((m) => m.socket === 'wheel')!.config).toMatchObject({ radius: ac.wheelRadius });
    expect(helm.modules!.some((m) => m.socket === 'start2')).toBe(true);
    // Her driving guide on the port wall, facing in; no other boat has it.
    expect(b.recipe.modules.find((m) => m.socket === 'poster')).toMatchObject({ module: 'furniture.poster', config: { poster: 'azimuthGuide' } });
    const wall = b.hull.sockets.find((q) => q.id === 'poster')!;
    expect(wall.transform.position[0]).toBeLessThan(0);
    expect(wall.transform.rotationDeg).toEqual([0, 90, 0]);
    // Other twins keep their shafts and the twin throttle.
    const cat = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
    const c = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[cat].defaults, hull: cat });
    expect((c.recipe.modules.find((m) => m.socket === 'engine')!.config as Record<string, any>).azimuth).toBeUndefined();
    expect(c.recipe.modules.some((m) => m.socket === 'poster')).toBe(false);
  });

  it('TRANSIT: the wheel swings both drives as rudders; each lever ahead in its forward half, astern in its after half; a throttle below zero is astern', () => {
    const io = (vals: Record<string, number | boolean>) => ({ num: (k: string) => Number(vals[k] ?? 0), has: (k: string) => k in vals, get: (k: string) => vals[k] ?? false });
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    const max = CONFIG.modules.azimuth.transitMaxDeg;
    // Levers: each drive its own way.
    expect(azimuthDemand(io({ angle: 30, angle2: -120, throttle: 0.5, throttle2: 1 })).want.map(deg)).toEqual([30, -120]);
    // Transit, the wheel hard to starboard: both drives push to port (her bow to starboard), ahead and astern.
    const t = azimuthDemand(io({ transit: true, helm: 1, angle: 10, angle2: 170, throttle: 0.6, throttle2: 0.6 }));
    expect(t.want.map(deg)).toEqual([-max, -(180 - max)]);
    expect(t.power).toEqual([0.6, 0.6]);
    // A throttle below zero (keys, game controller): that power, the drive turned round.
    const k = azimuthDemand(io({ angle: 0, angle2: 0, throttle: -1, throttle2: -1 }));
    expect(k.want.map((r) => Math.abs(deg(r)))).toEqual([180, 180]);
    expect(k.power).toEqual([1, 1]);
  });

  it('each drive turns at its steering rate; ahead she makes her speed; astern by turning the drives round', () => {
    const a = underWay();
    a.send('azimuth.demand2', 180);
    a.run(5);
    const rate = CONFIG.modules.azimuth.slewDegPerS;
    // (Round to astern is as short either way: it may go round either side.)
    expect(Math.abs(((a.v.engine.stbd!.azimuth ?? 0) * 180) / Math.PI)).toBeCloseTo(5 * rate, -1);
    a.run(15);
    expect(Math.abs(a.v.engine.stbd!.azimuth!)).toBeCloseTo(Math.PI, 2);
    // Both ahead, flat out: about her real 12 kn.
    const b = underWay();
    b.send('throttle.demand', 1);
    b.send('throttle.demand2', 1);
    b.run(60);
    const kn = Math.hypot(b.v.linearVelocity[0], b.v.linearVelocity[2]) / 0.5144;
    expect(kn).toBeGreaterThan(10.5);
    expect(kn).toBeLessThan(13.5);
    // Both turned round: she goes astern (+z).
    const c = underWay();
    c.send('azimuth.demand', 180);
    c.send('azimuth.demand2', 180);
    c.run(16);
    c.send('throttle.demand', 0.6);
    c.send('throttle.demand2', 0.6);
    c.run(20);
    expect(c.v.linearVelocity[2]).toBeGreaterThan(1);
  });

  it('one drive ahead, the other astern: she turns on the spot; TRANSIT and the wheel: she turns as the wheel says', () => {
    const a = underWay();
    a.send('azimuth.demand2', 180);
    a.run(16);
    const x0 = [a.v.position[0], a.v.position[2]];
    a.send('throttle.demand', 0.5);
    a.send('throttle.demand2', 0.5);
    a.run(20);
    expect(Math.abs(a.heading())).toBeGreaterThan(60);
    expect(Math.hypot(a.v.position[0] - x0[0], a.v.position[2] - x0[1])).toBeLessThan(25);
    // Port drive ahead, starboard astern: her bow swings to starboard (heading +, clockwise).
    expect(a.heading()).toBeGreaterThan(0);
    // Transit, the wheel to starboard: she turns to starboard; to port, to port.
    for (const side of [1, -1]) {
      const t = underWay();
      t.send('azimuth.transit', 1);
      t.send('helm.demand', side);
      t.send('throttle.demand', 0.8);
      t.send('throttle.demand2', 0.8);
      t.run(6);
      expect(Math.sign(t.heading())).toBe(side);
      expect(Math.abs(t.heading())).toBeGreaterThan(15);
    }
  });

  it('the lever: twist the hand and it turns, `twistGain` a degree; push the grip along its arrow for power; idle near upright; it stays where it is left', () => {
    const c = CONFIG.modules.azimuth.lever;
    const sent: [string, number][] = [];
    const lever = new AzimuthLever('l', { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, snapDeg: c.snapDeg, handMoves: true, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: 0, tipColour: 0xffffff, colour: 0xff0000, baseColour: 0 }, { angle: 'azimuth.demand', power: 'throttle.demand' }, { angle: () => 0, power: () => 0 }, 'test');
    lever.bind({ emit: (ch: string, v: number) => sent.push([ch, v]), haptic: () => {} } as never);
    lever.root.updateMatrixWorld(true);
    const grip = lever.grabPoint(new THREE.Vector3());
    const turned = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-deg * Math.PI) / 180);
    const pointer = (p: THREE.Vector3, deg: number) => ({ position: p, quaternion: turned(deg) }) as never;
    lever.grabStart(pointer(grip.clone(), 0));
    // The hand turned 30 deg to starboard: the lever 30 x twistGain round; still idle.
    lever.grabMove(pointer(grip.clone(), 30));
    expect(lever.angle).toBeCloseTo(30 * c.twistGain, 0);
    expect(lever.power).toBe(0);
    // Pushed along its arrow, the grip leaned half its travel: about half power, the angle kept.
    const a = (30 * c.twistGain * Math.PI) / 180;
    const lean = ((c.maxTiltDeg / 2) * Math.PI) / 180;
    const pivot = grip.clone().setY(lever.pivotY);
    const r = grip.y - lever.pivotY;
    const at = pivot.clone().add(new THREE.Vector3(Math.sin(a) * Math.sin(lean) * r, Math.cos(lean) * r, -Math.cos(a) * Math.sin(lean) * r));
    lever.grabMove(pointer(at, 30));
    expect(lever.angle).toBeCloseTo(30 * c.twistGain, 0);
    expect(lever.power).toBeCloseTo(0.5, 1);
    // Let go and grab again: it turns on from where it is (a full turn round is a few grabs).
    lever.grabEnd(pointer(at, 30));
    lever.grabStart(pointer(at, -60));
    lever.grabMove(pointer(at, 0));
    expect(lever.angle).toBeCloseTo(90 * c.twistGain, 0);
    // Back to upright: idle (the detent), its direction kept.
    lever.grabMove(pointer(grip.clone(), 0));
    expect(lever.power).toBe(0);
    expect(lever.angle).toBeCloseTo(90 * c.twistGain, 0);
    lever.grabEnd(pointer(grip, 0));
    expect(sent.some(([ch]) => ch === 'azimuth.demand')).toBe(true);
    expect(sent.at(-1)).toEqual(['throttle.demand', 0]);
  });

  it('held in VR, its thumbstick works it (forward more power, sideways a twist), and the hand then holds it where the stick left it', () => {
    const c = CONFIG.modules.azimuth.lever;
    const lever = new AzimuthLever('l', { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, snapDeg: c.snapDeg, handMoves: true, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: 0, tipColour: 0xffffff, colour: 0xff0000, baseColour: 0 }, { angle: 'azimuth.demand', power: 'throttle.demand' }, { angle: () => 0, power: () => 0 }, 'test');
    lever.bind({ emit: () => {}, haptic: () => {} } as never);
    lever.root.updateMatrixWorld(true);
    const hand = { position: lever.grabPoint(new THREE.Vector3()), quaternion: new THREE.Quaternion() } as never;
    lever.grabStart(hand);
    // Stick full forward for a second: half power (the keys' rate), the hand not moved.
    lever.stickSteer(0, 1);
    for (let i = 0; i < 10; i++) {
      lever.grabMove(hand);
      lever.tick(0.1);
    }
    expect(lever.power).toBeCloseTo(0.5, 2);
    // Stick to starboard for half a second: 45 degrees round, power kept.
    lever.stickSteer(1, 0);
    for (let i = 0; i < 5; i++) {
      lever.grabMove(hand);
      lever.tick(0.1);
    }
    expect(lever.angle).toBeCloseTo(45, 0);
    // Stick let go: the hand, still where it was, holds the lever where the stick left it.
    lever.stickSteer(0, 0);
    lever.grabMove(hand);
    lever.tick(0.1);
    expect(lever.angle).toBeCloseTo(45, 0);
    expect(lever.power).toBeCloseTo(0.5, 2);
    expect(lever.held).toBe(true);
    lever.grabEnd(hand);
    expect(lever.held).toBe(false);
  });

  it('as set (handMoves off): a hand holding it only holds it; moving or twisting the hand does nothing, the thumbstick works it', () => {
    const c = CONFIG.modules.azimuth.lever;
    expect(c.handMoves).toBe(false);
    const lever = new AzimuthLever('l', { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, snapDeg: c.snapDeg, handMoves: c.handMoves, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: 0, tipColour: 0xffffff, colour: 0xff0000, baseColour: 0 }, { angle: 'azimuth.demand', power: 'throttle.demand' }, { angle: () => 0, power: () => 0 }, 'test');
    lever.root.updateMatrixWorld(true);
    const sys = new InteractionSystem([lever], () => {}, () => {});
    const frame = (grip: THREE.Vector3, down: boolean, pressed: boolean, stick: [number, number], yawDeg = 0): HandFrame => ({ tracked: true, grip, ray: new THREE.Ray(grip.clone(), new THREE.Vector3(0, 0, -1)), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-yawDeg * Math.PI) / 180), gripDown: down, gripPressed: pressed, triggerDown: false, triggerPressed: false, stick });
    const far = new THREE.Vector3(5, 5, 5);
    const at = lever.grabPoint(new THREE.Vector3());
    const hands = (l: HandFrame) => ({ left: l, right: frame(far, false, false, [0, 0]) });
    sys.updateXR(hands(frame(at, true, true, [0, 0])));
    expect(sys.holding('left')).toBe(lever);
    // The hand pushed well forward and twisted 60 deg: nothing moves.
    const pushed = at.clone().add(new THREE.Vector3(0.03, -0.02, -0.12));
    for (let i = 0; i < 5; i++) sys.updateXR(hands(frame(pushed, true, false, [0, 0], 60)));
    expect(lever.power).toBe(0);
    expect(lever.angle).toBe(0);
    // The stick, sideways then forward: it twists, then gives power.
    for (let i = 0; i < 5; i++) {
      sys.updateXR(hands(frame(pushed, true, false, [1, 0], 60)));
      lever.tick(0.1);
    }
    expect(lever.angle).toBeGreaterThan(30);
    for (let i = 0; i < 5; i++) {
      sys.updateXR(hands(frame(pushed, true, false, [0, -1], 60)));
      lever.tick(0.1);
    }
    expect(lever.power).toBeGreaterThan(0.2);
    // And the hand moving back afterwards still changes nothing.
    const kept = [lever.angle, lever.power];
    for (let i = 0; i < 5; i++) sys.updateXR(hands(frame(at, true, false, [0, 0], -40)));
    expect([lever.angle, lever.power]).toEqual(kept);
  });

  it('a hand holding it: the interaction system gives it that hand\'s stick, and says the hand holds it (so the stick neither walks nor turns you)', () => {
    const c = CONFIG.modules.azimuth.lever;
    const lever = new AzimuthLever('l', { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, snapDeg: c.snapDeg, handMoves: true, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: 0, tipColour: 0xffffff, colour: 0xff0000, baseColour: 0 }, { angle: 'azimuth.demand', power: 'throttle.demand' }, { angle: () => 0, power: () => 0 }, 'test');
    lever.root.updateMatrixWorld(true);
    const sys = new InteractionSystem([lever], () => {}, () => {});
    const frame = (grip: THREE.Vector3, down: boolean, pressed: boolean, stick: [number, number]): HandFrame => ({ tracked: true, grip, ray: new THREE.Ray(grip.clone(), new THREE.Vector3(0, 0, -1)), quat: new THREE.Quaternion(), gripDown: down, gripPressed: pressed, triggerDown: false, triggerPressed: false, stick });
    const far = new THREE.Vector3(5, 5, 5);
    const at = lever.grabPoint(new THREE.Vector3());
    const hands = (l: HandFrame) => ({ left: l, right: frame(far, false, false, [0, 0]) });
    sys.updateXR(hands(frame(at, true, true, [0, 0])));
    expect(sys.holding('left')).toBe(lever);
    expect(sys.holding('right')).toBe(null);
    // Stick forward (the controller's y is negative forward), past the dead zone.
    for (let i = 0; i < 10; i++) {
      sys.updateXR(hands(frame(at, true, false, [0, -1])));
      lever.tick(0.1);
    }
    expect(lever.power).toBeCloseTo(0.5, 2);
    // A thumb resting just off centre (inside the dead zone) doesn't creep it.
    for (let i = 0; i < 10; i++) {
      sys.updateXR(hands(frame(at, true, false, [0.1, -0.1])));
      lever.tick(0.1);
    }
    expect(lever.power).toBeCloseTo(0.5, 2);
    // Grip let go: the hand holds nothing, and its stick is the player's again.
    sys.updateXR(hands(frame(at, false, false, [0, -1])));
    expect(sys.holding('left')).toBe(null);
    lever.tick(0.1);
    expect(lever.power).toBeCloseTo(0.5, 2);
  });

  it('its turn clicks into notches at 12, 3, 6 and 9 o\'clock, and turns on through them; the keys take it out of idle', () => {
    const c = CONFIG.modules.azimuth.lever;
    expect(snapTo(84, c.snapDeg)).toBe(90);
    expect(Math.abs(snapTo(-176, c.snapDeg) ?? 0)).toBe(180);
    expect(snapTo(-95, c.snapDeg)).toBe(-90);
    expect(snapTo(3, c.snapDeg)).toBe(0);
    expect(snapTo(45, c.snapDeg)).toBe(null);
    const lever = new AzimuthLever('l', { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, snapDeg: c.snapDeg, handMoves: true, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: 0, tipColour: 0xffffff, colour: 0xff0000, baseColour: 0 }, { angle: 'azimuth.demand', power: 'throttle.demand' }, { angle: () => 0, power: () => 0 }, 'test');
    let clicks = 0;
    lever.bind({ emit: () => {}, haptic: () => clicks++ } as never);
    // The desktop keys, a frame at a time: D turns it on through 3 o'clock, with a click there.
    lever.keySteer(1, 0);
    const seen = new Set<number>();
    for (let i = 0; i < 90; i++) {
      lever.tick(1 / 60);
      seen.add(Math.round(lever.angle));
    }
    expect(seen.has(90)).toBe(true);
    expect(Math.round(lever.angle)).toBe(Math.round(snapTo(135, c.snapDeg) ?? 135));
    expect(clicks).toBeGreaterThan(0);
    // W from idle: small steps under the idle detent add up, and it comes out of idle.
    lever.keySteer(0, 1);
    for (let i = 0; i < 60; i++) lever.tick(1 / 60);
    expect(lever.power).toBeCloseTo(0.5, 1);
    lever.keySteer(0, 0);
  });
});
