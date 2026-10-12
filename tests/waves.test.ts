import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  crestLoopFactor,
  displacedPosition,
  prepareWaves,
  sampleSurface,
  significantWaveHeight,
  surfaceHeight,
  wavenumberFromPeriod,
} from '../src/ocean/waves';

const components = CONFIG.ocean.waves;

// Deterministic pseudo-random numbers so failures are reproducible.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('wave configuration', () => {
  it('uses deep-water dispersion (λ = gT²/2π)', () => {
    const lambda = (2 * Math.PI) / wavenumberFromPeriod(7);
    expect(lambda).toBeCloseTo((9.81 * 49) / (2 * Math.PI), 6); // ≈ 76.5 m
  });

  it('describes a moderate sea, Hs ≈ 1.0-1.5 m', () => {
    const hs = significantWaveHeight(components);
    expect(hs).toBeGreaterThan(1.0);
    expect(hs).toBeLessThan(1.5);
  });

  it('cannot form looping crests (Σ Q·k·A < 1), so the height inversion converges', () => {
    expect(crestLoopFactor(components)).toBeLessThan(0.5);
  });
});

describe('CPU surface queries', () => {
  const rand = rng(42);

  it('surfaceHeight() at a displaced particle position returns that particle height', () => {
    for (const t of [0, 3.7, 1234.5]) {
      const waves = prepareWaves(components, t);
      for (let i = 0; i < 200; i++) {
        const x0 = (rand() - 0.5) * 400;
        const z0 = (rand() - 0.5) * 400;
        const [x, y, z] = displacedPosition(waves, x0, z0);
        expect(Math.abs(surfaceHeight(waves, x, z) - y)).toBeLessThan(1e-3);
      }
    }
  });

  it('normal matches finite differences of the height field', () => {
    const waves = prepareWaves(components, 17.2);
    const h = 1e-3;
    for (let i = 0; i < 50; i++) {
      const x = (rand() - 0.5) * 200;
      const z = (rand() - 0.5) * 200;
      const dhdx = (surfaceHeight(waves, x + h, z) - surfaceHeight(waves, x - h, z)) / (2 * h);
      const dhdz = (surfaceHeight(waves, x, z + h) - surfaceHeight(waves, x, z - h)) / (2 * h);
      const len = Math.hypot(dhdx, 1, dhdz);
      const [nx, ny, nz] = sampleSurface(waves, x, z).normal;
      expect(nx).toBeCloseTo(-dhdx / len, 3);
      expect(ny).toBeCloseTo(1 / len, 3);
      expect(nz).toBeCloseTo(-dhdz / len, 3);
    }
  });

  it('particle velocity matches the time derivative of the displacement', () => {
    const dt = 1e-4;
    for (let i = 0; i < 30; i++) {
      const t = rand() * 100;
      const x0 = (rand() - 0.5) * 200;
      const z0 = (rand() - 0.5) * 200;
      const a = displacedPosition(prepareWaves(components, t - dt), x0, z0);
      const b = displacedPosition(prepareWaves(components, t + dt), x0, z0);
      const [x, , z] = displacedPosition(prepareWaves(components, t), x0, z0);
      const v = sampleSurface(prepareWaves(components, t), x, z).velocity;
      for (let k = 0; k < 3; k++) expect(v[k]).toBeCloseTo((b[k] - a[k]) / (2 * dt), 2);
    }
  });

  it('a calm sea is flat', () => {
    const waves = prepareWaves([], 10);
    const s = sampleSurface(waves, 5, -3);
    expect(s.height).toBe(0);
    expect(s.normal).toEqual([0, 1, 0]);
  });
});
