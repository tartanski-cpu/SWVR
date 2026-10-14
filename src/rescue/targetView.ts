import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { sampleSurface, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { standingHeight } from '../world/geography';
import type { RescueTarget } from './rescue';

const ORANGE = 0xff6a10;
const SKIN = 0xd8a07a;

interface Marker {
  root: THREE.Group;
  arm: THREE.Object3D | null;
  /** Legs, shown once a survivor stands up (landing, ashore). */
  legs: THREE.Object3D | null;
  strobe: THREE.Sprite;
  kind: RescueTarget['kind'];
  phase: number;
  /** Smoothed horizontal position (snapshots and tows arrive in steps). */
  x: number;
  z: number;
}

/**
 * What's in the water during a rescue, made easy to spot:
 *   - a survivor: bright orange lifejacket up to the chin, head above water, facing the
 *     boat; waves an arm when you're within CONFIG.rescue.waveRange and blows the
 *     lifejacket whistle (spatial sound, via onWhistle) every few seconds;
 *   - crates: bright orange, banded, floating low and tilting with the waves.
 * Both ride the wave surface (sampled at their position; no physics body) and carry a
 * flashing strobe at night: a glowing sprite, not a real light, kept a readable size at
 * any distance.
 *
 * Recovery (see recovery.ts): a survivor on the line hangs on to the ring (no more
 * waving); climbing, they come up over the stern to their seat on deck, and aboard they
 * sit there, riding in the boat's frame. A crate on the hook follows it; once lifted it's
 * ordinary cargo, drawn by the cargo view, so it's hidden here.
 */
export class TargetsView {
  readonly root = new THREE.Group();
  private readonly markers = new Map<string, Marker>();
  private readonly personGeo: THREE.BufferGeometry;
  private readonly armGeo: THREE.BufferGeometry;
  private readonly legsGeo: THREE.BufferGeometry;
  private readonly crateGeo: THREE.BufferGeometry;
  /** A little self-lit so the orange stays bright in shadow and at dusk. */
  private readonly mat = (() => {
    const m = flatVertexColorMaterial();
    m.emissive.setHex(0x3a1600);
    return m;
  })();
  private readonly strobeMat: THREE.SpriteMaterial;
  private readonly tmp = new THREE.Vector3();
  private readonly endV = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly n = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private whistleT = 0;
  /** Called when the survivor blows the whistle (world position). */
  onWhistle: (pos: THREE.Vector3) => void = () => {};

  constructor() {
    this.root.name = 'rescueTargets';
    // Survivor, origin at the waterline, facing +z: lifejacket (with collar) and head.
    this.personGeo = mergeParts([
      part(new THREE.BoxGeometry(0.44, 0.5, 0.3).translate(0, -0.1, 0), ORANGE),
      part(new THREE.BoxGeometry(0.46, 0.12, 0.32).translate(0, 0.2, 0), 0xff8a30), // collar
      part(new THREE.BoxGeometry(0.46, 0.04, 0.32).translate(0, 0.02, 0), 0xe8e8e0), // reflective band
      part(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 0.38, 0.02), SKIN),
      part(new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.41, 0.0), 0x2b2118), // hair
      // The other arm, resting on the water.
      part(new THREE.BoxGeometry(0.09, 0.09, 0.4).translate(-0.3, 0.02, 0.12), ORANGE),
    ]);
    // Waving arm: pivot at the shoulder, pointing up.
    this.armGeo = mergeParts([
      part(new THREE.BoxGeometry(0.09, 0.42, 0.09).translate(0, 0.21, 0), ORANGE),
      part(new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.46, 0), SKIN),
    ]);
    // Legs and boots under the lifejacket, for standing (the bust's hem is at y = -0.35).
    this.legsGeo = mergeParts([
      part(new THREE.BoxGeometry(0.15, 0.72, 0.17).translate(-0.1, -0.71, 0), 0x2c3440),
      part(new THREE.BoxGeometry(0.15, 0.72, 0.17).translate(0.1, -0.71, 0), 0x2c3440),
      part(new THREE.BoxGeometry(0.16, 0.08, 0.26).translate(-0.1, -1.11, 0.04), 0x1a1a1a),
      part(new THREE.BoxGeometry(0.16, 0.08, 0.26).translate(0.1, -1.11, 0.04), 0x1a1a1a),
    ]);
    // Crate: origin at the waterline, a third of it below.
    this.crateGeo = mergeParts([
      part(new THREE.BoxGeometry(0.7, 0.5, 0.6).translate(0, 0.08, 0), ORANGE),
      part(new THREE.BoxGeometry(0.72, 0.06, 0.62).translate(0, 0.2, 0), 0x3a2a1a),
      part(new THREE.BoxGeometry(0.72, 0.06, 0.62).translate(0, -0.06, 0), 0x3a2a1a),
      part(new THREE.BoxGeometry(0.5, 0.01, 0.4).translate(0, 0.335, 0), 0xe8e8e0), // reflective top patch
    ]);
    // Strobe sprite: a soft white blob.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(220,240,255,0.8)');
    grad.addColorStop(1, 'rgba(200,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.strobeMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  }

  private create(t: RescueTarget): Marker {
    const root = new THREE.Group();
    root.name = `target:${t.id}`;
    let arm: THREE.Object3D | null = null;
    let legs: THREE.Object3D | null = null;
    if (t.kind === 'person') {
      root.add(new THREE.Mesh(this.personGeo, this.mat));
      arm = new THREE.Mesh(this.armGeo, this.mat);
      arm.position.set(0.27, 0.12, 0);
      legs = new THREE.Mesh(this.legsGeo, this.mat);
      legs.visible = false;
      root.add(arm, legs);
    } else {
      root.add(new THREE.Mesh(this.crateGeo, this.mat));
    }
    const strobe = new THREE.Sprite(this.strobeMat);
    strobe.position.set(t.kind === 'person' ? -0.15 : 0, t.kind === 'person' ? 0.32 : 0.4, 0);
    strobe.visible = false;
    root.add(strobe);
    this.root.add(root);
    const m: Marker = { root, arm, legs, strobe, kind: t.kind, phase: t.id.length * 0.37, x: t.x, z: t.z };
    this.markers.set(t.id, m);
    return m;
  }

  /**
   * @param vesselId / vesselRoot  the rescuing boat (survivors climb aboard and sit in it)
   */
  update(world: WorldState, waves: readonly PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number, dt: number, vesselId: string, vesselRoot?: THREE.Object3D): void {
    const cfg = CONFIG.rescue;
    const targets = world.rescue?.active?.targets ?? [];
    const v = world.vessels[vesselId];
    const seen = new Set<string>();
    let whistle: THREE.Vector3 | null = null;
    for (const t of targets) {
      seen.add(t.id);
      const m = this.markers.get(t.id) ?? this.create(t);
      // Lifted crates are cargo now.
      m.root.visible = !(t.kind === 'crate' && t.phase === 'aboard');
      if (!m.root.visible) continue;
      if (m.legs) m.legs.visible = t.phase === 'landing' || t.phase === 'ashore';
      if ((t.phase === 'climbing' || t.phase === 'aboard') && v && vesselRoot) {
        this.poseAboard(m, t, v.defId, vesselRoot, cfg.climbTime);
        continue;
      }
      if ((t.phase === 'landing' || t.phase === 'ashore') && t.shore) {
        this.poseLanding(m, t, t.shore, vesselRoot, time);
        continue;
      }
      // Smooth the drift and tow (big jumps snap).
      const k = Math.hypot(t.x - m.x, t.z - m.z) > 5 ? 1 : Math.min(1, dt * 12);
      m.x += (t.x - m.x) * k;
      m.z += (t.z - m.z) * k;
      const s = sampleSurface(waves, m.x, m.z);
      m.root.position.set(m.x, s.height, m.z);
      const dist = this.tmp.copy(m.root.position).distanceTo(viewer);
      m.root.visible = dist < 3000;
      // Lean with the wave slope (half of it), and face the viewer (the survivor) or keep a
      // drifting heading (crates).
      this.n.fromArray(s.normal).lerp(this.up, 0.5).normalize();
      this.q.setFromUnitVectors(this.up, this.n);
      const yaw = m.kind === 'person' ? Math.atan2(viewer.x - t.x, viewer.z - t.z) : m.phase + time * 0.05;
      m.root.quaternion.copy(this.q).multiply(this.qYaw.setFromAxisAngle(this.up, yaw));
      if (m.arm) {
        // On the line they hang on to the ring with both hands: no waving, no whistle.
        const waving = dist < cfg.waveRange && t.phase !== 'onLine';
        m.arm.rotation.z = waving ? -0.25 - 0.45 * (0.5 + 0.5 * Math.sin(time * 6 + m.phase)) : -1.35;
        if (waving && dist < cfg.whistleRange) whistle = m.root.position;
      }
      // Night strobe: a short bright flash once a period, sized to stay visible far off.
      const flash = darkness > cfg.strobeDarkness && (time + m.phase) % cfg.strobePeriod < cfg.strobeOn;
      m.strobe.visible = flash;
      if (flash) m.strobe.scale.setScalar(Math.max(0.35, dist / 45));
    }
    for (const [id, m] of this.markers) {
      if (seen.has(id)) continue;
      m.root.removeFromParent();
      this.markers.delete(id);
    }
    this.whistleT -= dt;
    if (whistle && this.whistleT <= 0) {
      this.whistleT = cfg.whistleEvery * (0.8 + Math.random() * 0.4);
      this.onWhistle(whistle);
    }
  }

  /**
   * Going ashore: stand up from the seat, then step across to the quay (a little hop over
   * the rail), and stand there facing the boat, waving.
   */
  private poseLanding(m: Marker, t: RescueTarget, shore: [number, number], root: THREE.Object3D | undefined, time: number): void {
    const STAND = 1.15; // bust origin above the feet
    const ground = standingHeight(shore[0], shore[1]);
    const end = this.endV.set(shore[0], ground + STAND, shore[1]);
    m.strobe.visible = false;
    if (t.phase === 'landing' && root) {
      const s = Math.min(1, (t.t ?? 0) / CONFIG.rescue.landTime);
      const seat = t.seat ?? [0, 1, 3];
      const start = root.localToWorld(this.n.set(seat[0], seat[1] + STAND, seat[2]));
      const up = Math.min(1, s / 0.3); // getting up
      const go = Math.max(0, (s - 0.3) / 0.7); // stepping across
      const p = this.tmp.lerpVectors(start, end, go);
      p.y += 0.45 * Math.sin(Math.PI * go) - (1 - up) * 0.8;
      m.root.position.copy(p);
      m.root.quaternion.setFromAxisAngle(this.up, Math.atan2(shore[0] - start.x, shore[1] - start.z));
      if (m.arm) m.arm.rotation.z = -1.0;
      return;
    }
    m.root.position.copy(end);
    // Face the boat and wave.
    const look = root ? root.getWorldPosition(this.n) : this.n.set(shore[0], 0, shore[1] - 1);
    m.root.quaternion.setFromAxisAngle(this.up, Math.atan2(look.x - shore[0], look.z - shore[1]));
    if (m.arm) m.arm.rotation.z = -0.25 - 0.45 * (0.5 + 0.5 * Math.sin(time * 6 + m.phase));
  }

  /** Climbing over the stern (an arc from the waterline to the seat), or sitting there. */
  private poseAboard(m: Marker, t: RescueTarget, defId: string, root: THREE.Object3D, climbTime: number): void {
    const seat = t.seat ?? [0, 1, 3];
    const stern = VESSEL_DEFS[defId].rescueGear.stern;
    // Sitting: the bust's lifejacket hem on the deck.
    const sit = this.tmp.set(seat[0], seat[1] + 0.35, seat[2]);
    if (t.phase === 'climbing') {
      const s = Math.min(1, (t.t ?? 0) / climbTime);
      // Up the transom first (most of the height), then forward to the seat.
      const up = Math.min(1, s / 0.55);
      const fwd = Math.max(0, (s - 0.45) / 0.55);
      sit.set(stern[0] + (seat[0] - stern[0]) * fwd, stern[1] + (sit.y - stern[1]) * up + 0.25 * Math.sin(Math.PI * fwd), stern[2] + (seat[2] - stern[2]) * fwd);
    }
    root.localToWorld(m.root.position.copy(sit));
    // Sitting facing aft, toward the open deck (the model faces +z); climbing in, facing forward.
    root.getWorldQuaternion(m.root.quaternion);
    if (t.phase === 'climbing') m.root.rotateY(Math.PI);
    if (m.arm) m.arm.rotation.z = t.phase === 'climbing' ? -0.4 : -1.35;
    m.strobe.visible = false;
  }
}
