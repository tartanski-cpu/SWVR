/**
 * Twin engines worked separately (owner, Oct 2026: "a twin engine control ... grab the left or
 * the right engine control independently ... super easy to grab both", and a START for each):
 * the diesel's `twin.split` (modules/dieselInboard), the twin lever control
 * (modules/twinThrottle), fitted by the Shipyard to twin shaft engines.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { useDesign } from '../src/boats/sims';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { compassHeading } from '../src/vessel/autopilot';
import { placeVessel } from '../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const CAT = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
const cat = (): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[CAT].defaults, hull: CAT });

function boat(d: ShipDesign) {
  useDesign(d);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  /** Master, breakers and the key on, the plugs given time to preheat. */
  const keyOn = () => {
    send('electrical.master', 1);
    for (const b of ['instruments', 'chart', 'radio', 'navLights', 'hydraulics']) send(`breaker.${b}`, 1);
    send('ignition.key', 1);
    run(8);
  };
  /** Hold a START (its key) until she catches. */
  const start = (key: string) => {
    send(key, 1);
    run(6);
    send(key, 0);
    run(1);
  };
  return { world, v, send, run, keyOn, start };
}

describe('twin engines worked separately', { timeout: 120000 }, () => {
  it('the Shipyard fits the catamaran (twin shafts) with the twin lever control and a START each; pods, stern drives and single engines keep one lever', () => {
    const b = buildDesign(cat());
    const engine = b.recipe.modules.find((m) => m.module === 'propulsion.diesel-inboard')!;
    expect(engine.config).toMatchObject({ twin: { split: true } });
    const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
    expect(helm.modules!.find((m) => m.socket === 'throttle')!.module).toBe('control.twin-throttle');
    const starts = helm.modules!.filter((m) => m.socket === 'start' || m.socket === 'start2');
    expect(starts.map((m) => m.bind)).toEqual([{ press: 'ignition.start' }, { press: 'ignition.start2' }]);
    expect(starts.map((m) => (m.config as { engrave: string }).engrave)).toEqual(['START P', 'START S']);
    // One engine: the single lever, one START.
    const single = buildDesign({ ...DEFAULT_DESIGN, controls: 1 }).recipe.modules.find((m) => m.socket === 'helm')!;
    expect(single.modules!.find((m) => m.socket === 'throttle')!.module).toBe('control.throttle-lever');
    expect(single.modules!.some((m) => m.socket === 'start2')).toBe(false);
    // Every fleet boat builds (the pilot boat's twin shafts get it too).
    for (const f of FLEET) expect(() => buildDesign(f.design), f.id).not.toThrow();
  });

  it('a START each: one engine runs alone; the other starts on its own button', () => {
    const { v, keyOn, start } = boat(cat());
    keyOn();
    start('ignition.start');
    expect(v.engine.phase).toBe('running');
    expect(v.engine.stbd!.phase).toBe('off');
    start('ignition.start2');
    expect(v.engine.stbd!.phase).toBe('running');
  });

  it('a lever each: one ahead and one astern turns her round (far tighter than both ahead); both ahead, she goes straight', () => {
    const t = boat(cat());
    t.keyOn();
    t.start('ignition.start');
    t.start('ignition.start2');
    // Port ahead, starboard astern: she turns to starboard (clockwise), going nowhere much.
    t.send('throttle.demand', 0.5);
    t.send('throttle.demand2', -0.5);
    const h0 = compassHeading(t.v);
    t.run(20);
    const turned = ((compassHeading(t.v) - h0 + 540) % 360) - 180;
    expect(turned).toBeGreaterThan(20);
    const split = Math.hypot(t.v.position[0], t.v.position[2]);
    expect(t.v.engine.gear).toBe(1);
    expect(t.v.engine.stbd!.gear).toBe(-1);
    // The keys' lever (the 'lever' intent) works both: together ahead, she runs straight.
    const s = boat(cat());
    s.keyOn();
    s.start('ignition.start');
    s.start('ignition.start2');
    s.send('lever', 0.6);
    const h1 = compassHeading(s.v);
    s.run(20);
    expect(s.v.controls.lever2).toBe(0.6); // (the keys' lever sets both, from the first press)
    expect(Math.abs(((compassHeading(s.v) - h1 + 540) % 360) - 180)).toBeLessThan(3);
    // (Split, she went a fraction as far: astern thrust is weaker than ahead, so she creeps ahead as she turns.)
    expect(split).toBeLessThan(0.5 * Math.hypot(s.v.position[0], s.v.position[2]));
    expect(s.v.engine.stbd!.rpm).toBeCloseTo(s.v.engine.rpm, 0);
  });

  it('the first move of the port lever works the port engine alone (owner, 29 Oct 2026: it moved both the first time)', () => {
    const t = boat(cat());
    t.keyOn();
    t.start('ignition.start');
    t.start('ignition.start2');
    expect(t.v.controls.lever2).toBeUndefined(); // (never touched)
    t.send('throttle.demand', 0.6);
    t.run(6);
    expect(t.v.engine.gear).toBe(1);
    expect(t.v.engine.stbd!.gear).toBe(0);
    expect(t.v.engine.stbd!.rpm).toBeLessThan(t.v.engine.rpm);
    // And then the starboard on its own.
    t.send('throttle.demand2', -0.4);
    t.run(4);
    expect(t.v.engine.stbd!.gear).toBe(-1);
    expect(t.v.engine.gear).toBe(1);
  });

  it('AUTO START (the quick start) starts both; the key off stops both', () => {
    const t = boat(cat());
    t.send('engineStartStop', 1);
    t.run(8);
    expect(t.v.engine.phase).toBe('running');
    expect(t.v.engine.stbd!.phase).toBe('running');
    t.send('ignition.key', 0);
    t.run(1);
    expect(t.v.engine.phase).toBe('off');
    expect(t.v.engine.stbd!.phase).toBe('off');
  });
});

describe('the twin lever control', () => {
  it('a knob works its own engine; the grip brings both together under the hand and moves them as one', async () => {
    const THREE = await import('three');
    const { TWIN_THROTTLE, TwinGrip } = await import('../src/modules/twinThrottle');
    const { Lever } = await import('../src/controls/Lever');
    const { CONFIG } = await import('../src/config');
    const c = { ...CONFIG.modules.throttleLever, ...CONFIG.modules.twinThrottle };
    const v = TWIN_THROTTLE.view!.build({ config: c, keys: { demand: 'throttle.demand', demand2: 'throttle.demand2' } } as never);
    const [port, stbd] = v.controls.filter((x): x is InstanceType<typeof Lever> => x instanceof Lever);
    const grip = v.controls.find((x): x is InstanceType<typeof TwinGrip> => x instanceof TwinGrip)!;
    const sent: Record<string, number> = {};
    for (const x of v.controls) x.bind({ emit: (ch, val) => void (sent[ch] = val), haptic: () => {} });
    const root = new THREE.Group();
    for (const x of v.controls) root.add(x.root);
    root.updateMatrixWorld(true);
    // Port knob pushed ahead alone.
    port.grabStart({ position: new THREE.Vector3(-0.08, 0.24, 0) });
    port.grabMove({ position: new THREE.Vector3(-0.08, 0.24, -0.12) });
    port.grabEnd({ position: new THREE.Vector3() });
    expect(sent['throttle.demand']).toBeGreaterThan(0.5);
    expect(sent['throttle.demand2']).toBeUndefined();
    // A hand by the grip (between the knobs) is nearer it than either lever; by a knob, nearer that lever.
    root.updateMatrixWorld(true);
    const mid = grip.grabPoint(new THREE.Vector3());
    expect(grip.distanceTo(mid)).toBeLessThan(port.distanceTo(mid));
    expect(grip.distanceTo(mid)).toBeLessThan(stbd.distanceTo(mid));
    const knob = port.grabPoint(new THREE.Vector3());
    expect(port.distanceTo(knob)).toBeLessThan(grip.distanceTo(knob));
    // A hand a little inboard of a knob, toward the grip, still takes that knob (owner, 29 Oct 2026:
    // the grip's grab area was too big); only a hand well in the middle takes the grip.
    const gap = mid.clone().sub(knob);
    for (const f of [0.25, 0.45]) {
      const at = knob.clone().addScaledVector(gap, f);
      expect(port.distanceTo(at)).toBeLessThan(grip.distanceTo(at));
    }
    // The grip: both to halfway between them, then both together.
    grip.grabStart({ position: mid.clone() });
    expect(sent['throttle.demand2']).toBeCloseTo(sent['throttle.demand'], 6);
    grip.grabMove({ position: mid.clone().add(new THREE.Vector3(0, 0, 0.15)) });
    grip.grabEnd({ position: new THREE.Vector3() });
    expect(sent['throttle.demand']).toBeLessThan(-0.3);
    expect(sent['throttle.demand2']).toBeCloseTo(sent['throttle.demand'], 6);
  });
});

describe('twin stern drives worked separately', { timeout: 120000 }, () => {
  const sd = (): ShipDesign => ({ ...DEFAULT_DESIGN, controls: 1, sternDrive: 1, twin: 1 });
  it('the Shipyard fits them the twin lever control (each leg its own engine); twin outboards keep one lever', () => {
    const b = buildDesign(sd());
    const legs = b.recipe.modules.find((m) => m.module === 'propulsion.outboard')!;
    expect((legs.config as { units: number[] }).units).toHaveLength(2);
    expect(legs.config).toMatchObject({ sterndrive: true, split: true });
    const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
    expect(helm.modules!.find((m) => m.socket === 'throttle')!.module).toBe('control.twin-throttle');
    expect(helm.modules!.some((m) => m.socket === 'start2')).toBe(true);
    const ob = buildDesign({ ...DEFAULT_DESIGN, controls: 1, outboards: 2 }).recipe.modules.find((m) => m.socket === 'helm')!;
    expect(ob.modules!.find((m) => m.socket === 'throttle')!.module).toBe('control.throttle-lever');
  });

  it('a START each, and one leg ahead with the other astern turns her round', () => {
    const t = boat(sd());
    t.keyOn();
    t.start('ignition.start');
    expect(t.v.engine.phase).toBe('running');
    expect(t.v.engine.stbd!.phase).toBe('off');
    t.start('ignition.start2');
    expect(t.v.engine.stbd!.phase).toBe('running');
    t.send('throttle.demand', -0.5);
    t.send('throttle.demand2', 0.5);
    const h0 = compassHeading(t.v);
    // (A small light boat: she spins fast, so a short look before the heading wraps round.)
    t.run(4);
    // Port astern, starboard ahead: she turns to port.
    expect(((compassHeading(t.v) - h0 + 540) % 360) - 180).toBeLessThan(-20);
  });
});

describe('a diesel dragged below idle in gear stalls (owner, Oct 2026)', { timeout: 120000 }, () => {
  it('a gearbox far too high for her propeller: in gear she stalls and stops, not "running" at 0 rpm with the battery running flat; in neutral she starts again', () => {
    // The stern trawler's slow diesel on its 1.9 m propeller through the lowest gearbox step
    // (not matched): the propeller wants many times the torque the engine has.
    const H = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
    const t = boat({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[H].defaults, hull: H, controls: 1, twin: 1, gear: 0 });
    t.keyOn();
    t.start('ignition.start');
    t.start('ignition.start2');
    expect(t.v.engine.phase).toBe('running');
    t.send('throttle.demand2', 0.6);
    t.run(4);
    expect(t.v.engine.stbd!.phase).toBe('off');
    expect(t.v.engine.phase).toBe('running');
    // Back in neutral, START S: she runs again.
    t.send('throttle.demand2', 0);
    t.start('ignition.start2');
    expect(t.v.engine.stbd!.phase).toBe('running');
  });
});
