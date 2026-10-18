import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * The recording camera (owner request): a desktop player becomes a flying camera instead of
 * a crew-mate, to film the others; the desktop screen is recorded with an outside tool (OBS).
 * Crew-mates see a small hand-held camera where it is (net/avatarView.ts), and a VR player
 * can pick it up and handle it like a GoPro (player/cameraHold.ts).
 *
 *   flying     the mouse aims it; W/S fly forward and back where it looks, A/D sideways,
 *              Space / C straight up and down, Shift faster; the mouse wheel zooms. Nothing
 *              stops it: it flies through hulls, walls and the sea.
 *   rides      with the boat (default): it keeps its place on her as she moves, its view
 *              turning with her heading but always level (as on a gimbal: her roll and pitch
 *              don't tip the picture). Or it stays put in the world, for a shot set up ashore
 *              or at sea as she passes.
 *   held       by a VR player: locked to their hand (lens along their controller), easing
 *              onto it (it comes over the network). Let go, it stays there, riding with their
 *              boat (or put, as set).
 *   smoothing  on: the view eases to where you fly and look, for steady footage.
 *   clean      on: nothing on the screen but the picture (no reticle, help, labels, notices).
 *
 * State here is the camera player's own (their game flies it); others see it through their
 * pose (`avatar.camera`, the camera's place and turn as the head).
 */
export class CameraMode {
  on = false;
  fov: number = CONFIG.camera.fov;
  /** 0 slow, 1 normal, 2 fast (CONFIG.camera.speeds). */
  speed = 1;
  smooth = true;
  rideBoat = true;
  clean = true;
  /** The vessel it rides with, or null: it stays put in the world. */
  frameId: string | null = null;
  /** Its place in the frame (the vessel's axes, or the world). */
  readonly pos = new THREE.Vector3();
  /** Its aim (rad): yaw from the frame's heading, pitch up from level. */
  yaw = 0;
  pitch = 0;
  /** Held in a VR player's hand this frame. */
  held = false;

  private readonly sPos = new THREE.Vector3();
  private readonly sQuat = new THREE.Quaternion();
  private placed = false;
  private readonly tPos = new THREE.Vector3();
  private readonly tQuat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly fq = new THREE.Quaternion();

  /** The frame's heading (rad, about up; 0 for the world). */
  private heading(frame: THREE.Object3D | null): number {
    if (!frame) return 0;
    const f = this.v.set(0, 0, -1).applyQuaternion(frame.getWorldQuaternion(this.fq));
    return Math.atan2(-f.x, -f.z);
  }

  /** Take up this world pose in a frame (entering camera mode, being let go, a new "rides" choice). */
  anchor(frameId: string | null, frame: THREE.Object3D | null, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion): void {
    this.frameId = frameId;
    this.pos.copy(worldPos);
    if (frame) frame.worldToLocal(this.pos);
    const d = this.v.set(0, 0, -1).applyQuaternion(worldQuat);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.yaw = Math.atan2(-d.x, -d.z) - this.heading(frame);
  }

  /** Snap the view to where it is now, no easing (entering camera mode). */
  snap(): void {
    this.placed = false;
  }

  /**
   * One frame. `look` is the mouse's yaw and pitch (free flying); `move` the keys (x right,
   * y up, z forward, each -1..1); `held` a VR hand's lens pose (world) while it holds us.
   * Sets the camera (a child of the scene) to the view.
   */
  update(
    dt: number,
    frame: THREE.Object3D | null,
    look: { yaw: number; pitch: number },
    move: { x: number; y: number; z: number; fast: boolean },
    held: { pos: THREE.Vector3; quat: THREE.Quaternion } | null,
    camera: THREE.PerspectiveCamera,
  ): void {
    const c = CONFIG.camera;
    this.held = !!held;
    if (held) {
      this.tPos.copy(held.pos);
      this.tQuat.copy(held.quat);
      // Keep our own place and aim on the hand, so it stays right there when let go.
      this.anchor(this.frameId, frame, held.pos, held.quat);
    } else {
      this.yaw = look.yaw;
      this.pitch = look.pitch;
      const Y = this.yaw + this.heading(frame);
      const P = this.pitch;
      this.tPos.copy(this.pos);
      if (frame) frame.localToWorld(this.tPos);
      const n = Math.hypot(move.x, move.y, move.z);
      if (n > 0) {
        // Forward where it looks (pitch too: it flies), sideways level, up straight up.
        const s = (c.speeds[this.speed] * (move.fast ? 3 : 1) * dt) / n;
        const fx = -Math.sin(Y) * Math.cos(P);
        const fy = Math.sin(P);
        const fz = -Math.cos(Y) * Math.cos(P);
        this.tPos.x += (fx * move.z + Math.cos(Y) * move.x) * s;
        this.tPos.y += (fy * move.z + move.y) * s;
        this.tPos.z += (fz * move.z - Math.sin(Y) * move.x) * s;
        this.pos.copy(this.tPos);
        if (frame) frame.worldToLocal(this.pos);
      }
      this.tQuat.setFromEuler(this.euler.set(P, Y, 0));
    }
    const tau = held ? c.heldTau : this.smooth ? c.smoothTau : 0;
    const k = !this.placed || tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    this.placed = true;
    this.sPos.lerp(this.tPos, k);
    this.sQuat.slerp(this.tQuat, k);
    camera.position.copy(this.sPos);
    camera.quaternion.copy(this.sQuat);
    if (camera.fov !== this.fov) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  }

  /** Zoom by mouse-wheel steps (in: fewer degrees). */
  zoom(steps: number): void {
    this.fov = THREE.MathUtils.clamp(this.fov + steps * 2, CONFIG.camera.fovMin, CONFIG.camera.fovMax);
  }

  /** The view now in the frame's axes (for the pose crew-mates see): place and turn. */
  framePose(frame: THREE.Object3D | null, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    outPos.copy(this.sPos);
    outQuat.copy(this.sQuat);
    if (!frame) return;
    frame.worldToLocal(outPos);
    outQuat.premultiply(frame.getWorldQuaternion(this.fq).invert());
  }
}
