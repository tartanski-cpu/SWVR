import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import type { VesselState } from '../vessel/vesselState';
import { jetOn, jetPath, type FireJob } from './fire';

const FLAMES = 12;
const PUFFS = 16;
const SEGMENTS = 40;

/**
 * Billboards that always face the camera, one per instance: each instance's matrix gives
 * its centre and size; the vertex shader spreads the quad in view space. `instanceColor.r`
 * carries a per-instance alpha, `.g` a random seed.
 */
const BILLBOARD_VERT = `
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vUv = uv;
    vAlpha = instanceColor.r;
    vSeed = instanceColor.g * 10.0;
    vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float size = length(instanceMatrix[0].xyz);
    c.xy += position.xy * size;
    gl_Position = projectionMatrix * c;
  }`;

/** Flames: a flickering teardrop, yellow at the root to orange-red at the tips (alpha-blended, so they stay orange against a bright sky; unlit, so they glow at night). */
const FLAME_FRAG = `
  uniform float time;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float y = vUv.y;
    float sway = sin(time * 3.1 + y * 4.0 + vSeed) * 0.18 * y;
    float w = mix(0.95, 0.12, y);
    float x = abs((vUv.x - 0.5) * 2.0 + sway) / w;
    float flick = 0.75 + 0.25 * sin(time * 9.0 + vSeed * 3.0 + y * 7.0);
    float a = smoothstep(1.0, 0.25, x) * smoothstep(1.0, 0.55, y + 0.15 * sin(time * 5.0 + vSeed)) * smoothstep(0.0, 0.12, y);
    vec3 col = mix(vec3(1.0, 0.86, 0.35), vec3(1.0, 0.28, 0.04), y);
    gl_FragColor = vec4(col * (0.85 + 0.3 * flick), a * vAlpha);
  }`;

/** Smoke / steam: soft round puffs with a ragged edge. `tint` grey (smoke) .. white (steam). */
const SMOKE_FRAG = `
  uniform float time;
  uniform vec3 tint;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p) + 0.05 * sin(atan(p.y, p.x) * 4.0 + vSeed + time * 0.5);
    float a = smoothstep(1.0, 0.2, r) * vAlpha;
    gl_FragColor = vec4(tint, a);
  }`;

/**
 * A fire, drawn: the thing burning (a fishing boat hulk bobbing on the swell, or a shed
 * ashore), flames (one instanced mesh of camera-facing billboards with an animated shader)
 * and a column of smoke puffs rising and spreading downwind (another), which turns to
 * white steam while the jet is on it. Sized by the fire's intensity; out, only a thin
 * smoke goes on. Four draw calls in all, only while there's a fire.
 */
export class FireView {
  readonly root = new THREE.Group();
  private readonly hulk: THREE.Group;
  private readonly shed: THREE.Group;
  private readonly flames: THREE.InstancedMesh;
  private readonly smoke: THREE.InstancedMesh;
  private readonly flameMat: THREE.ShaderMaterial;
  private readonly smokeMat: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private steam = 0;

  constructor() {
    this.root.name = 'fire';
    this.root.visible = false;
    const burnt = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
    const charred = new THREE.MeshLambertMaterial({ color: 0x151312 });
    // A 9 m fishing boat, burnt out: hull, a gutted wheelhouse, a stub mast.
    this.hulk = new THREE.Group();
    this.hulk.add(
      new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 9).translate(0, 0.1, 0), burnt),
      new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.2, 4, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.6, 1).translate(0, 0.2, -5.4), burnt),
      new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2.6).translate(0, 1.6, 1.2), charred),
      new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6).translate(0, 2.6, -1.5), charred),
    );
    // A wooden shed by the shore: walls and a pitched roof.
    this.shed = new THREE.Group();
    this.shed.add(
      new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3).translate(0, 1.2, 0), burnt),
      new THREE.Mesh(new THREE.ConeGeometry(3, 1.4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 3.1, 0), charred),
    );
    const quad = new THREE.PlaneGeometry(1, 1);
    const flameGeo = quad.clone().translate(0, 0.5, 0); // grows up from its root
    this.flameMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: BILLBOARD_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, fog: false });
    this.flames = new THREE.InstancedMesh(flameGeo, this.flameMat, FLAMES);
    this.smokeMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(0x2a2a2a) } }, vertexShader: BILLBOARD_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false });
    this.smoke = new THREE.InstancedMesh(quad, this.smokeMat, PUFFS);
    for (const im of [this.flames, this.smoke]) {
      im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3), 3);
    }
    this.flames.renderOrder = 3;
    this.smoke.renderOrder = 4;
    this.root.add(this.hulk, this.shed, this.flames, this.smoke);
  }

  update(world: WorldState, waves: readonly PreparedWave[], time: number, dt: number): void {
    const job = world.fire?.job;
    if (!job || job.phase === 'calling') {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.flameMat.uniforms.time.value = time;
    this.smokeMat.uniforms.time.value = time;
    const boat = job.kind === 'boat';
    this.hulk.visible = boat;
    this.shed.visible = !boat;
    // The burning thing: a hulk rides the swell (low in the water), a shed sits on the ground.
    const base = boat ? surfaceHeight(waves, job.x, job.z) - 0.3 : job.y;
    (boat ? this.hulk : this.shed).position.set(job.x, base, job.z);
    (boat ? this.hulk : this.shed).rotation.y = (job.yawDeg * Math.PI) / 180;
    this.placeFlames(job, base, time);
    this.steam += ((Math.max(job.wetting, job.handWet ?? 0) > 0.05 ? 1 : 0) - this.steam) * Math.min(1, dt * 1.5); // the monitor or an extinguisher
    this.placeSmoke(world, job, base, time);
  }

  private placeFlames(job: FireJob, base: number, time: number): void {
    const I = job.intensity;
    const H = CONFIG.fire.flameHeight[job.kind];
    const spread = job.kind === 'boat' ? [1.2, 3.5] : [1.6, 1.2];
    const yaw = (job.yawDeg * Math.PI) / 180;
    for (let i = 0; i < FLAMES; i++) {
      // Fixed spots over the deck / shed, each flickering in height.
      const u = Math.sin(i * 12.9898) * 0.5;
      const v = Math.sin(i * 78.233) * 0.5;
      const lx = u * 2 * spread[0];
      const lz = v * 2 * spread[1];
      const h = I <= 0 ? 0 : H * (0.35 + 0.65 * I) * (0.6 + 0.4 * Math.abs(Math.sin(time * (1.3 + i * 0.17) + i)));
      this.p.set(job.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), base + (job.kind === 'boat' ? 0.9 : 1.6), job.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
      this.m.compose(this.p, this.q.identity(), this.s.setScalar(Math.max(0.001, h)));
      this.flames.setMatrixAt(i, this.m);
      this.flames.setColorAt(i, this.c.setRGB(I > 0 ? 0.9 : 0, (i * 0.37) % 1, 0));
    }
    this.flames.instanceMatrix.needsUpdate = true;
    this.flames.instanceColor!.needsUpdate = true;
  }

  private placeSmoke(world: WorldState, job: FireJob, base: number, time: number): void {
    // Puffs rise from the flames' tops, spreading and drifting downwind, fading out.
    const w = world.environment.weather?.now;
    const to = w ? ((w.windFrom + 180) * Math.PI) / 180 : 0;
    const drift = w ? w.wind * 1.2 : 0.5;
    const I = Math.max(job.intensity, job.phase === 'out' ? 0.15 : 0);
    const top = base + CONFIG.fire.flameHeight[job.kind] * (0.4 + 0.6 * job.intensity);
    this.smokeMat.uniforms.tint.value.setRGB(0.16 + 0.7 * this.steam, 0.16 + 0.7 * this.steam, 0.17 + 0.72 * this.steam);
    for (let i = 0; i < PUFFS; i++) {
      const t = (time * 0.07 + i / PUFFS) % 1; // 0 (just risen) .. 1 (gone)
      const rise = t * 24;
      this.p.set(job.x + Math.sin(to) * drift * t * 6, top + rise - 1, job.z - Math.cos(to) * drift * t * 6);
      this.m.compose(this.p, this.q.identity(), this.s.setScalar(3 + t * 12 * (0.5 + I)));
      this.smoke.setMatrixAt(i, this.m);
      this.smoke.setColorAt(i, this.c.setRGB(Math.min(1, t * 6) * (1 - t) * (0.35 + 0.6 * I), (i * 0.61) % 1, 0));
    }
    this.smoke.instanceMatrix.needsUpdate = true;
    this.smoke.instanceColor!.needsUpdate = true;
  }
}

/**
 * The jet from the fire monitor, drawn along the same path the simulation uses (jetPath),
 * from the rendered (interpolated) boat: one instanced mesh of short, widening segments of
 * white water, and a flattened splash where it lands. Only while it flows.
 */
export class JetView {
  readonly root = new THREE.Group();
  private readonly jet: THREE.InstancedMesh;
  private readonly splash: THREE.Mesh;
  private readonly pts = Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3());
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.root.name = 'fireJet';
    const geo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true).translate(0, 0.5, 0);
    this.jet = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, depthWrite: false }), SEGMENTS);
    this.jet.frustumCulled = false;
    this.splash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(1, 0.35, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.root.add(this.jet, this.splash);
    this.root.visible = false;
  }

  /** @param root the workboat's rendered root (the jet starts from where you see the nozzle) */
  update(world: WorldState, v: VesselState | undefined, root: THREE.Object3D | undefined, time: number): void {
    if (!v || !root || !jetOn(v)) {
      this.root.visible = false;
      return;
    }
    // The simulation's path, from the rendered pose.
    const shown = { ...v, position: root.position.toArray() as [number, number, number], orientation: root.quaternion.toArray() as [number, number, number, number] };
    const n = jetPath(world, shown, this.pts, 0.08);
    for (let i = 0; i < SEGMENTS; i++) {
      if (i + 1 >= n) {
        this.jet.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const len = this.d.copy(b).sub(a).length();
      this.q.setFromUnitVectors(this.up, this.d.divideScalar(Math.max(1e-6, len)));
      // Widens as it flies and breaks up: 4 cm at the nozzle to ~0.6 m.
      const r = 0.04 + (i / SEGMENTS) * 0.6 + 0.03 * Math.sin(time * 20 + i);
      this.m.compose(a, this.q, this.s.set(r, len, r));
      this.jet.setMatrixAt(i, this.m);
    }
    this.jet.instanceMatrix.needsUpdate = true;
    const end = this.pts[Math.max(0, n - 1)];
    this.splash.position.copy(end);
    this.splash.scale.setScalar(1.6 + 0.4 * Math.sin(time * 13));
    this.root.visible = true;
  }
}
