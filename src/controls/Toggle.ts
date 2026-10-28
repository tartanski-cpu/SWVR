import * as THREE from 'three';
import { CONFIG } from '../config';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * Toggle switch (e.g. navigation lights). Two positions: a press flips it; the bat lever
 * tilts forward (on) or aft (off). Three positions (the cabin light: off / white / red):
 * each press steps 0 -> 1 -> 2 -> 0; the bat sits in the middle (0), forward (1) or aft
 * (2). Or, `sweep` (the foiling ferry's FOIL / HULL / SHALLOW, owner, 28 Oct 2026), each press
 * moves the bat to the next position along its travel, as a hand does a real one, turning back
 * at either end: forward, middle, aft, middle, forward (never from forward straight to aft).
 * It sends the position number. The authoritative position comes from the vessel state.
 */
export class Toggle extends Control {
  readonly kind = 'press' as const;
  private readonly bat = new THREE.Group();
  /** The bat lever (modules draw it as a shared part: modular/sharedParts.ts). */
  readonly batMesh: THREE.Mesh;
  private pos = 0;
  /** Sweeping: which way along its travel (forward to aft, +1, or back) the next press moves it. */
  private dir = 1;

  constructor(
    id: string,
    channel: string,
    readonly label: string,
    private readonly read: (s: VesselState) => number,
    private readonly positions: 2 | 3 = 2,
    private readonly sweep = false,
  ) {
    super(id, channel);
    const k = CONFIG.interaction.switchScale;
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.07 * k, 0.012, 0.09 * k), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    plate.position.y = 0.006;
    // Bat lever: stick and ball tip in one mesh (one draw call per toggle).
    const bat = new THREE.Mesh(
      mergeGeometries([new THREE.CylinderGeometry(0.007 * k, 0.009 * k, 0.05 * k, 8).translate(0, 0.025 * k, 0).toNonIndexed(), new THREE.SphereGeometry(0.012 * k, 8, 6).translate(0, 0.05 * k, 0).toNonIndexed()]),
      this.material(0xd8dadc),
    );
    this.bat.position.y = 0.012;
    this.batMesh = bat;
    this.bat.add(bat);
    // What the pointer and reticle hit: the switch at its first, full size (a hidden box
    // drawn by nothing), so a smaller switch is no harder to aim at.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09).translate(0, 0.035, 0), new THREE.MeshBasicMaterial());
    hit.visible = false;
    this.root.add(plate, this.bat, hit);
    this.hitObjects.push(bat, plate, hit);
    this.show(0);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.04 * CONFIG.interaction.switchScale, 0));
  }

  pressStart(): void {
    this.show(this.next());
    this.markPending();
    this.ctx?.haptic(0.5, 30);
    this.ctx?.emit(this.channel, this.pos);
  }

  /** Where a press moves it. */
  private next(): number {
    if (this.positions !== 3 || !this.sweep) return (this.pos + 1) % this.positions;
    // Along its travel: forward (1), middle (0), aft (2); at an end it turns back.
    const TRAVEL = [1, 0, 2];
    let i = TRAVEL.indexOf(this.pos) + this.dir;
    if (i < 0 || i > 2) {
      this.dir = -this.dir;
      i = TRAVEL.indexOf(this.pos) + this.dir;
    }
    return TRAVEL[i];
  }

  private show(pos: number): void {
    this.pos = pos;
    // Forward = on (1); two-way: aft = off; three-way: middle = off, aft = 2.
    this.bat.rotation.x = pos === 1 ? -0.45 : pos === 2 || this.positions === 2 ? 0.45 : 0;
  }

  sync(state: VesselState): void {
    const v = this.read(state);
    const pos = this.positions === 2 ? (v > 0.5 ? 1 : 0) : Math.max(0, Math.min(2, Math.round(v)));
    if (this.awaiting(pos === this.pos)) return;
    if (pos !== this.pos) this.show(pos);
  }
}
