/**
 * A Shipyard design (owner, Oct 2026): the choices you make in the Shipyard page, and their
 * short code. The code holds the choices, not the boat: the game rebuilds exactly the same
 * boat from them (shipyard/build.ts), so it stays short enough to type in VR and needs no
 * server. A code is tied to its `version` of the building rules: when the rules change,
 * the version goes up and older codes are upgraded (or refused with a reason).
 *
 * Every choice is a whole number on a fixed scale (its `steps`), so the code is exact. The
 * choices are packed as one number in mixed radix (each choice uses exactly its own number
 * of steps: a 3-way choice takes log2 3 = 1.6 bits, not 2), written in Crockford base 32
 * (digits and letters without I, L, O and U, so nothing looks like anything else), with a
 * check character after them (a weighted sum: any one mistyped character is caught).
 *
 * Version 3 (twin engines; this one): 10 characters of choices (50 bits; its ~3.3 x 10^13
 * combinations use ~3 % of them, the rest is room for later choices) and the check: 11
 * characters, shown as K7P4Q-2ZX9DM. Its number is the choices' number as it stands.
 *
 * The 10-character codes of earlier versions (9 characters and the check) still read, with
 * single engines. Each owned a range of their 45-bit numbers:
 *   - version 1 (the first Shipyard, no bow choice; each choice in whole bits): 2^42 .. 2^43.
 *     Read with the bow at the middle step (a 25 deg stem); before the bow became a stem
 *     angle that step was each hull's own bow, so their bows differ a little;
 *   - version 2 (the bow choice): from 2^43, its ~1.65 x 10^13 combinations (the 4th hull
 *     type, the pilot boat, added ~0.41 x 10^13 at the top of it).
 * Twin engines didn't fit in what was left of the 45 bits, so version 3 went to 11.
 */

/** The building rules this code was made with (3: twin engines, 11 characters). */
export const DESIGN_VERSION = 3;

/** One choice: its index on its scale, 0 .. steps-1. */
export interface ShipDesign {
  /** The base hull (DESIGN_HULLS). */
  hull: number;
  /** Hull length, beam and depth, each scaled (SCALES). */
  length: number;
  beam: number;
  depth: number;
  /** Bulwark height. */
  bulwark: number;
  /** Bow: the stem's rake, 0 plumb .. 4 raked 50 deg (SCALES.bow). */
  bow: number;
  /** Wheelhouse: where along the deck (aft .. forward), its length, its width, its headroom. */
  housePos: number;
  houseLength: number;
  houseWidth: number;
  headroom: number;
  /** Its floor sunk below the deck (a step down into it, for headroom). */
  sunk: number;
  /** Twin engines (two of the engine package, side by side, in lockstep): 0 single, 1 twin. */
  twin: number;
  /** Engine package (ENGINES), and the gearbox ratio matched to it (by sea trial in the Shipyard). */
  engine: number;
  gear: number;
  /** Controls package: 0 basic, 1 advanced. */
  controls: number;
  /** Paint (LIVERIES). */
  paint: number;
}

/** Version 2's choices, in its code's order (the hull type first, most significant). */
const V2_FIELDS: { key: keyof ShipDesign; steps: number }[] = [
  // The hull type first (most significant): its range grows at the top, so adding a type
  // (the pilot boat, the 4th) leaves every earlier code meaning the same boat.
  { key: 'hull', steps: 4 },
  { key: 'length', steps: 16 },
  { key: 'beam', steps: 16 },
  { key: 'depth', steps: 16 },
  { key: 'bulwark', steps: 8 },
  { key: 'bow', steps: 5 },
  { key: 'housePos', steps: 16 },
  { key: 'houseLength', steps: 16 },
  { key: 'houseWidth', steps: 8 },
  { key: 'headroom', steps: 8 },
  { key: 'sunk', steps: 2 },
  { key: 'engine', steps: 3 },
  { key: 'gear', steps: 16 },
  { key: 'controls', steps: 2 },
  { key: 'paint', steps: 8 },
];

/** Each choice's number of steps, in the code's order (version 3: twin engines, then version 2's). */
export const FIELDS: { key: keyof ShipDesign; steps: number }[] = [{ key: 'twin', steps: 2 }, ...V2_FIELDS];

/** Version 1's choices, each in whole bits (for reading its codes). */
const V1_FIELDS: { key: keyof ShipDesign; bits: number; steps: number }[] = [
  { key: 'hull', bits: 2, steps: 3 },
  { key: 'length', bits: 4, steps: 16 },
  { key: 'beam', bits: 4, steps: 16 },
  { key: 'depth', bits: 4, steps: 16 },
  { key: 'bulwark', bits: 3, steps: 8 },
  { key: 'housePos', bits: 4, steps: 16 },
  { key: 'houseLength', bits: 4, steps: 16 },
  { key: 'houseWidth', bits: 3, steps: 8 },
  { key: 'headroom', bits: 3, steps: 8 },
  { key: 'sunk', bits: 1, steps: 2 },
  { key: 'engine', bits: 2, steps: 3 },
  { key: 'gear', bits: 4, steps: 16 },
  { key: 'controls', bits: 1, steps: 2 },
  { key: 'paint', bits: 3, steps: 8 },
];

/** What the steps mean (the build reads these; the page labels its sliders with them). */
export const SCALES = {
  /** Length, beam and depth: x0.80 .. x1.175 of the base hull, in 2.5 % steps (index 8 = x1). */
  scale: (i: number) => 0.8 + 0.025 * i,
  /** Bulwark height (m): 0.3 .. 1.0. */
  bulwark: (i: number) => 0.3 + 0.1 * i,
  /** Wheelhouse position: 0 right aft .. 1 right forward, within the deck that's free for it. */
  housePos: (i: number) => i / 15,
  /** Wheelhouse length (m): 2.4 .. 5.4. */
  houseLength: (i: number) => 2.4 + 0.2 * i,
  /** Wheelhouse width: 65 .. 100 % of what the deck leaves between side decks. */
  houseWidth: (i: number) => 0.65 + 0.05 * i,
  /** Headroom, floor to roof (m): 1.9 .. 2.6. */
  headroom: (i: number) => 1.9 + 0.1 * i,
  /** Bow: the stem's rake from vertical (deg), 0 (plumb) .. 50 (owner: no further). */
  bow: (i: number) => 12.5 * i,
  /** Gearbox ratio: 1.0 .. 4.18, each step 10 % more than the last (rounded to 0.01). */
  gear: (i: number) => Math.round(100 * 1.1 ** i) / 100,
};

/** The page's starting point: the landing craft much as she is. */
export const DEFAULT_DESIGN: ShipDesign = {
  hull: 0,
  length: 8,
  beam: 8,
  depth: 8,
  bulwark: 2,
  bow: 2,
  housePos: 4,
  houseLength: 2,
  houseWidth: 7,
  headroom: 3,
  sunk: 1,
  twin: 0,
  engine: 1,
  gear: 2,
  controls: 1,
  paint: 0,
};

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Every combination of version 3's choices: its codes are the numbers 0 .. this - 1. */
export const COMBINATIONS = FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);
/** Where version 2's codes start, and how many there are. */
const V2_BASE = 1n << 43n;
const V2_COMBINATIONS = V2_FIELDS.reduce((a, f) => a * BigInt(f.steps), 1n);

/** The choices as one mixed-radix number, the first choice most significant. */
function pack(d: ShipDesign, fields: readonly { key: keyof ShipDesign; steps: number }[]): bigint {
  let n = 0n;
  for (const f of fields) {
    const v = d[f.key];
    if (!Number.isInteger(v) || v < 0 || v >= f.steps) throw new Error(`design ${f.key} ${v} is off its scale (0..${f.steps - 1})`);
    n = n * BigInt(f.steps) + BigInt(v);
  }
  return n;
}

/** A number as `count` base-32 characters and the check, grouped 5 and the rest. */
function write(all: bigint, count: number): string {
  const syms: number[] = [];
  for (let k = count - 1; k >= 0; k--) syms.push(Number((all >> BigInt(5 * k)) & 31n));
  syms.push(check(syms));
  const s = syms.map((v) => ALPHABET[v]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** The design as its code, e.g. 'K7P4Q-2ZX9DM' (version 3, 11 characters). */
export function encodeDesign(d: ShipDesign): string {
  return write(pack(d, FIELDS), 10);
}

/** A single-engine design as a version 2 code (10 characters): for checking that old codes still read. */
export function encodeDesignV2(d: ShipDesign): string {
  return write(V2_BASE + pack(d, V2_FIELDS), 9);
}

/**
 * A code back to its design, or why it can't be read. Forgiving as typed: any case, with
 * or without the dash or spaces, and I / L read as 1, O as 0. 11 characters (version 3), or
 * 10 (versions 1 and 2: single engines).
 */
export function decodeDesign(code: string): { design: ShipDesign } | { error: string } {
  const s = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (s.length !== 11 && s.length !== 10) return { error: `a design code has 11 characters (this has ${s.length})` };
  const syms: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { error: `'${ch}' isn't used in design codes` };
    syms.push(v);
  }
  const body = syms.slice(0, -1);
  if (check(body) !== syms[syms.length - 1]) return { error: 'that code has a mistyped character (its check doesn’t match)' };
  let all = 0n;
  for (const v of body) all = (all << 5n) | BigInt(v);
  if (s.length === 11) {
    if (all >= COMBINATIONS) return { error: `that code is from a newer Shipyard than this game (it reads versions 1 to ${DESIGN_VERSION})` };
    return unpack(all, FIELDS);
  }
  if (all >> 42n === 1n) return decodeV1(all);
  if (all < V2_BASE || all - V2_BASE >= V2_COMBINATIONS) return { error: 'that isn’t a Shipyard code' };
  const v2 = unpack(all - V2_BASE, V2_FIELDS);
  return 'design' in v2 ? { design: { ...v2.design, twin: 0 } } : v2;
}

/** A mixed-radix number back to its choices, the last choice least significant. */
function unpack(n: bigint, fields: readonly { key: keyof ShipDesign; steps: number }[]): { design: ShipDesign } | { error: string } {
  const d = {} as ShipDesign;
  for (const f of [...fields].reverse()) {
    d[f.key] = Number(n % BigInt(f.steps));
    n /= BigInt(f.steps);
  }
  if (n !== 0n) return { error: 'that code is off the scales (no design has it)' };
  return { design: d };
}

/** A version 1 code (each choice in whole bits, no bow choice): the same boat, its stem raked 25 deg (the middle step). */
function decodeV1(all: bigint): { design: ShipDesign } | { error: string } {
  let shift = 42;
  const d = { bow: 2, twin: 0 } as ShipDesign;
  for (const f of V1_FIELDS) {
    shift -= f.bits;
    const v = Number((all >> BigInt(shift)) & BigInt((1 << f.bits) - 1));
    if (v >= f.steps) return { error: `that code's ${f.key} is off its scale` };
    d[f.key] = v;
  }
  return { design: d };
}

/**
 * The check character: the characters weighted 1, 3, 5 ..., summed mod 32. Odd weights have an
 * inverse mod 32, so changing any one character always changes the sum.
 */
function check(syms: number[]): number {
  let a = 0;
  for (let i = 0; i < syms.length; i++) a = (a + (2 * i + 1) * syms[i]) % 32;
  return a;
}
