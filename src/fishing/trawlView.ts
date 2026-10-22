import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { GearFacts } from '../modular/module';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { codendAt, luffOf, luffPoint } from './codend';
import { aFrameOf, heapAt } from './fishing';
import { gearOf } from '../boats/sims';

const FLOATS = 7;
/** The net's rings along it, and the lines along it (its meshes). */
const RINGS = 9;
const LONGS = 10;
/** Fish drawn in the heap on deck at most, how many a box's worth, and how many falling as the codend empties. */
const HEAP = 96;
const PER_BOX = 8;
const FALLING = 8;
/** Fish colours (cod grey, mackerel blue, haddock brown, red gurnard, silver whiting), as on the fish boxes. */
const FISH = [0xa8b0b4, 0x3e6e80, 0x8a7a64, 0xc4563c, 0xc8d0d6, 0x5a7a86];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** A fixed scatter (0..1) for the i-th thing, so the heap doesn't shuffle each frame. */
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The trawl (fishing.ts), drawn in the world: cheap and rope-free (the brief's rule: no
 * physics, no ropes). The A-frame over the transom, swinging on its rams, with its blocks and
 * its control box, is the boat's own module (modules/aFrame); everything here follows it
 * (fishing/codend.ts).
 *   warps    two straight dark lines from the A-frame's side blocks to the trawl doors: astern
 *            and down while the net is out, longer as it goes out; short when the doors are up.
 *   doors    the two otter boards that spread the net: in the water at the warps' ends while
 *            it's out, hanging under the blocks when it's in (one instanced mesh).
 *   floats   the headline's orange floats in an arc on the surface well astern, riding
 *            the waves (one instanced mesh) while it's fishing.
 *   net      (owner, Oct 2026: "a more advanced animation when you pull the net in") its body
 *            coming up over the stern, drawn as netting (rings and lines along it, one line
 *            mesh), to the codend: the bag at its end, as big as what's in it, silver with fish
 *            inside its mesh (a body and its netting), coming up from astern, hanging under the
 *            A-frame and swung in over the deck.
 *   the catch emptied (RELEASE): the codend shrinks as the fish pour out of it onto the deck
 *            (`pourTime`), into a heap there (one instanced mesh, a few fish to a box's worth),
 *            which goes down as it's boxed.
 */
export class TrawlView {
  readonly root = new THREE.Group();
  private readonly warps: THREE.LineSegments;
  private readonly floats: THREE.InstancedMesh;
  private readonly doors: THREE.InstancedMesh;
  private readonly netting: THREE.LineSegments;
  private readonly codend = new THREE.Group();
  private readonly codendFill: THREE.Mesh;
  private readonly fish: THREE.InstancedMesh;
  private af: GearFacts['trawlGantry'] | null = null;
  /** Her stern roller's top (where the net comes over the stern, her axes) and her deck along her. */
  private stern = new THREE.Vector3();
  /** Her trawl winches' starboard lead (port is -x), if she has them; her net drum's lead, if she has one. */
  private winch: [number, number, number] | null = null;
  private drum: THREE.Vector3 | null = null;
  private deckY: (z: number) => number = () => 0;
  /** Where the doors hang when the net's in: against her quarters, outboard (starboard; port its mirror). */
  private doorHang: [number, number, number] = [1, 0, 0];
  /** Where the catch is emptied on deck (fishing.ts heapAt). */
  private heap: [number, number] = [0, 0];
  /** What's shown in the codend (boxes' worth), easing after the simulation as the fish pour, and how much there was when they began to. */
  private shownCatch = 0;
  private pourFrom = 0;
  private lastTime = 0;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();

  constructor() {
    this.root.name = 'trawl';
    const wg = new THREE.BufferGeometry();
    // (Two warps, and with trawl winches two more lengths from their drums up to the blocks.)
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    this.warps = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    this.floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7a1a }), FLOATS);
    // A trawl door: a steel plate with a heavy shoe along its bottom, its bracket on its face.
    const door = mergeParts([
      part(new THREE.BoxGeometry(0.05, 0.45, 0.8), 0x3a4148),
      part(new THREE.BoxGeometry(0.08, 0.06, 0.84).translate(0, -0.23, 0), 0x22262a),
      part(new THREE.BoxGeometry(0.1, 0.22, 0.05).translate(0.05, 0.04, 0), 0xd0a020),
    ]);
    this.doors = new THREE.InstancedMesh(door, flatVertexColorMaterial(), 2);
    // The net: rings and the lines along it, positions set each frame.
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RINGS * LONGS + (RINGS - 1) * LONGS) * 2 * 3), 3));
    this.netting = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0x2e5a3a }));
    // The codend: a body (the fish showing through it) and its netting over it, a unit ball scaled.
    // (Each face a fish's colour: the catch packed in the bag, seen through its mesh.)
    const fill = new THREE.IcosahedronGeometry(0.97, 1);
    const n = fill.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    const col = new THREE.Color();
    for (let i = 0; i < n; i += 3) {
      col.setHex(FISH[Math.floor(rnd(i) * FISH.length)]);
      for (let k = 0; k < 3; k++) col.toArray(cols, (i + k) * 3);
    }
    fill.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.codendFill = new THREE.Mesh(fill, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const mesh = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0x2e5a3a }));
    this.codend.add(this.codendFill, mesh);
    // The fish: the heap on deck and those falling into it (light, tinted each by its colour).
    const body = mergeParts([part(new THREE.BoxGeometry(0.3, 0.06, 0.08), 0xffffff), part(new THREE.BoxGeometry(0.06, 0.05, 0.09).translate(-0.17, 0, 0), 0xd8d8d8)]);
    this.fish = new THREE.InstancedMesh(body, flatVertexColorMaterial(), HEAP + FALLING);
    for (let i = 0; i < HEAP + FALLING; i++) this.fish.setColorAt(i, new THREE.Color(FISH[i % FISH.length]));
    for (const o of [this.warps, this.floats, this.doors, this.netting, this.codendFill, mesh, this.fish]) o.frustumCulled = false;
    this.root.add(this.warps, this.floats, this.doors, this.netting, this.codend, this.fish);
    this.root.visible = false;
  }

  /** Follow her trawl gantry (the A-frame is her module: deck.a-frame). */
  setBoat(v: { defId: string }): void {
    this.af = aFrameOf(v);
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    this.deckY = (z) => plan.deckY(z);
    this.stern.set(0, plan.deckY(plan.transom) + 0.25, plan.transom);
    this.winch = gearOf(v, 'trawlWinches')?.lead ?? null;
    const nd = gearOf(v, 'netDrum');
    this.drum = nd ? new THREE.Vector3(...nd.lead) : null;
    this.heap = heapAt(v);
    const qz = plan.transom - 0.45;
    this.doorHang = [plan.halfBeam(qz) + 0.08, plan.deckY(qz) - 0.4, qz];
  }

  update(world: WorldState, boat: THREE.Object3D | null, waves: readonly PreparedWave[], t: number): void {
    const f = world.fishing;
    const af = this.af;
    if (!boat || !f || !af) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const dt = Math.min(0.1, Math.max(0, t - this.lastTime));
    this.lastTime = t;
    const out = f.t;
    const lift = f.lift ?? 0;
    const luff = luffOf(lift);
    const inNet = f.catch?.length ?? 0;
    // What's shown in the codend eases down as the fish pour out (RELEASE), up at once.
    const pour = CONFIG.fishing.codend.pourTime;
    if (inNet >= this.shownCatch) this.shownCatch = this.pourFrom = inNet;
    else this.shownCatch = Math.max(inNet, this.shownCatch - (dt * Math.max(1, this.pourFrom - inNet)) / pour);
    const pouring = this.shownCatch - inNet;
    const onDeck = Math.max(0, (f.pile?.length ?? 0) - pouring);

    // ── The doors and the warps ──
    const k = smooth(0, 0.12, out);
    const back = 6 + 34 * out;
    const down = 2 + 10 * out;
    const pos = this.warps.geometry.attributes.position as THREE.BufferAttribute;
    [-1, 1].forEach((s, i) => {
      const block = luffPoint(af, luff, [s * af.blockX, af.top - 0.22, af.headZ]);
      // Hung up on the stern quarters (out of the way as the net comes aboard), or astern and down at the end of its warp.
      const hang = [s * this.doorHang[0], this.doorHang[1], this.doorHang[2]];
      const far = [s * (af.blockX + 1.5 * out), -down, af.headZ + back];
      boat.localToWorld(this.a.set(hang[0] + (far[0] - hang[0]) * k, hang[1] + (far[1] - hang[1]) * k, hang[2] + (far[2] - hang[2]) * k));
      boat.localToWorld(this.b.set(...block));
      pos.setXYZ(2 * i, this.b.x, this.b.y, this.b.z);
      pos.setXYZ(2 * i + 1, this.a.x, this.a.y + 0.33, this.a.z);
      // With trawl winches: the warp from its drum up to the block (else it comes off the tow winch, under the frame).
      const w = this.winch;
      if (w) boat.localToWorld(this.a.set(s * w[0], w[1], w[2]));
      pos.setXYZ(4 + 2 * i, this.b.x, this.b.y, this.b.z);
      pos.setXYZ(5 + 2 * i, w ? this.a.x : this.b.x, w ? this.a.y : this.b.y, w ? this.a.z : this.b.z);
      // Its face along her, splayed out a little in the water (spreading the net).
      boat.getWorldQuaternion(this.q).multiply(new THREE.Quaternion().setFromEuler(this.e.set(0, s * 0.35 * k, 0)));
      this.doors.setMatrixAt(i, this.m.compose(this.a, this.q, this.s.set(1, 1, 1)));
    });
    pos.needsUpdate = true;
    this.doors.instanceMatrix.needsUpdate = true;

    // ── The floats, while it's fishing ──
    const n = out > 0.6 ? FLOATS : 0;
    this.floats.count = n;
    for (let i = 0; i < n; i++) {
      const u = i / (FLOATS - 1) - 0.5;
      boat.localToWorld(this.a.set(u * 7 * out, 0, af.headZ + back + 8 - 4 * u * u * 6));
      this.a.y = surfaceHeight(waves, this.a.x, this.a.z) + 0.08 + 0.02 * Math.sin(t * 3 + i);
      this.floats.setMatrixAt(i, this.m.makeTranslation(this.a.x, this.a.y, this.a.z));
    }
    this.floats.instanceMatrix.needsUpdate = true;

    // ── The net coming up the stern, and the codend ──
    // Seen once the warps are in (it's under water while they're out); wound back on its drum while it's stowed.
    const up = out <= 0.001 && lift > 0 && f.net !== 'stowed';
    const stowing = f.net === 'stowing';
    const c = CONFIG.fishing.codend;
    const r = c.radius + c.radiusPerBox * Math.cbrt(this.shownCatch);
    const at = codendAt(af, lift);
    this.codend.visible = up && !(stowing && lift < c.hangAt);
    this.netting.visible = up && !stowing;
    if (this.codend.visible) {
      // Hanging, it's a long bag; coming up through the water, rounder. Shrinks away as it's stowed.
      const hanging = smooth(c.surfaceAt, c.hangAt, lift);
      const gone = stowing ? smooth(c.hangAt, 1, lift) : 1;
      boat.localToWorld(this.codend.position.set(...at));
      boat.getWorldQuaternion(this.codend.quaternion);
      this.codend.scale.set(r * gone, r * (1 + 0.5 * hanging) * gone, r * (1.3 - 0.3 * hanging) * gone);
      this.codendFill.visible = this.shownCatch > 0.05;
    }
    if (this.netting.visible) this.drawNet(boat, at, r, lift);

    // ── The catch on deck: the heap, and the fish falling into it as the codend empties ──
    const heap = [this.heap[0], 0, this.heap[1]];
    const heapY = this.deckY(heap[2]) + 0.03;
    const count = Math.min(HEAP, Math.round(onDeck * PER_BOX));
    const R = 0.3 + 0.16 * Math.sqrt(onDeck);
    for (let i = 0; i < count; i++) {
      const ang = rnd(i) * Math.PI * 2;
      const rad = R * Math.sqrt(rnd(i + 500));
      const lay = Math.floor(i / 24);
      boat.localToWorld(this.a.set(heap[0] + Math.cos(ang) * rad, heapY + lay * 0.05 * (1 - rad / R), heap[2] + Math.sin(ang) * rad));
      boat.getWorldQuaternion(this.q).multiply(new THREE.Quaternion().setFromEuler(this.e.set(0, rnd(i + 900) * 6.28, 0)));
      this.fish.setMatrixAt(i, this.m.compose(this.a, this.q, this.s.set(1, 1, 1)));
    }
    let shown = count;
    if (pouring > 0.05 && this.codend.visible) {
      for (let j = 0; j < FALLING; j++) {
        const u = (t * 2.2 + j / FALLING) % 1;
        // From the codend's mouth down onto the heap.
        boat.localToWorld(this.a.set(at[0] + (heap[0] - at[0]) * u + (rnd(j) - 0.5) * 0.3, at[1] - r - u * (at[1] - r - heapY), at[2] + (heap[2] - at[2]) * u + (rnd(j + 40) - 0.5) * 0.3));
        boat.getWorldQuaternion(this.q).multiply(new THREE.Quaternion().setFromEuler(this.e.set(rnd(j + 70) * 3, rnd(j + 80) * 6.28, 1.2)));
        this.fish.setMatrixAt(shown++, this.m.compose(this.a, this.q, this.s.set(1, 1, 1)));
      }
    }
    this.fish.count = shown;
    this.fish.instanceMatrix.needsUpdate = true;
  }

  /** The net's body: from over her stern roller (wide) down or up to the codend's mouth (narrow), sagging between. */
  private drawNet(boat: THREE.Object3D, codend: readonly number[], r: number, lift: number): void {
    const pos = this.netting.geometry.attributes.position as THREE.BufferAttribute;
    const end = new THREE.Vector3(...codend);
    // (Off her net drum, if she has one: over the top of its roll.)
    const start = (this.drum ?? this.stern).clone();
    // Toward the codend, short of it by its radius.
    end.add(start.clone().sub(end).setLength(r * 0.9));
    // Sagging between: down into the water while it's astern, less as it comes up.
    const ctrl = start.clone().lerp(end, 0.5);
    ctrl.y -= 1.5 * (1 - smooth(0.3, 0.75, lift)) + 0.3;
    const point = (u: number) => {
      const a = start.clone().multiplyScalar((1 - u) * (1 - u));
      return a.add(ctrl.clone().multiplyScalar(2 * u * (1 - u))).add(end.clone().multiplyScalar(u * u));
    };
    const rings: THREE.Vector3[][] = [];
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      const p = point(u);
      const along = point(Math.min(1, u + 0.02)).sub(point(Math.max(0, u - 0.02))).normalize();
      const side = new THREE.Vector3(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(along, side).normalize();
      // Wide at the stern (the net bunched over the roller) or the drum's width, narrowing to the codend's mouth.
      const wide = this.drum ? 0.55 : 0.7;
      const rad = wide + (r * 0.8 - wide) * u;
      rings.push(Array.from({ length: LONGS }, (_, j) => {
        const a = (j / LONGS) * Math.PI * 2;
        return boat.localToWorld(p.clone().addScaledVector(side, Math.cos(a) * rad).addScaledVector(upv, Math.sin(a) * rad * 0.6));
      }));
    }
    let k = 0;
    const put = (p: THREE.Vector3) => pos.setXYZ(k++, p.x, p.y, p.z);
    for (const ring of rings)
      for (let j = 0; j < LONGS; j++) {
        put(ring[j]);
        put(ring[(j + 1) % LONGS]);
      }
    for (let i = 0; i < RINGS - 1; i++)
      for (let j = 0; j < LONGS; j++) {
        put(rings[i][j]);
        put(rings[i + 1][j]);
      }
    pos.needsUpdate = true;
  }
}
