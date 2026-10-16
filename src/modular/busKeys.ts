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
import { CONFIG } from '../config';
import { hydraulicsOn, isPowered } from '../vessel/electrics';
import { leverDemand, preheatNeeded } from '../vessel/physics/propulsion';
import { isWorkboat, VESSEL_DEFS } from '../vessel/vesselDef';
import { BREAKERS, type BreakerName, type VesselControls, type VesselState } from '../vessel/vesselState';
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
 * lights stays here (today's rules) until the engine is a module (M4). Undefined on a boat
 * without the workboat's engine panel. All need 12 V on the Instruments circuit, except
 * GLOW, which is wired with the glow plugs (12 V on the master).
 */
type Lamp = 'off' | 'on' | 'blink';
const LAMP = ['off', 'on', 'blink'] as const;
function lamp(s: VesselState, which: 'oil' | 'charge' | 'glow' | 'neutral' | 'bilge'): Lamp | undefined {
  const def = VESSEL_DEFS[s.defId];
  if (!isWorkboat(def)) return undefined;
  const instr = isPowered(s, 'instruments');
  const e = s.engine;
  const running = e.phase === 'running';
  switch (which) {
    case 'oil':
      // No oil pressure stopped; blinks running with the sump nearly dry.
      return !instr ? 'off' : !running ? 'on' : (e.oil ?? 1) < (def.maintenance?.lampAt ?? 0) ? 'blink' : 'off';
    case 'charge':
      return instr && !running ? 'on' : 'off';
    case 'glow':
      return isPowered(s) && e.key > 0 && s.controls.heat > 0 && e.glow < preheatNeeded(s, def) ? 'on' : 'off';
    case 'neutral':
      // On in neutral (the start interlock); blinks while START is held in gear.
      return !instr ? 'off' : leverDemand(def, s.controls.lever).gear === 0 ? 'on' : s.controls.start > 0 ? 'blink' : 'off';
    case 'bilge':
      return instr && (s.bilge ?? 0) >= (def.bilge?.alarmAt ?? 1) ? 'blink' : 'off';
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
  'ignition.heat': control('heat', 'HEAT button held: the glow plugs heat (key on).', { aliases: ['heat'] }),
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
  'electrical.powered': state('boolean', (s) => isPowered(s), '12 V on the bus: master on and the selected battery not flat (boats without electrics: always).', { default: true, writer: 'core' }),
  'electrical.busVoltage': state('number', (s) => s.electrics?.volts, 'Bus voltage on the last tick (0 with the master off).', { unit: 'V', writer: 'core' }),
  'electrical.amps': state('number', (s) => s.electrics?.amps, 'Net battery current on the last tick, + discharging.', { unit: 'A', writer: 'core' }),
  'battery.1.soc': state('number', (s) => s.electrics?.soc[0], 'Battery 1 state of charge.', { unit: '0..1', range: [0, 1], writer: 'core' }),
  'battery.2.soc': state('number', (s) => s.electrics?.soc[1], 'Battery 2 state of charge.', { unit: '0..1', range: [0, 1], writer: 'core' }),
  'hydraulics.on': state('boolean', (s) => hydraulicsOn(s), 'Deck hydraulic pressure: engine running and the DECK HYD breaker on.'),

  // ── Engine and propulsion ──
  'propulsion.state': state('enum', (s) => s.engine.phase, 'The engine: off, cranking or running.', { values: ['off', 'cranking', 'running'], aliases: ['engine.phase'], writer: 'module' }),
  'propulsion.rpm': state('number', (s) => s.engine.rpm, 'Engine (crankshaft) speed.', { unit: 'rpm', aliases: ['engine.rpm'], writer: 'module' }),
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
  'outboard.battery': state('number', (s) => s.battery, "The outboard's battery charge.", { unit: '0..1', range: [0, 1] }),

  // ── Deck gear and fittings ──
  'anchor.letGo': control('anchor', 'ANCHOR switch: let go / pay out (on), heave in and stow (off).', { aliases: ['anchor'] }),
  'anchor.phase': state('enum', (s) => s.anchor.phase, 'Anchor: stowed, paying out, set, weighing, or hanging off the bottom.', {
    values: ['stowed', 'paying', 'set', 'weighing', 'hanging'],
    writer: 'module',
  }),
  'anchor.chainOut': state('number', (s) => s.anchor.rodeM, 'Chain paid out.', { unit: 'm', writer: 'module' }),
  'anchor.tension': state('number', (s) => s.anchor.tension, 'Horizontal chain tension at the bow on the last tick.', { unit: 'N', writer: 'module' }),
  'anchor.dragging': state('boolean', (s) => s.anchor.dragging, 'The anchor is dragging (tension over its holding power).', { writer: 'module' }),
  'mooring.phase': state('enum', (s) => s.mooring.phase, 'Mooring: free, docking (lines going ashore) or moored.', { values: ['free', 'docking', 'moored'] }),
  'mooring.bow': state('number', (s) => s.mooring.bow ?? 0, 'Bow line: 0 not fast, else the side of the cleat it is on (-1 port, +1 starboard).', { unit: 'side', integer: true, range: [-1, 1] }),
  'mooring.stern': state('number', (s) => s.mooring.stern ?? 0, 'Stern line: 0 not fast, else the side of the cleat it is on.', { unit: 'side', integer: true, range: [-1, 1] }),
  'fenders.out': control('fenders', 'Fenders over the side (on) or stowed.', { aliases: ['fenders'] }),
  'winch.heaveIn': control('winchHeave', 'Tow winch HEAVE IN button held.', { aliases: ['winchHeave'] }),
  'winch.payOut': control('winchPayOut', 'Tow winch PAY OUT button held.', { aliases: ['winchPayOut'] }),
  'trawl.shoot': control('trawl', 'TRAWL switch: shoot the net (on) / haul it (off). It follows the net when worked by hand.', {
    aliases: ['trawl'],
    followedBy: 'fishing',
  }),
  'net.payOut': control('netOut', 'Trawl PAY OUT button on the A-frame, held.', { aliases: ['netOut'] }),
  'net.haul': control('netIn', 'Trawl HAUL button on the A-frame, held.', { aliases: ['netIn'] }),
  'firePump.on': control('firePump', 'FIRE PUMP switch.', { aliases: ['firePump'] }),
  'monitor.pan': setting('monPan', [-mon.panLimitDeg, mon.panLimitDeg], 'deg', 'Fire monitor pan, + to starboard.', { hold: 'monPan', aliases: ['monPan'] }),
  'monitor.tilt': setting('monTilt', [mon.tiltMinDeg, mon.tiltMaxDeg], 'deg', 'Fire monitor elevation.', { hold: 'monPan', aliases: ['monTilt'], default: 20 }),
  'tender.phase': state('enum', (s) => s.tender?.phase, "A ship's boat: free, stowed in her cradle, lowering or hoisting.", { values: ['free', 'stowed', 'lowering', 'hoisting'] }),

  // ── Wheelhouse ──
  'door.aft.open': control('door', 'The wheelhouse aft door open (starts open).', { aliases: ['door'], default: true }),
  'door.side.open': control('sideDoor', 'The wheelhouse port side door open (starts shut).', { aliases: ['sideDoor'] }),
  'hatch.engine.open': control('engineHatch', 'The engine hatch in the wheelhouse floor open.', { aliases: ['engineHatch'] }),
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
  'contact.impact': state('number', (s) => s.contact.impact, 'Largest approach speed of a point that touched this tick.', { unit: 'm/s', writer: 'core' }),

  // ── Engine panel warning lamps ──
  'lamp.oil': state('enum', (s) => lamp(s, 'oil'), 'OIL lamp: on with no oil pressure (engine stopped), blinking while running with the sump nearly dry.', { values: LAMP }),
  'lamp.charge': state('enum', (s) => lamp(s, 'charge'), 'CHARGE lamp: on while the alternator isn\'t charging (engine stopped).', { values: LAMP }),
  'lamp.glow': state('enum', (s) => lamp(s, 'glow'), 'GLOW lamp: on while HEAT is held, until the glow plugs are hot enough.', { values: LAMP }),
  'lamp.neutral': state('enum', (s) => lamp(s, 'neutral'), 'NEUTRAL lamp: on with the lever in neutral; blinking while START is held in gear.', { values: LAMP }),
  'lamp.bilge': state('enum', (s) => lamp(s, 'bilge'), 'BILGE lamp: blinking with the bilge over its alarm level.', { values: LAMP }),

  // ── Navigation (from her motion) ──
  'nav.speedKts': state('number', (s) => Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) / KNOT, 'Speed over ground.', { unit: 'kn', writer: 'core' }),
  'nav.heading': state('number', heading, 'Compass heading of the bow, 0 north, 90 east.', { unit: 'deg', writer: 'core' }),
} satisfies Record<string, BusKeySpec>;

export type BusKey = keyof typeof BUS_KEYS;
