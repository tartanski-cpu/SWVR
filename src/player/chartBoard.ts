import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { HandFrame } from '../controls/InteractionSystem';
import { ChartPad, type PadFace } from '../voyage/chartPad';
import type { Handedness } from './xrInput';

/**
 * The planning chart on a board, VR (owner, 28 Oct 2026: "a chart board you carry"; voyage/
 * planChart.ts). The Voyage tab's Open the chart puts it out; its ✕ key (or the menu again)
 * puts it away. It's yours alone, as your view of the chart is; the plan on it is everyone's.
 *
 *   out      it comes up in front of you, a little below your eyes, turned to face you, and
 *            stays there (owner, 29 Oct 2026: "it shouldn't be stuck to your hand. It should
 *            be an object that appears in the world and stays in relation to the boat"):
 *            aboard, it goes with her as she moves; ashore, it stands where it is.
 *   moving   grip it by its frame (either hand) and it comes with your hand; let go and it
 *            stays where you left it, on the boat you're aboard (so you can set it up by the
 *            helm, or anywhere inside her, and it stays there).
 *   working  either hand's pointer on it, as the quay table's (voyage/chartPad.ts PadFaces):
 *     trigger, pressed and let go: on the chart, the tool there (a point, or the nearest off);
 *              on a key along its foot, that key
 *     trigger, held and dragged: the chart moves with the pointer
 *     right thumbstick forward / back: zoom in / out about where you're pointing
 *   keys     WAY STOP LOOK DEL | UNDO CLEAR | BOAT ALL | − + | LAYERS | ✕
 *
 * One mesh and one canvas, redrawn only when what's on it changes (at most every
 * `board.redrawS`), and only while it's out.
 */
export class ChartBoard {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly pad: ChartPad;
  private out = false;
  private looked = false;
  /** The hand holding it, and where it sits in that hand's frame. */
  private held: { hand: Handedness; offset: THREE.Matrix4 } | null = null;
  private readonly w: number;
  private readonly h: number;
  private readonly tmp = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly handM = new THREE.Matrix4();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly ident = new THREE.Quaternion();

  constructor(
    host: { world(): WorldState; ownBoatId(): string; send(ref: string, args?: number[]): void },
    /** What it stays with: the boat you're aboard (her drawn root), else the scene. */
    private readonly anchor: () => THREE.Object3D,
  ) {
    const b = CONFIG.voyage.plan.chart.board;
    this.pad = new ChartPad(host, {
      px: b.px,
      aspect: 4 / 3,
      toolbarShare: b.toolbarShare,
      keys: ['way', 'stop', 'look', 'remove', 'undo', 'clear', 'boat', 'all', 'out', 'in', 'layers', 'close'],
      redrawS: b.redrawS,
      onClose: () => this.putAway(),
    });
    this.pad.texture.anisotropy = 4;
    this.w = b.width;
    this.h = b.width * 0.75;
    // The board: its face (the chart), a dark frame round it and a back.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), new THREE.MeshBasicMaterial({ map: this.pad.texture, toneMapped: false }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.05, this.h + 0.05, 0.02).translate(0, 0, -0.011), new THREE.MeshLambertMaterial({ color: 0x2a2f33 }));
    this.root.add(frame, this.mesh);
    this.root.name = 'chartBoard';
    this.root.visible = false;
  }

  /** Its face as a planning chart's, for the pointer (PadFaces): worked while it's out. */
  get face(): PadFace {
    return { mesh: this.mesh, pad: this.pad, reach: CONFIG.voyage.plan.chart.board.reach, on: () => this.out };
  }

  get isOut(): boolean {
    return this.out;
  }

  /** Out in front of you (`head`, `facing` its look direction), or put away. */
  toggle(head: THREE.Vector3, facing: THREE.Vector3): void {
    if (this.out) this.putAway();
    else this.takeOut(head, facing);
  }

  /** Up in front of you, a little below your eyes, facing you, staying with the boat you're aboard. */
  takeOut(head: THREE.Vector3, facing: THREE.Vector3): void {
    const b = CONFIG.voyage.plan.chart.board;
    const f = this.tmp.set(facing.x, 0, facing.z);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    this.root.removeFromParent();
    this.root.position.set(head.x + f.x * b.ahead, head.y - b.below, head.z + f.z * b.ahead);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);
    this.anchor().attach(this.root);
    this.out = true;
    this.root.visible = true;
    this.held = null;
    // The first time: round your boat.
    if (!this.looked) this.pad.centreOnBoat();
    this.looked = true;
  }

  putAway(): void {
    this.out = false;
    this.root.visible = false;
    this.held = null;
    this.pad.input(null, false);
  }

  /** The world view's built terrains, for the career map's sharp coast. */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.pad.setLandSource(source);
  }

  /**
   * Each VR frame, before the controls take the hands: grip it by its frame to move it, let go
   * to leave it there (on the boat you're aboard). Returns the hand holding it, which nothing
   * else may use this frame. (Pointing at it is PadFaces', with the other planning charts.)
   */
  updateXR(hands: Record<Handedness, HandFrame>, dt: number, haptic: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (!this.out) return used;
    if (!this.root.parent) {
      // (The boat it was on went: away it goes.)
      this.putAway();
      return used;
    }
    const pose = (f: HandFrame) => this.handM.compose(f.grip, f.quat ?? this.ident, this.one);
    if (this.held) {
      const f = hands[this.held.hand];
      if (!f.tracked || !f.gripDown) {
        // Let go: it stays here, with the boat you're aboard.
        this.anchor().attach(this.root);
        this.held = null;
      } else {
        used[this.held.hand] = true;
        this.m.multiplyMatrices(pose(f), this.held.offset).decompose(this.root.position, this.root.quaternion, this.tmp);
        this.root.scale.set(1, 1, 1);
        this.root.updateMatrixWorld(true);
      }
    } else {
      for (const h of ['right', 'left'] as const) {
        const f = hands[h];
        if (!f.tracked || !f.gripPressed || !this.nearFrame(f.grip)) continue;
        // Taken: carried in the world while held (its offset in the hand kept).
        this.root.updateMatrixWorld(true);
        this.sceneOf().attach(this.root);
        this.held = { hand: h, offset: new THREE.Matrix4().copy(pose(f)).invert().multiply(this.root.matrixWorld) };
        used[h] = true;
        haptic(h, 0.5, 30);
        break;
      }
    }
    this.pad.update(dt);
    return used;
  }

  /** A hand's grip close enough to the board's frame (or its face's edge) to take hold. */
  private nearFrame(p: THREE.Vector3): boolean {
    const l = this.mesh.worldToLocal(this.tmp.copy(p));
    const g = CONFIG.voyage.plan.chart.board.grab;
    return Math.abs(l.x) < this.w / 2 + g && Math.abs(l.y) < this.h / 2 + g && Math.abs(l.z) < g;
  }

  /** The scene it's in (the top of its anchor's tree). */
  private sceneOf(): THREE.Object3D {
    let o = this.anchor();
    while (o.parent) o = o.parent;
    return o;
  }
}
