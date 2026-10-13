import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentView } from '../environment/environmentView';
import { createOceanGeometry, distanceForCellSize } from './oceanGeometry';
import fragmentShader from './shaders/ocean.frag.glsl?raw';
import vertexShader from './shaders/ocean.vert.glsl?raw';
import type { PreparedWave } from './waves';
import { SHELTERS } from '../world/archipelago';
import { MAX_SHELTERS } from '../world/shelter';

const MAX_WAVES = 8;

/**
 * The visible ocean: one large graded grid that follows the viewer, displaced on the GPU
 * by the same wave sum the CPU uses for physics (waves.ts).
 */
export class OceanView {
  readonly mesh: THREE.Mesh;
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
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 0 },
    uFogFar: { value: 1 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
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
  update(waves: readonly PreparedWave[], viewer: THREE.Vector3, env: EnvironmentView): void {
    const step = CONFIG.ocean.mesh.innerSpacing;
    this.mesh.position.set(Math.round(viewer.x / step) * step, 0, Math.round(viewer.z / step) * step);

    const u = this.uniforms;
    u.uCenter.value.set(viewer.x, viewer.z);
    const count = Math.min(waves.length, MAX_WAVES);
    u.uWaveCount.value = count;
    let crest = 0;
    for (let i = 0; i < count; i++) {
      const w = waves[i];
      const fadeEnd = distanceForCellSize(w.wavelength / CONFIG.ocean.mesh.minCellsPerWavelength);
      u.uWaveA.value[i].set(w.dirX, w.dirZ, w.k, w.amplitude);
      u.uWaveB.value[i].set(w.horizontal, w.phase, fadeEnd, 0);
      crest += w.amplitude;
    }
    // Crest whitening starts at a fraction of the theoretical maximum elevation.
    u.uCrestHeight.value = crest * 0.75;

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
