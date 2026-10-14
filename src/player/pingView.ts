import * as THREE from 'three';
import { mixer } from '../audio/mixer';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';
import { playerColor } from '../net/avatarView';

interface Marker {
  root: THREE.Group;
  beam: THREE.Mesh;
  ring: THREE.Mesh;
  diamond: THREE.Mesh;
  mats: THREE.MeshBasicMaterial[];
  t: number;
}

/**
 * Pings as markers: a tall thin light beam (visible from far off), a ring pulsing out on
 * the spot, and a diamond above it that keeps a readable size at any distance. In the
 * pinging player's colour, fading out over the last couple of seconds. Each sits in its
 * frame (vessel root or scene), so a ping on deck rides the boat.
 */
export class PingView {
  private readonly markers = new Map<EntityId, Marker>();
  private readonly tmp = new THREE.Vector3();
  /** Called once for each new ping (for the sound): world position. */
  onNew: (pos: THREE.Vector3, mine: boolean) => void = () => {};

  constructor(private readonly scene: THREE.Object3D) {}

  update(world: WorldState, vesselRoots: Map<string, THREE.Object3D>, viewer: THREE.Vector3, localId: EntityId): void {
    const cfg = CONFIG.ping;
    const pings = world.pings ?? {};
    for (const [id, p] of Object.entries(pings)) {
      const age = world.time - p.t;
      if (age > cfg.life || age < -1) continue;
      let m = this.markers.get(id);
      if (!m) this.markers.set(id, (m = this.create(playerColor(id))));
      const frame = (p.vessel && vesselRoots.get(p.vessel)) || this.scene;
      if (m.root.parent !== frame) frame.add(m.root);
      m.root.position.fromArray(p.pos);
      if (m.t !== p.t) {
        m.t = p.t;
        this.onNew(m.root.getWorldPosition(this.tmp), id === localId);
      }
      m.root.visible = true;
      // Keep it upright in the world even on a rolling deck.
      m.root.quaternion.copy(frame.getWorldQuaternion(new THREE.Quaternion()).invert());
      const fade = Math.min(1, (cfg.life - age) / 2);
      const pulse = (age % 1.2) / 1.2;
      m.ring.scale.setScalar(0.6 + pulse * 2.4);
      (m.ring.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.9 * fade;
      (m.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade;
      (m.diamond.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
      const dist = m.root.getWorldPosition(this.tmp).distanceTo(viewer);
      const s = Math.max(1, dist / 18);
      m.diamond.scale.setScalar(s);
      m.diamond.position.y = 1.6 + 0.6 * s + Math.sin(age * 3) * 0.1 * s;
      m.diamond.rotation.y = age * 2;
      m.beam.scale.set(s * 0.6, 1, s * 0.6);
    }
    for (const [id, m] of this.markers) {
      const p = pings[id];
      if (!p || world.time - p.t > cfg.life) m.root.visible = false;
    }
  }

  private create(color: number): Marker {
    const mat = () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide });
    const mats = [mat(), mat(), mat()];
    const h = CONFIG.ping.beamHeight;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 8, 1, true).translate(0, h / 2, 0), mats[0]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2).translate(0, 0.05, 0), mats[1]);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), mats[2]);
    diamond.scale.y = 1.4;
    for (const o of [beam, ring, diamond]) {
      o.frustumCulled = false;
      o.renderOrder = 5;
    }
    const root = new THREE.Group();
    root.name = 'ping';
    root.add(beam, ring, diamond);
    return { root, beam, ring, diamond, mats, t: -1 };
  }
}

/** A short two-note "ping" on the shared AudioContext, quieter with distance. */
export class PingAudio {
  private ctx: AudioContext | null = null;

  attach(ctx: AudioContext | null): void {
    if (ctx) this.ctx = ctx;
  }

  play(distance: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const level = 0.25 / (1 + distance / 40);
    const t = ctx.currentTime;
    for (const [f, dt] of [
      [1320, 0],
      [1760, 0.09],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(level, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35);
      o.connect(g).connect(mixer.bus(ctx, 'effects'));
      o.start(t + dt);
      o.stop(t + dt + 0.4);
    }
  }
}
