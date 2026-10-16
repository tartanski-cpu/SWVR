import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { potGeometry } from '../cargo/cargoView';
import { buoyColor, potReady, type ShotPot } from './potting';

const MAX = 32;
const BUBBLES = 24;
const HAULING = 4;
const DRIPS = 14;

/**
 * Shot pots as seen from the boat (potting/potting.ts): only their marker buoys - the pot
 * itself is on the bottom, just a record. Each buoy floats on the drawn waves (sampled at
 * three points for its tilt; no physics body): a float in its boat's colour, a short pole
 * and a small flag. Three instanced meshes for all of them.
 *
 * Shooting: a splash ring spreading where the pot went in, and a trail of bubbles while it
 * sinks (`sinkTime`); then the buoy pops up.
 *
 * The ready cue (milestone 2): the flag is red while the pot soaks and green when it's
 * ready to haul, and at night a small light on the pole top blinks when it's ready - but
 * only within `cueRange` of you; further off the flag is a dull grey, so you still have to
 * go back to where you marked them.
 *
 * Hauling (milestone 3): once the buoy's aboard it sits on the gunwale where the line comes
 * in, and the line runs from there over the side and down. The last couple of metres the
 * pot itself shows: a shape under the water, then breaking the surface swinging on its
 * line and dripping, up the side to the gunwale.
 */
export class PotView {
  readonly root = new THREE.Group();
  private readonly float: THREE.InstancedMesh;
  private readonly pole: THREE.InstancedMesh;
  private readonly flag: THREE.InstancedMesh;
  private readonly splash: THREE.InstancedMesh;
  private readonly bubbles: THREE.Points;
  /** Night lights on ready buoys nearby (blinking). */
  private readonly lamps: THREE.Points;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();
  /** Lines being hauled: lead → water → pot (two segments each). */
  private readonly lines: THREE.LineSegments;
  private readonly hanging: THREE.InstancedMesh;
  private readonly drips: THREE.Points;
  private readonly lead = new THREE.Vector3();
  private readonly water = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly qv = new THREE.Quaternion();

  constructor() {
    this.root.name = 'potBuoys';
    const mat = flatVertexColorMaterial();
    // A round float, a little flattened, half out of the water (tinted by instance colour).
    this.float = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 7).scale(1, 0.85, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.pole = new THREE.InstancedMesh(mergeParts([part(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5).translate(0, 0.55, 0), 0x2a2e33)]), mat, MAX);
    // The flag at the pole's top, flying from it.
    this.flag = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.12).translate(0.09, 0.93, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAX);
    this.splash = new THREE.InstancedMesh(new THREE.RingGeometry(0.85, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4f8fa, transparent: true, opacity: 0.55, depthWrite: false }), 8);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLES * 8 * 3), 3));
    bg.setDrawRange(0, 0);
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xe8f4f8, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false }));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    lg.setDrawRange(0, 0);
    this.lamps = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xfff2a0, size: 7, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }));
    this.lamps.frustumCulled = false;
    this.root.add(this.lamps);
    for (const o of [this.float, this.pole, this.flag, this.splash]) {
      o.frustumCulled = false;
      o.count = 0;
    }
    this.bubbles.frustumCulled = false;
    this.root.add(this.float, this.pole, this.flag, this.splash, this.bubbles);
    const ln = new THREE.BufferGeometry();
    ln.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAULING * 4 * 3), 3));
    ln.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(ln, new THREE.LineBasicMaterial({ color: 0xe0b440 }));
    this.lines.frustumCulled = false;
    const size = CONFIG.cargo.kinds.find((k) => k.name === 'Pot')?.size ?? [0.75, 0.42, 0.5];
    this.hanging = new THREE.InstancedMesh(potGeometry(size, false, false), flatVertexColorMaterial(), HAULING);
    this.hanging.frustumCulled = false;
    this.hanging.count = 0;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAULING * DRIPS * 3), 3));
    dg.setDrawRange(0, 0);
    this.drips = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xdcecf2, size: 0.03, transparent: true, opacity: 0.85, depthWrite: false }));
    this.drips.frustumCulled = false;
    this.root.add(this.lines, this.hanging, this.drips);
  }

  /**
   * @param time     world time (s): how long each pot has been in
   * @param viewer   where you are (the cue shows only close by)
   * @param darkness 0 day .. 1 night (the ready light)
   * @param vesselRoots each vessel's drawn root (lines being hauled lead in over their gunwales)
   */
  update(world: WorldState, waves: readonly PreparedWave[], time: number, viewer: THREE.Vector3, darkness: number, vesselRoots: Map<string, THREE.Object3D>): void {
    let nl = 0;
    const lampPos = this.lamps.geometry.getAttribute('position') as THREE.BufferAttribute;
    const blink = (time % 2) < 0.35;
    const shot = world.potting?.shot ?? [];
    const sink = CONFIG.potting.sinkTime;
    let nb = 0;
    let ns = 0;
    let nbub = 0;
    const bubPos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    let nh = 0;
    for (const pot of shot) {
      if (pot.haul?.phase === 'line') {
        // Aboard: the buoy on the gunwale (no pole or flag drawn), the line and the pot.
        const root = vesselRoots.get(pot.haul.vessel ?? '');
        if (!root || !pot.haul.lead || nb >= MAX) continue;
        root.localToWorld(this.lead.fromArray(pot.haul.lead));
        this.m.compose(this.p.copy(this.lead).add(this.s.set(0, 0.12, 0)), root.getWorldQuaternion(this.q), this.s.set(1, 1, 1));
        this.float.setMatrixAt(nb, this.m);
        this.float.setColorAt(nb, this.color.setHex(buoyColor(world, pot.owner)));
        this.m.makeScale(0, 0, 0);
        this.pole.setMatrixAt(nb, this.m);
        this.flag.setMatrixAt(nb, this.m);
        this.flag.setColorAt(nb, this.color.setHex(0x6a6a66));
        nb++;
        if (nh < HAULING) this.drawHaul(nh++, pot, root, waves, time);
        continue;
      }
      const t = time - pot.shotAt;
      const h = surfaceHeight(waves, pot.x, pot.z);
      if (t < sink + 1.2 && ns < 8) {
        // The splash ring, spreading for a second; bubbles while it sinks.
        const r = 0.3 + 1.1 * Math.min(1, t / 1.2);
        this.splash.setMatrixAt(ns++, this.m.compose(this.p.set(pot.x, h + 0.05, pot.z), this.q.identity(), this.s.set(r, 1, r)));
        if (t < sink) {
          for (let i = 0; i < BUBBLES && nbub < BUBBLES * 8; i++) {
            const a = i * 2.4 + t * 3;
            const d = 0.1 + 0.35 * ((i * 0.37) % 1);
            bubPos.setXYZ(nbub++, pot.x + Math.cos(a) * d, h + 0.02 + ((t * 0.6 + i * 0.13) % 0.12), pot.z + Math.sin(a) * d);
          }
        }
      }
      if (t < sink || nb >= MAX) continue;
      // Popped up: rises out of the water over a third of a second, then rides the waves.
      const pop = Math.min(1, (t - sink) / 0.35);
      const hx = surfaceHeight(waves, pot.x + 0.4, pot.z);
      const hz = surfaceHeight(waves, pot.x, pot.z + 0.4);
      this.e.set(Math.atan2(hz - h, 0.4) * 0.8, (pot.shotAt * 1.7) % (Math.PI * 2), -Math.atan2(hx - h, 0.4) * 0.8, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(pot.x, h - 0.04 - 0.35 * (1 - pop), pot.z);
      this.m.compose(this.p, this.q, this.s.set(1, 1, 1));
      this.float.setMatrixAt(nb, this.m);
      this.pole.setMatrixAt(nb, this.m);
      this.flag.setMatrixAt(nb, this.m);
      this.float.setColorAt(nb, this.color.setHex(buoyColor(world, pot.owner)));
      // The cue, only from fairly close.
      const near = Math.hypot(pot.x - viewer.x, pot.z - viewer.z) < CONFIG.potting.cueRange;
      const ready = potReady(world, pot);
      this.flag.setColorAt(nb, this.color.setHex(!near ? 0x6a6a66 : ready ? CONFIG.potting.flagReady : CONFIG.potting.flagSoaking));
      if (near && ready && darkness > 0.4 && blink) lampPos.setXYZ(nl++, ...this.s.set(0, 1.03, 0).applyMatrix4(this.m).toArray());
      nb++;
    }
    for (const o of [this.float, this.pole, this.flag]) {
      o.count = nb;
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
    }
    this.splash.count = ns;
    this.splash.instanceMatrix.needsUpdate = true;
    this.bubbles.geometry.setDrawRange(0, nbub);
    this.lamps.geometry.setDrawRange(0, nl);
    lampPos.needsUpdate = true;
    bubPos.needsUpdate = true;
    this.hanging.count = nh;
    this.hanging.instanceMatrix.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, nh * 4);
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.drips.geometry.setDrawRange(0, nh * DRIPS);
    (this.drips.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.root.visible = shot.length > 0;
  }

  /**
   * One line being hauled: from the gunwale out to the water (0.6 m outboard, as the hands
   * see it) and down to the pot. With `line` m still out and d0 from the gunwale to the
   * water, the pot is (line - d0) under the surface; once line < d0 it's out, hanging on the
   * line part way up the side - swinging a little with the boat, and dripping.
   */
  private drawHaul(k: number, pot: ShotPot, root: THREE.Object3D, waves: readonly PreparedWave[], time: number): void {
    const h = pot.haul!;
    const lead = h.lead!;
    root.localToWorld(this.water.set(lead[0] + Math.sign(lead[0]) * 0.6, 0, lead[2]));
    this.water.y = surfaceHeight(waves, this.water.x, this.water.z);
    const d0 = this.lead.distanceTo(this.water);
    const line = Math.max(0, h.line ?? 0);
    const out = line < d0;
    if (out) this.top.lerpVectors(this.lead, this.water, line / Math.max(0.01, d0));
    else this.top.copy(this.water).setY(this.water.y - (line - d0));
    // Swing: a small pendulum with the boat's motion (two slow sines; bigger once it's out).
    const sw = out ? 0.1 : 0.03;
    const ax = Math.sin(time * 2.1 + k) * sw;
    const az = Math.sin(time * 1.6 + k * 2) * sw;
    const potH = CONFIG.cargo.kinds.find((x) => x.name === 'Pot')?.size[1] ?? 0.42;
    root.getWorldQuaternion(this.qv);
    this.q.setFromEuler(this.e.set(az, 0, -ax)).premultiply(this.qv);
    // The pot hangs from its bridle, its base potH + a little below the line's end.
    this.p.set(0, -(potH + 0.08), 0).applyQuaternion(this.q).add(this.top);
    this.hanging.setMatrixAt(k, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
    // The line: gunwale → water point (or the pot, once it's out) → the pot.
    const lp = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const mid = out ? this.top : this.water;
    lp.setXYZ(k * 4, this.lead.x, this.lead.y, this.lead.z);
    lp.setXYZ(k * 4 + 1, mid.x, mid.y, mid.z);
    lp.setXYZ(k * 4 + 2, mid.x, mid.y, mid.z);
    lp.setXYZ(k * 4 + 3, this.top.x, this.top.y, this.top.z);
    // Drips off the pot's base while it's out of the water: each falls 0.5 m in a loop.
    const dp = this.drips.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < DRIPS; i++) {
      const ph = (time * 1.8 + i * 0.37) % 1;
      const fall = out && this.p.y > this.water.y - 0.1 ? 0.5 * ph * ph : 1e4;
      const a = i * 2.39996;
      dp.setXYZ(k * DRIPS + i, this.p.x + Math.cos(a) * 0.25 * ((i % 3) / 2), this.p.y - fall, this.p.z + Math.sin(a) * 0.18 * (((i + 1) % 3) / 2));
    }
  }
}
