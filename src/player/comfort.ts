import * as THREE from 'three';
import { CONFIG } from '../config';

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const tilt = new THREE.Quaternion();
const tiltP = new THREE.Quaternion();

/** Critically damped second-order follower: x'' = w^2 (target - x) - 2 w x'. */
class Follower {
  x = 0;
  v = 0;
  step(target: number, omega: number, dt: number): number {
    // Substep so that omega*h stays small whatever the frame time (stable, accurate).
    const n = Math.max(1, Math.ceil((omega * dt) / 0.2));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (omega * omega * (target - this.x) - 2 * omega * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

/**
 * BeamNG-style motion decoupling between the deck and the player's view.
 *
 * The deck's world orientation is split into heading and tilt, q = Yaw * Rx(pitch) * Rz(roll).
 * Heading is always followed exactly. The player's own pitch/roll and vertical position
 * follow `coupling` times the deck's, through a critically damped spring-damper whose time
 * constant grows as coupling falls. Low frequencies (the boat's gross attitude) get through;
 * the faster roll/pitch/heave of the waves is soaked up - roughly what our neck and
 * vestibular reflexes do to keep the head stable in space.
 *
 * Outputs, applied to the rig's carrier (a child of the vessel, at the player's feet):
 *   - a local rotation C = T^-1 * T_player, so the carrier's world tilt is T_player,
 *   - a world-vertical offset of the view relative to the deck (softly limited).
 * Collision and walking still use the deck frame; this is purely what the eyes see.
 */
export class MotionDecoupler {
  coupling: number = CONFIG.comfort.motionCoupling;
  private readonly roll = new Follower();
  private readonly pitch = new Follower();
  private readonly height = new Follower();
  private refHeight = 0;
  private needsReset = true;

  /** Call when boarding/leaving so the filters start from the current state. */
  reset(): void {
    this.needsReset = true;
  }

  /**
   * @param deckWorld  vessel world orientation
   * @param feetY      world height of the player's feet on the deck
   * @param outQ       carrier local rotation
   * @returns world-vertical offset (m) to add to the view
   */
  update(dt: number, deckWorld: THREE.Quaternion, feetY: number, outQ: THREE.Quaternion): number {
    const cfg = CONFIG.comfort;
    euler.setFromQuaternion(deckWorld, 'YXZ');
    const deckPitch = euler.x;
    const deckRoll = euler.z;

    if (this.needsReset) {
      this.needsReset = false;
      this.roll.reset(deckRoll * this.coupling);
      this.pitch.reset(deckPitch * this.coupling);
      this.refHeight = feetY;
      this.height.reset(feetY);
    }

    const c = Math.min(1, Math.max(0, this.coupling));
    if (c >= 0.999) {
      // Rigid: exactly the deck.
      this.roll.reset(deckRoll);
      this.pitch.reset(deckPitch);
      this.height.reset(feetY);
      this.refHeight = feetY;
      outQ.identity();
      return 0;
    }

    // Squared so the slider feels even: the filter and the coupling scale both reduce
    // motion, and with a linear map almost everything happened in the top quarter.
    const tau = cfg.minTimeConstant + (1 - c) ** 2 * (cfg.maxTimeConstant - cfg.minTimeConstant);
    const omega = 1 / tau;
    const r = this.roll.step(deckRoll * c, omega, dt);
    const p = this.pitch.step(deckPitch * c, omega, dt);

    // Heave relative to a very slow reference (tracks sinkage, trim changes, tide...).
    this.refHeight += (feetY - this.refHeight) * Math.min(1, dt / cfg.heaveReferenceTime);
    const y = this.height.step(this.refHeight + c * (feetY - this.refHeight), omega, dt);
    const m = cfg.maxHeaveOffset;
    const offset = m * Math.tanh((y - feetY) / m);

    // Carrier rotation: undo the deck tilt, apply the player's filtered tilt.
    euler.set(deckPitch, 0, deckRoll, 'YXZ');
    tilt.setFromEuler(euler);
    euler.set(p, 0, r, 'YXZ');
    tiltP.setFromEuler(euler);
    outQ.copy(tilt).invert().multiply(tiltP);
    return offset;
  }
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
