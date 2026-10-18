import * as THREE from 'three';
import { CONFIG } from '../../config';
import { gerstnerChunk, MAX_WAVES } from '../../ocean/oceanView';
import { restPosition, type PreparedWave } from '../../ocean/waves';
import { MAX_SHELTERS } from '../../world/shelter';
import { foamNoiseTexture } from '../../ocean/foamNoise';
import type { VesselState } from '../vesselState';

/**
 * Vertices across the ribbon (-1 .. 1). Enough that the straight segments between them
 * follow the wave curvature once the ribbon has spread wide; with too few, the flat strips
 * dip under the crests and the opaque ocean hides them.
 */
const ACROSS = 9;

/**
 * The wake: a foam ribbon on the water behind the transom. One draw call, a few hundred
 * vertices, and almost no CPU:
 *
 *  - Every `spacing` metres (or `idleInterval` seconds while the prop churns) the CPU
 *    records ONE trail point: the transom's REST position on the water (inverted through
 *    the wave model), the boat's athwartships direction, the time, and how strong the
 *    Kelvin arms (speed) and the prop wash (thrust) are.
 *  - The vertex shader spreads each point across the ribbon (half-width grows with age at a
 *    rate set by the speed, like the 19.5° Kelvin arms), then displaces it with the SAME
 *    Gerstner sum as the ocean (gerstner.glsl). Because foam points are water particles, they
 *    ride the swell exactly and drift with the orbital motion.
 *  - The fragment shader draws bright arms at the edges and churned wash in the middle,
 *    broken up by a noise texture fixed to the water, thinning into patches as it ages.
 *  - The propeller's jet (owner): each point also carries how fast the prop's slipstream
 *    moves through the water there (momentum theory, CONFIG.effects.wake.jetTau), and the
 *    shader carries the foam aft at that speed, slowing as the jet mixes in, and spreads
 *    it. So a tug at full throttle, hardly moving, still churns a long white wash astern.
 *  - Planing (her hull's `planing` Froude range): the arms spread wider and the white
 *    water astern is full and bright.
 */
export class WakeTrail {
  readonly mesh: THREE.Mesh;
  private readonly cfg = CONFIG.effects.wake;
  private readonly center: Float32Array;
  private readonly perp: Float32Array;
  private readonly birth: Float32Array;
  private readonly params: Float32Array;
  /** Per point: the jet's speed aft through the water (m/s; ahead for astern thrust), how far she's planing (0..1). */
  private readonly jet: Float32Array;
  private readonly attrs: THREE.BufferAttribute[];
  /** Ring slots in emission order (oldest first). */
  private readonly order: number[] = [];
  private next = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private lastTime = -1e9;
  private gap = true;
  /** 1 where a trail point starts a new strip (not joined to the point before it). */
  private readonly stripStart: Uint8Array;
  private readonly uTime = { value: 0 };
  private readonly stern = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  /**
   * @param originZ  where the trail starts along the hull (vessel z, the transom)
   * @param boat     her propeller's diameter (m), her length (m), her planing range (none: a displacement hull)
   */
  constructor(
    shared: Record<string, { value: unknown }>,
    originZ: number,
    private readonly boat: { propD: number; length: number; planing?: { fnStart: number; fnFull: number } },
  ) {
    const n = this.cfg.maxPoints * ACROSS;
    this.center = new Float32Array(n * 2);
    this.perp = new Float32Array(n * 2);
    this.birth = new Float32Array(n).fill(-1e9);
    this.params = new Float32Array(n * 3);
    this.jet = new Float32Array(n * 2);
    this.stripStart = new Uint8Array(this.cfg.maxPoints);
    const sideAttr = new Float32Array(n);
    for (let i = 0; i < n; i++) sideAttr[i] = -1 + (2 * (i % ACROSS)) / (ACROSS - 1);
    const geo = new THREE.BufferGeometry();
    // `position` is unused by the shader (it computes positions), but three.js wants one.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mk = (a: Float32Array, size: number) => new THREE.BufferAttribute(a, size).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.center, 2), mk(this.perp, 2), mk(this.birth, 1), mk(this.params, 3), mk(this.jet, 2)];
    geo.setAttribute('aCenter', this.attrs[0]);
    geo.setAttribute('aPerp', this.attrs[1]);
    geo.setAttribute('aBirth', this.attrs[2]);
    geo.setAttribute('aParams', this.attrs[3]);
    geo.setAttribute('aJet', this.attrs[4]);
    geo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(this.cfg.maxPoints * (ACROSS - 1) * 6), 1));
    geo.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uTime: this.uTime,
        uLife: { value: this.cfg.life },
        uWashLife: { value: this.cfg.washLife },
        uHalfWidth0: { value: this.cfg.startHalfWidth },
        uJetTau: { value: this.cfg.jetTau },
        uNoise: { value: foamNoiseTexture() },
      },
      vertexShader: `${gerstnerChunk}\n${WAKE_VERT}`,
      fragmentShader: WAKE_FRAG,
      defines: { MAX_WAVES, MAX_SHELTERS },
      transparent: true,
      depthWrite: false,
      // Winding depends on which way the boat was going (ahead or astern) when the points
      // were laid, so draw both faces.
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'wake';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // after the opaque ocean
    this.originZ = originZ;
  }

  private readonly originZ: number;

  /**
   * @param root   the vessel's interpolated root
   * @param waves  wave constants at the render time
   * @param time   render time (s) - the same clock as the waves
   */
  update(s: VesselState, root: THREE.Object3D, waves: readonly PreparedWave[], time: number): void {
    this.uTime.value = time;
    const c = this.cfg;
    root.localToWorld(this.stern.set(0, 0, this.originZ));
    const moved = Math.hypot(this.stern.x - this.lastX, this.stern.z - this.lastZ);
    const speed = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]);
    // How far she's planing: her Froude number (by length) through her hull's planing range.
    const pl = this.boat.planing;
    const fn = speed / Math.sqrt(9.81 * this.boat.length);
    const planing = pl ? Math.min(1, Math.max(0, (fn - pl.fnStart) / (pl.fnFull - pl.fnStart))) : 0;
    // The white water astern of a planing hull, whatever the prop's doing.
    const wash = Math.max(Math.min(1, Math.abs(s.thrust) / c.fullWashThrust), 0.85 * planing);
    const arm = Math.min(1, Math.max(0, (speed - 0.6) / c.fullArmSpeed));
    // `moved` is NaN before the first point, which counts as due (and as a jump).
    const due = !(moved < c.spacing) || (wash > 0.05 && time - this.lastTime >= c.idleInterval);
    if (!due) return;
    // A jump (teleport, drop test) or a stretch without foam starts a new strip, rather
    // than joining the new point to the last one with a long streak.
    const breakStrip = !(moved < 25) || this.gap;
    this.lastX = this.stern.x;
    this.lastZ = this.stern.z;
    this.lastTime = time;
    if (arm <= 0 && wash <= 0.05) {
      this.gap = true;
      return;
    }
    this.gap = false;

    root.getWorldQuaternion(this.q);
    this.side.set(1, 0, 0).applyQuaternion(this.q);
    this.side.y = 0;
    this.side.normalize();
    const [x0, z0] = restPosition(waves, this.stern.x, this.stern.z);
    // Sideways: the Kelvin arms with speed, or the jet's own spreading at full wash; wider planing.
    const spread = Math.min(c.maxSpread * (1 + (c.planingSpread - 1) * planing), Math.max(speed * c.spreadPerSpeed, wash * c.washSpread));
    // The jet (momentum theory): the slipstream's speed through the water far behind the
    // disc, u = sqrt(V^2 + 2T / (rho A)) - V, V her speed of advance into it (headway for
    // thrust ahead, sternway for astern). Positive: carried aft.
    const fwd = this.side.z * s.linearVelocity[0] - this.side.x * s.linearVelocity[2]; // headway (m/s): the bow is the side vector turned a quarter
    const T = Math.abs(s.thrust);
    const ahead = s.thrust >= 0 ? 1 : -1;
    const V = Math.max(0, ahead * fwd);
    const area = (Math.PI * this.boat.propD * this.boat.propD) / 4;
    const jet = T > 0 ? ahead * (Math.sqrt(V * V + (2 * T) / (CONFIG.ocean.density * area)) - V) : 0;

    const slot = this.next;
    this.next = (this.next + 1) % c.maxPoints;
    for (let k = 0; k < ACROSS; k++) {
      const v = slot * ACROSS + k;
      this.center.set([x0, z0], v * 2);
      this.perp.set([this.side.x, this.side.z], v * 2);
      this.birth[v] = time;
      this.params.set([arm, wash, spread], v * 3);
      this.jet.set([jet, planing], v * 2);
    }
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(slot * ACROSS * a.itemSize, ACROSS * a.itemSize);
      a.needsUpdate = true;
    }
    const at = this.order.indexOf(slot);
    if (at >= 0) this.order.splice(at, 1);
    this.stripStart[slot] = breakStrip ? 1 : 0;
    this.order.push(slot);
    this.rebuildIndex();
  }

  /** Quads between consecutive trail points (in emission order) only. */
  private rebuildIndex(): void {
    const index = this.mesh.geometry.index!;
    const idx = index.array as Uint16Array;
    let n = 0;
    for (let i = 0; i + 1 < this.order.length; i++) {
      if (this.stripStart[this.order[i + 1]]) continue;
      const a = this.order[i] * ACROSS;
      const b = this.order[i + 1] * ACROSS;
      for (let k = 0; k < ACROSS - 1; k++) {
        idx[n++] = a + k;
        idx[n++] = b + k;
        idx[n++] = a + k + 1;
        idx[n++] = a + k + 1;
        idx[n++] = b + k;
        idx[n++] = b + k + 1;
      }
    }
    index.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, n);
  }
}

const WAKE_VERT = /* glsl */ `
attribute vec2 aCenter;   // rest position of the trail point (world xz)
attribute vec2 aPerp;     // athwartships unit vector at emission
attribute float aBirth;   // emission time (s)
attribute vec3 aParams;   // arm strength, wash strength, spread rate (m/s)
attribute float aSide;    // -1 .. 1 across the ribbon
attribute vec2 aJet;      // the prop jet's speed aft through the water (m/s), planing 0..1
uniform float uTime;
uniform float uHalfWidth0;
uniform float uJetTau;
varying float vPlane;
varying vec2 vRest;
varying float vSide;
varying float vAge;
varying vec2 vStrength;
varying vec3 vWorld;

void main() {
  float age = uTime - aBirth;
  float halfWidth = uHalfWidth0 + aParams.z * age;
  // Carried aft by the jet, slowing as it mixes in: u tau (1 - e^(-t/tau)). (Aft is her
  // athwartships vector turned a quarter: (-perp.z, perp.x).)
  float travel = aJet.x * uJetTau * (1.0 - exp(-age / uJetTau));
  vec2 p0 = aCenter + vec2(-aPerp.y, aPerp.x) * travel + aPerp * (aSide * halfWidth);
  vPlane = aJet.y;
  vec3 d = gerstnerDisplacement(p0);
  // Lift above the water grows with the vertex spacing, covering the chord error of the
  // flat strips against curved waves (a few cm near the boat, ~0.15 m when spread wide).
  vec3 wp = vec3(p0.x + d.x, d.y + 0.03 + 0.008 * halfWidth, p0.y + d.z);
  vRest = p0;
  vSide = aSide;
  vAge = age;
  vStrength = aParams.xy;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const WAKE_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uLife;
uniform float uWashLife;
uniform float uSunIntensity;
uniform float uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vRest;
varying float vSide;
varying float vAge;
varying vec2 vStrength;
varying vec3 vWorld;
varying float vPlane;

void main() {
  float t = vAge / uLife;
  if (t >= 1.0) discard;
  float u = abs(vSide);
  // Kelvin arms: bright bands along the edges, fading with age.
  float arm = smoothstep(0.6, 0.88, u) * (1.0 - smoothstep(0.9, 1.0, u)) * vStrength.x * (1.0 - t);
  // Prop wash: churned water down the middle, gone sooner; clear water between it and the arms.
  float wash = (1.0 - smoothstep(0.0, 0.4, u)) * vStrength.y * max(0.0, 1.0 - vAge / uWashLife);
  // Foam texture fixed to the water; it thins into patches as it ages.
  float n = texture2D(uNoise, vRest * 0.16).r * 0.65 + texture2D(uNoise, vRest * 0.045 + 0.31).r * 0.35;
  float threshold = mix(0.3, 0.8, t);
  float foam = (arm + wash) * smoothstep(threshold, threshold + 0.22, n);
  if (foam < 0.01) discard;
  vec3 col = vec3(0.9, 0.95, 0.97) * (0.35 * uAmbient + 0.55 * uSunIntensity);
  float fogF = clamp((length(cameraPosition - vWorld) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  // A planing hull's wake is whiter and more solid.
  gl_FragColor = vec4(mix(col, uFogColor, fogF), min(1.0, foam * (1.0 + 0.5 * vPlane)) * mix(0.7, 0.92, vPlane) * (1.0 - fogF));
  #include <colorspace_fragment>
}
`;
