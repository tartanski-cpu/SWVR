import { describe, expect, it } from 'vitest';
import { IdFactory } from '../../src/core/ids';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { allKeys, applyBusIntent, busOf, BusWatcher, coerce, resolveKey, specOf, type BusValue } from '../../src/modular/bus';
import { placeVessel } from '../../src/vessel/vesselControl';
import { createVesselState } from '../../src/vessel/vesselState';

describe('bus key registry', () => {
  it('every key is documented, typed and sane', () => {
    const names = new Set<string>();
    for (const k of allKeys()) {
      const s = specOf(k);
      expect(s.doc.length, k).toBeGreaterThan(5);
      expect(/^[a-z][A-Za-z0-9]*(\.[a-z0-9][A-Za-z0-9]*)+$/.test(k), `${k}: '<system>.<thing>' in camelCase`).toBe(true);
      if (s.type === 'number') expect(s.unit, `${k} needs a unit`).toBeTruthy();
      if (s.range) expect(s.range[0], k).toBeLessThanOrEqual(s.range[1]);
      if (s.type === 'enum') expect(s.values?.length, k).toBeGreaterThan(0);
      // Its default fits its own type and range.
      expect(coerce(s, s.default), `${k} default`).toEqual(s.default);
      // Only intent keys are held or followed.
      if (s.hold || s.followedBy) expect(s.kind, k).toBe('intent');
      for (const n of [k, ...(s.aliases ?? [])]) {
        expect(names.has(n), `'${n}' is used twice`).toBe(false);
        names.add(n);
      }
    }
    // Names and aliases all resolve back to their key.
    for (const k of allKeys()) for (const a of specOf(k).aliases ?? []) expect(resolveKey(a)).toBe(k);
    expect(resolveKey('no.such.key')).toBeNull();
  });

  it('saves only hull damage and engine wear (owner: as today)', () => {
    expect(allKeys().filter((k) => specOf(k).persist).sort()).toEqual(['hull.damage', 'propulsion.wear']);
  });

  it('every key reads the same value as today\'s field, and writable keys write it back', () => {
    const s = createVesselState('v', 'workboat');
    const bus = busOf(s);
    // A value different from the current one, inside the key's limits.
    const other = (k: (typeof keys)[number]): BusValue => {
      const spec = specOf(k);
      const now = bus.get(k);
      if (spec.type === 'boolean') return !now;
      if (spec.type === 'enum') return spec.values!.find((x) => x !== now)!;
      const [lo, hi] = spec.range ?? [-10, 10];
      return now === hi ? lo : hi;
    };
    const keys = allKeys().filter((k) => specOf(k).bind.set && !specOf(k).press);
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) {
      const v = other(k);
      bus.set(k, v);
      expect(bus.get(k), k).toEqual(v);
    }
    // The values landed in today's fields.
    expect(s.controls.lever).toBe(1);
    expect(s.engine.key).toBe(1);
    expect(s.electrics!.breakers.radio).toBe(0);
  });

  it('a press key does its thing once and reads its default: TUNE steps the station', () => {
    const s = createVesselState('v', 'workboat');
    const bus = busOf(s);
    bus.set('fm.tune', true); // off: switches the set on, on the same station
    expect([s.controls.fmOn, s.controls.fmStation]).toEqual([1, 0]);
    bus.set('fm.tune', true);
    expect(s.controls.fmStation).toBe(1);
    expect(bus.get('fm.tune')).toBe(false);
  });

  it('derived keys follow the boat: heading, speed, circuits', () => {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    world.geography = 'openSea';
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, -300, 90);
    stepWorld(world, [], 1 / 60);
    const bus = busOf(v);
    expect(bus.num('nav.heading')).toBeCloseTo(90, 3);
    placeVessel(v, 0, 0, -300, 270);
    expect(bus.num('nav.heading')).toBeCloseTo(270, 3);
    v.linearVelocity = [0, 0, -5 * 0.514444];
    expect(bus.num('nav.speedKts')).toBeCloseTo(5, 6);
    expect(bus.get('circuit.radio.live')).toBe(true);
    v.electrics!.breakers.radio = 0;
    expect(bus.get('circuit.radio.live')).toBe(false);
    expect(bus.get('circuit.instruments.live')).toBe(true);
    v.electrics!.master = 0;
    expect(bus.get('circuit.instruments.live')).toBe(false);
    expect(bus.num('rudder.angle')).toBe(0);
  });

  it("a boat without electrics doesn't carry them: defaults, and writes are ignored", () => {
    const skiff = createVesselState('s', 'skiff');
    const bus = busOf(skiff);
    expect(bus.has('electrical.master')).toBe(false);
    expect(bus.get('electrical.master')).toBe(true); // default: no modelled electrics count as powered
    bus.set('electrical.master', false);
    expect(skiff.electrics).toBeUndefined();
    expect(bus.has('outboard.battery')).toBe(true);
    expect(bus.has('throttle.demand')).toBe(true);
  });
});

describe('player intents through the bus', () => {
  it('clamped to the range, rounded where whole, aliases accepted', () => {
    const s = createVesselState('v', 'workboat');
    expect(applyBusIntent(s, 'throttle.demand', 1.7, 'p1')).toBe(true);
    expect(s.controls.lever).toBe(1);
    expect(applyBusIntent(s, 'lever', -0.4, 'p1')).toBe(true); // the old channel name
    expect(s.controls.lever).toBe(-0.4);
    applyBusIntent(s, 'outboard.gear', 0.7, 'p1');
    expect(s.controls.obGear).toBe(1);
    applyBusIntent(s, 'lights.cabin', 5, 'p1');
    expect(s.controls.cabinLight).toBe(2);
    applyBusIntent(s, 'brk_radio', 0, 'p1');
    expect(s.electrics!.breakers.radio).toBe(0);
  });

  it('refused: state keys, unknown keys, junk values', () => {
    const s = createVesselState('v', 'workboat');
    expect(applyBusIntent(s, 'propulsion.rpm', 1500, 'p1')).toBe(false);
    expect(s.engine.rpm).toBe(0);
    expect(applyBusIntent(s, 'no.such', 1, 'p1')).toBe(false);
    expect(applyBusIntent(s, 'throttle.demand', NaN, 'p1')).toBe(false);
    expect(applyBusIntent(s, 'throttle.demand', 'full' as unknown as number, 'p1')).toBe(false);
    expect(s.controls.lever).toBe(0);
  });

  it('a held control answers only to the hand on it (multiplayer)', () => {
    const s = createVesselState('v', 'workboat');
    s.holds.lever = 'p1';
    expect(applyBusIntent(s, 'throttle.demand', 0.5, 'p2')).toBe(false);
    expect(applyBusIntent(s, 'throttle.demand', 0.5, 'p1')).toBe(true);
    // The searchlight joystick's hold covers both its axes.
    s.holds.spotPan = 'p1';
    expect(applyBusIntent(s, 'searchlight.tilt', 5, 'p2')).toBe(false);
    expect(applyBusIntent(s, 'searchlight.tilt', 5, 'p1')).toBe(true);
    // Switches aren't held.
    expect(applyBusIntent(s, 'lights.nav', 1, 'p2')).toBe(true);
  });
});

describe('BusWatcher', () => {
  it('says when something it watches has changed by a visible amount', () => {
    const s = createVesselState('v', 'workboat');
    const bus = busOf(s);
    const w = new BusWatcher(['propulsion.rpm', 'lights.nav'], { 'propulsion.rpm': 10 });
    expect(w.changed(bus)).toBe(true); // first look
    expect(w.changed(bus)).toBe(false);
    s.engine.rpm = 3; // rounds to the same 10 rpm
    expect(w.changed(bus)).toBe(false);
    s.engine.rpm = 12;
    expect(w.changed(bus)).toBe(true);
    s.controls.navLights = 1;
    expect(w.changed(bus)).toBe(true);
    expect(w.changed(bus)).toBe(false);
  });
});
