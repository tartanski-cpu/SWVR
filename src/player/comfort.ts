import * as THREE from 'three';
import { CONFIG } from '../config';

const yawQ = new THREE.Quaternion();
const tilt = new THREE.Quaternion();
const partial = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Horizon steadying. The vessel's world orientation q is split into heading and tilt,
 * q = Yaw(psi) * T. The player should feel only (1 - s) of the tilt:
 *     player frame = Yaw(psi) * slerp(I, T, 1 - s)
 * Since the carrier is a child of the vessel (which applies q), its local rotation is
 *     C = T^-1 * slerp(I, T, 1 - s)
 * pivoting about the player's feet, so the deck under you stays put and the boat rolls
 * "around" you. s = 0: full motion; s = 1: horizon locked.
 */
export function horizonCorrection(vesselWorld: THREE.Quaternion, steadying: number, out: THREE.Quaternion): THREE.Quaternion {
  if (steadying <= 0) return out.identity();
  fwd.set(0, 0, -1).applyQuaternion(vesselWorld);
  yawQ.setFromAxisAngle(UP, Math.atan2(-fwd.x, -fwd.z));
  tilt.copy(yawQ).invert().multiply(vesselWorld);
  partial.identity().slerp(tilt, 1 - steadying);
  return out.copy(tilt).invert().multiply(partial);
}

/**
 * Head-locked tunnel vignette (reduces vection while artificially moving) and full fade
 * to black (head inside a wall). A small quad just in front of the eyes, drawn last.
 */
export class ComfortOverlay {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { uVignette: { value: 0 }, uFade: { value: 0 } };
  private vignette = 0;
  private fade = 0;

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uVignette;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;           // 0 centre .. ~1.4 corners
          float inner = mix(1.2, 0.45, uVignette);       // tunnel closes in with strength
          float a = smoothstep(inner, inner + 0.35, d) * step(0.001, uVignette);
          gl_FragColor = vec4(0.0, 0.0, 0.0, max(a, uFade));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), material);
    this.mesh.position.set(0, 0, -0.15);
    this.mesh.renderOrder = 10000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'comfortOverlay';
  }

  /**
   * @param moving 0..1 how much artificial motion is happening
   * @param inWall whether the head is inside solid structure
   */
  update(dt: number, moving: number, inWall: boolean): void {
    const targetV = Math.min(1, moving) * CONFIG.comfort.vignette;
    this.vignette += (targetV - this.vignette) * Math.min(1, dt / (targetV > this.vignette ? 0.08 : 0.3));
    this.fade += ((inWall ? 1 : 0) - this.fade) * Math.min(1, dt / 0.15);
    this.uniforms.uVignette.value = this.vignette;
    this.uniforms.uFade.value = this.fade;
    this.mesh.visible = this.vignette > 0.01 || this.fade > 0.01;
  }
}
