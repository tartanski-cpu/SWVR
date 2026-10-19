import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Camera views at the helm with a game controller (owner, Oct 2026; desktop only, not VR):
 * Y cycles inside -> orbit -> flyby -> inside while you drive from the helm (app/App.ts
 * updateHelmSeat; leaving the helm puts you back inside).
 *
 *   inside  the usual view from the helm (the right stick looks round).
 *   orbit   a camera on a sphere round the boat, a couple of her lengths off, turning with
 *           her heading so it keeps its place astern of her as she turns; the right stick
 *           orbits it round and up and down. Eased, so it swings smoothly.
 *   flyby   a camera put down ahead of her, off to one side, a few metres up, that stays
 *           there and watches her pass; once she's well past it (or far off) a new spot is
 *           picked ahead of her, the other side. The stick does nothing.
 *
 * Zoom (RT in, LT out, held): the orbit camera comes in and goes out (`zoom` scales its
 * distance); the flyby camera narrows and widens its lens (`fovScale`).
 *
 * Nothing to do with the recording camera (cameraMode.ts): these are driving views, for
 * docking and for seeing her go by.
 *
 * World positions and quaternions; the app sets the camera to them before the frame is drawn.
 */
export type HelmView = 'inside' | 'orbit' | 'flyby';
const VIEWS: HelmView[] = ['inside', 'orbit', 'flyby'];

export interface HelmBoat {
  /** Her origin (world), her orientation (vessel -> world), her length (m), her velocity (world, m/s). */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  length: number;
  vel: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export class HelmCamera {
  view: HelmView = 'inside';
  /** Orbit: the camera's bearing round her from astern (rad, + to starboard) and its height angle (rad). */
  yaw = 0;
  pitch = 0.32;
  /** Zoom: the orbit distance times this; the flyby lens (its field of view) times this. */
  zoom = 1;
  fovScale = 1;
  /** Flyby: where the camera stands (world), and which side it stands next. */
  private readonly flyAt = new THREE.Vector3();
  private flySet = false;
  private flySide = 1;
  private readonly sPos = new THREE.Vector3();
  private readonly sLook = new THREE.Vector3();
  private placed = false;
  private readonly fwd = new THREE.Vector3();
  private readonly off = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly hq = new THREE.Quaternion();
  private readonly m = new THREE.Matrix4();

  /** The next view round. */
  cycle(): HelmView {
    this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length];
    this.placed = false;
    this.flySet = false;
    return this.view;
  }

  /** Zoom in (dir +1) or out (-1) while held: the orbit camera's distance, the flyby's lens. */
  zoomBy(dir: number, dt: number): void {
    const c = CONFIG.helmCamera;
    if (this.view === 'orbit') this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-dir * c.zoomRate * dt), c.orbit.zoomMin, c.orbit.zoomMax);
    else if (this.view === 'flyby') this.fovScale = THREE.MathUtils.clamp(this.fovScale * Math.exp(-dir * c.zoomRate * dt), c.flyby.fovMin, 1);
  }

  /** Back inside (leaving the helm, into VR, the recording camera). */
  reset(): void {
    this.view = 'inside';
    this.placed = false;
    this.flySet = false;
  }

  /** Her heading (rad about up) from her orientation. */
  private heading(q: THREE.Quaternion): number {
    const f = this.fwd.set(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  /**
   * One frame: the camera's world pose for the view, or false inside. `stick`: the right
   * stick (-1..1, y down +).
   */
  update(dt: number, stick: { x: number; y: number }, boat: HelmBoat, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    if (this.view === 'inside') return false;
    const c = CONFIG.helmCamera;
    const H = this.heading(boat.quat);
    if (this.view === 'orbit') {
      const o = c.orbit;
      this.yaw -= stick.x * o.rate * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch + stick.y * o.rate * dt, o.pitchMin, o.pitchMax);
      const dist = Math.max(o.minDist, o.lengths * boat.length) * this.zoom;
      // Astern of her at yaw 0, level with her heading, up by the pitch; then turned to her heading.
      this.off.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(dist);
      this.off.applyQuaternion(this.hq.setFromAxisAngle(UP, H));
      this.target.copy(boat.pos).addScaledVector(UP, o.up * boat.length);
      const want = this.off.add(this.target);
      const k = this.placed ? 1 - Math.exp(-dt / o.tau) : 1;
      this.sPos.lerp(want, k);
      this.sLook.lerp(this.target, k);
    } else {
      const f = c.flyby;
      const fwd = this.fwd.set(0, 0, -1).applyQuaternion(boat.quat);
      fwd.y = 0;
      fwd.normalize();
      // Her course for the spot ahead: where she's going if she's moving, else where she points.
      const speed = Math.hypot(boat.vel.x, boat.vel.z);
      const along = speed > 0.5 ? this.off.set(boat.vel.x / speed, 0, boat.vel.z / speed) : this.off.copy(fwd);
      const ahead = this.flySet ? this.target.copy(boat.pos).sub(this.flyAt).dot(along) : 0;
      const far = this.flySet ? this.flyAt.distanceTo(boat.pos) : 0;
      if (!this.flySet || ahead > f.behind || far > f.maxDist) {
        // A new spot: ahead along her course, off to the side (the other side each time), up.
        this.flySide = -this.flySide;
        const side = this.target.set(-along.z, 0, along.x).multiplyScalar(this.flySide * f.offset);
        this.flyAt.copy(boat.pos).addScaledVector(along, f.ahead).add(side);
        this.flyAt.y = f.height;
        this.flySet = true;
        this.placed = false;
      }
      this.target.copy(boat.pos).addScaledVector(UP, 1.5);
      const k = this.placed ? 1 - Math.exp(-dt / f.lookTau) : 1;
      this.sPos.copy(this.flyAt);
      this.sLook.lerp(this.target, k);
    }
    this.placed = true;
    outPos.copy(this.sPos);
    this.m.lookAt(this.sPos, this.sLook, UP);
    outQuat.setFromRotationMatrix(this.m);
    return true;
  }
}
