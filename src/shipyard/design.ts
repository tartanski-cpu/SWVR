/**
 * A Shipyard design (owner, Oct 2026): the choices you make in the Shipyard page, and their
 * short code. The code holds the choices, not the boat: the game rebuilds exactly the same
 * boat from them (shipyard/build.ts), so it stays short enough to type in VR and needs no
 * server. A code is tied to its `version` of the building rules: when the rules change,
 * the version goes up and older codes are upgraded (or refused with a reason).
 *
 * Every choice is a whole number on a fixed scale (its `steps`), so the code is exact:
 *   version 3 bits, base hull 2, length 4, beam 4, depth 4, bulwark 3,
 *   wheelhouse position 4, length 4, width 3, headroom 3, sunk floor 1,
 *   engine 2, gearbox 4, controls 1, paint 3                   = 45 bits
 * = 9 characters of Crockford base 32 (digits and letters without I, L, O and U, so
 * nothing looks like anything else), and a 10th, a check character (a weighted sum of the
 * nine: any one mistyped character is caught). Shown as two groups of five: K7P4Q-2ZX9D.
 */

/** The building rules this code was made with. */
export const DESIGN_VERSION = 1;

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
  /** Wheelhouse: where along the deck (aft .. forward), its length, its width, its headroom. */
  housePos: number;
  houseLength: number;
  houseWidth: number;
  headroom: number;
  /** Its floor sunk below the deck (a step down into it, for headroom). */
  sunk: number;
  /** Engine package (ENGINES), and the gearbox ratio matched to it (by sea trial in the Shipyard). */
  engine: number;
  gear: number;
  /** Controls package: 0 basic, 1 advanced. */
  controls: number;
  /** Paint (LIVERIES). */
  paint: number;
}

/** Each choice's number of steps (its bits: steps <= 2^bits) and what a step means. */
export const FIELDS: { key: keyof ShipDesign; bits: number; steps: number }[] = [
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
  housePos: 4,
  houseLength: 2,
  houseWidth: 7,
  headroom: 3,
  sunk: 1,
  engine: 1,
  gear: 2,
  controls: 1,
  paint: 0,
};

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The design as its code, e.g. 'K7P4Q-2ZX9D'. */
export function encodeDesign(d: ShipDesign): string {
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let b = n - 1; b >= 0; b--) bits.push((v >> b) & 1);
  };
  put(DESIGN_VERSION, 3);
  for (const f of FIELDS) {
    const v = d[f.key];
    if (!Number.isInteger(v) || v < 0 || v >= f.steps) throw new Error(`design ${f.key} ${v} is off its scale (0..${f.steps - 1})`);
    put(v, f.bits);
  }
  const syms: number[] = [];
  for (let i = 0; i < bits.length; i += 5) syms.push(bits.slice(i, i + 5).reduce((a, b) => a * 2 + b, 0));
  syms.push(check(syms));
  const s = syms.map((v) => ALPHABET[v]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/**
 * A code back to its design, or why it can't be read. Forgiving as typed: any case, with
 * or without the dash or spaces, and I / L read as 1, O as 0.
 */
export function decodeDesign(code: string): { design: ShipDesign } | { error: string } {
  const s = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (s.length !== 10) return { error: `a design code has 10 characters (this has ${s.length})` };
  const syms: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { error: `'${ch}' isn't used in design codes` };
    syms.push(v);
  }
  if (check(syms.slice(0, 9)) !== syms[9]) return { error: 'that code has a mistyped character (its check doesn’t match)' };
  const body: number[] = [];
  for (const v of syms.slice(0, 9)) for (let b = 4; b >= 0; b--) body.push((v >> b) & 1);
  let i = 0;
  const take = (n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 2 + body[i++];
    return v;
  };
  const version = take(3);
  if (version !== DESIGN_VERSION) return { error: `that code is from Shipyard version ${version}; this game reads version ${DESIGN_VERSION}` };
  const d = {} as ShipDesign;
  for (const f of FIELDS) {
    const v = take(f.bits);
    if (v >= f.steps) return { error: `that code's ${f.key} is off its scale` };
    d[f.key] = v;
  }
  return { design: d };
}

/**
 * The check character: the nine weighted 1, 3, 5 ... 17, summed mod 32. Odd weights have an
 * inverse mod 32, so changing any one character always changes the sum.
 */
function check(syms: number[]): number {
  let a = 0;
  for (let i = 0; i < syms.length; i++) a = (a + (2 * i + 1) * syms[i]) % 32;
  return a;
}
