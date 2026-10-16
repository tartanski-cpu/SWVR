import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { buoyColor, potReady } from './potting';

const MAX = 32;
const BUBBLES = 24;

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
  }

  /**
   * @param time     world time (s): how long each pot has been in
   * @param viewer   where you are (the cue shows only close by)
   * @param darkness 0 day .. 1 night (the ready light)
   */
  update(world: WorldState, waves: readonly PreparedWave[], time: number, viewer: THREE.Vector3, darkness: number): void {
    let nl = 0;
    const lampPos = this.lamps.geometry.getAttribute('position') as THREE.BufferAttribute;
    const blink = (time % 2) < 0.35;
    const shot = world.potting?.shot ?? [];
    const sink = CONFIG.potting.sinkTime;
    let nb = 0;
    let ns = 0;
    let nbub = 0;
    const bubPos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const pot of shot) {
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
    this.root.visible = shot.length > 0;
  }
}
