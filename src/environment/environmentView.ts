import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentState } from './timeOfDay';
import { skyPalette, sunDirection, sunElevationDeg } from './timeOfDay';

/**
 * Renders the environment state: sun light, sky (hemisphere) light, background and fog.
 * Milestone 2 replaces the flat background with a gradient sky dome and sun disc.
 */
export class EnvironmentView {
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
  private readonly background = new THREE.Color();
  private readonly fog: THREE.Fog;
  private lastTimeOfDay = Number.NaN;

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.Fog(0xffffff, CONFIG.environment.fogNear, CONFIG.environment.fogFar);
    scene.fog = this.fog;
    scene.background = this.background;
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  /** @param focus world position the sun light should be centred on (the player). */
  update(env: EnvironmentState, focus: THREE.Vector3): void {
    const dir = sunDirection(env.timeOfDay);
    this.sun.target.position.copy(focus);
    this.sun.position.set(focus.x + dir[0] * 100, focus.y + dir[1] * 100, focus.z + dir[2] * 100);

    // Palette only changes when the time changes.
    if (env.timeOfDay === this.lastTimeOfDay) return;
    this.lastTimeOfDay = env.timeOfDay;

    const p = skyPalette(sunElevationDeg(dir));
    this.background.setRGB(...p.horizon, THREE.SRGBColorSpace);
    this.fog.color.setRGB(...p.fog, THREE.SRGBColorSpace);
    this.sun.color.setRGB(...p.sunColor, THREE.SRGBColorSpace);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setRGB(...p.zenith, THREE.SRGBColorSpace);
    this.hemi.groundColor.setRGB(p.horizon[0] * 0.3, p.horizon[1] * 0.35, p.horizon[2] * 0.4, THREE.SRGBColorSpace);
    this.hemi.intensity = p.ambientIntensity;
  }
}
