import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentView } from './environmentView';

/**
 * Gradient sky dome with a sun disc and glow. A large inside-out sphere that follows the
 * viewer, drawn first with no depth write so everything else draws over it.
 * Below the horizon it stays at the horizon colour, which is also the fog colour, so
 * the far edge of the ocean dissolves into the sky without a seam.
 */
const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float up = max(dir.y, 0.0);
    // Horizon colour holds near the horizon then blends to zenith.
    vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));

    float cosAngle = dot(dir, uSunDir);
    float visible = smoothstep(-0.02, 0.01, uSunDir.y);       // sun below horizon: no disc
    float disc = smoothstep(0.99985, 0.99992, cosAngle);       // ~0.7 deg radius
    float glow = pow(max(cosAngle, 0.0), 180.0) * 0.6 + pow(max(cosAngle, 0.0), 12.0) * 0.12;
    sky += uSunColor * (disc * 3.0 + glow * min(uSunIntensity, 1.5)) * visible;

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

export class SkyView {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunIntensity: { value: 1 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.environment.skyRadius, 32, 16), material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  update(env: EnvironmentView, viewer: THREE.Vector3): void {
    this.mesh.position.copy(viewer);
    const u = this.uniforms;
    u.uZenith.value.copy(env.zenith);
    u.uHorizon.value.copy(env.horizon);
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunIntensity.value = env.sunIntensity;
  }
}
