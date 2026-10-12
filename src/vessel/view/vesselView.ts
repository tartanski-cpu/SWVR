import * as THREE from 'three';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { buildVesselMesh } from './hullMesh';

/**
 * Scene-graph representation of one vessel, interpolated between simulation ticks.
 *
 * `root` is the vessel's frame: anything parented to it (the player rig from milestone 5,
 * controls, debug views) rides with the boat exactly as rendered.
 *
 * Interpolation: before every sim tick the App calls `snapshot()`, which keeps the pose
 * the vessel had before that tick. After the ticks, `update(alpha)` blends previous ->
 * current. The render is therefore up to one tick (16.7 ms) behind the sim, but smooth at
 * any display rate (72/90/120 Hz).
 */
export class VesselView {
  readonly root = new THREE.Group();
  private readonly prevPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currPos = new THREE.Vector3();
  private readonly currQuat = new THREE.Quaternion();
  private hasSnapshot = false;

  constructor(
    readonly vesselId: string,
    def: VesselDef,
  ) {
    this.root.name = `vessel:${vesselId}`;
    this.root.add(buildVesselMesh(def.hull));
  }

  snapshot(state: VesselState): void {
    this.prevPos.fromArray(state.position);
    this.prevQuat.fromArray(state.orientation);
    this.hasSnapshot = true;
  }

  update(state: VesselState, alpha: number): void {
    this.currPos.fromArray(state.position);
    this.currQuat.fromArray(state.orientation);
    if (!this.hasSnapshot) this.snapshot(state);
    this.root.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
  }
}
