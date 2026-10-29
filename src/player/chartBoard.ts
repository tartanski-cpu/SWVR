import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { HandFrame } from '../controls/InteractionSystem';
import { ChartPad } from '../voyage/chartPad';
import type { Handedness } from './xrInput';

/**
 * The planning chart on a board in your left hand, VR (owner, 28 Oct 2026: "a chart board you
 * carry"; voyage/planChart.ts). The Voyage tab's Open the chart puts it there; its ✕ key (or the
 * menu again) puts it away. It's yours alone, as your view of the chart is; the plan on it is
 * everyone's.
 *
 *   held     it rides with your left hand, a little up and ahead of it, turned to face you
 *            (so it reads square on however the hand's turned). That hand is busy while it's out.
 *   pointing your right hand's pointer on it: a small cross where it falls.
 *     trigger, pressed and let go: on the chart, the tool there (a point, or the nearest off);
 *              on a key along its foot, that key
 *     trigger, held and dragged: the chart moves with the pointer
 *     thumbstick forward / back: zoom in / out about where you're pointing
 *   keys     WAY STOP LOOK DEL | UNDO CLEAR | BOAT ALL | − + | ✕
 *
 * One mesh and one canvas (a chart pad: voyage/chartPad.ts, as the quay table's and the boat's
 * are), redrawn only when what's on it changes (at most every `board.redrawS`), and only while
 * it's out.
 */
export class ChartBoard {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly pad: ChartPad;
  private out = false;
  private readonly ray = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();

  constructor(
    host: { world(): WorldState; ownBoatId(): string; send(ref: string, args?: number[]): void },
  ) {
    const b = CONFIG.voyage.plan.chart.board;
    this.pad = new ChartPad(host, {
      px: b.px,
      aspect: 4 / 3,
      toolbarShare: b.toolbarShare,
      keys: ['way', 'stop', 'look', 'remove', 'undo', 'clear', 'boat', 'all', 'out', 'in', 'close'],
      redrawS: b.redrawS,
      onClose: () => this.putAway(),
    });
    this.pad.texture.anisotropy = 4;
    const w = b.width;
    const h = w * 0.75;
    // The board: its face (the chart), a dark frame round it and a back.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.pad.texture, toneMapped: false }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.012).translate(0, 0, -0.007), new THREE.MeshLambertMaterial({ color: 0x2a2f33 }));
    this.root.add(frame, this.mesh);
    this.root.name = 'chartBoard';
    this.root.visible = false;
  }

  get isOut(): boolean {
    return this.out;
  }

  /** Out into your left hand, or put away. */
  toggle(): void {
    if (this.out) this.putAway();
    else this.takeOut();
  }

  private looked = false;
  takeOut(): void {
    this.out = true;
    this.root.visible = true;
    // The first time: round your boat.
    if (!this.looked) this.pad.centreOnBoat();
    this.looked = true;
  }

  putAway(): void {
    this.out = false;
    this.root.visible = false;
    this.pad.input(null, false);
  }

  /** The world view's built terrains, for the career map's sharp coast. */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.pad.setLandSource(source);
  }

  /**
   * Each VR frame, before the controls take the hands: placed in the left hand, worked by the
   * right hand's pointer. Returns the hands it used (the left holding it; the right while
   * pointing at it), which nothing else may use this frame.
   */
  updateXR(hands: Record<Handedness, HandFrame>, head: THREE.Vector3, dt: number, haptic: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (!this.out) return used;
    const L = hands.left;
    if (!L.tracked) {
      this.root.visible = false;
      return used;
    }
    this.root.visible = true;
    used.left = true;
    // In the left hand: a little up and ahead of it (its own axes), facing your head.
    const b = CONFIG.voyage.plan.chart.board;
    this.tmp.set(...b.offset);
    if (L.quat) this.tmp.applyQuaternion(L.quat);
    this.root.position.copy(L.grip).add(this.tmp);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);

    // The right hand's pointer on it.
    const R = hands.right;
    let at: [number, number] | null = null;
    if (R.tracked) {
      this.ray.ray.copy(R.ray);
      const hit = this.ray.intersectObject(this.mesh, false)[0];
      if (hit?.uv) at = [hit.uv.x * this.pad.W, (1 - hit.uv.y) * this.pad.H];
    }
    used.right = !!at;
    const sy = R.stick?.[1] ?? 0;
    const zoom = at && Math.abs(sy) > CONFIG.interaction.stickDeadZone ? CONFIG.voyage.plan.chart.stickZoomPerS ** (-sy * dt) : 1;
    if (this.pad.input(at, !!at && R.triggerDown, zoom)) haptic('right', 0.4, 25);
    if (this.out) this.pad.update(dt);
    return used;
  }
}
