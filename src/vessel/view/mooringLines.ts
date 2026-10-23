import * as THREE from 'three';
import { BOLLARD_HALF_SPACING, berthBollards } from '../../world/berths';
import { CONFIG } from '../../config';
import { hullPlan } from '../layout';
import { berthAxis, berthById, shoreSide } from '../physics/mooring';
import { gearOf } from '../../boats/sims';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Bow and stern lines from the cleat each is made fast on to the berth's bollards on the
 * quay/pier edge (bow line to the forward bollard, stern line to the aft one), each drawn
 * while its end is fast. Thin ropes (not 1-px lines, which all but vanish in
 * a headset): one instanced cylinder draw call, posed each frame in world space.
 */
export class MooringLines {
  readonly mesh: THREE.InstancedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    // Unit-length rope along +Y, centred on the origin.
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xe0d2a0 }), 2);
    this.mesh.name = 'mooringLines';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(s: VesselState, def: VesselDef, root: THREE.Object3D): void {
    const m = s.mooring;
    const berth = m.phase !== 'free' ? berthById(m.berthId) : undefined;
    this.mesh.visible = !!berth;
    if (!berth) return;
    const ax = berthAxis(berth, m.reversed);
    const plan = hullPlan(def);
    const top = def.layout.bulwarkHeight + 0.06;
    let n = 0;
    // No ends recorded (the sim fills them in on its next tick): both on the quay side.
    const legacy = !m.bow && !m.stern ? shoreSide(s, berth) : 0;
    // From her cleats (modules/cleat).
    for (const [side, cleat, along] of [
      [m.bow || legacy, gearOf(s, 'bowCleat'), berth.bollardHalf ?? BOLLARD_HALF_SPACING], // the bow line leads forward to the forward bollard
      [m.stern || legacy, gearOf(s, 'sternCleat'), -(berth.bollardHalf ?? BOLLARD_HALF_SPACING)], // the stern line aft
    ] as const) {
      if (!side || !cleat) continue;
      // From the cleat on the bulwark top (a small boat's: where it is)...
      const z = cleat.z;
      if (cleat.x !== undefined) root.localToWorld(this.a.set(cleat.x, cleat.lineY, z));
      else root.localToWorld(this.a.set(side * (plan.halfBeam(z) - 0.03), plan.deckY(z) + top, z));
      // ...to the bollard's head on the quay: the one a little beyond her end (the bow line
      // leads forward, the stern line aft), so a long boat's lines don't run back inside her
      // length (CONFIG.docking.lineLead); none on her face (a pontoon's cleats): her berth's.
      const ahead = along > 0 ? 1 : -1;
      const at = (this.a.x - berth.x) * ax.x + (this.a.z - berth.z) * ax.z;
      const goal = at + ahead * CONFIG.docking.lineLead;
      let best: { x: number; z: number } | null = null;
      let bestErr = Infinity;
      for (const p of berthBollards(berth)) {
        const s = (p.x - berth.x) * ax.x + (p.z - berth.z) * ax.z;
        if ((s - at) * ahead < 0.5) continue; // not beyond her cleat
        const err = Math.abs(s - goal);
        if (err < bestErr && err < CONFIG.docking.lineLeadMax) {
          best = p;
          bestErr = err;
        }
      }
      if (best) this.b.set(best.x, berth.deckY + 0.45, best.z);
      else
        this.b.set(
          berth.x + ax.x * along + berth.shoreX * (berth.shoreDist + 0.5),
          berth.deckY + 0.45,
          berth.z + ax.z * along + berth.shoreZ * (berth.shoreDist + 0.5),
        );
      this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.dir.subVectors(this.b, this.a);
      const len = this.dir.length();
      this.q.setFromUnitVectors(this.up, this.dir.divideScalar(len || 1));
      this.m.compose(this.mid, this.q, this.s.set(1, len, 1));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
