import * as THREE from 'three';

/**
 * A ring buffer of simple particles drawn as ONE Points object with per-particle RGBA
 * (exhaust smoke, spray). Particles live in world space; step() integrates them with drag
 * toward still air, buoyant rise or gravity, and fades them with age and near the viewer.
 * When nothing is alive the update and the draw call are skipped.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly shade: Float32Array;
  private readonly white: Float32Array;
  private readonly blue: Float32Array;
  private readonly alpha: Float32Array;
  private next = 0;
  private alive = 0;

  constructor(
    private readonly max: number,
    size: number,
    map: THREE.Texture,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.shade = new Float32Array(max);
    this.white = new Float32Array(max);
    this.blue = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  /** Overall light level (0..1, e.g. darker at night): multiplies every particle's colour. */
  setBrightness(level: number): void {
    (this.points.material as THREE.PointsMaterial).color.setScalar(level);
  }

  /**
   * @param white 0 = the `grey` shade passed to step() .. 1 = white (cold-engine smoke, spray)
   * @param blue  0 .. 1 = blue-grey (an engine burning its oil)
   */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, shade: number, alpha: number, white = 0, blue = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.shade[i] = shade;
    this.alpha[i] = alpha;
    this.white[i] = white;
    this.blue[i] = blue;
    this.alive++;
  }

  /**
   * @param drag    per-second exponential drag toward still air
   * @param rise    terminal upward drift (m/s) for buoyant smoke
   * @param gravity vertical acceleration (m/s^2)
   * @param grey    grey level from (age fraction, shade)
   * @param viewer  world position of the viewer (near particles fade out)
   */
  step(
    dt: number,
    drag: number,
    rise: number,
    gravity: number,
    grey: (t: number, shade: number) => number,
    viewer: THREE.Vector3,
  ): void {
    // Nothing alive: skip the loop and the buffer uploads, and the draw call.
    this.points.visible = this.alive > 0;
    if (this.alive === 0) return;
    this.alive = 0;
    const d = Math.exp(-drag * dt);
    for (let i = 0; i < this.max; i++) {
      const a = (this.age[i] += dt);
      const k = i * 3;
      const c = i * 4;
      if (a >= this.life[i]) {
        this.col[c + 3] = 0;
        continue;
      }
      this.alive++;
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d + rise * (1 - d) + gravity * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = a / this.life[i];
      // Dirty diesel smoke: grey with a slight brown cast. Blend towards white (cold-engine
      // smoke), which also loses the brown cast, and towards blue-grey (burning oil).
      const w = this.white[i];
      const b = this.blue[i] * (1 - w);
      const g = grey(t, this.shade[i]) * (1 - w) + 0.9 * w;
      this.col[c] = g * (1.04 - 0.04 * w) * (1 - 0.45 * b);
      this.col[c + 1] = g * (1 - 0.25 * b);
      this.col[c + 2] = g * (0.9 + 0.1 * w) * (1 + 0.5 * b);
      const near = Math.hypot(this.pos[k] - viewer.x, this.pos[k + 1] - viewer.y, this.pos[k + 2] - viewer.z);
      const nearFade = Math.min(1, Math.max(0, (near - 0.6) / 1.4));
      this.col[c + 3] = this.alpha[i] * Math.min(1, a * 8) * (1 - t) ** 1.5 * nearFade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

