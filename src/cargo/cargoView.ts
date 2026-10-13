import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { standingHeight } from '../world/geography';
import { portById } from './cargo';

const MAX = 32;
/** Spacing of waiting items along a port's stack row (m). */
const STACK_SPACING = 1.8;

/**
 * Every cargo item as a box, one instanced draw call: waiting in a row on its port's quay
 * (or beach), or stowed in its deck slot riding the boat. Sized by kind, coloured by
 * destination (the port's colour), with a pale band so it reads as packaged goods.
 */
export class CargoView {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    // Unit box (1 m) on its base: a tinted body with pale bands top and middle.
    const geo = mergeParts([
      part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff),
      part(new THREE.BoxGeometry(1.02, 0.08, 1.02).translate(0, 0.55, 0), 0xf2ead8),
      part(new THREE.BoxGeometry(1.02, 0.06, 1.02).translate(0, 0.97, 0), 0xf2ead8),
    ]);
    this.mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), MAX);
    this.mesh.name = 'cargo';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** @param vesselRoots each vessel's interpolated root (deck cargo rides it) */
  update(world: WorldState, vesselRoots: Map<string, THREE.Object3D>): void {
    let i = 0;
    for (const c of Object.values(world.cargo)) {
      if (i >= MAX) break;
      const kind = CONFIG.cargo.kinds[c.kind];
      this.scale.set(kind.size[0], kind.size[1], kind.size[2]);
      if ('port' in c.at) {
        const port = portById(c.at.port);
        if (!port) continue;
        const s = port.cargo;
        const yaw = (s.stackYawDeg * Math.PI) / 180;
        const x = s.stackX + Math.sin(yaw) * c.at.slot * STACK_SPACING;
        const z = s.stackZ - Math.cos(yaw) * c.at.slot * STACK_SPACING;
        this.p.set(x, standingHeight(x, z), z);
        this.q.setFromAxisAngle(this.up, -yaw);
      } else {
        const root = vesselRoots.get(c.at.vessel);
        const v = world.vessels[c.at.vessel];
        if (!root || !v) continue;
        root.localToWorld(this.p.fromArray(VESSEL_DEFS[v.defId].cargo.slots[c.at.slot]));
        root.getWorldQuaternion(this.q);
      }
      // A little yaw jitter per item so a row doesn't look machine-placed.
      this.qYaw.setFromAxisAngle(this.up, ((c.id.length * 37 + c.mass) % 9) * 0.01 - 0.04);
      this.m.compose(this.p, this.q.multiply(this.qYaw), this.scale);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.color.set(portById(c.to)?.cargo.color ?? 0x888888));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
