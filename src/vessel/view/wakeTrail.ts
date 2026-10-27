import * as THREE from 'three';
import { CONFIG } from '../../config';
import { MAX_KNOCKS, MAX_RACES, MAX_WAVES, gerstnerChunk } from '../../ocean/oceanView';
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

/** Her azimuth drives, for their wash: each leg's x, where the legs stand, how far ahead of its leg each propeller is (m). */
export interface WakeDrives {
  x: readonly number[];
  legZ: number;
  propY: number;
  fwd: number;
}

/**
 * One ribbon of foam in the trail: its own run of ring slots, laid from one place (her
 * transom, or one drive's propeller), joined point to point only to its own.
 */
interface Stream {
  base: number;
  size: number;
  next: number;
  /** Its slots in emission order (oldest first). */
  order: number[];
  lastX: number;
  lastZ: number;
  lastTime: number;
  gap: boolean;
}

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
 *  - Azimuth drives (owner: the wash should follow the Kort nozzles): each drive lays its
 *    own ribbon of wash in the same mesh, from its propeller, carried the opposite way to
 *    its push at its own thrust; the transom's ribbon then keeps only the Kelvin arms.
 *  - Planing (her hull's `planing` Froude range): the arms spread wider and the white
 *    water astern is full and bright.
 */
export class WakeTrail {
  readonly mesh: THREE.Mesh;
  private readonly cfg = CONFIG.effects.wake;
  private readonly center: Float32Array;
  private readonly perp: Float32Array;
  private readonly birth: Float32Array;
  /** Per point: arm strength, wash strength, spread rate (m/s), half-width at birth (m). */
  private readonly params: Float32Array;
  /** Per point: the jet's speed through the water (m/s; + aft along its ribbon, - ahead for astern thrust), how far she's planing (0..1). */
  private readonly jet: Float32Array;
  private readonly attrs: THREE.BufferAttribute[];
  /** Her transom's ribbon first, then one per azimuth drive. */
  private readonly streams: Stream[] = [];
  /** 1 where a trail point starts a new strip (not joined to the point before it). */
  private readonly stripStart: Uint8Array;
  private readonly uTime = { value: 0 };
  private readonly at = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  /** This frame's GPU upload ranges started afresh (several streams may lay a point in one frame: each adds its own). */
  private fresh = false;

  /**
   * @param originZ  where the trail starts along the hull (vessel z, the transom)
   * @param boat     her propeller's diameter (m), her length (m), her planing range (none: a
   *                 displacement hull), her azimuth drives (none: her propellers push straight aft)
   */
  constructor(
    shared: Record<string, { value: unknown }>,
    originZ: number,
    private readonly boat: { propD: number; length: number; planing?: { fnStart: number; fnFull: number }; drives?: WakeDrives },
  ) {
    const sizes = [this.cfg.maxPoints, ...(boat.drives?.x.map(() => this.cfg.drivePoints) ?? [])];
    let base = 0;
    for (const size of sizes) {
      this.streams.push({ base, size, next: 0, order: [], lastX: NaN, lastZ: NaN, lastTime: -1e9, gap: true });
      base += size;
    }
    const points = base;
    const n = points * ACROSS;
    this.center = new Float32Array(n * 2);
    this.perp = new Float32Array(n * 2);
    this.birth = new Float32Array(n).fill(-1e9);
    this.params = new Float32Array(n * 4);
    this.jet = new Float32Array(n * 2);
    this.stripStart = new Uint8Array(points);
    const sideAttr = new Float32Array(n);
    for (let i = 0; i < n; i++) sideAttr[i] = -1 + (2 * (i % ACROSS)) / (ACROSS - 1);
    const geo = new THREE.BufferGeometry();
    // `position` is unused by the shader (it computes positions), but three.js wants one.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mk = (a: Float32Array, size: number) => new THREE.BufferAttribute(a, size).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.center, 2), mk(this.perp, 2), mk(this.birth, 1), mk(this.params, 4), mk(this.jet, 2)];
    geo.setAttribute('aCenter', this.attrs[0]);
    geo.setAttribute('aPerp', this.attrs[1]);
    geo.setAttribute('aBirth', this.attrs[2]);
    geo.setAttribute('aParams', this.attrs[3]);
    geo.setAttribute('aJet', this.attrs[4]);
    geo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(points * (ACROSS - 1) * 6), 1));
    geo.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uTime: this.uTime,
        uLife: { value: this.cfg.life },
        uWashLife: { value: this.cfg.washLife },
        uJetTau: { value: this.cfg.jetTau },
        uNoise: { value: foamNoiseTexture() },
      },
      vertexShader: `${gerstnerChunk}\n${WAKE_VERT}`,
      fragmentShader: WAKE_FRAG,
      defines: { MAX_WAVES, MAX_SHELTERS, MAX_RACES, MAX_KNOCKS },
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
   * The jet (momentum theory): the slipstream's speed through the water far behind the disc,
   * u = sqrt(V^2 + 2T / (rho A)) - V, V the speed of advance into it (>= 0).
   */
  private jetSpeed(T: number, V: number): number {
    const area = (Math.PI * this.boat.propD * this.boat.propD) / 4;
    return T > 0 ? Math.sqrt(V * V + (2 * T) / (CONFIG.ocean.density * area)) - V : 0;
  }

  /**
   * @param root   the vessel's interpolated root
   * @param waves  wave constants at the render time
   * @param time   render time (s) - the same clock as the waves
   */
  update(s: VesselState, root: THREE.Object3D, waves: readonly PreparedWave[], time: number): void {
    this.uTime.value = time;
    this.fresh = false;
    const c = this.cfg;
    const drives = this.boat.drives;
    const speed = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]);
    // How far she's planing: her Froude number (by length) through her hull's planing range.
    const pl = this.boat.planing;
    const fn = speed / Math.sqrt(9.81 * this.boat.length);
    const planing = pl ? Math.min(1, Math.max(0, (fn - pl.fnStart) / (pl.fnFull - pl.fnStart))) : 0;
    root.getWorldQuaternion(this.q);
    this.side.set(1, 0, 0).applyQuaternion(this.q);
    this.side.y = 0;
    this.side.normalize();
    let changed = false;

    // Her transom: the Kelvin arms, the white water astern of a planing hull, and (her
    // propellers on shafts, pushing straight aft) their wash. Azimuth drives lay their own.
    const T = drives ? 0 : Math.abs(s.thrust);
    const wash = Math.max(Math.min(1, T / c.fullWashThrust), 0.85 * planing);
    const arm = Math.min(1, Math.max(0, (speed - 0.6) / c.fullArmSpeed));
    // Sideways: the Kelvin arms with speed, or the jet's own spreading at full wash; wider planing.
    const spread = Math.min(c.maxSpread * (1 + (c.planingSpread - 1) * planing), Math.max(speed * c.spreadPerSpeed, wash * c.washSpread));
    // The jet: carried aft (ahead for astern thrust); V her headway into it (the bow is the side vector turned a quarter).
    const fwd = this.side.z * s.linearVelocity[0] - this.side.x * s.linearVelocity[2];
    const ahead = s.thrust >= 0 ? 1 : -1;
    const jet = ahead * this.jetSpeed(T, Math.max(0, ahead * fwd));
    root.localToWorld(this.at.set(0, 0, this.originZ));
    changed = this.lay(this.streams[0], waves, time, this.side.x, this.side.z, arm, wash, spread, c.startHalfWidth, jet, planing) || changed;

    if (drives) {
      // Each drive's share of her thrust (VesselState keeps the mean of the two): its
      // propeller's revs squared, in gear (a propeller's thrust goes as n^2).
      const engines = [s.engine, s.engine.stbd];
      const n2 = engines.map((e) => (e && e.gear !== 0 ? e.rpm * e.rpm : 0));
      const sum = n2[0] + n2[1];
      drives.x.forEach((x, i) => {
        const th = engines[i]?.azimuth ?? 0;
        const Ti = sum > 0 ? (2 * Math.abs(s.thrust) * n2[i]) / sum : 0;
        // Its push (the boat's axes: 0 ahead, -z; + to starboard), in the world.
        this.push.set(Math.sin(th), 0, -Math.cos(th)).applyQuaternion(this.q);
        this.push.y = 0;
        this.push.normalize();
        // The wash runs from its propeller (ahead of its leg along its push) the opposite way to
        // its push: the ribbon's athwartships vector is the push turned a quarter (the shader
        // carries the foam along that vector turned back).
        root.localToWorld(this.at.set(x + Math.sin(th) * drives.fwd, drives.propY, drives.legZ - Math.cos(th) * drives.fwd));
        const w = Math.min(1, Ti / c.fullWashThrust);
        const V = Math.max(0, s.linearVelocity[0] * this.push.x + s.linearVelocity[2] * this.push.z);
        changed = this.lay(this.streams[i + 1], waves, time, -this.push.z, this.push.x, 0, w, w * c.washSpread, c.driveHalfWidth * this.boat.propD, this.jetSpeed(Ti, V), 0) || changed;
      });
    }
    if (changed) this.rebuildIndex();
  }

  /**
   * One trail point on a stream at `this.at`, when one is due: every `spacing` metres it has
   * moved, or every `idleInterval` seconds while its wash churns. @returns whether it laid one.
   */
  private lay(st: Stream, waves: readonly PreparedWave[], time: number, px: number, pz: number, arm: number, wash: number, spread: number, halfWidth: number, jet: number, planing: number): boolean {
    const c = this.cfg;
    const moved = Math.hypot(this.at.x - st.lastX, this.at.z - st.lastZ);
    // `moved` is NaN before the first point, which counts as due (and as a jump).
    const due = !(moved < c.spacing) || (wash > 0.05 && time - st.lastTime >= c.idleInterval);
    if (!due) return false;
    // A jump (teleport, drop test) or a stretch without foam starts a new strip, rather
    // than joining the new point to the last one with a long streak.
    const breakStrip = !(moved < 25) || st.gap;
    st.lastX = this.at.x;
    st.lastZ = this.at.z;
    st.lastTime = time;
    if (arm <= 0 && wash <= 0.05) {
      st.gap = true;
      return false;
    }
    st.gap = false;
    const [x0, z0] = restPosition(waves, this.at.x, this.at.z);
    const slot = st.base + st.next;
    st.next = (st.next + 1) % st.size;
    for (let k = 0; k < ACROSS; k++) {
      const v = slot * ACROSS + k;
      this.center.set([x0, z0], v * 2);
      this.perp.set([px, pz], v * 2);
      this.birth[v] = time;
      this.params.set([arm, wash, spread, halfWidth], v * 4);
      this.jet.set([jet, planing], v * 2);
    }
    for (const a of this.attrs) {
      if (!this.fresh) a.clearUpdateRanges();
      a.addUpdateRange(slot * ACROSS * a.itemSize, ACROSS * a.itemSize);
      a.needsUpdate = true;
    }
    const at = st.order.indexOf(slot);
    if (at >= 0) st.order.splice(at, 1);
    this.stripStart[slot] = breakStrip ? 1 : 0;
    st.order.push(slot);
    this.fresh = true;
    return true;
  }

  /** Quads between consecutive trail points of a stream (in emission order) only. */
  private rebuildIndex(): void {
    const index = this.mesh.geometry.index!;
    const idx = index.array as Uint16Array;
    let n = 0;
    for (const { order } of this.streams) {
      for (let i = 0; i + 1 < order.length; i++) {
        if (this.stripStart[order[i + 1]]) continue;
        const a = order[i] * ACROSS;
        const b = order[i + 1] * ACROSS;
        for (let k = 0; k < ACROSS - 1; k++) {
          idx[n++] = a + k;
          idx[n++] = b + k;
          idx[n++] = a + k + 1;
          idx[n++] = a + k + 1;
          idx[n++] = b + k;
          idx[n++] = b + k + 1;
        }
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
attribute vec4 aParams;   // arm strength, wash strength, spread rate (m/s), half-width at birth (m)
attribute float aSide;    // -1 .. 1 across the ribbon
attribute vec2 aJet;      // the prop jet's speed aft through the water (m/s), planing 0..1
uniform float uTime;
uniform float uJetTau;
varying float vPlane;
varying vec2 vRest;
varying float vSide;
varying float vAge;
varying vec2 vStrength;
varying vec3 vWorld;

void main() {
  float age = uTime - aBirth;
  float halfWidth = aParams.w + aParams.z * age;
  // Carried by the jet, slowing as it mixes in: u tau (1 - e^(-t/tau)), along the ribbon's
  // athwartships vector turned a quarter, (-perp.z, perp.x): aft from her transom, or the
  // opposite way to an azimuth drive's push.
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
