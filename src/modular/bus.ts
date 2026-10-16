/**
 * Contract: the BUS (docs/MODULAR_BOATS.md 3.1).
 *
 * A boat's bus is the list of named values its parts share: 'throttle.demand' (-1..1),
 * 'propulsion.rpm', 'circuit.radio.live'... Modules never talk to each other, only to the
 * bus: a lever writes 'throttle.demand', the engine reads it and writes 'propulsion.rpm',
 * the rev counter reads that. The rev counter never knows an engine exists.
 *
 * Every key is declared once, with its type, unit and range, in the registry
 * (busKeys.ts). That lets a recipe be checked when it loads: anything a module reads must
 * be written by something on that boat.
 *
 * Two kinds of key:
 *   intent  set by players through a control (a lever, a switch). A player's intent is
 *           checked here: clamped to the key's range, refused if someone else holds the
 *           control (multiplayer), then written. This replaces the big switch in
 *           vessel/vesselControl.ts one key at a time.
 *   state   set by the simulation only (rpm, volts, anchor phase...). Displays read it.
 *
 * Polled, not notified (3.1 / 2.2): readers look a key up each frame. A view that redraws
 * only on change keeps a BusWatcher (below), as the instrument atlas does today.
 *
 * Storage, for now (the "facade", M1-M5): each key is bound to the field of VesselState
 * where today's code keeps it ('throttle.demand' is `controls.lever`), so snapshots, saves
 * and every existing reader are untouched. In M6 the values move into one flat record and
 * the bindings go.
 */
import type { VesselState } from '../vessel/vesselState';
import { BUS_KEYS, type BusKey } from './busKeys';

/** A value on the bus. Enums are strings from a fixed list. */
export type BusValue = number | boolean | string;

/**
 * Who produces a key's value:
 *   module  a mounted module (a recipe must carry one for anyone to read the key)
 *   core    the vessel's own physics and motion (speed, heading, contact): always there
 *   legacy  code from before modular boats, not converted yet: counts as always there
 *           until its module lands, when the key flips to 'module' in the same change
 */
export type BusWriter = 'module' | 'core' | 'legacy';

/** One entry in the registry. */
export interface BusKeySpec {
  type: 'number' | 'boolean' | 'enum';
  /** Unit in words for numbers: 'rpm', 'deg', 'kW', 'V', 'A', 'kn', '°C', 'L', '0..1', '-1..1'. */
  unit?: string;
  /** Allowed range. A player's intent is clamped to it. */
  range?: readonly [number, number];
  /** Whole numbers only (switch positions, gear). */
  integer?: boolean;
  /** Enums: the allowed values. */
  values?: readonly string[];
  kind: 'intent' | 'state';
  writer: BusWriter;
  /** Value when the boat doesn't carry what this key belongs to (e.g. no electrics). */
  default: BusValue;
  /** Grab-control ownership group (multiplayer): the first hand on it keeps it. */
  hold?: string;
  /** Kept between sessions. Today only hull damage and engine wear (owner's decision). */
  persist?: boolean;
  /** An intent key the named system may also set: a switch that follows its machine. */
  followedBy?: string;
  /**
   * A press, not a position (TUNE: next station): setting it does something once, and it
   * always reads its default. Not recorded by the golden runs (it has nothing to show).
   */
  press?: boolean;
  /** Old names that still find this key. Never removed. */
  aliases?: readonly string[];
  /** One plain sentence: what it is, for the debug viewer and the key table. */
  doc: string;
  /**
   * Facade (M1-M5): where today's VesselState keeps the value. `get` returns undefined
   * when this boat doesn't carry it (no electrics, no tender...). No `set`: derived, read
   * only (a heading worked out from the orientation).
   */
  bind: {
    get(s: VesselState): BusValue | undefined;
    set?(s: VesselState, v: BusValue): void;
  };
}

/** Reading a boat's bus: displays, interlocks, other systems. */
export interface BusReader {
  /** The key's value, or its default if this boat doesn't carry it. */
  get(key: BusKey): BusValue;
  /** As a number (booleans: 0 / 1). */
  num(key: BusKey): number;
  /** Does this boat carry this key at all? */
  has(key: BusKey): boolean;
}

/** Reading and writing (the simulation side only). */
export interface Bus extends BusReader {
  /** Write a value, checked against the key's type and range. Unknown or read-only: ignored. */
  set(key: BusKey, value: BusValue): void;
}

const ALIASES = new Map<string, BusKey>();
for (const [key, spec] of Object.entries(BUS_KEYS) as [BusKey, BusKeySpec][]) {
  for (const a of spec.aliases ?? []) ALIASES.set(a, key);
}

/** A key by its name or an alias, or null if there is no such key. */
export function resolveKey(name: string): BusKey | null {
  if (name in BUS_KEYS) return name as BusKey;
  return ALIASES.get(name) ?? null;
}

/**
 * Is this exactly a key's own name (not an alias)? Controls converted to modules send
 * their key's own name ('throttle.demand'); not-yet-converted code sends the old channel
 * names ('lever'), which still go through vessel/vesselControl.ts as before.
 */
export function isKeyName(name: string): name is BusKey {
  return name in BUS_KEYS;
}

/**
 * The hold group (multiplayer ownership) of a control channel: a key's `hold`, found by
 * its name or alias ('throttle.demand' and 'lever' are both held as 'lever'). Null: not a
 * held control.
 */
export function holdGroup(name: string): string | null {
  const key = resolveKey(name);
  return key ? (specOf(key).hold ?? null) : null;
}

/** The registry entry for a key. */
export function specOf(key: BusKey): BusKeySpec {
  return BUS_KEYS[key] as BusKeySpec;
}

/** Every key, in registry order. */
export function allKeys(): BusKey[] {
  return Object.keys(BUS_KEYS) as BusKey[];
}

/**
 * Make a value fit its key: numbers clamped to the range (and rounded if whole), booleans
 * from anything truthy or > 0.5, enums only from the list. Null: it can't be made to fit
 * (a string for a number, an unknown enum value, NaN).
 */
export function coerce(spec: BusKeySpec, value: BusValue): BusValue | null {
  switch (spec.type) {
    case 'number': {
      let n = typeof value === 'boolean' ? (value ? 1 : 0) : typeof value === 'number' ? value : NaN;
      if (!Number.isFinite(n)) return null;
      if (spec.range) n = Math.min(spec.range[1], Math.max(spec.range[0], n));
      if (spec.integer) n = Math.round(n);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value > 0.5 : null;
      return null;
    case 'enum':
      return typeof value === 'string' && spec.values?.includes(value) ? value : null;
  }
}

function asNumber(v: BusValue): number {
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
}

/** The facade bus over one vessel's state (M1-M5). Cheap: no copies, no allocation per read. */
class StateBus implements Bus {
  constructor(private readonly s: VesselState) {}

  get(key: BusKey): BusValue {
    const spec = specOf(key);
    return spec.bind.get(this.s) ?? spec.default;
  }

  num(key: BusKey): number {
    return asNumber(this.get(key));
  }

  has(key: BusKey): boolean {
    return specOf(key).bind.get(this.s) !== undefined;
  }

  set(key: BusKey, value: BusValue): void {
    const spec = specOf(key);
    if (!spec.bind.set || spec.bind.get(this.s) === undefined) return;
    const v = coerce(spec, value);
    if (v !== null) spec.bind.set(this.s, v);
  }
}

/** The bus of one vessel. */
export function busOf(s: VesselState): Bus {
  return new StateBus(s);
}

/**
 * A player's intent on a bus key (a control was moved). Checked as today's
 * applyVesselIntent does: only intent keys, not while another player holds that control,
 * clamped to the key's range. Returns whether it was written.
 */
export function applyBusIntent(s: VesselState, name: string, value: BusValue, playerId: string): boolean {
  const key = resolveKey(name);
  if (!key) return false;
  const spec = specOf(key);
  if (spec.kind !== 'intent' || !spec.bind.set) return false;
  if (spec.bind.get(s) === undefined) return false;
  const holder = spec.hold ? s.holds[spec.hold] : undefined;
  if (holder && holder !== playerId) return false;
  const v = coerce(spec, value);
  if (v === null) return false;
  spec.bind.set(s, v);
  return true;
}

/**
 * For views that redraw only when something they show has changed (the instrument atlas):
 * remembers the last values of its keys, each rounded to what you could see change.
 */
export class BusWatcher {
  private readonly last: BusValue[];

  /**
   * @param keys    the keys to watch
   * @param quantum for numbers, the smallest change that matters per key (default: any)
   */
  constructor(
    private readonly keys: readonly BusKey[],
    private readonly quantum: Partial<Record<BusKey, number>> = {},
  ) {
    this.last = keys.map(() => NaN);
  }

  /** Has anything changed since the last call? (The first call always says yes.) */
  changed(read: BusReader): boolean {
    let any = false;
    this.keys.forEach((k, i) => {
      let v = read.get(k);
      const q = this.quantum[k];
      if (typeof v === 'number' && q) v = Math.round(v / q) * q;
      if (!Object.is(v, this.last[i])) {
        this.last[i] = v;
        any = true;
      }
    });
    return any;
  }
}
