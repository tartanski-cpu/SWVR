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
 * The error shrinks by that factor (~0.17 here) each iteration; 4 iterations ≈ sub-mm.
 *
 * Phases are wrapped to [0, 2π) on the CPU in double precision, so the shader never sees
 * a large `t` and float32 precision does not degrade over long sessions.
 */
import { CONFIG } from '../config';
import { wrap } from '../core/math';

const TWO_PI = Math.PI * 2;

/** Serializable description of one wave component (lives in EnvironmentState). */
export interface WaveComponent {
  amplitude: number;
  period: number;
  directionDeg: number;
  steepness: number;
  phase: number;
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
    out[i] = w;
  }
  return out;
}

/** Horizontal displacement H(p0) of the particle with rest position (x0, z0). */
function horizontalDisplacement(waves: readonly PreparedWave[], x0: number, z0: number, out: { x: number; z: number }) {
  let hx = 0;
  let hz = 0;
  for (const w of waves) {
    const c = Math.cos(w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase);
    hx += w.horizontal * w.dirX * c;
    hz += w.horizontal * w.dirZ * c;
  }
  out.x = hx;
  out.z = hz;
}

const scratchH = { x: 0, z: 0 };

/**
 * Rest position (x0, z0) of the particle currently at world point (x, z).
 * See the header comment for why this iteration converges.
 */
export function restPosition(waves: readonly PreparedWave[], x: number, z: number, iterations = 4): [number, number] {
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
  let x = x0;
  let y = 0;
  let z = z0;
  for (const w of waves) {
    const theta = w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    x += w.horizontal * w.dirX * c;
    y += w.amplitude * s;
    z += w.horizontal * w.dirZ * c;
  }
  return [x, y, z];
}

/** Water surface elevation (m above mean level) at world point (x, z). */
export function surfaceHeight(waves: readonly PreparedWave[], x: number, z: number): number {
  const [x0, z0] = restPosition(waves, x, z);
  let y = 0;
  for (const w of waves) y += w.amplitude * Math.sin(w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase);
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
  let y = 0;
  // Tangent along x0: (1 + txx, txy, txz); along z0: (tzx, tzy, 1 + tzz)
  let txx = 0, txy = 0, txz = 0, tzy = 0, tzz = 0; // prettier-ignore
  let vx = 0, vy = 0, vz = 0; // prettier-ignore
  for (const w of waves) {
    const theta = w.k * (w.dirX * x0 + w.dirZ * z0) - w.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    y += w.amplitude * s;
    const qks = w.horizontal * w.k * s;
    const akc = w.amplitude * w.k * c;
    txx -= qks * w.dirX * w.dirX;
    txz -= qks * w.dirX * w.dirZ;
    tzz -= qks * w.dirZ * w.dirZ;
    txy += akc * w.dirX;
    tzy += akc * w.dirZ;
    vx += w.horizontal * w.dirX * w.omega * s;
    vz += w.horizontal * w.dirZ * w.omega * s;
    vy -= w.amplitude * w.omega * c;
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
  return { height: y, normal: [nx, ny, nz], velocity: [vx, vy, vz] };
}

/** Significant wave height of a sum of sinusoids: Hs = 4σ, σ² = Σ A²/2. */
export function significantWaveHeight(components: readonly WaveComponent[]): number {
  const variance = components.reduce((s, c) => s + (c.amplitude * c.amplitude) / 2, 0);
  return 4 * Math.sqrt(variance);
}

/** Σ Q·k·A. Must be < 1: guarantees no looping crests AND convergence of restPosition(). */
export function crestLoopFactor(components: readonly WaveComponent[]): number {
  return components.reduce((s, c) => s + c.steepness * wavenumberFromPeriod(c.period) * c.amplitude, 0);
}
