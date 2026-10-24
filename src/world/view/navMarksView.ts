import * as THREE from 'three';
import { CONFIG } from '../../config';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { MARKS, type MarkKind } from '../archipelago';
import { LIGHT_CHARACTERS, lightOn } from '../navMarks';

import { glowSprite, LightPointsMaterial } from '../../render/lightPoints';

/**
 * The hazard buoys (archipelago.ts MARKS; owner request), drawn to IALA: pillar buoys for
 * the cardinals and the isolated danger mark, a can and a cone for the lateral marks, each
 * with its topmark and its light flashing its character (navMarks.ts). They ride the swell
 * (a small rock from the wave), as the sea is drawn this frame.
 * Cost: one instanced draw call per buoy type in use, and one for all the lamps (constant
 * on-screen size, like the harbour lights, so they're seen miles off at night).
 */
const BLACK = 0x1a1c1e;
const YELLOW = 0xf0c418;
const RED = 0xc8241c;
const GREEN = 0x1f8a3a;

/** A pillar buoy: float, two column bands (lower, upper), a mast, topmark parts, a lamp. */
function pillar(float: number, lower: number, upper: number, topmark: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeParts([
    // The float and the column in weathered paint (pixel paint: scuffs and rust runs).
    part(new THREE.CylinderGeometry(0.85, 1.0, 1.0, 10).translate(0, 0.1, 0), float, 'worn'),
    part(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 10).translate(0, 1.1, 0), lower, 'worn'),
    part(new THREE.CylinderGeometry(0.36, 0.42, 1.0, 10).translate(0, 2.1, 0), upper, 'worn'),
    part(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5).translate(0, 3.1, 0), BLACK), // mast
    ...topmark,
    part(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8).translate(0, 3.8, 0), 0x3a3e42), // lamp housing
  ]);
}

/** A topmark cone at height y, point up or down. */
const cone = (y: number, up: boolean, color = BLACK) => part(new THREE.ConeGeometry(0.24, 0.36, 10).rotateX(up ? 0 : Math.PI).translate(0, y, 0), color);
const ball = (y: number) => part(new THREE.SphereGeometry(0.17, 10, 6).translate(0, y, 0), BLACK);

const SHAPES: Record<MarkKind, () => THREE.BufferGeometry> = {
  // North: black over yellow, both cones up.
  N: () => pillar(YELLOW, YELLOW, BLACK, [cone(3.05, true), cone(3.5, true)]),
  // South: yellow over black, both cones down.
  S: () => pillar(BLACK, BLACK, YELLOW, [cone(3.05, false), cone(3.5, false)]),
  // East: black, yellow band, black; cones base to base.
  E: () => pillar(BLACK, YELLOW, BLACK, [cone(3.05, false), cone(3.45, true)]),
  // West: yellow, black band, yellow; cones point to point.
  W: () => pillar(YELLOW, BLACK, YELLOW, [cone(3.05, true), cone(3.45, false)]),
  // Isolated danger: black with a red band, two black balls.
  isolated: () => pillar(BLACK, RED, BLACK, [ball(3.0), ball(3.42)]),
  // Port hand: a red can, can topmark.
  port: () =>
    mergeParts([
      part(new THREE.CylinderGeometry(0.75, 0.8, 1.6, 10).translate(0, 0.4, 0), RED, 'worn'),
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5).translate(0, 1.6, 0), BLACK),
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10).translate(0, 2.0, 0), RED),
      part(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8).translate(0, 2.45, 0), 0x3a3e42),
    ]),
  // Starboard hand: a green cone, cone topmark.
  stbd: () =>
    mergeParts([
      part(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 10).translate(0, -0.15, 0), GREEN, 'worn'),
      part(new THREE.ConeGeometry(0.8, 1.8, 10).translate(0, 1.0, 0), GREEN, 'worn'),
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5).translate(0, 2.1, 0), BLACK),
      cone(2.4, true, GREEN),
      part(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8).translate(0, 2.75, 0), 0x3a3e42),
    ]),
};
/** The lamp's height above the waterline, per shape. */
const LAMP_Y: Record<MarkKind, number> = { N: 4.0, S: 4.0, E: 4.0, W: 4.0, isolated: 4.0, port: 2.65, stbd: 2.95 };
const LAMP_COLOR = { white: 0xfff4d8, red: 0xff3020, green: 0x30ff60 };

export class NavMarksView {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<MarkKind, { mesh: THREE.InstancedMesh; marks: number[] }>();
  private readonly lamps: THREE.Points;
  private readonly lampMat: LightPointsMaterial;
  private readonly lampPos: THREE.BufferAttribute;
  private readonly lampCol: THREE.BufferAttribute;
  private readonly base: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  /** Each mark's last height on the waves (NaN: not yet), and the frame count for taking turns. */
  private heights = new Float32Array(0);
  private frame = 0;
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.root.name = 'navMarks';
    const mat = flatVertexColorMaterial();
    const byKind = new Map<MarkKind, number[]>();
    MARKS.forEach((mk, i) => byKind.set(mk.kind, [...(byKind.get(mk.kind) ?? []), i]));
    for (const [kind, marks] of byKind) {
      const mesh = new THREE.InstancedMesh(SHAPES[kind](), mat, marks.length);
      mesh.name = `buoys:${kind}`;
      mesh.frustumCulled = false;
      this.meshes.set(kind, { mesh, marks });
      this.root.add(mesh);
    }
    const n = MARKS.length;
    this.lampPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.base = new Float32Array(n * 3);
    const c = new THREE.Color();
    MARKS.forEach((mk, i) => {
      c.set(LAMP_COLOR[LIGHT_CHARACTERS[mk.kind].color]);
      this.base.set([c.r, c.g, c.b], i * 3);
    });
    this.lampCol = new THREE.BufferAttribute(this.base.slice(), 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.lampPos);
    geo.setAttribute('color', this.lampCol);
    this.lampMat = new LightPointsMaterial(glowSprite());
    this.lamps = new THREE.Points(geo, this.lampMat);
    this.lamps.name = 'buoyLights';
    this.lamps.frustumCulled = false;
    this.root.add(this.lamps);
  }

  /**
   * @param waves    the sea as drawn this frame
   * @param time     seconds (the lights' rhythm)
   * @param darkness 0 (noon) .. 1 (night)
   * @param viewer   where the viewer is: near marks are set on the waves every frame, farther
   *                 ones in turns (CONFIG.navMarks.wavesEvery; review, Oct 2026: every mark on
   *                 the map was sampled every frame, 97 on the Clyde)
   */
  update(waves: readonly PreparedWave[], time: number, darkness: number, viewer?: { x: number; z: number }): void {
    const pos = this.lampPos.array as Float32Array;
    const col = this.lampCol.array as Float32Array;
    if (this.heights.length !== MARKS.length) this.heights = new Float32Array(MARKS.length).fill(NaN);
    const frame = ++this.frame;
    const w = CONFIG.navMarks.wavesEvery;
    for (const [kind, { mesh, marks }] of this.meshes) {
      marks.forEach((idx, k) => {
        const mk = MARKS[idx];
        const d = viewer ? Math.hypot(mk.x - viewer.x, mk.z - viewer.z) : 0;
        const every = d < w.nearM ? 1 : d < w.midM ? w.mid : w.far;
        if (Number.isNaN(this.heights[idx]) || (frame + idx) % every === 0) this.heights[idx] = surfaceHeight(waves, mk.x, mk.z, CONFIG.ocean.sceneryIterations) - 0.25;
        const y = this.heights[idx];
        // A gentle rock with the swell, each buoy out of step with the others.
        const ph = idx * 1.7;
        this.e.set(0.06 * Math.sin(time * 0.9 + ph), 0, 0.06 * Math.sin(time * 0.75 + ph * 1.3));
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(mk.x, y, mk.z), this.q, this.one);
        mesh.setMatrixAt(k, this.m);
        // The lamp at the top, flashing its character (staggered a little per buoy).
        this.v.set(0, LAMP_Y[kind], 0).applyQuaternion(this.q);
        pos[idx * 3] = mk.x + this.v.x;
        pos[idx * 3 + 1] = y + this.v.y;
        pos[idx * 3 + 2] = mk.z + this.v.z;
        const on = lightOn(LIGHT_CHARACTERS[kind].pattern, time, idx * 0.37);
        for (let j = 0; j < 3; j++) col[idx * 3 + j] = on ? this.base[idx * 3 + j] : 0;
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.lampPos.needsUpdate = true;
    this.lampCol.needsUpdate = true;
    this.lampMat.set(CONFIG.lightPoints.size * (0.5 + 0.8 * darkness), 0.25 + 0.75 * darkness);
  }
}
