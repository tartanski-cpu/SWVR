/**
 * Drawing a fish farm's net check (aqua/netCheck.ts): a small flag on each cage ring while a
 * check is going, where a boat comes alongside it (ringPoint): yellow still to check, green
 * checked, red at a torn net until it's mended. One instanced mesh for every flag (a pole and
 * its flag, coloured per instance): one draw call, drawn only while there's a check and only
 * within `drawRange` of the viewer.
 */
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { CONFIG } from '../config';
import { farmAt } from './farmService';
import { ringPoint } from './netCheck';

const MAX = 32;
const TO_CHECK = 0xf2c418;
const CHECKED = 0x2ac050;
const HOLE = 0xe02a1a;
/** Flags are drawn only this near (m). */
const DRAW_RANGE = 900;

export class AquaView {
  readonly root = new THREE.Group();
  private readonly flags: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor() {
    // A pole 2.6 m tall and a big flag at its head (white: the instance colour tints it), to be
    // seen across the farm; the pole's foot at the origin.
    const geo = mergeParts([
      part(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5).translate(0, 1.3, 0), 0x2a2e33),
      part(new THREE.BoxGeometry(0.03, 0.55, 0.85).translate(0, 2.3, 0.43), 0xffffff),
    ]);
    this.flags = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), MAX);
    this.flags.count = 0;
    this.flags.frustumCulled = false;
    this.root.add(this.flags);
    this.root.name = 'aqua';
  }

  update(world: WorldState, viewer: THREE.Vector3): void {
    let n = 0;
    for (const [id, site] of Object.entries(world.aqua?.sites ?? {})) {
      const call = site.call;
      const at = farmAt(id);
      if (call?.kind !== 'check' || !call.checked || !at) continue;
      if (Math.hypot(at.farm.x - viewer.x, at.farm.z - viewer.z) > DRAW_RANGE) continue;
      call.checked.forEach((done, ring) => {
        if (n >= MAX) return;
        const [x, z] = ringPoint(at.farm, ring);
        const hole = call.hole && call.hole.ring === ring && call.hole.found && !call.hole.mended;
        this.p.set(x, CONFIG.aqua.check.ringTop, z);
        this.m.compose(this.p, this.q, this.s);
        this.flags.setMatrixAt(n, this.m);
        this.flags.setColorAt(n, this.color.setHex(hole ? HOLE : done ? CHECKED : TO_CHECK));
        n++;
      });
    }
    this.flags.count = n;
    this.flags.visible = n > 0;
    if (n) {
      this.flags.instanceMatrix.needsUpdate = true;
      if (this.flags.instanceColor) this.flags.instanceColor.needsUpdate = true;
    }
  }
}
