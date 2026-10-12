import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentState } from './environmentState';
import { skyPalette, sunDirection, sunElevationDeg } from './timeOfDay';

/**
 * Turns environment state into lights, fog and a set of shared colours/vectors that the
 * sky dome and ocean shader read every frame (so everything agrees on one palette).
 * Colours are stored in Three's linear working space.
 */
export class EnvironmentView {
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);

  // Shared, read-only for other views.
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly sunColor = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly horizon = new THREE.Color();
  sunIntensity = 1;
  ambientIntensity = 1;

  private readonly background = new THREE.Color();
  private readonly fog: THREE.Fog;
  private lastTimeOfDay = Number.NaN;

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.Fog(0xffffff, CONFIG.environment.fogNear, CONFIG.environment.fogFar);
    scene.fog = this.fog;
    scene.background = this.background; // clear colour behind the sky dome
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  get fogColor(): THREE.Color {
    return this.fog.color;
  }

  get fogNear(): number {
    return this.fog.near;
  }

  get fogFar(): number {
    return this.fog.far;
  }

  /** @param focus world position the sun light should be centred on (the player). */
  update(env: EnvironmentState, focus: THREE.Vector3): void {
    // Palette only changes when the time changes.
    if (env.timeOfDay !== this.lastTimeOfDay) {
      this.lastTimeOfDay = env.timeOfDay;
      this.applyTimeOfDay(env.timeOfDay);
    }
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 100);
  }

  private applyTimeOfDay(timeOfDay: number): void {
    const dir = sunDirection(timeOfDay);
    this.sunDir.set(dir[0], dir[1], dir[2]);

    const p = skyPalette(sunElevationDeg(dir));
    this.zenith.setRGB(...p.zenith, THREE.SRGBColorSpace);
    this.horizon.setRGB(...p.horizon, THREE.SRGBColorSpace);
    this.sunColor.setRGB(...p.sunColor, THREE.SRGBColorSpace);
    this.sunIntensity = p.sunIntensity;
    this.ambientIntensity = p.ambientIntensity;

    this.background.copy(this.horizon);
    this.fog.color.setRGB(...p.fog, THREE.SRGBColorSpace);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = p.sunIntensity;
    // Sky light: average of zenith and horizon - the whole dome lights a shaded wall, and
    // the pure zenith blue made white paint look navy.
    this.hemi.color.copy(this.zenith).lerp(this.horizon, 0.55);
    this.hemi.groundColor.setRGB(p.horizon[0] * 0.3, p.horizon[1] * 0.35, p.horizon[2] * 0.4, THREE.SRGBColorSpace);
    this.hemi.intensity = p.ambientIntensity * 1.35;
  }
}
