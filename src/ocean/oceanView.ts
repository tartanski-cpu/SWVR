import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentView } from '../environment/environmentView';
import { createOceanGeometry, distanceForCellSize } from './oceanGeometry';
import fragmentShader from './shaders/ocean.frag.glsl?raw';
import oceanVertex from './shaders/ocean.vert.glsl?raw';
import gerstnerChunk from './shaders/gerstner.glsl?raw';
import type { PreparedWave } from './waves';
import { createRippleTexture } from './rippleTexture';
import { SHELTERS } from '../world/archipelago';
import { MAX_SHELTERS } from '../world/shelter';

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
    // Static: the shelter zones never move.
    uShelter: { value: Array.from({ length: MAX_SHELTERS }, (_, i) => {
      const z = SHELTERS[i];
      return z ? new THREE.Vector4(z.x, z.z, z.rIn, z.rOut) : new THREE.Vector4();
    }) },
    uShelterK: { value: Array.from({ length: MAX_SHELTERS }, (_, i) => SHELTERS[i]?.factor ?? 1) },
    uShelterCount: { value: Math.min(SHELTERS.length, MAX_SHELTERS) },
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
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 0 },
    uFogFar: { value: 1 },
    // Wind ripples (CONFIG.ocean.ripples): texture, per-layer uv offset (drift) and scale.
    uRipple: { value: createRippleTexture() },
    uRippleUv: { value: [new THREE.Vector4(), new THREE.Vector4()] }, // offset x, z; 1/scale; unused
    uRippleStrength: { value: CONFIG.ocean.ripples.strength },
    uRippleFade: { value: new THREE.Vector2(CONFIG.ocean.ripples.fadeNear, CONFIG.ocean.ripples.fadeFar) },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `${gerstnerChunk}\n${oceanVertex}`,
      fragmentShader,
      defines: { MAX_WAVES, MAX_SHELTERS },
    });
    this.mesh = new THREE.Mesh(createOceanGeometry(), material);
    this.mesh.name = 'ocean';
    // Vertices move in the shader, so the CPU bounding volume is meaningless; it is
    // always around the viewer anyway.
    this.mesh.frustumCulled = false;
  }

  /**
   * @param waves  wave constants for the current render time (from prepareWaves)
   * @param viewer viewer world position; the grid is re-centred under it
   */
  /** The searchlight's pool on the water (intensity 0 = off). */
  setSpotlight(light: THREE.SpotLight): void {
    const u = this.uniforms;
    light.getWorldPosition(u.uSpotPos.value);
    light.target.getWorldPosition(u.uSpotDir.value).sub(u.uSpotPos.value).normalize();
    u.uSpotCos.value.set(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)));
    u.uSpotColor.value.copy(light.color).multiplyScalar(light.intensity > 0 ? 1.2 : 0);
  }

  /** The port floodlight's glints on the water (intensity 0 = off). */
  setPortLight(light: THREE.PointLight): void {
    const u = this.uniforms;
    light.getWorldPosition(u.uPortLightPos.value);
    u.uPortLightColor.value.copy(light.color).multiplyScalar(Math.min(1, light.intensity / 1600) * 0.9);
    u.uPortLightRange.value = light.distance;
  }

  /** @param time render time (s): drifts the ripples */
  update(waves: readonly PreparedWave[], viewer: THREE.Vector3, env: EnvironmentView, time = 0): void {
    const step = CONFIG.ocean.mesh.innerSpacing;
    this.mesh.position.set(Math.round(viewer.x / step) * step, 0, Math.round(viewer.z / step) * step);

    const u = this.uniforms;
    u.uCenter.value.set(viewer.x, viewer.z);
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
