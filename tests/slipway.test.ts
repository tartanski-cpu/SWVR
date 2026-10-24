/**
 * Landing slipways (owner, Oct 2026): a bow-ramp boat comes in bow first with her ramp down,
 * is drawn up onto the slip and held there (no waves), her ramp's toe flaps on the concrete;
 * going astern takes her off.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { cargoPortAt } from '../src/cargo/cargo';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { SLIPWAYS, type SlipwayDef } from '../src/world/archipelago';
import { blockTop } from '../src/world/geography';
import { landedPose, rampCrossing, rampFloor, rampLine } from '../src/world/slipway';
import { groundHeight, slipSurface } from '../src/world/terrain';

const DT = 1 / 60;
const up = (s: SlipwayDef) => ({ x: Math.sin((s.headingDeg * Math.PI) / 180), z: -Math.cos((s.headingDeg * Math.PI) / 180) });
/** A point `down` m down the slip's centreline. */
const onSlip = (s: SlipwayDef, down: number, across = 0) => {
  const u = up(s);
  return { x: s.x - u.x * down + u.z * across, z: s.z - u.z * down - u.x * across };
};
const surface = (s: SlipwayDef, down: number) => s.top - s.slope * down;

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('the slipways', () => {
  it('are in the ground: a concrete plane down into the water, clear of the quays, deep water off the toe', () => {
    for (const s of SLIPWAYS) {
      for (const down of [0.5, s.length / 2, s.length - 0.5])
        for (const across of [-s.width / 2 + 0.3, 0, s.width / 2 - 0.3]) {
          const p = onSlip(s, down, across);
          expect(groundHeight(p.x, p.z), `${s.id} ${down}`).toBeCloseTo(surface(s, down), 6);
          expect(slipSurface(p.x, p.z)?.id).toBe(s.id);
          expect(blockTop(p.x, p.z)).toBeNull();
        }
      // From above the water to well under it; off its toe, water for a boat to come in on.
      expect(s.top).toBeGreaterThan(1);
      expect(surface(s, s.length)).toBeLessThan(-1.2);
      const off = onSlip(s, s.length + 6);
      expect(groundHeight(off.x, off.z), s.id).toBeLessThan(-2);
    }
  });
});

// Room for the long runs: about twice as slow on GitHub's publishing machine, past the 20 s default.
describe('landing on a slipway', { timeout: 60000 }, () => {
  it('the landing craft lies landed level at her waterline, her bottom just on the slip, her flaps resting on it above the water', () => {
    const def = VESSEL_DEFS.landingCraft;
    for (const s of SLIPWAYS) {
      const p = landedPose(def, s);
      let nearest = Infinity;
      for (const st of def.hull.stations) {
        const keel = Math.min(...st.polygon.map((q) => q[1]));
        const gap = keel - surface(s, p.down + st.z);
        expect(gap, `${s.id} station ${st.z}`).toBeGreaterThan(-1e-6);
        nearest = Math.min(nearest, gap);
      }
      expect(nearest).toBeLessThan(0.01);
      expect(p.position[1]).toBe(0);
      const r = rampLine(def, p.flapDeg)!;
      expect(p.flapDeg).toBeGreaterThan(10);
      expect(p.flapDeg).toBeLessThan(80);
      expect(r.tip.y).toBeCloseTo(surface(s, p.down + r.tip.z), 2);
      expect(r.tip.y).toBeGreaterThan(0); // you step off dry
      // Her stern is still over the slip, afloat.
      expect(p.down + def.hull.stations[0].z).toBeLessThan(s.length);
    }
  });

  it('a Shipyard landing craft lands too: her landing bow rides up the slip as the landing craft\'s does, her flaps on it above the water', () => {
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0 });
    const def = VESSEL_DEFS.design;
    expect(def.layout.bowRamp?.flap.length).toBe(CONFIG.vessels.landingCraft.layout.bowRamp.flap.length);
    const s = SLIPWAYS[0];
    const p = landedPose(def, s);
    for (const st of def.hull.stations) expect(Math.min(...st.polygon.map((q) => q[1])) - surface(s, p.down + st.z)).toBeGreaterThan(-1e-6);
    const r = rampLine(def, p.flapDeg)!;
    expect(p.flapDeg).toBeLessThan(80);
    expect(r.tip.y).toBeCloseTo(surface(s, p.down + r.tip.z), 2);
    expect(r.tip.y).toBeGreaterThan(0);
    // Her bow is her own landing bow, whatever the bow choice says (none for her).
    const keelAt = () => Math.min(...[...def.hull.stations].sort((a, b) => a.z - b.z)[0].polygon.map((q) => q[1]));
    const k0 = keelAt();
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, bow: 0 });
    expect(keelAt()).toBeCloseTo(k0, 6);
    expect(keelAt()).toBeGreaterThan(0); // the forefoot at the waterline: not a plumb stem to full depth
  });

  function approach(defId: string, rampDown: boolean) {
    const { world, vesselId } = createWorld(new IdFactory(), defId);
    const v = world.vessels[vesselId];
    const s = SLIPWAYS[0];
    const to = landedPose(VESSEL_DEFS[defId], s);
    // 14 m out, on the slip's line, bow up it.
    const u = up(s);
    placeVessel(v, to.position[0] - u.x * 14, 0, to.position[2] - u.z * 14, s.headingDeg);
    const send = (control: string, value: number, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
    send('quickStart', 1);
    if (rampDown) send('bowRamp', 1);
    const run = (sec: number, each?: () => void) => {
      for (let i = 0; i < sec / DT; i++) {
        stepWorld(world, [], DT);
        each?.();
      }
    };
    return { world, v, s, to, send, run };
  }

  it('coming in slowly bow first with her ramp down: drawn up onto the slip and held there, the waves no longer moving her; in port', () => {
    const { world, v, s, to, send, run } = approach('landingCraft', true);
    expect(world.environment.waves.length).toBeGreaterThan(0);
    run(4);
    send('lever', 0.12);
    run(90, () => {
      if (v.slip) v.controls.lever = 0;
    });
    expect(v.slip?.phase).toBe('landed');
    expect(v.slip?.id).toBe(s.id);
    // Held: exactly where she lies landed, still, for half a minute of swell.
    run(30);
    expect(v.position).toEqual(to.position);
    expect(v.orientation[0]).toBeCloseTo(to.orientation[0], 9);
    expect(v.linearVelocity).toEqual([0, 0, 0]);
    expect(v.angularVelocity).toEqual([0, 0, 0]);
    expect(cargoPortAt(v)?.id).toBe(s.portId);
    // Her engine runs on as usual.
    expect(v.engine.phase).toBe('running');
  });

  it('astern takes her off: she backs away down the slip', () => {
    const { world, v, to, send, run } = approach('landingCraft', true);
    send('slipDebugLand', 1);
    expect(v.slip?.phase).toBe('landed');
    run(3);
    send('lever', -0.5);
    run(15);
    expect(v.slip).toBeUndefined();
    expect(Math.hypot(v.position[0] - to.position[0], v.position[2] - to.position[2])).toBeGreaterThan(2);
    void world;
  });

  it("with her ramp up she doesn't land (she just touches the slip); the workboat, with no ramp, never does", () => {
    const a = approach('landingCraft', false);
    a.run(4);
    a.send('lever', 0.12);
    a.run(60);
    expect(a.v.slip).toBeUndefined();
    const b = approach('workboat', false);
    b.send('bowRamp', 1);
    b.run(4);
    b.send('lever', 0.12);
    b.run(60);
    expect(b.v.slip).toBeUndefined();
    b.send('slipDebugLand', 1);
    expect(b.v.slip).toBeUndefined();
  });

  it('moved anywhere (a debug move, a teleport) she is off the slip', () => {
    const { v, send } = approach('landingCraft', true);
    send('slipDebugLand', 1);
    expect(v.slip).toBeDefined();
    placeVessel(v, 0, 0, 0, 0);
    expect(v.slip).toBeUndefined();
  });
});

describe('walking off down the ramp', { timeout: 60000 }, () => {
  it('the ramp floor runs from her bow deck down to the flaps\' tips; the crossing is at the tips, ashore below aboard', () => {
    const def = VESSEL_DEFS.landingCraft;
    const p = landedPose(def, SLIPWAYS[0]);
    const r = rampLine(def, p.flapDeg)!;
    expect(rampFloor(def, p.flapDeg, 0, r.hinge.z)).toBeCloseTo(r.hinge.y, 6);
    expect(rampFloor(def, p.flapDeg, 0, r.lip.z)).toBeCloseTo(r.lip.y, 6);
    expect(rampFloor(def, p.flapDeg, 0, r.tip.z)).toBeCloseTo(r.tip.y, 6);
    // Downhill all the way; nothing beyond the tips or out past the ramp's sides.
    let last = Infinity;
    for (let z = r.hinge.z; z >= r.tip.z; z -= 0.05) {
      const f = rampFloor(def, p.flapDeg, 0, z)!;
      expect(f).toBeLessThanOrEqual(last + 1e-9);
      last = f;
    }
    expect(rampFloor(def, p.flapDeg, 0, r.tip.z - 0.1)).toBeNull();
    expect(rampFloor(def, p.flapDeg, r.halfWidth, r.lip.z)).toBeNull();
    const c = rampCrossing(def, p.flapDeg)!;
    expect(c.ashoreZ).toBeLessThan(c.aboardZ);
    expect(c.ashoreZ).toBeGreaterThan(r.tip.z);
    expect(c.aboardZ).toBeLessThan(r.lip.z);
  });
});
