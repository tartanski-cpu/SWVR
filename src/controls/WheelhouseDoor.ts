import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * The wheelhouse's aft door: a sliding panel with a big window in it (so you can see
 * astern from the helm with it shut), sliding to port behind the aft wall. A press -
 * trigger on it in VR, a click on the desktop, from inside or out - opens or shuts it
 * (`door` 1 / 0, owner request: not automatic). It slides over ~0.4 s.
 * Its root sits at the bottom centre of the doorway, on the aft face of the wall.
 */
export class WheelhouseDoor extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Wheelhouse door: open / shut';
  private readonly panel = new THREE.Group();
  private open = 1;
  private target = 1;

  constructor(
    private readonly width: number,
    height: number,
  ) {
    super('door', 'door');
    const w = width;
    const t = 0.04;
    // The window: from waist height to near the top, most of the door's width.
    const sill = 1.0;
    const head = height - 0.18;
    const side = 0.1;
    const frame = this.material(0xd8dcdc);
    const box = (bw: number, bh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t).translate(x, y, 0), frame);
      this.panel.add(m);
      this.hitObjects.push(m);
    };
    box(w, sill, 0, sill / 2); // below the window
    box(w, height - head, 0, (head + height) / 2); // above
    box(side, head - sill, -(w - side) / 2, (sill + head) / 2); // either side
    box(side, head - sill, (w - side) / 2, (sill + head) / 2);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 2 * side, head - sill).translate(0, (sill + head) / 2, 0),
      new THREE.MeshBasicMaterial({ color: 0xbcd4e0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    glass.name = 'windowGlass'; // the laser passes through it
    glass.renderOrder = 2;
    this.panel.add(glass);
    // A handle on each face.
    const handle = this.material(0x5a6066);
    for (const z of [-t, t]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03).translate(w / 2 - 0.08, 1.05, z), handle);
      this.panel.add(h);
      this.hitObjects.push(h);
    }
    this.root.add(this.panel);
    this.place();
  }

  distanceTo(world: THREE.Vector3): number {
    // The handle side of the panel, wherever it has slid to.
    return this.toLocal(world).distanceTo(new THREE.Vector3(this.panel.position.x + this.width / 2 - 0.08, 1.05, 0));
  }

  pressStart(): void {
    this.target = this.target > 0.5 ? 0 : 1;
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.target);
  }

  sync(state: VesselState): void {
    this.target = state.controls.door > 0.5 ? 1 : 0;
  }

  /** Slide toward open / shut (call every frame). */
  tick(dt: number): void {
    if (this.open === this.target) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 2.5);
    this.place();
  }

  /** Fully shut (for the wind and rain sound). */
  get shut(): boolean {
    return this.open < 0.05;
  }

  private place(): void {
    this.panel.position.x = -this.open * (this.width + 0.05);
  }
}
