import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentState } from './environmentState';
import { skyPalette, sunDirection, sunElevationDeg } from './timeOfDay';
import { visibilityAt } from './weather';

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
  private lastKey = '';
  /** Visibility where the viewer is (m), for anything that wants it (spotting, sounds). */
  visibility = Infinity;
  /** A lightning flash now, 0..1 (the clouds light up with it: skyView.ts). */
  flash = 0;
  /** The moon is the light now, 0..1 (sunDir, sunColor and sunIntensity are the moon's). */
  moon = 0;

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.Fog(0xffffff, CONFIG.environment.hazeFar * CONFIG.weather.hazeNearFraction, CONFIG.environment.hazeFar);
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

  /**
   * @param focus world position the sun light should be centred on (the player).
   * @param time  world time (s), for lightning flashes.
   */
  update(env: EnvironmentState, focus: THREE.Vector3, time = 0): void {
    // Weather where you are: cloud cover, rain, and visibility (fog banks included).
    const w = env.weather?.now;
    const cloud = w?.cloud ?? 0;
    const rain = w?.rain ?? 0;
    this.visibility = visibilityAt(env, focus.x, focus.z);
    // The palette only changes when the time or the weather visibly does - or during a
    // lightning flash (a third of a second, recomputed each frame, then once more after).
    const flash = this.flashLevel(env, time);
    this.flash = flash;
    const key = `${env.timeOfDay.toFixed(3)}|${cloud.toFixed(2)}|${rain.toFixed(2)}|${Math.round(Math.log(this.visibility) * 20)}`;
    if (key !== this.lastKey || flash > 0 || this.flashing) {
      this.lastKey = key;
      this.applyTimeOfDay(env.timeOfDay);
      this.applyWeather(cloud, this.visibility, rain);
      if (flash > 0) this.applyFlash(flash);
      this.flashing = flash > 0;
    }
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 100);
  }

  private applyTimeOfDay(timeOfDay: number): void {
    const dir = sunDirection(timeOfDay);
    this.sunDir.set(dir[0], dir[1], dir[2]);

    const elev = sunElevationDeg(dir);
    const p = skyPalette(elev);
    this.zenith.setRGB(...p.zenith, THREE.SRGBColorSpace);
    this.horizon.setRGB(...p.horizon, THREE.SRGBColorSpace);
    this.sunColor.setRGB(...p.sunColor, THREE.SRGBColorSpace);
    this.sunIntensity = p.sunIntensity;
    this.ambientIntensity = p.ambientIntensity;
    // The moon (CONFIG.moon): from dusk, the light comes from the anti-sun point, a full moon
    // opposite the sun: the sky's disc and glow, the sea's glitter path and the shadows
    // follow it as they do the sun, at a fraction of the strength and a cool white.
    const m = CONFIG.moon;
    const night = Math.min(1, Math.max(0, (m.from - elev) / (m.from - m.full)));
    const moonUp = Math.min(1, Math.max(0, -dir[1] * 4));
    this.moon = night * moonUp;
    if (this.moon > 0) {
      this.sunDir.set(-dir[0], -dir[1], -dir[2]);
      this.sunColor.setHex(m.color);
      this.sunIntensity = m.light * this.moon;
      this.ambientIntensity += m.ambient * this.moon;
    }

    this.background.copy(this.horizon);
    this.fog.color.setRGB(...p.fog, THREE.SRGBColorSpace);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = this.sunIntensity; // (the moon's at night)
    // Sky light: average of zenith and horizon - the whole dome lights a shaded wall, and
    // the pure zenith blue made white paint look navy.
    this.hemi.color.copy(this.zenith).lerp(this.horizon, 0.55);
    this.hemi.groundColor.setRGB(p.horizon[0] * 0.3, p.horizon[1] * 0.35, p.horizon[2] * 0.4, THREE.SRGBColorSpace);
    this.hemi.intensity = this.ambientIntensity * 1.35;
    // (applyWeather sets the fog's reach from today's visibility right after this.)
    this.fog.far = CONFIG.environment.hazeFar;
    this.fog.near = this.fog.far * CONFIG.weather.hazeNearFraction;
  }

  /**
   * Weather on top of the time-of-day palette:
   *   cloud      the sky greys toward its own brightness, the sun dims (up to 75 %), the
   *              sky light a little;
   *   visibility scene fog closes in (built-in linear fog, out to the visibility or the
   *              clearest day's haze), and in thick fog the whole sky turns the fog colour.
   * Everything that reads the shared colours (sky dome, ocean, lights) follows.
   */
  private applyWeather(cloud: number, visibility: number, rain: number): void {
    const grey = (c: THREE.Color, amount: number, scale: number) => {
      const l = (0.3 * c.r + 0.59 * c.g + 0.11 * c.b) * scale;
      c.lerp(this.tmpColor.setRGB(l, l * 1.02, l * 1.06), amount);
    };
    if (cloud > 0.01) {
      grey(this.zenith, cloud * 0.85, 1.1);
      grey(this.horizon, cloud * 0.7, 0.95);
      this.sunIntensity *= 1 - 0.75 * cloud;
      this.ambientIntensity *= 1 - 0.2 * cloud;
      this.sun.intensity = this.sunIntensity;
      this.hemi.intensity = this.ambientIntensity * 1.35;
      this.hemi.color.copy(this.zenith).lerp(this.horizon, 0.55);
    }
    if (rain > 0.01) {
      // Rain clouds are darker still: a squall is gloomy.
      const k = 1 - CONFIG.weather.rainDarken * rain;
      this.sunIntensity *= k;
      this.ambientIntensity *= k;
      this.sun.intensity = this.sunIntensity;
      this.hemi.intensity = this.ambientIntensity * 1.35;
      this.zenith.multiplyScalar(k);
      this.horizon.multiplyScalar(0.5 + 0.5 * k);
    }
    // Fog out to the visibility, or to the clearest day's haze (regions: the far land shows
    // across a sound). In fog the clear band in front is short (nearFraction); in clear air
    // the sea is crisp for a few km and only the far land softens (hazeNearFraction).
    const far = Math.min(CONFIG.environment.hazeFar, visibility);
    const clarity = Math.min(1, Math.max(0, (Math.log(far) - Math.log(3000)) / (Math.log(CONFIG.environment.hazeFar) - Math.log(3000))));
    const nearFraction = CONFIG.weather.nearFraction + (CONFIG.weather.hazeNearFraction - CONFIG.weather.nearFraction) * clarity;
    this.fog.far = far;
    this.fog.near = far * nearFraction;
    // Fog: the sky dome takes the fog colour as visibility drops below ~3 km.
    const thick = 1 - Math.min(1, Math.max(0, (Math.log(visibility) - Math.log(300)) / (Math.log(3000) - Math.log(300))));
    if (thick > 0) {
      const fogC = this.tmpColor2.copy(this.horizon);
      grey(fogC, 0.6, 1.05);
      this.zenith.lerp(fogC, thick);
      this.horizon.lerp(fogC, thick);
    }
    this.background.copy(this.horizon);
    this.fog.color.copy(this.horizon);
  }

  /** How bright a lightning flash is now, 0..1: a double flicker, fainter far off. */
  private flashLevel(env: EnvironmentState, time: number): number {
    const L = env.weather?.lightning;
    if (!L || L.at < 0) return 0;
    const age = time - L.at;
    const T = CONFIG.weather.lightning.flashTime;
    if (age < 0 || age > T) return 0;
    const flicker = age < 0.06 ? 1 : age < 0.12 ? 0.15 : age < 0.2 ? 0.75 : 0.3 * (1 - (age - 0.2) / (T - 0.2));
    return flicker * (1 - 0.7 * Math.min(1, L.dist / 4500));
  }

  /** Lightning: the sky and the sky light jump toward a cold white. */
  private applyFlash(f: number): void {
    const white = this.tmpColor.setRGB(0.85, 0.88, 1.0);
    this.zenith.lerp(white, 0.6 * f);
    this.horizon.lerp(white, 0.5 * f);
    this.hemi.color.lerp(white, f);
    this.hemi.intensity = this.ambientIntensity * 1.35 * (1 + 6 * f);
    this.background.copy(this.horizon);
    this.fog.color.copy(this.horizon);
  }

  private flashing = false;
  private readonly tmpColor = new THREE.Color();
  private readonly tmpColor2 = new THREE.Color();
}
