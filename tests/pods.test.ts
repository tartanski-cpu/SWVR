/**
 * Pod drives (owner, Oct 2026: "two drives... attach to the bottom of the ship, and the
 * propellers are at the front", with "a joystick, which allows you to control the vessel
 * basically in any direction"): the Shipyard's choice for a planing hull, the pods steering
 * from the wheel, and the joystick's vector mode (crab sideways, creep, turn on the spot).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { headingDeg } from '../src/controls/instruments';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { CONFIG } from '../src/config';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { useDesign } from '../src/boats/sims';
import { validateRecipe } from '../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../src/shipyard/design';
import { allocatePods, combinePushes, podPushes } from '../src/vessel/physics/podAllocation';

afterAll(() => useDesign(DEFAULT_DESIGN));

const pilot = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, pods: 1, ...more });

/** What the pods' pushes add up to: to starboard, aft, and the moment about her centre. */
function totals(at: { x: number; z: number }[], v: { x: number; z: number }[]) {
  return {
    fx: v.reduce((a, p) => a + p.x, 0),
    fz: v.reduce((a, p) => a + p.z, 0),
    m: v.reduce((a, p, i) => a + at[i].z * p.x - at[i].x * p.z, 0),
  };
}

describe('sharing the stick out between two pods', () => {
  const at = [
    { x: -0.8, z: 3 },
    { x: 0.8, z: 3 },
  ];
  it('gives exactly what is asked: a push sideways with no turn, a turn with no push', () => {
    const side = podPushes(at, 0.4, 0, 0);
    expect(totals(at, side).fx).toBeCloseTo(0.4, 9);
    expect(totals(at, side).fz).toBeCloseTo(0, 9);
    expect(totals(at, side).m).toBeCloseTo(0, 9);
    // To crab, one pod pushes ahead and the other astern, angled in: their pushes cross about her centre.
    expect(Math.sign(side[0].z)).toBe(-Math.sign(side[1].z));
    const turn = podPushes(at, 0, 0, -0.5);
    expect(totals(at, turn).m).toBeCloseTo(-0.5, 9);
    expect(turn[0].x).toBeCloseTo(0, 9); // straight: one ahead, one astern
  });

  it('keeps the turn when the pods can’t give both: the push is cut back first', () => {
    const both = combinePushes(podPushes(at, 3, 0, 0), podPushes(at, 0, 0, -0.4));
    expect(totals(at, both).m).toBeCloseTo(-0.4, 3);
    expect(Math.max(...both.map((p) => Math.hypot(p.x, p.z)))).toBeLessThanOrEqual(1 + 1e-6);
    expect(totals(at, both).fx).toBeGreaterThan(0);
  });

  it('turns each push into a heading within the swing, ahead or astern', () => {
    const o = allocatePods(at, 0.4, 0, 0, Math.PI / 4);
    expect(o.some((p) => p.push < 0) && o.some((p) => p.push > 0)).toBe(true);
    for (const p of o) expect(Math.abs(p.angle)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
  });
});

describe('pod drives in the Shipyard', () => {
  it('go on a planing hull: two pods in place of the shafts and rudders, a black throttle and the helm joystick', () => {
    for (const hull of [0, 1, 3]) {
      const d = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, pods: 1 };
      const b = buildDesign(d);
      const pods = b.recipe.modules.find((m) => m.module === 'propulsion.pods');
      expect(pods, `hull ${hull}`).toBeTruthy();
      expect(b.recipe.modules.some((m) => m.socket === 'engine' || m.socket === 'rudder')).toBe(false);
      const c = pods!.config as { units: number[]; mount: { y: number; z: number }; strut: number; propeller: { diameter: number } };
      expect(c.units).toHaveLength(2);
      expect(c.units[0]).toBeCloseTo(-c.units[1], 6);
      // Under her bottom, forward of the transom, the propellers' tips clear of her bottom.
      expect(c.mount.y).toBeLessThan(0);
      expect(c.strut).toBeGreaterThan(c.propeller.diameter / 2);
      expect(b.figures.engine).toMatch(/^Twin .*on pod drives/);
      const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
      expect(helm.modules!.some((m) => m.module === 'control.helm-joystick')).toBe(true);
      expect((helm.modules!.find((m) => m.socket === 'throttle')!.config as { style?: string }).style).toBe('black');
      useDesign(d);
      expect(validateRecipe(RECIPES.design, LIBRARY), `hull ${hull}`).toEqual([]);
    }
  });

  it('cost their price, and keep the joystick with the basic controls', () => {
    const twin = buildDesign(pilot({ pods: 0, twin: 1, sternDrive: 1 }));
    const b = buildDesign(pilot());
    expect(b.figures.price).toBeGreaterThan(twin.figures.price);
    const basic = buildDesign(pilot({ controls: 0 }));
    expect(basic.recipe.modules.find((m) => m.socket === 'helm')!.modules!.some((m) => m.module === 'control.helm-joystick')).toBe(true);
  });

  it('not on the tug (a displacement hull) or with outboards: they say why', () => {
    const tug = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, pods: 1 });
    expect(tug.recipe.modules.some((m) => m.module === 'propulsion.pods')).toBe(false);
    expect(tug.warnings.some((w) => /planing hull/.test(w))).toBe(true);
    const ob = buildDesign(pilot({ outboards: 1 }));
    expect(ob.recipe.modules.some((m) => m.module === 'propulsion.pods')).toBe(false);
  });

  it('are in the code (version 28); a code without them is the same boat on shafts', () => {
    const back = decodeDesign(encodeDesign(pilot()));
    expect('design' in back && back.design.pods).toBe(1);
    expect(encodeDesign(pilot({ pods: 0 }))).toBe(encodeDesign({ ...pilot(), pods: 0 }));
    const plain = decodeDesign(encodeDesign(pilot({ pods: 0 })));
    expect('design' in plain && plain.design.pods).toBe(0);
  });
});

describe('driving her on her pods', () => {
  /** The pilot boat on pods, started, then `orders` for `secs`: how far she went (her axes at the start) and turned. */
  const drive = (orders: [string, number][], secs: number) => {
    useDesign(pilot());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (c: string, x: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control: c, value: x } as Intent], 1 / 60);
    send('quickStart', 1);
    for (let i = 0; i < 360; i++) stepWorld(world, [], 1 / 60);
    const [x0, , z0] = v.position;
    for (const [c, x] of orders) send(c, x);
    let turned = 0;
    let last = headingDeg(v);
    for (let i = 0; i < secs * 60; i++) {
      stepWorld(world, [], 1 / 60);
      const h = headingDeg(v);
      turned += ((h - last + 540) % 360) - 180;
      last = h;
    }
    // Placed heading north, her bow toward -z, starboard +x.
    return { starboard: v.position[0] - x0, ahead: -(v.position[2] - z0), turned, v };
  };

  it('from the wheel and throttle: ahead, and the pods swing together to turn her', () => {
    const a = drive([['lever', 0.6]], 15);
    expect(a.ahead).toBeGreaterThan(50);
    const t = drive([['lever', 0.6], ['helm', 1]], 15);
    expect(t.turned).toBeGreaterThan(90); // to starboard
    const max = CONFIG.modules.pods.steering.maxAngleDeg;
    for (const p of t.v.pods!.angles) expect((p * 180) / Math.PI).toBeCloseTo(max, 3);
  });

  it('JOYSTICK, stick to starboard: she crabs to starboard, holding her head', () => {
    const r = drive([['pods.joystickMode', 1], ['joystick.x', 1]], 30);
    expect(r.starboard).toBeGreaterThan(8);
    expect(Math.abs(r.ahead)).toBeLessThan(1.5);
    expect(Math.abs(r.turned)).toBeLessThan(8);
    const l = drive([['pods.joystickMode', 1], ['joystick.x', -0.5]], 30);
    expect(l.starboard).toBeLessThan(-3);
  });

  it('stick forward and back: she creeps; let go, she stops pushing', () => {
    expect(drive([['pods.joystickMode', 1], ['joystick.y', 0.3]], 20).ahead).toBeGreaterThan(3);
    expect(drive([['pods.joystickMode', 1], ['joystick.y', -0.3]], 20).ahead).toBeLessThan(-3);
    const idle = drive([['pods.joystickMode', 1]], 20);
    expect(Math.hypot(idle.ahead, idle.starboard)).toBeLessThan(0.5);
  });

  it('twisted: she turns on the spot, clockwise to starboard', () => {
    const t = drive([['pods.joystickMode', 1], ['joystick.twist', 1]], 20);
    expect(t.turned).toBeGreaterThan(50);
    expect(Math.hypot(t.ahead, t.starboard)).toBeLessThan(3);
    expect(drive([['pods.joystickMode', 1], ['joystick.twist', -1]], 20).turned).toBeLessThan(-50);
  });

  it('moving the throttle out of neutral hands the pods back to the wheel', () => {
    const r = drive([['pods.joystickMode', 1], ['lever', 0.5]], 2);
    expect(r.v.controls.joyMode).toBe(0);
  });
});
