import * as THREE from 'three';
import { groundHeight } from '../../world/terrain';
import { gearOf } from '../../boats/sims';
import type { VesselState } from '../vesselState';

const N = 24;

/**
 * The anchor chain from the bow roller: a sagging curve down to where it meets the bottom,
 * then lying along the seabed to the anchor (a hanging chain goes straight down). World
 * space, one line draw call; under water it's hidden by the opaque sea, which is fine.
 */
export class AnchorChainView {
  readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private readonly hawse = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
    this.line.name = 'anchorChain';
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  update(s: VesselState, root: THREE.Object3D): void {
    const a = s.anchor;
    // Her anchor's hawse (the anchor and windlass are her module, deck.anchor-windlass).
    const gear = gearOf(s, 'anchor');
    this.line.visible = !!gear && a.phase !== 'stowed' && a.rodeM > 0.2;
    if (!gear || !this.line.visible) return;
    root.localToWorld(this.hawse.fromArray(gear.hawse));
    const hx = this.hawse.x;
    const hy = this.hawse.y;
    const hz = this.hawse.z;
    const p = this.positions;
    const bottom = groundHeight(a.x, a.z);
    const depth = hy - bottom;
    const dx = a.x - hx;
    const dz = a.z - hz;
    const x = Math.hypot(dx, dz);
    if (a.phase === 'hanging' || a.phase === 'paying' || a.rodeM <= depth || x < 0.01) {
      // Straight down the chain's length (or to the bottom).
      const len = Math.min(a.rodeM, depth);
      for (let i = 0; i < N; i++) p.set([hx, hy - (len * i) / (N - 1), hz], i * 3);
    } else {
      // Suspended part reaches the bottom `span` metres out (less when slack), then lies flat.
      const xTaut = Math.sqrt(Math.max(0, a.rodeM * a.rodeM - depth * depth));
      const span = Math.min(x, Math.max(depth * 0.6, x - Math.max(0, xTaut - x)));
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const along = t * x;
        let y: number;
        if (along < span) {
          // Catenary-like: steep at the bow, flattening into the bottom.
          const u = along / span;
          y = bottom + depth * (1 - u) ** 2;
        } else {
          y = bottom + 0.05;
        }
        p.set([hx + (dx / x) * along, y, hz + (dz / x) * along], i * 3);
      }
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
}
