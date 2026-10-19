/**
 * The moon (environment/environmentView.ts, CONFIG.moon): after dusk the light comes from
 * the anti-sun point, a cool white at a fraction of the sun's strength; by day nothing changes.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createEnvironment } from '../src/environment/environmentState';
import { EnvironmentView } from '../src/environment/environmentView';

const at = (timeOfDay: number) => {
  const view = new EnvironmentView(new THREE.Scene());
  const env = createEnvironment();
  env.timeOfDay = timeOfDay;
  view.update(env, new THREE.Vector3(), 0);
  return view;
};

describe('the moon', () => {
  it('at midnight the light is the moon: up, cool, a fraction of the sun', () => {
    const v = at(0.5);
    expect(v.moon).toBeGreaterThan(0.9);
    expect(v.sunDir.y).toBeGreaterThan(0.2);
    expect(v.sunIntensity).toBeCloseTo(CONFIG.moon.light * v.moon, 3);
    expect(v.sunColor.b).toBeGreaterThan(v.sunColor.r);
    expect(v.sun.intensity).toBeGreaterThan(0);
  });
  it('at noon the sun is the light and the moon counts for nothing', () => {
    const v = at(12);
    expect(v.moon).toBe(0);
    expect(v.sunIntensity).toBeGreaterThan(2);
  });
});
