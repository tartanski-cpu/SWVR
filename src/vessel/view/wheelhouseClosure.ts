import * as THREE from 'three';
import type { WorkboatDef } from '../vesselDef';

/**
 * Closing the wheelhouse up: glass in the window openings, shown only with the windows
 * shut (one merged, faintly tinted transparent mesh). The aft door is a control of its
 * own (controls/WheelhouseDoor.ts). With the windows shut and the door shut, the wind and
 * rain are much quieter inside (the App asks `sealed`).
 */
export class WheelhouseClosure {
  readonly root = new THREE.Group();
  private readonly glass: THREE.Mesh;

  constructor(def: WorkboatDef) {
    const wh = def.layout.wheelhouse;
    const hw = wh.halfWidth;
    const w = wh.wall;
    const sill = wh.floorY + wh.windowSill;
    const head = wh.floorY + wh.windowHead;
    const h = head - sill;
    const y = (sill + head) / 2;
    const door = wh.doorWidth / 2;
    const planes: THREE.BufferGeometry[] = [];
    // Front panes, the two sides, and the aft wall either side of the door.
    planes.push(new THREE.PlaneGeometry(2 * (hw - w), h).translate(0, y, wh.front + w * 0.3));
    for (const s of [-1, 1]) {
      planes.push(new THREE.PlaneGeometry(wh.aft - wh.front - 0.2, h).rotateY(Math.PI / 2).translate(s * (hw - w / 2), y, (wh.front + wh.aft) / 2));
      const x0 = door + 0.1;
      const x1 = hw - 0.1;
      planes.push(new THREE.PlaneGeometry(x1 - x0, h).translate(s * (x0 + x1) / 2, y, wh.aft - w / 2));
    }
    const geo = new THREE.BufferGeometry();
    const merged = planes.map((p) => p.toNonIndexed());
    const count = merged.reduce((n, p) => n + p.attributes.position.count, 0);
    const pos = new Float32Array(count * 3);
    let o = 0;
    for (const p of merged) {
      pos.set(p.attributes.position.array as Float32Array, o);
      o += p.attributes.position.array.length;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbcd4e0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    this.glass.name = 'windowGlass';
    this.glass.visible = false;
    this.glass.renderOrder = 2;
    this.root.add(this.glass);
  }

  /** @param shut windows switched shut */
  update(shut: boolean): void {
    this.glass.visible = shut;
  }
}
