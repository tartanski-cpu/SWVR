import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { WorkboatDef } from '../vesselDef';

/**
 * Rain on the wheelhouse front windows, and the wipers. The windows are open frames until
 * it rains; then a transparent "wet glass" plane fills the three front panes:
 *
 *   - drops: a grid of cells (`glassCell`), each with a hashed chance of a drop; the share
 *     of cells with a drop rises with the rain and with the time since that spot was last
 *     wiped (back to full after `glassRefill` s at full rain);
 *   - wipers: one pendulum arm per pane, hanging from the window head (as on most
 *     workboats: it clears the part you look through, above the dash), sweeping +-`wiperSweepDeg`
 *     with a triangle wave of period `wiperPeriod`. For a point under the arm, when the arm
 *     last passed is worked out in the shader from the wiper's clock (two passes per
 *     sweep), so no texture is painted and nothing is uploaded per frame.
 *
 * The wipers run while switched on and powered (Instruments breaker); switched off they
 * finish the sweep and park.
 */
export class RainGlass {
  readonly root = new THREE.Group();
  private readonly glass: THREE.Mesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly pivots: THREE.Vector3[];
  /** Wiper clock (s): runs while wiping; and time since they parked (s). */
  private clock = 0;
  private idle = 1000;
  private parked = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(def: WorkboatDef) {
    const wh = def.layout.wheelhouse;
    const c = CONFIG.rain;
    const sill = wh.floorY + wh.windowSill;
    const head = wh.floorY + wh.windowHead;
    const x0 = -wh.halfWidth + wh.wall;
    const x1 = wh.halfWidth - wh.wall;
    // Pane centres between the corner posts and the mullions at x = +-0.5.
    const paneX = [(x0 + -0.5) / 2, 0, (x1 + 0.5) / 2];
    const pivotY = head - 0.04;
    this.pivots = paneX.map((x) => new THREE.Vector3(x, pivotY, wh.front - 0.012));

    const geo = new THREE.PlaneGeometry(x1 - x0, head - sill).translate((x0 + x1) / 2, (sill + head) / 2, wh.front + wh.wall * 0.5);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uRain: { value: 0 },
        uClock: { value: 0 },
        uIdle: { value: 1000 },
        uPeriod: { value: c.wiperPeriod },
        uSweep: { value: (c.wiperSweepDeg * Math.PI) / 180 },
        uArm: { value: c.wiperArm },
        uRefill: { value: c.glassRefill },
        uCell: { value: c.glassCell },
        uPaneX: { value: new THREE.Vector3(...paneX) },
        uPivotY: { value: pivotY },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          vPos = position.xy; // vessel axes: x across, y up
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uRain, uClock, uIdle, uPeriod, uSweep, uArm, uRefill, uCell, uPivotY, uLight;
        uniform vec3 uPaneX;
        varying vec2 vPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // Seconds since the wiper arm last passed this point (large if it doesn't reach it).
        float sinceWiped(vec2 p) {
          float px = p.x < -0.5 ? uPaneX.x : (p.x > 0.5 ? uPaneX.z : uPaneX.y);
          vec2 d = p - vec2(px, uPivotY);
          float r = length(d);
          float ang = atan(d.x, -d.y); // from hanging straight down, + to starboard
          if (r < 0.08 || r > uArm || abs(ang) > uSweep) return 1000.0;
          // Arm angle: a triangle wave, -A -> +A in the first half period, back in the second.
          float u = fract(uClock / uPeriod);
          float A = uSweep;
          float u1 = (ang + A) / (4.0 * A);       // passing on the way out
          float u2 = 0.5 + (A - ang) / (4.0 * A); // and on the way back
          float last = u >= u2 ? u2 : (u >= u1 ? u1 : u2 - 1.0);
          return (u - last) * uPeriod + uIdle;
        }
        void main() {
          float since = sinceWiped(vPos);
          float density = uRain * clamp(since * (0.4 + 0.6 * uRain) / uRefill, 0.0, 1.0);
          // Drops: one possible per cell, jittered, of random size.
          vec2 cell = floor(vPos / uCell);
          vec2 f = vPos / uCell - cell;
          float h = hash(cell);
          float present = step(h, density * 0.75);
          vec2 c = vec2(0.25 + 0.5 * hash(cell + 7.1), 0.25 + 0.5 * hash(cell + 3.3));
          float rad = 0.12 + 0.28 * hash(cell + 1.9);
          float dist = length(f - c) / rad;
          float drop = present * (1.0 - smoothstep(0.75, 1.0, dist));
          // A drop is a little lens: bright top-left, dark lower rim.
          float shade = clamp(0.6 + 0.6 * (c.y - f.y) / rad - 0.3 * dist, 0.0, 1.0);
          vec3 col = mix(vec3(0.15, 0.17, 0.2), vec3(0.85, 0.9, 0.95), shade) * (0.4 + 0.6 * uLight);
          // A faint wet film over the glass, plus the drops.
          float a = density * 0.07 + drop * 0.55;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.glass = new THREE.Mesh(geo, this.material);
    this.glass.name = 'rainGlass';
    this.glass.visible = false;
    this.glass.renderOrder = 3;

    // Wiper arms on the outside of the glass: arm and blade in one box, one instanced draw call.
    const armGeo = new THREE.BoxGeometry(0.01, c.wiperArm, 0.01).translate(0, -c.wiperArm / 2, 0);
    this.arms = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: 0x15181a }), this.pivots.length);
    this.arms.name = 'wipers';
    this.root.add(this.glass, this.arms);
    this.pose(-(c.wiperSweepDeg * Math.PI) / 180);
  }

  /** Arm angle (rad, from hanging straight down) at the wiper clock: the shader's triangle wave. */
  private angle(): number {
    const c = CONFIG.rain;
    const A = (c.wiperSweepDeg * Math.PI) / 180;
    const u = (this.clock / c.wiperPeriod) % 1;
    return u < 0.5 ? -A + 4 * A * u : A - 4 * A * (u - 0.5);
  }

  private pose(angle: number): void {
    this.q.setFromAxisAngle(this.z, angle); // hanging arm: + swings the tip to starboard
    this.pivots.forEach((p, i) => this.arms.setMatrixAt(i, this.m.compose(p, this.q, this.one)));
    this.arms.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param rain     0..1
   * @param running  wipers switched on and powered
   * @param light    daylight 0..1 (drops darker at night)
   */
  update(rain: number, running: boolean, light: number, dt: number): void {
    const P = CONFIG.rain.wiperPeriod;
    if (running || !this.parked) {
      // Running, or finishing the sweep back to park (the start of a period).
      const before = this.clock;
      this.clock += dt;
      this.parked = false;
      if (!running && Math.floor(this.clock / P) > Math.floor(before / P)) {
        this.clock = Math.floor(this.clock / P) * P;
        this.parked = true;
      }
      this.idle = 0;
      this.pose(this.parked ? -(CONFIG.rain.wiperSweepDeg * Math.PI) / 180 : this.angle());
    } else {
      this.idle += dt;
    }
    this.glass.visible = rain > 0.02;
    if (!this.glass.visible) return;
    const u = this.material.uniforms;
    u.uRain.value = rain;
    u.uClock.value = this.clock;
    u.uIdle.value = this.idle;
    u.uLight.value = light;
  }
}
