import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentView } from '../environment/environmentView';
import { OCEAN_ORDER } from '../vessel/view/engineLook';
import { createOceanGeometry, distanceForCellSize } from './oceanGeometry';
import fragmentShader from './shaders/ocean.frag.glsl?raw';
import oceanVertex from './shaders/ocean.vert.glsl?raw';
import gerstnerChunk from './shaders/gerstner.glsl?raw';
import type { PreparedWave } from './waves';
import { createRippleTexture } from './rippleTexture';
import { foamNoiseTexture } from './foamNoise';
import { SHELTERS, type CurrentZoneDef, type ShelterDef } from '../world/archipelago';
import { knockPoints, raceStrength, setVector } from '../world/currents';

/** Races and whirl points the shader holds at once: those of the regions drawn in full. */
export const MAX_RACES = 4;
export const MAX_KNOCKS = 12;
import { MAX_SHELTERS } from '../world/shelter';
import { gustZone, type GustState } from '../environment/gusts';

export const MAX_WAVES = 8;
export { gerstnerChunk };

/**
 * The visible ocean: one large graded grid that follows the viewer, displaced on the GPU
 * by the same wave sum the CPU uses for physics (waves.ts).
 */
export class OceanView {
  readonly mesh: THREE.Mesh;
  /**
   * Uniforms other water-surface shaders share by reference (the wake): the wave sum,
   * shelter zones, viewer centre, lighting and fog. Updated here once per frame.
   */
  get sharedUniforms() {
    const u = this.uniforms;
    return {
      uWaveA: u.uWaveA,
      uWaveB: u.uWaveB,
      uWaveCount: u.uWaveCount,
      uCenter: u.uCenter,
      uShelter: u.uShelter,
      uShelterK: u.uShelterK,
      uShelterCount: u.uShelterCount,
      uShelterArc: u.uShelterArc,
      uRace: u.uRace,
      uRaceB: u.uRaceB,
      uRaceCount: u.uRaceCount,
      uRaceFade: u.uRaceFade,
      uSunIntensity: u.uSunIntensity,
      uAmbient: u.uAmbient,
      uFogColor: u.uFogColor,
      uFogNear: u.uFogNear,
      uFogFar: u.uFogFar,
    };
  }
  private readonly uniforms = {
    uWaveA: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uWaveB: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uWaveCount: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    // The shelter zones of the regions drawn in full (setShelters); home's to start with.
    uShelter: { value: Array.from({ length: MAX_SHELTERS }, () => new THREE.Vector4()) },
    uShelterK: { value: Array.from({ length: MAX_SHELTERS }, () => 1) },
    uShelterCount: { value: 0 },
    uShelterArc: { value: Array.from({ length: MAX_SHELTERS }, () => new THREE.Vector2()) },
    // Tidal races (setRaces, setRaceStrengths each frame) and their whirl points.
    uRace: { value: Array.from({ length: MAX_RACES }, () => new THREE.Vector4()) },
    uRaceB: { value: Array.from({ length: MAX_RACES }, () => new THREE.Vector4(1, 0, 0, 1)) },
    uRaceCount: { value: 0 },
    uRaceFade: { value: CONFIG.currents.edgeFade },
    uKnock: { value: Array.from({ length: MAX_KNOCKS }, () => new THREE.Vector4()) },
    uKnockCount: { value: 0 },
    // A katabatic gust's patch on the water (setGust): x, z, radius, strength; the way it blows.
    uGust: { value: new THREE.Vector4() },
    uGustDir: { value: new THREE.Vector2(1, 0) },
    uGustLook: { value: new THREE.Vector2(CONFIG.gusts.look.darken, CONFIG.gusts.look.spray) },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(CONFIG.ocean.colors.deep) },
    uScatter: { value: new THREE.Color(CONFIG.ocean.colors.scatter) },
    uFoam: { value: new THREE.Color(CONFIG.ocean.colors.foam) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunIntensity: { value: 1 },
    uAmbient: { value: 1 },
    uSpecPower: { value: CONFIG.ocean.specularPower },
    uReflection: { value: CONFIG.ocean.reflectionStrength },
    uCrestHeight: { value: 1 },
    uFoamAmount: { value: 0 },
    uPortLightPos: { value: new THREE.Vector3() },
    uPortLightColor: { value: new THREE.Color(0, 0, 0) },
    uPortLightRange: { value: 1 },
    uSpotPos: { value: new THREE.Vector3() },
    uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
    uSpotCos: { value: new THREE.Vector2(1, 1) },
    uSpotColor: { value: new THREE.Color(0, 0, 0) },
    uTorchPos: { value: new THREE.Vector3() },
    uTorchDir: { value: new THREE.Vector3(0, -1, 0) },
    uTorchCos: { value: new THREE.Vector2(1, 1) },
    uTorchColor: { value: new THREE.Color(0, 0, 0) },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 0 },
    uFogFar: { value: 1 },
    // Wind ripples (CONFIG.ocean.ripples): texture, per-layer uv offset (drift) and scale.
    uRipple: { value: createRippleTexture() },
    uRippleUv: { value: [new THREE.Vector4(), new THREE.Vector4()] }, // offset x, z; 1/scale; unused
    uRippleStrength: { value: CONFIG.ocean.ripples.strength },
    uRippleFade: { value: new THREE.Vector2(CONFIG.ocean.ripples.fadeNear, CONFIG.ocean.ripples.fadeFar) },
    // The wind's foam (CONFIG.ocean.windFoam): see update().
    uWindFoam: { value: new THREE.Vector4(1, 0, 0, 0) },
    uStreak: { value: new THREE.Vector3(1 / (8 * CONFIG.ocean.windFoam.streakLength), 1 / (8 * CONFIG.ocean.windFoam.streakWidth), 0) },
    uFoamNoise: { value: foamNoiseTexture() },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `${gerstnerChunk}\n${oceanVertex}`,
      fragmentShader,
      defines: { MAX_WAVES, MAX_SHELTERS, MAX_RACES, MAX_KNOCKS },
    });
    this.mesh = new THREE.Mesh(createOceanGeometry(), material);
    this.mesh.name = 'ocean';
    this.setShelters(SHELTERS);
    // Vertices move in the shader, so the CPU bounding volume is meaningless; it is
    // always around the viewer anyway.
    this.mesh.frustumCulled = false;
    // After the boats, and after their engine spaces' water stops (vessel/view/engineLook.ts).
    this.mesh.renderOrder = OCEAN_ORDER;
  }

  /**
   * @param waves  wave constants for the current render time (from prepareWaves)
   * @param viewer viewer world position; the grid is re-centred under it
   */
  /**
   * The sheltered-water zones the shader applies (the same formula as the CPU's
   * shelterFactor): those of the regions drawn in full, refreshed when that changes. The
   * CPU reads every region's zones; a zone the shader lacks would only be one far from
   * every player, so nobody sees the difference.
   */
  setShelters(zones: readonly ShelterDef[]): void {
    const u = this.uniforms;
    const n = Math.min(zones.length, MAX_SHELTERS);
    for (let i = 0; i < MAX_SHELTERS; i++) {
      const z = zones[i];
      if (i < n && z) u.uShelter.value[i].set(z.x, z.z, z.rIn, z.rOut);
      else u.uShelter.value[i].set(0, 0, 0, 0);
      u.uShelterK.value[i] = i < n && z ? z.factor : 1;
      // A gap: the bearing it opens from and the half-arc, in radians (arc 0 = none).
      if (i < n && z && z.openArcDeg) u.uShelterArc.value[i].set(((z.openFromDeg ?? 0) * Math.PI) / 180, (z.openArcDeg * Math.PI) / 180);
      else u.uShelterArc.value[i].set(0, 0);
    }
    u.uShelterCount.value = n;
  }

  private races: readonly CurrentZoneDef[] = [];

  /** The tidal races the shader draws: those of the regions drawn in full (set with the shelters). */
  setRaces(zones: readonly CurrentZoneDef[]): void {
    this.races = zones.slice(0, MAX_RACES);
    const u = this.uniforms;
    let nk = 0;
    this.races.forEach((z, i) => {
      const s = setVector(z);
      u.uRace.value[i].set(z.x, z.z, z.length / 2, z.width / 2);
      u.uRaceB.value[i].set(s.x, s.z, 0, z.waveFactor);
      for (const k of knockPoints(z)) {
        if (nk >= MAX_KNOCKS) break;
        u.uKnock.value[nk++].set(k.x, k.z, CONFIG.currents.knock.radius * 1.6, 0);
      }
    });
    u.uRaceCount.value = this.races.length;
    u.uKnockCount.value = nk;
  }

  /** Each race's strength now (the clock, world/currents.ts), once per frame. */
  private setRaceStrengths(time: number): void {
    const u = this.uniforms;
    u.uTime.value = time % 3600;
    let nk = 0;
    this.races.forEach((z, i) => {
      const st = raceStrength(z);
      u.uRaceB.value[i].z = st;
      for (let k = 0; k < z.knocks && nk < MAX_KNOCKS; k++) u.uKnock.value[nk++].w = Math.abs(st);
    });
  }

  /**
   * A katabatic gust's patch on the water (environment/gusts.ts): darker, ruffled water
   * streaked with spray down the way it blows, a few seconds ahead of the wind itself.
   */
  setGust(g: GustState | undefined): void {
    const u = this.uniforms;
    const zone = gustZone(g);
    if (!zone || !g || g.look <= 0.01) {
      u.uGust.value.w = 0;
      return;
    }
    const to = ((zone.fromDeg + 180) * Math.PI) / 180;
    u.uGust.value.set(zone.x, zone.z, zone.r, g.look);
    u.uGustDir.value.set(Math.sin(to), -Math.cos(to));
  }

  /** The searchlight's pool on the water (intensity 0 = off). */
  setSpotlight(light: THREE.SpotLight): void {
    const u = this.uniforms;
    light.getWorldPosition(u.uSpotPos.value);
    light.target.getWorldPosition(u.uSpotDir.value).sub(u.uSpotPos.value).normalize();
    u.uSpotCos.value.set(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)));
    u.uSpotColor.value.copy(light.color).multiplyScalar(light.intensity > 0 ? 1.2 : 0);
  }

  /** Your hand torch's pool on the water (null or not lit: none). */
  setTorch(light: THREE.SpotLight | null): void {
    const u = this.uniforms;
    if (!light?.visible) {
      u.uTorchColor.value.setRGB(0, 0, 0);
      return;
    }
    light.getWorldPosition(u.uTorchPos.value);
    light.target.getWorldPosition(u.uTorchDir.value).sub(u.uTorchPos.value).normalize();
    u.uTorchCos.value.set(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)));
    u.uTorchColor.value.copy(light.color).multiplyScalar(1.4);
  }

  /** The port floodlight's glints on the water (intensity 0 = off). */
  setPortLight(light: THREE.PointLight): void {
    const u = this.uniforms;
    light.getWorldPosition(u.uPortLightPos.value);
    u.uPortLightColor.value.copy(light.color).multiplyScalar(Math.min(1, light.intensity / 1600) * 0.9);
    u.uPortLightRange.value = light.distance;
  }

  /**
   * @param time render time (s): drifts the ripples and the wind's foam
   * @param wind the wind (m/s, world x, z: the way it blows), for its foam
   */
  update(waves: readonly PreparedWave[], viewer: THREE.Vector3, env: EnvironmentView, time = 0, wind = { x: 0, z: 0 }): void {
    const step = CONFIG.ocean.mesh.innerSpacing;
    this.mesh.position.set(Math.round(viewer.x / step) * step, 0, Math.round(viewer.z / step) * step);

    const u = this.uniforms;
    u.uCenter.value.set(viewer.x, viewer.z);
    this.setRaceStrengths(time);
    const count = Math.min(waves.length, MAX_WAVES);
    u.uWaveCount.value = count;
    let crest = 0;
    let steep = 0;
    for (let i = 0; i < count; i++) {
      const w = waves[i];
      const fadeEnd = distanceForCellSize(w.wavelength / CONFIG.ocean.mesh.minCellsPerWavelength);
      u.uWaveA.value[i].set(w.dirX, w.dirZ, w.k, w.amplitude);
      u.uWaveB.value[i].set(w.horizontal, w.phase, fadeEnd, 0);
      crest += w.amplitude;
      steep += w.k * w.horizontal;
    }
    // Whitecaps: none at the moderate sea's steepness (Σ Q·k·A ≈ 0.24), plenty by a storm (0.35).
    u.uFoamAmount.value = Math.min(1, Math.max(0, (steep - 0.25) / 0.09));
    // Crest whitening starts at a fraction of the theoretical maximum elevation.
    u.uCrestHeight.value = crest * 0.75;
    // Ripples drift with the breeze; a little stronger in a flat calm, where they're all
    // the texture there is (fading out as the waves reach ~0.3 m).
    const rc = CONFIG.ocean.ripples;
    u.uRippleStrength.value = rc.strength + rc.calmBoost * Math.max(0, 1 - crest / 0.3);
    rc.layers.forEach((l, i) => {
      const a = (l.directionDeg * Math.PI) / 180;
      // Offset in tile units, wrapped so it stays precise however long the game runs.
      const ox = (((Math.sin(a) * l.speed * time) / l.scale) % 1 + 1) % 1;
      const oz = (((-Math.cos(a) * l.speed * time) / l.scale) % 1 + 1) % 1;
      u.uRippleUv.value[i].set(ox, oz, 1 / l.scale, 0);
    });

    // The wind's foam, by the Beaufort scale: white horses from force 4, streaks from force 6.
    const wf = CONFIG.ocean.windFoam;
    const ws = Math.hypot(wind.x, wind.z);
    const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (ws - a) / (b - a)));
    if (ws > 0.01) u.uWindFoam.value.set(wind.x / ws, wind.z / ws, ramp(wf.capsFrom, wf.capsFull), ramp(wf.streakFrom, wf.streakFull));
    else u.uWindFoam.value.set(1, 0, 0, 0);
    // The drift downwind, wrapped at the noise tile's length so it stays precise.
    u.uStreak.value.z = (wf.drift * time) % (8 * wf.streakLength);

    u.uZenith.value.copy(env.zenith);
    u.uHorizon.value.copy(env.horizon);
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunIntensity.value = env.sunIntensity;
    u.uAmbient.value = env.ambientIntensity;
    u.uFogColor.value.copy(env.fogColor);
    u.uFogNear.value = env.fogNear;
    u.uFogFar.value = env.fogFar;
  }
}
