/**
 * Gerstner (trochoidal) ocean surface: the single source of truth for wave maths.
 *
 * The vertex shader (ocean.vert.glsl) evaluates exactly the same sum, fed by the
 * PreparedWave values computed here, so physics and visuals agree.
 *
 * ── The surface ────────────────────────────────────────────────────────────────
 * A water particle whose rest position on the mean surface is p0 = (x0, z0) is displaced to
 *
 *   P(p0, t) = ( x0 + Σ Qi·Ai·Dxi·cos θi,   Σ Ai·sin θi,   z0 + Σ Qi·Ai·Dzi·cos θi )
 *   θi = ki·(Di · p0) − (ωi·t − φi)
 *
 * with Di the unit travel direction, ki the wavenumber, ωi² = g·ki (deep-water dispersion),
 * Ai the amplitude and Qi ∈ [0,1] the horizontal orbit fraction. Particles move toward the
 * crest, giving the sharper crests / flatter troughs of a trochoid.
 *
 * ── Height at a world point ────────────────────────────────────────────────────
 * Because the surface also moves sideways, the height above a fixed world point (x, z) is
 * NOT simply Σ A sin θ evaluated at (x, z). We must first find the rest position p0 whose
 * particle ends up at (x, z):  p0 + H(p0) = (x, z),  H = horizontal displacement.
 * Fixed-point iteration p0 ← (x, z) − H(p0) converges because |∂H/∂p0| ≤ Σ Qi·ki·Ai < 1,
 * which is the very same condition that stops crests from looping over themselves.
 * The error shrinks by that factor each iteration (0.24 in the moderate sea, 0.35 in a
 * storm); 6 iterations keep it under a centimetre even then.
 *
 * Phases are wrapped to [0, 2π) on the CPU in double precision, so the shader never sees
 * a large `t` and float32 precision does not degrade over long sessions.
 *
 * ── Sheltered water ────────────────────────────────────────────────────────────
 * In harbours and bays every component is scaled by s(x0, z0) ≤ 1 (world/shelter.ts),
 * evaluated at the rest position like the phase. s ≤ 1 only shrinks Σ Q·k·A, so the
 * convergence argument above still holds.
 */
import { CONFIG } from '../config';
import { wrap } from '../core/math';
import { arcShelter, shelterFactor } from '../world/shelter';
import { addCurrent, raceAt, raceOpposition, type RaceHere } from '../world/currents';

/**
 * The amplitude factor at rest position (x0, z0) that is the same for every wave: sheltered
 * water (<= 1) times the tidal races' standing waves (>= 1 while one runs). A bay with a gap
 * (ShelterDef.openArcDeg) is applied per wave on top, by its direction: arcShelter. The
 * shader applies the same (gerstner.glsl). `race` is filled with the strongest running race
 * there, for the overfalls (waveFactors below).
 */
export function waveFactorAt(x0: number, z0: number, race: RaceHere = RACE): number {
  return shelterFactor(x0, z0) * raceAt(x0, z0, race).f;
}
/** The whole factor for one wave: the common part times the gapped bays' shelter from its direction. */
export function waveFactorFor(x0: number, z0: number, w: PreparedWave, common: number): number {
  return common * arcShelter(x0, z0, w.dirX, w.dirZ);
}

/** The factors for one wave: on its height (`amp`) and on its crest sharpness (`hor`, the orbit). */
export interface WaveFactors {
  amp: number;
  hor: number;
}
const RACE: RaceHere = { f: 1, setX: 0, setZ: 0, sw: 0 };
const FACTORS: WaveFactors = { amp: 1, hor: 1 };

/** Σ Q·k·A of a prepared set, the sea's waves and the chop apart (prepareWaves), for the crest-loop cap. */
const LOOPS = new WeakMap<readonly PreparedWave[], { sea: number; chop: number }>();
/** The crests may loop over past Σ Q·k·A = 1: the overfalls' orbits are capped at this. */
export const LOOP_CAP = 0.92;
let capHere = 1;

/**
 * The common factor at (x0, z0) for a prepared set (waveFactorAt), with the race there in
 * RACE and the crest-loop cap for the overfalls: where the race's standing waves and the
 * overfalls would push Σ Q·k·A past LOOP_CAP, the orbits (not the heights) are scaled back
 * so the crests never fold over. The shader does the same (gerstner.glsl).
 */
function commonFactors(waves: readonly PreparedWave[], x0: number, z0: number): number {
  const common = waveFactorAt(x0, z0, RACE);
  capHere = 1;
  if (RACE.sw !== 0) {
    const l = LOOPS.get(waves);
    if (l) {
      const o = CONFIG.currents.overfalls;
      const a = Math.abs(RACE.sw);
      const worst = l.sea * RACE.f * (1 + o.heighten * a) * (1 + o.steepen * a) + l.chop * a;
      if (worst > LOOP_CAP) capHere = LOOP_CAP / worst;
    }
  }
  return common;
}

/**
 * One wave's factors at (x0, z0), with the overfalls (CONFIG.currents.overfalls): in a race
 * running against it, a wave stands higher and sharper; with the flow, a little lower. The
 * chop waves are nothing but where they oppose a running race. `common` is waveFactorAt
 * (shelter × the race's own factor), with `race` as it filled it.
 */
export function waveFactors(x0: number, z0: number, w: PreparedWave, common: number, race: RaceHere = RACE, out: WaveFactors = FACTORS): WaveFactors {
  const s = waveFactorFor(x0, z0, w, common);
  const o = CONFIG.currents.overfalls;
  const opp = race.sw === 0 ? 0 : raceOpposition(race, w.dirX, w.dirZ);
  if (w.chop) {
    // Shelter and the bays as the others, but not the race's own standing-wave factor.
    const f = (s / race.f) * Math.max(0, opp);
    out.amp = f;
    out.hor = f * (race === RACE ? capHere : 1);
    return out;
  }
  const against = Math.max(0, opp);
  const amp = s * (1 + o.heighten * against - o.flatten * Math.max(0, -opp));
  out.amp = amp;
  out.hor = amp * (1 + o.steepen * against) * (race === RACE ? capHere : 1);
  return out;
}

const TWO_PI = Math.PI * 2;

/** Serializable description of one wave component (lives in EnvironmentState). */
export interface WaveComponent {
  amplitude: number;
  period: number;
  directionDeg: number;
  steepness: number;
  phase: number;
  /** The overfalls' chop (CONFIG.currents.overfalls): nowhere but in a race running against it. */
  chop?: boolean;
}

/** Per-frame/per-tick evaluated constants for one component. */
export interface PreparedWave {
  dirX: number;
  dirZ: number;
  /** Wavenumber k = 2π/λ (rad/m). */
  k: number;
  /** Angular frequency ω (rad/s). */
  omega: number;
  amplitude: number;
  /** Horizontal orbit amplitude Q·A (m). */
  horizontal: number;
  /** (ω·t − φ) wrapped to [0, 2π). */
  phase: number;
  wavelength: number;
  chop: boolean;
}

export function wavenumberFromPeriod(period: number, g = CONFIG.ocean.gravity): number {
  const omega = TWO_PI / period;
  return (omega * omega) / g;
}

/** Evaluate per-component constants at time `t` (s). Reuses `out` to avoid allocation. */
export function prepareWaves(components: readonly WaveComponent[], t: number, out: PreparedWave[] = []): PreparedWave[] {
  out.length = components.length;
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    const omega = TWO_PI / c.period;
    const k = wavenumberFromPeriod(c.period);
    const bearing = (c.directionDeg * Math.PI) / 180;
    const w = out[i] ?? ({} as PreparedWave);
    w.dirX = Math.sin(bearing); // east component
    w.dirZ = -Math.cos(bearing); // north is -Z
    w.k = k;
    w.omega = omega;
    w.amplitude = c.amplitude;
    w.horizontal = c.steepness * c.amplitude;
    w.phase = wrap(omega * t - c.phase, TWO_PI);
    w.wavelength = TWO_PI / k;
    w.chop = !!c.chop;
    out[i] = w;
  }
  let sea = 0;
  let chop = 0;
  for (const w of out) {
    if (w.chop) chop += w.horizontal * w.k;
    else sea += w.horizontal * w.k;
  }
  LOOPS.set(out, { sea, chop });
  return out;
}

/** The set's Σ Q·k·A, the sea's waves and the chop apart (for the ocean shader's cap). */
export function loopSums(waves: readonly PreparedWave[]): { sea: number; chop: number } {
  return LOOPS.get(waves) ?? { sea: 0, chop: 0 };
}

/** Horizontal displacement H(p0) of the particle with rest position (x0, z0). */
function horizontalDisplacement(waves: readonly PreparedWave[], x0: number, z0: number, out: { x: number; z: number }) {
  let hx = 0;
  let hz = 0;
  const common = waves.length > 0 ? commonFactors(waves, x0, z0) : 1;
  for (const w of waves) {
    const s = waveFactors(x0, z0, w, common).hor;
    const c = Math.cos(w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase) * s;
    hx += w.horizontal * w.dirX * c;
    hz += w.horizontal * w.dirZ * c;
  }
  out.x = hx;
  out.z = hz;
}

const scratchH = { x: 0, z: 0 };
const cur = { x: 0, z: 0 };

/**
 * Rest position (x0, z0) of the particle currently at world point (x, z).
 * See the header comment for why this iteration converges.
 */
export function restPosition(waves: readonly PreparedWave[], x: number, z: number, iterations = 6): [number, number] {
  let x0 = x;
  let z0 = z;
  for (let i = 0; i < iterations; i++) {
    horizontalDisplacement(waves, x0, z0, scratchH);
    x0 = x - scratchH.x;
    z0 = z - scratchH.z;
  }
  return [x0, z0];
}

/** Full displaced position of the particle with rest position (x0, z0). */
export function displacedPosition(waves: readonly PreparedWave[], x0: number, z0: number): [number, number, number] {
  const common = waves.length > 0 ? commonFactors(waves, x0, z0) : 1;
  let x = x0;
  let y = 0;
  let z = z0;
  for (const w of waves) {
    const f = waveFactors(x0, z0, w, common);
    const theta = w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    x += f.hor * w.horizontal * w.dirX * c;
    y += f.amp * w.amplitude * s;
    z += f.hor * w.horizontal * w.dirZ * c;
  }
  return [x, y, z];
}

/** Water surface elevation (m above mean level) at world point (x, z). */
export function surfaceHeight(waves: readonly PreparedWave[], x: number, z: number): number {
  if (waves.length === 0) return 0;
  const [x0, z0] = restPosition(waves, x, z);
  const common = commonFactors(waves, x0, z0);
  let y = 0;
  for (const w of waves) y += w.amplitude * waveFactors(x0, z0, w, common).amp * Math.sin(w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase);
  return y;
}

export interface SurfaceSample {
  height: number;
  /** Unit surface normal. */
  normal: [number, number, number];
  /** Velocity of the surface water particle (m/s): orbital motion. */
  velocity: [number, number, number];
}

/**
 * Height, normal and particle velocity at world point (x, z).
 *
 * Normal: cross product of the surface tangents ∂P/∂z0 × ∂P/∂x0, with ∂θ/∂x0 = k·Dx etc.
 * Velocity: ∂P/∂t at fixed p0, using ∂θ/∂t = −ω.
 */
export function sampleSurface(waves: readonly PreparedWave[], x: number, z: number): SurfaceSample {
  const [x0, z0] = restPosition(waves, x, z);
  const common = waves.length > 0 ? commonFactors(waves, x0, z0) : 1;
  let y = 0;
  // Tangent along x0: (1 + txx, txy, txz); along z0: (tzx, tzy, 1 + tzz)
  let txx = 0, txy = 0, txz = 0, tzy = 0, tzz = 0; // prettier-ignore
  let vx = 0, vy = 0, vz = 0; // prettier-ignore
  for (const w of waves) {
    const theta = w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const f = waveFactors(x0, z0, w, common);
    const amp = w.amplitude * f.amp;
    const hor = w.horizontal * f.hor;
    y += amp * s;
    const qks = hor * w.k * s;
    const akc = amp * w.k * c;
    txx -= qks * w.dirX * w.dirX;
    txz -= qks * w.dirX * w.dirZ;
    tzz -= qks * w.dirZ * w.dirZ;
    txy += akc * w.dirX;
    tzy += akc * w.dirZ;
    vx += hor * w.dirX * w.omega * s;
    vz += hor * w.dirZ * w.omega * s;
    vy -= amp * w.omega * c;
  }
  // Tx = (1+txx, txy, txz), Tz = (txz, tzy, 1+tzz)  (the cross term is symmetric)
  const ax = txz, ay = tzy, az = 1 + tzz; // Tz
  const bx = 1 + txx, by = txy, bz = txz; // Tx
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz);
  nx /= len;
  ny /= len;
  nz /= len;
  // The tidal races: the water itself moving (world/currents.ts), on top of the orbits.
  cur.x = 0;
  cur.z = 0;
  addCurrent(x, z, cur);
  return { height: y, normal: [nx, ny, nz], velocity: [vx + cur.x, vy, vz + cur.z] };
}

/**
 * The sea at a point as a hull feels it (vessel/physics added resistance): the waves'
 * amplitudes there added up (with the shelter and the overfalls), and the direction they
 * travel, weighted by amplitude (unit vector; zero in a flat calm).
 */
export function localSeaAt(waves: readonly PreparedWave[], x: number, z: number, out = { amp: 0, dirX: 0, dirZ: 0 }): { amp: number; dirX: number; dirZ: number } {
  out.amp = 0;
  out.dirX = 0;
  out.dirZ = 0;
  if (waves.length === 0) return out;
  const common = commonFactors(waves, x, z);
  for (const w of waves) {
    const a = w.amplitude * waveFactors(x, z, w, common).amp;
    out.amp += a;
    out.dirX += a * w.dirX;
    out.dirZ += a * w.dirZ;
  }
  const n = Math.hypot(out.dirX, out.dirZ);
  if (n > 1e-9) {
    out.dirX /= n;
    out.dirZ /= n;
  }
  return out;
}

/** Significant wave height of a sum of sinusoids: Hs = 4σ, σ² = Σ A²/2. */
export function significantWaveHeight(components: readonly WaveComponent[]): number {
  const variance = components.reduce((s, c) => s + (c.amplitude * c.amplitude) / 2, 0);
  return 4 * Math.sqrt(variance);
}

/**
 * Σ Q·k·A of the open sea. Must be < 1: guarantees no looping crests AND convergence of
 * restPosition(). The overfalls' chop is left out: it is nothing outside a running race,
 * and inside one the orbits are capped (commonFactors, LOOP_CAP).
 */
export function crestLoopFactor(components: readonly WaveComponent[]): number {
  return components.reduce((s, c) => s + (c.chop ? 0 : c.steepness * wavenumberFromPeriod(c.period) * c.amplitude), 0);
}
