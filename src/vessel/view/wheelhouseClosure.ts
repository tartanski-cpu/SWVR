import * as THREE from 'three';
import type { WorkboatDef } from '../vesselDef';

/**
 * Closing the wheelhouse up: glass in the window openings (shown only with the windows
 * shut - one merged, faintly tinted transparent mesh) and a sliding door in the aft
 * doorway. The door is a convenience, not an obstacle: it slides open whenever someone is
 * near the doorway and closes behind them. With the windows shut and the door closed,
 * the wind and rain are much quieter inside (the App asks `sealed`).
 */
export class WheelhouseClosure {
  readonly root = new THREE.Group();
  private readonly glass: THREE.Mesh;
  private readonly door: THREE.Mesh;
  private doorOpen = 0;
  private readonly doorX: number;

  constructor(private readonly def: WorkboatDef) {
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
    // Sliding door: a panel with a window, sliding to port behind the aft wall.
    this.doorX = 0;
    this.door = new THREE.Mesh(new THREE.BoxGeometry(wh.doorWidth, wh.doorHeight, 0.04).translate(0, wh.doorHeight / 2, 0), new THREE.MeshLambertMaterial({ color: 0xd8dcdc }));
    this.door.position.set(this.doorX, wh.floorY, wh.aft + 0.03);
    this.door.name = 'wheelhouseDoor';
    this.root.add(this.glass, this.door);
  }

  /**
   * @param shut      windows switched shut
   * @param someoneAt is anyone near the doorway (vessel axes positions of the players aboard)
   */
  update(shut: boolean, people: { x: number; z: number }[], range: number, dt: number): void {
    this.glass.visible = shut;
    const wh = this.def.layout.wheelhouse;
    const near = people.some((p) => Math.abs(p.x) < range && Math.abs(p.z - wh.aft) < range);
    const target = near ? 1 : 0;
    this.doorOpen += Math.sign(target - this.doorOpen) * Math.min(Math.abs(target - this.doorOpen), dt * 2.5);
    this.door.position.x = this.doorX - this.doorOpen * (wh.doorWidth + 0.05);
  }

  /** Windows shut and the door closed: the wheelhouse is sealed against wind and rain. */
  sealed(shut: boolean): boolean {
    return shut && this.doorOpen < 0.05;
  }
}
