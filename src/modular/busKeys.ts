/**
 * THE bus key registry (docs/MODULAR_BOATS.md 3.1): every named value a boat carries, in
 * one place, with its type, unit, range and who writes it.
 *
 * Naming: '<system>.<thing>' in camelCase, generic rather than per-boat ('propulsion.rpm',
 * not 'workboatEngine.rpm'), so one rev counter works on any boat. A boat with two of
 * something binds the second to its own key in her recipe (module ports, 2.4).
 *
 * First pass (M1): every field of today's VesselState that a control, a display or another
 * system reads. Each entry is bound to that field (the facade; see bus.ts), and is marked
 * writer 'legacy' until the module that owns it is converted. Renaming a key: add the old
 * name to `aliases`, never delete it (saves and recipes may use it).
 */
import { bridgeHasControl } from '../plant/plant';
import { CONFIG } from '../config';
import { hydraulicsOn, isPowered } from '../vessel/electrics';
import { leverDemand, preheatNeeded } from '../vessel/physics/propulsion';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { gearOf } from '../boats/sims';
import { engageAutopilot, nudgeAutopilot, quickStart } from '../vessel/autopilot';
import { toggleDock } from '../vessel/physics/mooring';
import { BREAKERS, type BreakerName, type VesselControls, type VesselState } from '../vessel/vesselState';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { BusKeySpec, BusValue } from './bus';

const RAD = 180 / Math.PI;
const KNOT = 0.514444;

/** A two-position switch or button in `controls` (0 / 1 there; a boolean on the bus). */
function control(field: keyof VesselControls, doc: string, extra: Partial<BusKeySpec> = {}): BusKeySpec {
  return {
    type: 'boolean',
    kind: 'intent',
    writer: 'legacy',
    default: false,
    doc,
    bind: {
      get: (s) => (s.controls[field] ?? 0) > 0.5,
      set: (s, v) => {
        s.controls[field] = v ? 1 : 0;
      },
    },
    ...extra,
  };
}

/** A numeric control setting in `controls` (a lever, a pan angle, a 3-way switch). */
function setting(field: keyof VesselControls, range: readonly [number, number], unit: string, doc: string, extra: Partial<BusKeySpec> = {}): BusKeySpec {
  return {
    type: 'number',
    unit,
    range,
    kind: 'intent',
    writer: 'legacy',
    default: 0,
    doc,
    bind: {
      get: (s) => s.controls[field] ?? 0,
      set: (s, v) => {
        s.controls[field] = v as number;
      },
    },
    ...extra,
  };
}

/** Simulation output: a value computed by today's code (read only on the bus). */
function state(type: BusKeySpec['type'], get: (s: VesselState) => BusValue | undefined, doc: string, extra: Partial<BusKeySpec> = {}): BusKeySpec {
  return {
    type,
    kind: 'state',
    writer: 'legacy',
    default: type === 'boolean' ? false : type === 'enum' ? (extra.values?.[0] ?? '') : 0,
    doc,
    bind: { get },
    ...extra,
  };
}

/**
 * A value a module keeps (modular boats M4a): read like a state key, and written by the
 * module through its port (never by a player).
 */
function kept(type: BusKeySpec['type'], get: (s: VesselState) => BusValue | undefined, set: (s: VesselState, v: BusValue) => void, doc: string, extra: Partial<BusKeySpec> = {}): BusKeySpec {
  return { ...state(type, get, doc, extra), writer: 'module', bind: { get, set } };
}

/** One way of the pod drives' helm joystick (-1..1 in `controls`): only on a boat with pods (VesselState.pods). */
function podStick(field: 'joyX' | 'joyY' | 'joyR', doc: string): BusKeySpec {
  const spec = setting(field, [-1, 1], '-1..1', doc, { hold: 'joyX' });
  return { ...spec, bind: { ...spec.bind!, get: (s) => (s.pods ? (s.controls[field] ?? 0) : undefined) } };
}

/** A press: setting it true does `act` once; it always reads false (see BusKeySpec.press). */
function press(doc: string, aliases: string[], act: (s: VesselState) => void): BusKeySpec {
  return {
    type: 'boolean',
    kind: 'intent',
    writer: 'legacy',
    default: false,
    doc,
    press: true,
    aliases,
    bind: {
      get: () => false,
      set: (s, v) => {
        if (v) act(s);
      },
    },
  };
}

/** The breaker switches on the panel by the helm. */
function breakerKeys(): Record<`breaker.${BreakerName}`, BusKeySpec> {
  const out = {} as Record<`breaker.${BreakerName}`, BusKeySpec>;
  for (const b of BREAKERS) {
    out[`breaker.${b}`] = {
      type: 'boolean',
      kind: 'intent',
      writer: 'legacy',
      default: true,
      doc: `The ${b} breaker on the panel by the helm (on / off).`,
      aliases: [`brk_${b}`],
      bind: {
        get: (s) => (s.electrics ? s.electrics.breakers[b] > 0 : undefined),
        set: (s, v) => {
          if (s.electrics) s.electrics.breakers[b] = v ? 1 : 0;
        },
      },
    };
  }
  return out;
}

/** Is each circuit live: master on, a battery not flat, and its breaker on. */
function circuitKeys(): Record<`circuit.${BreakerName}.live`, BusKeySpec> {
  const out = {} as Record<`circuit.${BreakerName}.live`, BusKeySpec>;
  for (const b of BREAKERS) {
    out[`circuit.${b}.live`] = state('boolean', (s) => isPowered(s, b), `12 V on the ${b} circuit: master on, battery not flat, breaker on.`, { default: true, writer: 'core' });
  }
  return out;
}

/**
 * The engine panel's warning lamps (modular boats M3), as today's WarningLamps lit them:
 * each is off, on, or blinking. The lamp module only draws what the key says; WHEN a lamp
 * lights stays here (today's rules). Undefined on a boat without an inboard diesel. All need 12 V on the Instruments circuit, except
 * GLOW, which is wired with the glow plugs (12 V on the master). OIL and CHARGE are fed
 * through the key, as on most engine panels: they light when the key goes on.
 */
type Lamp = 'off' | 'on' | 'blink';
const LAMP = ['off', 'on', 'blink'] as const;
function lamp(s: VesselState, which: 'oil' | 'charge' | 'glow' | 'neutral' | 'bilge' | 'hull' | 'engine' | 'temp' | 'fuel' | 'ready' | 'batt' | 'shore'): Lamp | undefined {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return undefined;
  const instr = isPowered(s, 'instruments');
  const e = s.engine;
  const running = e.phase === 'running';
  // (READY, BATT and SHORE are an electric boat's only.)
  if ((which === 'ready' || which === 'batt' || which === 'shore') && !diesel.electric) return undefined;
  switch (which) {
    case 'oil':
      // No oil pressure stopped; blinks running with the sump nearly dry.
      return !instr || e.key <= 0 ? 'off' : !running ? 'on' : (e.oil ?? 1) < diesel.maintenance.lampAt ? 'blink' : 'off';
    case 'charge':
      return instr && e.key > 0 && !running ? 'on' : 'off';
    case 'glow':
      // Lit while the glow plugs preheat: from the key going on until they're hot enough.
      return isPowered(s) && e.key > 0 && !running && e.glow < preheatNeeded(s, diesel) ? 'on' : 'off';
    case 'neutral':
      // On in neutral (the start interlock); blinks while START is held in gear.
      return !instr ? 'off' : leverDemand(diesel, s.controls.lever).gear === 0 ? 'on' : s.controls.start > 0 ? 'blink' : 'off';
    case 'bilge':
      return instr && (s.bilge ?? 0) >= (gearOf(s, 'bilgePump')?.alarmAt ?? 1) ? 'blink' : 'off';
    case 'hull': {
      // Her condition (wear.ts): on once worth a repair (the duty board's line), blinking when bad.
      const d = s.damage ?? 0;
      return !instr || d <= CONFIG.duties.damageAt ? 'off' : d > CONFIG.wear.badAt ? 'blink' : 'on';
    }
    case 'engine': {
      const w = e.wear ?? 0;
      return !instr || w <= CONFIG.duties.wearAt ? 'off' : w > CONFIG.wear.badAt ? 'blink' : 'on';
    }
    // Every tier's warnings (owner, Oct 2026: "some kind of warning light should be in all the
    // packages"): the coolant over its alarm (blinking: stop her), the fuel under its low mark.
    // Before, only the advanced engine monitor showed these two alarms.
    case 'temp':
      return instr && engineAlarms(s, diesel).highTemp ? 'blink' : 'off';
    case 'fuel':
      return instr && engineAlarms(s, diesel).lowFuel ? 'on' : 'off';
    // An electric boat's (owner, 28 Oct 2026): her drive live (the key on, 12 V, charge in her
    // battery), her battery low (blinking nearly flat), plugged in at the quay.
    case 'ready':
      return instr && running ? 'on' : 'off';
    case 'batt':
      return !instr || !engineAlarms(s, diesel).lowFuel ? 'off' : (s.battery ?? 0) < CONFIG.modules.warningLamps.battFlat ? 'blink' : 'on';
    case 'shore':
      return instr && s.shore ? 'on' : 'off';
  }
}

/** Compass heading of the bow (deg, 0 = north = -Z, 90 = east), from the orientation. */
function heading(s: VesselState): number {
  const [x, y, z, w] = s.orientation;
  const fx = -2 * (x * z + w * y);
  const fz = -(1 - 2 * (x * x + y * y));
  const h = Math.atan2(fx, -fz) * RAD;
  return h < 0 ? h + 360 : h;
}

const spot = CONFIG.vessels.workboat.spotlight;
const crane = CONFIG.modules.deckCrane;

/** Does she carry a deck crane (its state is kept with her: VesselState.modules)? */
const hasCrane = (s: VesselState) => !!s.modules && Object.values(s.modules).some((e) => e.id === 'deck.crane');

/**
 * A deck crane key: there only on a boat with a crane. `unset`: a setting's value before its
 * joystick is first touched (the crane's stowed angle, not 0).
 */
function craneKey(spec: BusKeySpec, unset?: { field: keyof VesselControls; value: number }): BusKeySpec {
  const get = spec.bind.get;
  return {
    ...spec,
    bind: {
      ...spec.bind,
      get: (s) => (!hasCrane(s) ? undefined : unset ? (s.controls[unset.field] ?? unset.value) : get(s)),
    },
  };
}
/** A dive A-frame key (modules/diveFrame): there only on a boat with one. */
const hasDiveFrame = (s: VesselState) => !!s.modules && Object.values(s.modules).some((e) => e.id === 'deck.dive-frame');
function diveKey(spec: BusKeySpec): BusKeySpec {
  const get = spec.bind.get;
  return { ...spec, bind: { ...spec.bind, get: (s) => (hasDiveFrame(s) ? get(s) : undefined) } };
}
/** An azimuth drives key (modules/dieselInboard `azimuth`): there only on a boat with them. */
/** A key only a boat with hydrofoils has (VesselDef.foils). */
function foilKey(spec: BusKeySpec): BusKeySpec {
  const get = spec.bind.get;
  return { ...spec, bind: { ...spec.bind, get: (s) => (VESSEL_DEFS[s.defId]?.foils ? get(s) : undefined) } };
}
function aziKey(spec: BusKeySpec): BusKeySpec {
  const get = spec.bind.get;
  return { ...spec, bind: { ...spec.bind, get: (s) => (gearOf(s, 'diesel')?.azimuth ? get(s) : undefined) } };
}
const mon = CONFIG.vessels.workboat.fireMonitor;

export const BUS_KEYS = {
  // ── Helm and propulsion controls ──
  'throttle.demand': setting('lever', [-1, 1], '-1..1', 'Throttle / gear lever: -1 full astern, 0 neutral, +1 full ahead. On an outboard boat, the twist-grip throttle 0..1 in the selected gear.', {
    hold: 'lever',
    aliases: ['lever'],
    // Modular boats M2: the throttle-lever module writes it (debug keys, menus and old
    // tests still send 'lever').
    writer: 'module',
  }),
  // Twin engines worked separately (the twin lever control; owner, Oct 2026): the starboard
  // engine's lever and START. Only on such a boat; its lever reads as the port one's until moved.
  'throttle.demand2': {
    ...setting('lever2', [-1, 1], '-1..1', 'Twin engines worked separately: the starboard engine\'s throttle / gear lever (throttle.demand is then the port engine\'s). Reads as the port lever until it is moved.', { hold: 'lever2', writer: 'module' }),
    bind: {
      get: (s) => (gearOf(s, 'diesel')?.split ? (s.controls.lever2 ?? s.controls.lever) : undefined),
      set: (s, v) => {
        s.controls.lever2 = v as number;
      },
    },
  },
  'ignition.start2': {
    ...control('start2', 'Twin engines worked separately: the starboard engine\'s START held (ignition.start is then the port engine\'s).'),
    bind: {
      get: (s) => (gearOf(s, 'diesel')?.split ? (s.controls.start2 ?? 0) > 0.5 : undefined),
      set: (s, v) => {
        s.controls.start2 = v ? 1 : 0;
      },
    },
  },
  // Azimuth drives (modules/dieselInboard `azimuth`; owner, Oct 2026: the harbour tug's ASD
  // levers): each lever's direction, and TRANSIT. Only on such a boat. (Each lever's power is
  // throttle.demand / throttle.demand2.)
  'azimuth.demand': aziKey(setting('aziAngle', [-180, 180], 'deg', 'Azimuth drives: the way the port drive\'s lever points, the direction it asks the drive to push (0 ahead, + to starboard, +-180 astern). Its power is throttle.demand.', { hold: 'lever', writer: 'module' })),
  'azimuth.demand2': aziKey(setting('aziAngle2', [-180, 180], 'deg', 'Azimuth drives: the way the starboard drive\'s lever points (as azimuth.demand). Its power is throttle.demand2.', { hold: 'lever2', writer: 'module' })),
  'azimuth.transit': aziKey(control('aziTransit', 'Azimuth drives: TRANSIT on. The wheel swings both drives together as rudders (the autopilot can steer her); each lever then sets only its engine\'s power, ahead while it\'s turned into its forward half, astern into its after half.', { writer: 'module' })),
  'azimuth.angle': state('number', (s) => (s.engine.azimuth === undefined ? undefined : (s.engine.azimuth * 180) / Math.PI), 'Azimuth drives: where the port drive points, the way it pushes (0 ahead, + to starboard), following its lever at its steering rate.', { unit: 'deg', writer: 'module' }),
  'azimuth.angle2': state('number', (s) => (s.engine.stbd?.azimuth === undefined ? undefined : (s.engine.stbd.azimuth * 180) / Math.PI), 'Azimuth drives: where the starboard drive points (as azimuth.angle).', { unit: 'deg', writer: 'module' }),
  // Hydrofoils (vessel/physics/foils.ts; owner, Oct 2026: the foiling ferry's helm): FOIL / HULL
  // and her ride height. Only on a boat with foils.
  'foils.mode': foilKey({
    ...setting('foilMode', [0, 2], 'mode', 'Hydrofoils: 1 FOIL (the default) her flight computer flies her on her foils at speed; 0 HULL it keeps her down on her hulls, foils down, bringing her down gently if she was flying; 2 SHALLOW as HULL, then her foils retract once she\'s off them and slowed.', { integer: true, writer: 'module', default: 1 }),
    bind: {
      get: (s) => s.controls.foilMode ?? 1,
      set: (s, v) => {
        s.controls.foilMode = Math.round(Math.min(2, Math.max(0, v as number)));
      },
    },
  }),
  'foils.deploy': foilKey(state('number', (s) => s.foil?.deploy ?? 1, 'Hydrofoils: how far down her foils are, 1 down (as she flies) .. 0 retracted (SHALLOW, vessel/physics/foils.ts). Retracting pods rise with them (modules/pods `retract`).', { unit: '0..1' })),
  'foils.ride': foilKey({
    ...setting('foilRide', [0, 2], 'step', 'Hydrofoils: her ride height, 0 low, 1 normal, 2 high (her forward foil CONFIG.foils.rideSteps deeper or shallower than her design ride depth).', { integer: true, writer: 'module', default: 1 }),
    bind: {
      get: (s) => s.controls.foilRide ?? 1,
      set: (s, v) => {
        s.controls.foilRide = Math.round(Math.min(2, Math.max(0, v as number)));
      },
    },
  }),
  'helm.demand': setting('helm', [-1, 1], '-1..1', 'Wheel (or tiller) position: -1 hard to port, +1 hard to starboard.', { hold: 'helm', aliases: ['helm'] }),
  'ignition.key': {
    type: 'boolean',
    kind: 'intent',
    writer: 'legacy',
    default: false,
    doc: 'Ignition key on / off. Off closes the fuel solenoid: a running diesel stops.',
    aliases: ['key'],
    bind: {
      get: (s) => s.engine.key > 0,
      set: (s, v) => {
        s.engine.key = v ? 1 : 0;
      },
    },
  },
  'ignition.heat': control('heat', 'HEAT button held: extra glow-plug heat (key on). The boats have no HEAT button now: the plugs preheat on their own with the key.', { aliases: ['heat'] }),
  'ignition.start': control('start', 'START button held: the starter cranks (key on, lever in neutral).', { aliases: ['start'] }),
  'outboard.on': control('obOn', "The outboard's on/off button: motor on.", { aliases: ['obOn'] }),
  'outboard.gear': setting('obGear', [-1, 1], 'gear', "The outboard's gear lever: -1 reverse, 0 neutral, +1 forward.", { integer: true, aliases: ['obGear'] }),

  // ── Lights, signals, wipers ──
  'lights.nav': control('navLights', 'NAV LIGHTS switch.', { aliases: ['navLights'] }),
  'lights.cabin': setting('cabinLight', [0, 2], 'position', 'Cabin light switch: 0 off, 1 white, 2 red (night).', { integer: true, aliases: ['cabinLight'] }),
  'lights.deckFore': control('deckFore', 'Foredeck floodlight switch (overhead panel).', { aliases: ['deckFore'] }),
  'lights.deckAft': control('deckAft', 'Aft deck floodlight switch (overhead panel).', { aliases: ['deckAft'] }),
  'lights.rail': control('railLights', 'Rail LED strips switch (overhead panel).', { aliases: ['railLights'] }),
  'horn.sound': control('horn', 'Horn button held.', { aliases: ['horn'] }),
  'wipers.on': control('wipers', 'WIPERS switch.', { aliases: ['wipers'] }),
  'searchlight.on': control('spotlight', 'SPOT switch: the searchlight on.', { aliases: ['spotlight'] }),
  'searchlight.pan': setting('spotPan', [-spot.panLimitDeg, spot.panLimitDeg], 'deg', 'Searchlight pan, + to starboard.', { hold: 'spotPan', aliases: ['spotPan'] }),
  'searchlight.tilt': setting('spotTilt', [spot.tiltMinDeg, spot.tiltMaxDeg], 'deg', 'Searchlight tilt, + up, 0 horizontal.', { hold: 'spotPan', aliases: ['spotTilt'], default: -4 }),

  // ── Radios ──
  'fm.on': control('fmOn', 'FM radio power.', { aliases: ['fmOn'] }),
  // (Absent until a pull-down board is first pulled: boats without one read as before.)
  'whiteboard.down': ((spec) => ({ ...spec, bind: { ...spec.bind, get: (s: VesselState) => (s.controls.boardDown === undefined ? undefined : s.controls.boardDown > 0.5) } }))(
    control('boardDown', 'The pull-down whiteboard pulled down (it rolls up into its box under the roof when not).', { writer: 'module' }),
  ),
  'fm.station': setting('fmStation', [0, CONFIG.fmRadio.stations.length - 1], 'index', 'FM station, an index into CONFIG.fmRadio.stations.', { integer: true, aliases: ['fmStation'] }),
  'fm.tune': press('TUNE pressed: on to the next station, switching the set on if it was off.', ['fmTune'], (s) => {
    if (s.controls.fmOn) s.controls.fmStation = (s.controls.fmStation + 1) % CONFIG.fmRadio.stations.length;
    s.controls.fmOn = 1;
  }),

  // ── Electrics (12 V) ──
  'electrical.master': {
    type: 'boolean',
    kind: 'intent',
    writer: 'legacy',
    default: true,
    doc: 'Battery master switch (the red key on the aft wall).',
    aliases: ['master'],
    bind: {
      get: (s) => (s.electrics ? s.electrics.master > 0 : undefined),
      set: (s, v) => {
        if (s.electrics) s.electrics.master = v ? 1 : 0;
      },
    },
  },
  'electrical.selector': {
    type: 'number',
    unit: 'position',
    range: [1, 3],
    integer: true,
    kind: 'intent',
    writer: 'legacy',
    default: 1,
    doc: 'Battery selector: 1, 2, or 3 = both in parallel.',
    aliases: ['batSelect'],
    bind: {
      get: (s) => s.electrics?.selector,
      set: (s, v) => {
        if (s.electrics) s.electrics.selector = v as number;
      },
    },
  },
  ...breakerKeys(),
  ...circuitKeys(),
  'plant.bridge': state('boolean', (s) => bridgeHasControl(s), "The harbour tug's engine room has handed her engines to the bridge (plant/plant.ts: the control place at BRIDGE); always true on a boat without one.", { default: true, writer: 'core' }),
  'electrical.powered': state('boolean', (s) => isPowered(s), '12 V on the bus: master on and the selected battery not flat (boats without electrics: always).', { default: true, writer: 'core' }),
  'electrical.busVoltage': state('number', (s) => s.electrics?.volts, 'Bus voltage on the last tick (0 with the master off).', { unit: 'V', writer: 'core' }),
  'electrical.amps': state('number', (s) => s.electrics?.amps, 'Net battery current on the last tick, + discharging.', { unit: 'A', writer: 'core' }),
  'battery.1.soc': state('number', (s) => s.electrics?.soc[0], 'Battery 1 state of charge.', { unit: '0..1', range: [0, 1], writer: 'core' }),
  'battery.2.soc': state('number', (s) => s.electrics?.soc[1], 'Battery 2 state of charge.', { unit: '0..1', range: [0, 1], writer: 'core' }),
  'hydraulics.on': state('boolean', (s) => hydraulicsOn(s), 'Deck hydraulic pressure: engine running and the DECK HYD breaker on.'),

  // ── Engine and propulsion ──
  'propulsion.state': state('enum', (s) => s.engine.phase, 'The engine: off, cranking or running.', { values: ['off', 'cranking', 'running'], aliases: ['engine.phase'], writer: 'module' }),
  'propulsion.rpm': state('number', (s) => s.engine.rpm, 'Engine (crankshaft) speed.', { unit: 'rpm', aliases: ['engine.rpm'], writer: 'module' }),
  'propulsion.state2': state('enum', (s) => s.engine.stbd?.phase, 'Twin engines worked separately: the starboard engine, off, cranking or running (propulsion.state is then the port engine).', { values: ['off', 'cranking', 'running'], writer: 'module' }),
  'propulsion.rpm2': state('number', (s) => s.engine.stbd?.rpm, 'Twin engines worked separately: the starboard engine\'s speed.', { unit: 'rpm', writer: 'module' }),
  'propulsion.load': state('number', (s) => s.engine.rack, 'Fuel rack position as set by the governor: the engine load.', { unit: '0..1', aliases: ['engine.rack'], writer: 'module' }),
  'propulsion.gear': state('number', (s) => s.engine.gear, 'Gearbox engaged: -1 astern, 0 neutral, +1 ahead.', { unit: 'gear', integer: true, range: [-1, 1], aliases: ['engine.gear'], writer: 'module' }),
  'propulsion.thrust': kept('number', (s) => s.thrust, (s, v) => (s.thrust = v as number), 'Propeller (or outboard) thrust on the last tick.', { unit: 'N' }),
  'propulsion.immersion': kept('number', (s) => s.engine.immersion ?? 1, (s, v) => (s.engine.immersion = v as number), 'How much of the propeller disc is under water (the rudder in its slipstream works as much).', { unit: '0..1', range: [0, 1] }),
  'propulsion.crankS': state('number', (s) => s.engine.crank, 'Seconds cranked so far this start.', { unit: 's', aliases: ['engine.crankS'], writer: 'module' }),
  'propulsion.glowS': state('number', (s) => s.engine.glow, 'Glow-plug preheat accumulated.', { unit: 's', aliases: ['engine.glowS'], writer: 'module' }),
  'propulsion.coolantC': state('number', (s) => s.engine.coolantC, 'Coolant (block) temperature.', { unit: '°C', aliases: ['engine.coolantC'], writer: 'module' }),
  'propulsion.oilC': state('number', (s) => s.engine.oilC, 'Lube oil temperature.', { unit: '°C', aliases: ['engine.oilC'], writer: 'module' }),
  'propulsion.coolingFault': state('boolean', (s) => s.engine.coolingFault, 'Raw-water pump impeller failed (debug fault).', { aliases: ['engine.coolingFault'], writer: 'module' }),
  'propulsion.oilLevel': state('number', (s) => s.engine.oil, 'Lube oil in the sump.', { unit: '0..1', range: [0, 1], aliases: ['engine.oilLevel'], writer: 'module' }),
  'propulsion.sinceOilCheckS': state('number', (s) => s.engine.sinceCheck, 'Running time since the dipstick was last pulled.', { unit: 's', aliases: ['engine.sinceOilCheckS'], writer: 'module' }),
  'propulsion.oilCheck': press('The dipstick pulled: the oil is checked, and the clock to the next check starts again.', ['dipstick', 'engine.oilCheck'], (s) => {
    if (s.engine.oil !== undefined) s.engine.sinceCheck = 0;
  }),
  'propulsion.oilTopUp': press('The oil can used: the sump topped up.', ['oilTopUp', 'engine.oilTopUp'], (s) => {
    if (s.engine.oil !== undefined) s.engine.oil = 1;
  }),
  'propulsion.wear': state('number', (s) => s.engine.wear, 'Engine wear from running hot or dry; costs power.', { unit: '0..1', range: [0, 1], persist: true, aliases: ['engine.wear'], writer: 'module' }),
  'fuel.litres': kept('number', (s) => s.engine.fuelL, (s, v) => (s.engine.fuelL = v as number), 'Fuel in the tank (the engine draws from it; a fuel berth fills it).', { unit: 'L' }),
  'fuel.flowLph': state('number', (s) => s.engine.fuelFlowLph, 'Fuel flow now.', { unit: 'L/h', writer: 'module' }),
  'fuel.refuelling': state('boolean', (s) => s.refuelling, 'Taking fuel at a fuel berth.'),
  'rudder.angle': state('number', (s) => s.rudder * RAD, 'Actual rudder angle (on an outboard boat, the motor swing), + trailing edge to starboard.', { unit: 'deg', writer: 'module' }),
  'outboard.battery': state('number', (s) => s.battery, "The outboard's battery charge.", { unit: '0..1', range: [0, 1], writer: 'module' }),

  // ── Deck gear and fittings ──
  'anchor.letGo': control('anchor', 'ANCHOR switch: let go / pay out (on), heave in and stow (off).', { aliases: ['anchor'] }),
  'anchor.phase': state('enum', (s) => s.anchor.phase, 'Anchor: stowed, paying out, set, weighing, or hanging off the bottom.', {
    values: ['stowed', 'paying', 'set', 'weighing', 'hanging'],
    writer: 'module',
  }),
  'anchor.chainOut': state('number', (s) => s.anchor.rodeM, 'Chain paid out.', { unit: 'm', writer: 'module' }),
  'anchor.tension': state('number', (s) => s.anchor.tension, 'Horizontal chain tension at the bow on the last tick.', { unit: 'N', writer: 'module' }),
  'anchor.dragging': state('boolean', (s) => s.anchor.dragging, 'The anchor is dragging (tension over its holding power).', { writer: 'module' }),
  // ── The helm assist panel (owner, Oct 2026; modules/helmAssist, vessel/autopilot.ts) ──
  'helmAssist.autoStart': press('AUTO START pressed: the whole start-up, master and main breakers on and the engine started.', [], quickStart),
  'helmAssist.dock': press('DOCK pressed: both lines ashore at the berth in range, or cast off (the menu Dock).', [], toggleDock),
  'autopilot.engage': press('AUTOPILOT pressed: hold the heading she is on now, or let go. Turning the wheel lets go too.', [], (s) => engageAutopilot(s, !s.controls.autopilot)),
  'autopilot.port': press('PORT pressed on the autopilot: the heading it holds moves a few degrees to port (CONFIG.modules.helmAssist.autopilot.stepDeg).', [], (s) => nudgeAutopilot(s, -(gearOf(s, 'autopilot')?.stepDeg ?? 0))),
  'autopilot.starboard': press('STBD pressed on the autopilot: the heading it holds moves a few degrees to starboard.', [], (s) => nudgeAutopilot(s, gearOf(s, 'autopilot')?.stepDeg ?? 0)),
  'autopilot.on': state('boolean', (s) => (gearOf(s, 'autopilot') ? !!s.controls.autopilot : undefined), 'The autopilot is holding her heading.'),
  'autopilot.heading': state('number', (s) => (s.controls.autopilot ? s.controls.autopilotHeading : undefined), 'The heading the autopilot holds.', { unit: 'deg' }),
  // ── Pod drives' joystick (owner, Oct 2026; modules/pods, modules/helmJoystick) ──
  'joystick.x': podStick('joyX', 'Helm joystick sideways: -1 full to port, +1 full to starboard (0 let go).'),
  'joystick.y': podStick('joyY', 'Helm joystick fore and aft: +1 full ahead, -1 full astern (0 let go).'),
  'joystick.twist': podStick('joyR', 'Helm joystick twisted: +1 full clockwise (bow to starboard), -1 anticlockwise (0 let go).'),
  'pods.joystickMode': press('JOYSTICK pressed: hand the pods to the helm joystick, or back to the wheel and throttle. Only with the throttle in neutral; moving it out of neutral hands them back.', [], (s) => {
    s.controls.joyMode = s.controls.joyMode ? 0 : 1;
    s.controls.joyX = s.controls.joyY = s.controls.joyR = 0;
  }),
  'pods.joystick': state('boolean', (s) => (s.pods ? !!s.controls.joyMode : undefined), 'The pods are on the helm joystick (vector mode).'),
  'pods.angle.port': state('number', (s) => (s.pods ? s.pods.angles[0] * RAD : undefined), 'The port pod\'s heading, + its push turned to port (as the rudder angle).', { unit: 'deg', writer: 'module' }),
  'pods.angle.stbd': state('number', (s) => (s.pods ? s.pods.angles[s.pods.angles.length - 1] * RAD : undefined), 'The starboard pod\'s heading.', { unit: 'deg', writer: 'module' }),
  'mooring.phase': state('enum', (s) => s.mooring.phase, 'Mooring: free, docking (lines going ashore) or moored.', { values: ['free', 'docking', 'moored'] }),
  'mooring.bow': state('number', (s) => s.mooring.bow ?? 0, 'Bow line: 0 not fast, else the side of the cleat it is on (-1 port, +1 starboard).', { unit: 'side', integer: true, range: [-1, 1] }),
  'mooring.stern': state('number', (s) => s.mooring.stern ?? 0, 'Stern line: 0 not fast, else the side of the cleat it is on.', { unit: 'side', integer: true, range: [-1, 1] }),
  'fenders.out': control('fenders', 'Fenders over the side (on) or stowed.', { aliases: ['fenders'] }),
  'winch.heaveIn': control('winchHeave', 'Tow winch HEAVE IN button held.', { aliases: ['winchHeave'] }),
  'winch.payOut': control('winchPayOut', 'Tow winch PAY OUT button held.', { aliases: ['winchPayOut'] }),
  // The deck crane (modules/deckCrane): two joysticks, as on a crane's radio remote (owner,
  // Oct 2026). The left asks for slew and boom angles, the right for how far the telescopic
  // boom is run out and how much wire is paid out; the crane follows each at its own rate.
  // HOOK takes or sets down the load. Only on a boat that has one.
  'crane.slew': craneKey(setting('craneSlew', [-crane.slewLimitDeg, crane.slewLimitDeg], 'deg', 'Deck crane: the slew its left joystick asks for, + to starboard of straight ahead (the crane follows at its own rate).', { hold: 'crane', writer: 'module' }), { field: 'craneSlew', value: crane.stow.slewDeg }),
  'crane.luff': craneKey(setting('craneLuff', [crane.luffMinDeg, crane.luffMaxDeg], 'deg', 'Deck crane: the boom angle its left joystick asks for, above level.', { hold: 'crane', writer: 'module' }), { field: 'craneLuff', value: crane.stow.luffDeg }),
  'crane.extend': craneKey(setting('craneExtend', [0, crane.extendMax], 'm', 'Deck crane: how far its right joystick asks the telescopic boom to be run out (the crane follows at its own rate).', { hold: 'crane', writer: 'module' }), { field: 'craneExtend', value: 0 }),
  'crane.wire': craneKey(setting('craneWire', [crane.wireMin, crane.wireMax], 'm', 'Deck crane: how much wire its right joystick asks to be paid out from the boom tip (more: the hook lower).', { hold: 'crane', writer: 'module', default: crane.stow.wire }), { field: 'craneWire', value: crane.stow.wire }),
  'crane.hook': craneKey(control('craneHook', 'Deck crane HOOK button held: a press takes the item under the hook, or sets down the one on it.', { writer: 'module' })),
  'trawl.shoot': control('trawl', 'TRAWL switch: shoot the net (on) / haul it (off). It follows the net when worked by hand.', {
    aliases: ['trawl'],
    followedBy: 'fishing',
  }),
  'net.payOut': control('netOut', 'Trawl PAY OUT button on the A-frame, held.', { aliases: ['netOut'] }),
  'net.haul': control('netIn', 'Trawl HAUL button on the A-frame, held.', { aliases: ['netIn'] }),
  'net.release': control('netRelease', "Trawl RELEASE button on the A-frame's box: the codend, hanging over the deck, emptied (fishing.ts).", { aliases: ['netRelease'] }),
  'trawl.warpOut': state('number', (s) => s.trawlGear?.warp ?? 0, "How far the trawl's warps are paid out, 0 (in) .. 1 (fishing): what the trawl winches' drums show (fishing.ts).", { unit: '0..1' }),
  'trawl.netOnDrum': state('number', (s) => s.trawlGear?.net ?? 1, 'How much of the trawl net is wound on its drum, 0 .. 1 (all of it, stowed): what the net drum shows (fishing.ts).', { unit: '0..1' }),
  'aFrame.luff': state('number', (s) => s.aFrameLuff ?? 0, 'How far the A-frame has swung inboard on its rams: 0 raked aft over the stern, 1 in over the deck (fishing/codend.ts).', { unit: '0..1' }),
  // The dive A-frame (modules/diveFrame): its stand's hold-to-run buttons.
  'dive.frameOut': diveKey(control('diveOut', 'Dive A-frame FRAME OUT button held: swings the sub out over the stern (only with her up in the docking head).', { writer: 'module' })),
  'dive.frameIn': diveKey(control('diveIn', 'Dive A-frame FRAME IN button held: swings the sub in over her cradle (only with her up in the docking head).', { writer: 'module' })),
  'dive.winchUp': diveKey(control('diveUp', 'Dive A-frame WINCH UP button held: hoists the sub into the docking head.', { writer: 'module' })),
  'dive.winchDown': diveKey(control('diveDown', 'Dive A-frame WINCH DOWN button held: lowers the sub onto her cradle, or into the sea with the frame right out.', { writer: 'module' })),
  'firePump.on': control('firePump', 'FIRE PUMP switch.', { aliases: ['firePump'] }),
  'monitor.pan': setting('monPan', [-mon.panLimitDeg, mon.panLimitDeg], 'deg', 'Fire monitor pan, + to starboard.', { hold: 'monPan', aliases: ['monPan'] }),
  'monitor.tilt': setting('monTilt', [mon.tiltMinDeg, mon.tiltMaxDeg], 'deg', 'Fire monitor elevation.', { hold: 'monPan', aliases: ['monTilt'], default: 20 }),
  'tender.phase': state('enum', (s) => s.tender?.phase, "A ship's boat: free, stowed in her cradle, lowering or hoisting.", { values: ['free', 'stowed', 'lowering', 'hoisting'] }),

  // ── Wheelhouse ──
  'door.aft.open': control('door', 'The wheelhouse aft door open (starts open).', { aliases: ['door'], default: true }),
  'door.side.open': control('sideDoor', 'The wheelhouse port side door open (starts shut).', { aliases: ['sideDoor'] }),
  'gate.side.open': control('sideGate', 'The gate in the working-deck bulwark open (starts shut).', { aliases: ['sideGate'] }),
  'ramp.bow.down': control('bowRamp', 'The bow ramp lowered (starts raised; the landing craft).', { aliases: ['bowRamp'] }),
  'hatch.engine.open': control('engineHatch', 'The engine hatch in the wheelhouse floor open.', { aliases: ['engineHatch'] }),
  'furniture.headDoor': control('headDoor', "The head's door open (starts shut; a Shipyard boat's furniture).", { aliases: ['headDoor'] }),
  'hatch.hold.open': control('holdHatch', "The fish hold's hatch lid open (starts shut; a Shipyard boat's fish hold).", { aliases: ['holdHatch'] }),
  'hold.lift': control('holdLift', "The fish hold's LIFT button: a box lifted out onto the deck by the hatch (the lid open; fishing/fishHold.ts).", { aliases: ['holdLift'] }),
  'hold.boxes': state('number', (s) => s.hold?.boxes.length ?? 0, 'Fish boxes in the fish hold.', { unit: 'boxes' }),
  'chartTable.leafOpen': {
    ...control('chartLeaf', "The chart table's drop leaf unfolded (folded: against the wall).", { aliases: ['chartLeaf'], default: true }),
    bind: {
      get: (s) => (s.controls.chartLeaf ?? 1) > 0.5,
      set: (s, v) => {
        s.controls.chartLeaf = v ? 1 : 0;
      },
    },
  },
  'chartTable.lamp': control('chartLamp', 'Chart table lamp switch.', { aliases: ['chartLamp'] }),

  // ── Hull ──
  'bilge.level': kept('number', (s) => s.bilge, (s, v) => (s.bilge = v as number), 'Water in the bilge (a damaged hull leaks in; the bilge pump takes it out).', { unit: '0..1', range: [0, 1] }),
  'hull.damage': state('number', (s) => s.damage, 'Hull damage; it leaks into the bilge.', { unit: '0..1', range: [0, 1], persist: true }),
  'contact.force': state('number', (s) => s.contact.force, 'Total contact force against ground or structures on the last tick.', { unit: 'N', writer: 'core' }),
  'contact.slide': state('number', (s) => s.contact.slide, 'Mean sliding speed of the touching points.', { unit: 'm/s', writer: 'core' }),
  'contact.impact': state('number', (s) => s.contact.impact, 'Largest approach speed of a point that touched this tick (less what a fender, strake or tyre took up).', { unit: 'm/s', writer: 'core' }),

  // ── Engine panel warning lamps ──
  'lamp.oil': state('enum', (s) => lamp(s, 'oil'), 'OIL lamp: on with no oil pressure (key on, engine stopped), blinking while running with the sump nearly dry.', { values: LAMP }),
  'lamp.charge': state('enum', (s) => lamp(s, 'charge'), 'CHARGE lamp: on while the alternator isn\'t charging (key on, engine stopped).', { values: LAMP }),
  'lamp.glow': state('enum', (s) => lamp(s, 'glow'), 'GLOW lamp: on from the key going on until the glow plugs are hot enough (wait for it to go out, then START).', { values: LAMP }),
  'lamp.neutral': state('enum', (s) => lamp(s, 'neutral'), 'NEUTRAL lamp: on with the lever in neutral; blinking while START is held in gear.', { values: LAMP }),
  'lamp.bilge': state('enum', (s) => lamp(s, 'bilge'), 'BILGE lamp: blinking with the bilge over its alarm level.', { values: LAMP }),
  'lamp.hull': state('enum', (s) => lamp(s, 'hull'), 'HULL lamp: on with hull damage worth a repair, blinking when bad.', { values: LAMP }),
  'lamp.engine': state('enum', (s) => lamp(s, 'engine'), 'ENGINE lamp: on with engine wear worth an overhaul, blinking when bad.', { values: LAMP }),
  'lamp.temp': state('enum', (s) => lamp(s, 'temp'), 'TEMP lamp: blinking with the coolant over its alarm temperature.', { values: LAMP }),
  'lamp.fuel': state('enum', (s) => lamp(s, 'fuel'), 'FUEL lamp: on with the fuel under its low mark.', { values: LAMP }),
  'lamp.ready': state('enum', (s) => lamp(s, 'ready'), 'READY lamp (an electric boat\'s): on while her drive is live (the key on, 12 V, charge in her battery): the levers move her.', { values: LAMP }),
  'lamp.batt': state('enum', (s) => lamp(s, 'batt'), 'BATT lamp (an electric boat\'s): on with her battery under its low mark, blinking nearly flat.', { values: LAMP }),
  'lamp.shore': state('enum', (s) => lamp(s, 'shore'), 'SHORE lamp (an electric boat\'s): on while she\'s plugged in at the quay (shore power).', { values: LAMP }),

  // ── Navigation (from her motion) ──
  'nav.speedKts': state('number', (s) => Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) / KNOT, 'Speed over ground.', { unit: 'kn', writer: 'core' }),
  'nav.heading': state('number', heading, 'Compass heading of the bow, 0 north, 90 east.', { unit: 'deg', writer: 'core' }),
} satisfies Record<string, BusKeySpec>;

export type BusKey = keyof typeof BUS_KEYS;
