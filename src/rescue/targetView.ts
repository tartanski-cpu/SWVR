import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { sampleSurface, type PreparedWave } from '../ocean/waves';
import { fitPaint, flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { rescuePlaces } from './recovery';
import { standingHeight } from '../world/geography';
import type { Incident, RescueTarget } from './rescue';
import { armGeometry, decodeLook, headGeometry, lookFromId } from '../net/avatarOutfits';

const ORANGE = 0xff6a10;
const SKIN = 0xd8a07a;

interface Marker {
  root: THREE.Group;
  arm: THREE.Object3D | null;
  /** Legs, shown once a survivor stands up (landing, ashore). */
  legs: THREE.Object3D | null;
  /** A survivor's lifejacket strobe (crates have none: owner request, they were too easy to find). */
  strobe: THREE.Sprite | null;
  kind: RescueTarget['kind'];
  phase: number;
  /** Smoothed horizontal position (snapshots and tows arrive in steps). */
  x: number;
  z: number;
}

/**
 * What's in the water during a rescue, made easy to spot:
 *   - a survivor: a figure built as the crew's avatars are (net/avatarOutfits.ts: their
 *     head with its face and skin, a beard maybe, each their own from their id; owner, Oct
 *     2026) in a bright orange lifejacket up to the chin with its collar, reflective band
 *     and strobe, head above water, facing the boat; waves an arm when you're within
 *     CONFIG.rescue.waveRange and blows the lifejacket whistle (spatial sound, via
 *     onWhistle) every few seconds;
 *   - crates: bright orange, banded, floating low and tilting with the waves;
 *   - what they're in or by (Incident.prop): an upturned dinghy, a liferaft with its
 *     canopy (its people sitting in it), a motor boat settling and listing as she sinks.
 * Both ride the wave surface (sampled at their position; no physics body). A survivor's
 * lifejacket carries a flashing strobe at night: a glowing sprite, not a real light, kept a
 * readable size at any distance. Crates have none (owner request: too easy to find).
 *
 * Recovery (see recovery.ts): a survivor on the line hangs on to the ring (no more
 * waving); climbing, they come up over the stern to their seat on deck, and aboard they
 * sit there, riding in the boat's frame. A crate on the hook follows it; once lifted it's
 * ordinary cargo, drawn by the cargo view, so it's hidden here.
 */
export class TargetsView {
  readonly root = new THREE.Group();
  private readonly markers = new Map<string, Marker>();
  /** The lifejacket and the waving arm are shared; each survivor's head is their own (by id). */
  private readonly personGeo: THREE.BufferGeometry;
  private readonly armGeo: THREE.BufferGeometry;
  private readonly props = new Map<string, { root: THREE.Group; kind: 'dinghy' | 'liferaft' | 'sinking'; hull: THREE.Object3D }>();
  private readonly dinghyGeo: THREE.BufferGeometry;
  private readonly raftGeo: THREE.BufferGeometry;
  private readonly sinkingGeo: THREE.BufferGeometry;
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
    // Survivor, origin at the waterline, facing +z: the lifejacket (a foam vest with its
    // collar round the neck, a reflective band, the whistle on its cord, a light), a dark
    // jumper under it, and the other arm resting on the water. The head is each one's own.
    this.personGeo = mergeParts([
      part(new THREE.BoxGeometry(0.42, 0.5, 0.26).translate(0, -0.1, 0), 0x2a3340), // the jumper (torso)
      part(new THREE.BoxGeometry(0.46, 0.44, 0.32).translate(0, -0.06, 0), ORANGE), // the vest
      part(new THREE.BoxGeometry(0.16, 0.14, 0.06).translate(0, 0.22, -0.11), 0xff8a30), // the collar, in front of the neck
      part(new THREE.BoxGeometry(0.46, 0.16, 0.14).translate(0, 0.2, 0.1), 0xff8a30), // the collar, round the back of the neck
      part(new THREE.BoxGeometry(0.47, 0.04, 0.33).translate(0, 0.0, 0), 0xe8e8e0), // reflective band
      part(new THREE.BoxGeometry(0.03, 0.05, 0.02).translate(0.12, 0.1, -0.165), 0xf2f2ee), // the whistle
      part(new THREE.BoxGeometry(0.03, 0.03, 0.02).translate(-0.15, 0.3, -0.16), 0xd8d8d0), // the light
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 7).rotateX(Math.PI / 2).translate(-0.3, 0.02, 0.12), 0x2a3340), // the other arm, sleeve
      part(new THREE.SphereGeometry(0.05, 8, 6).translate(-0.3, 0.02, 0.33), SKIN), // its hand
    ]);
    // Waving arm: pivot at the shoulder, pointing up (the jumper's sleeve, a hand).
    this.armGeo = mergeParts([part(armGeometry(decodeLook(0), 0.42, false).rotateX(Math.PI).translate(0, 0, 0), 0x2a3340), part(new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.46, 0), SKIN)]);
    // The upturned dinghy: a hull keel-up, awash, her centreboard sticking up.
    this.dinghyGeo = mergeParts([
      part(new THREE.BoxGeometry(1.5, 0.45, 3.6).translate(0, 0.02, 0), 0xe8e4dc),
      part(new THREE.BoxGeometry(1.2, 0.1, 3.0).translate(0, 0.28, 0), 0x3a5a9a), // the bottom, antifouled
      part(new THREE.BoxGeometry(0.04, 0.5, 0.7).translate(0, 0.55, -0.2), 0xd8d4cc), // the centreboard
    ]);
    // The liferaft: an orange ring of buoyancy tubes with a canopy over it.
    this.raftGeo = mergeParts([
      part(new THREE.CylinderGeometry(1.3, 1.3, 0.4, 8).translate(0, 0.15, 0), ORANGE),
      part(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 8).translate(0, 0.33, 0), 0x3a3a3a), // the floor
      // The canopy is a tent over the middle, so her people (sat round the tube) stay in view.
      part(new THREE.ConeGeometry(0.85, 0.9, 8, 1, true).translate(0, 0.8, 0), 0xf08a28),
      part(new THREE.BoxGeometry(0.9, 0.06, 0.05).translate(0, 0.38, -1.3), 0x222222), // the grab line's strap
    ]);
    // The sinking motor boat: a small cabin boat, drawn settling and listing as she goes.
    this.sinkingGeo = mergeParts([
      part(new THREE.BoxGeometry(2.2, 0.9, 6.0).translate(0, 0.1, 0), 0xf0ece4),
      part(new THREE.BoxGeometry(2.2, 0.08, 6.0).translate(0, 0.58, 0), 0x6a4a2a), // the gunwale
      part(new THREE.BoxGeometry(1.8, 0.8, 2.0).translate(0, 0.95, -0.8), 0xf0ece4), // the cuddy
      part(new THREE.BoxGeometry(1.82, 0.3, 0.6).translate(0, 1.0, 0.25), 0x1a2a30), // its windscreen
      part(new THREE.BoxGeometry(0.5, 0.6, 0.3).translate(0, 0.8, 2.8), 0x222222), // the outboard
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
      fitPaint(part(new THREE.BoxGeometry(0.7, 0.5, 0.6).translate(0, 0.08, 0), ORANGE, 'crate')), // each face a crate side (pixel paint)
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
      // Their own head (as the avatars': face, skin, maybe a beard), facing +z with the body.
      const look = decodeLook(lookFromId(t.id));
      const head = new THREE.Mesh(headGeometry(look, 0xff8a30).rotateY(Math.PI), this.mat);
      head.position.set(0, 0.38, 0.0);
      root.add(head);
      arm = new THREE.Mesh(this.armGeo, this.mat);
      arm.position.set(0.27, 0.12, 0);
      legs = new THREE.Mesh(this.legsGeo, this.mat);
      legs.visible = false;
      root.add(arm, legs);
    } else {
      root.add(new THREE.Mesh(this.crateGeo, this.mat));
    }
    // Survivors' lifejackets carry a strobe; crates don't (you find them by looking).
    let strobe: THREE.Sprite | null = null;
    if (t.kind === 'person') {
      strobe = new THREE.Sprite(this.strobeMat);
      strobe.position.set(-0.15, 0.32, 0);
      strobe.visible = false;
      root.add(strobe);
    }
    this.root.add(root);
    const m: Marker = { root, arm, legs, strobe, kind: t.kind, phase: t.id.length * 0.37, x: t.x, z: t.z };
    this.markers.set(t.id, m);
    return m;
  }

  /**
   * @param vesselId / vesselRoot  the rescuing boat (survivors climb aboard and sit in it)
   */
  /** Visibility where the viewer is (m): waving is seen within it, the strobe a bit beyond. */
  visibility = Infinity;

  update(world: WorldState, waves: readonly PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number, dt: number, vesselId: string, vesselRoot?: THREE.Object3D): void {
    const cfg = CONFIG.rescue;
    const inc = world.rescue?.active;
    const targets = inc?.targets ?? [];
    const v = world.vessels[vesselId];
    const seen = new Set<string>();
    let whistle: THREE.Vector3 | null = null;
    this.updateProp(inc, waves, time);
    let seatOnProp = 0;
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
      if (t.phase === 'raft' && inc?.prop) {
        this.poseOnProp(m, inc.prop, seatOnProp++, waves, viewer, time);
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
        // They wave once they can see you (within the visibility); the whistle carries in fog.
        const inWater = t.phase !== 'onLine';
        const waving = inWater && dist < Math.min(cfg.waveRange, this.visibility);
        m.arm.rotation.z = waving ? -0.25 - 0.45 * (0.5 + 0.5 * Math.sin(time * 6 + m.phase)) : -1.35;
        if (inWater && dist < cfg.whistleRange) whistle = m.root.position;
      }
      // Night strobe: a short bright flash once a period, sized to stay visible far off.
      // Fog swallows it beyond a little more than the visibility.
      const inSight = dist < this.visibility * CONFIG.spotting.strobeVisFactor;
      const flash = inSight && darkness > cfg.strobeDarkness && (time + m.phase) % cfg.strobePeriod < cfg.strobeOn;
      if (m.strobe) {
        m.strobe.visible = flash;
        if (flash) m.strobe.scale.setScalar(Math.max(0.35, dist / 45));
      }
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

  /** The dinghy, raft or sinking boat: riding the waves where it drifts; the boat settling and listing as her time runs out. */
  private updateProp(inc: Incident | null | undefined, waves: readonly PreparedWave[], time: number): void {
    const want = inc?.prop && !inc.prop.sunk ? inc.prop : null;
    for (const [id, p] of this.props) {
      if (want && id === inc!.defId + ':' + inc!.callT) continue;
      p.root.removeFromParent();
      this.props.delete(id);
    }
    if (!want || !inc) return;
    const id = inc.defId + ':' + inc.callT;
    let p = this.props.get(id);
    if (!p) {
      const root = new THREE.Group();
      root.name = `rescueProp:${want.kind}`;
      const hull = new THREE.Mesh(want.kind === 'dinghy' ? this.dinghyGeo : want.kind === 'liferaft' ? this.raftGeo : this.sinkingGeo, this.mat);
      root.add(hull);
      this.root.add(root);
      p = { root, kind: want.kind, hull };
      this.props.set(id, p);
    }
    const s = sampleSurface(waves, want.x, want.z);
    p.root.position.set(want.x, s.height, want.z);
    this.n.fromArray(s.normal).lerp(this.up, 0.5).normalize();
    this.q.setFromUnitVectors(this.up, this.n);
    p.root.quaternion.copy(this.q).multiply(this.qYaw.setFromAxisAngle(this.up, inc.x * 0.01));
    if (want.kind === 'sinking') {
      // Settling by the stern and listing, further the longer she's been going.
      const f = Math.min(1, Math.max(0, (time - inc.callT) / CONFIG.rescue.sinkTime));
      p.hull.position.y = -0.9 * f;
      p.hull.rotation.z = 0.4 * f;
      p.hull.rotation.x = -0.25 * f;
    }
  }

  /** Sitting on the raft's buoyancy tube or in the sinking boat's cockpit, facing the viewer. */
  private poseOnProp(m: Marker, prop: NonNullable<Incident['prop']>, i: number, waves: readonly PreparedWave[], viewer: THREE.Vector3, time: number): void {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const r = prop.kind === 'liferaft' ? 1.1 : 0.45;
    const dx = Math.cos(a) * r;
    const dz = prop.kind === 'sinking' ? 0.6 + 0.9 * (i % 2) : Math.sin(a) * r;
    const x = prop.x + dx;
    const z = prop.z + dz;
    const s = sampleSurface(waves, x, z);
    const lift = prop.kind === 'liferaft' ? 0.6 : 0.75; // bust origin above the tube / the cockpit sole
    m.x = x;
    m.z = z;
    m.root.position.set(x, s.height + lift, z);
    m.root.quaternion.setFromAxisAngle(this.up, Math.atan2(viewer.x - x, viewer.z - z));
    m.root.visible = true;
    if (m.arm) m.arm.rotation.z = -0.25 - 0.45 * (0.5 + 0.5 * Math.sin(time * 6 + m.phase));
    if (m.legs) m.legs.visible = false;
  }

  /**
   * Going ashore: stand up from the seat, then step across to the quay (a little hop over
   * the rail), and stand there facing the boat, waving.
   */
  private poseLanding(m: Marker, t: RescueTarget, shore: [number, number], root: THREE.Object3D | undefined, time: number): void {
    const STAND = 1.15; // bust origin above the feet
    const ground = standingHeight(shore[0], shore[1]);
    const end = this.endV.set(shore[0], ground + STAND, shore[1]);
    if (m.strobe) m.strobe.visible = false;
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
    const stern = rescuePlaces(defId).stern;
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
    if (m.strobe) m.strobe.visible = false;
  }
}
