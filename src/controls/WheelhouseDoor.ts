import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Wiring } from './Control';

/**
 * The wheelhouse's aft door: a sliding panel with a big window in it (so you can see
 * astern from the helm with it shut), sliding to port behind the aft wall. It slides over
 * ~0.4 s. Not itself a control (owner feedback: open, it slid behind the whiteboard and
 * caught hands writing on it): a push button on the door frame, inside and out
 * (`DoorButton`), opens or shuts it.
 * Its root sits at the bottom centre of the doorway, on the aft face of the wall.
 */
export class WheelhouseDoor {
  readonly root = new THREE.Group();
  private readonly panel = new THREE.Group();
  private open = 1;
  private target = 1;

  constructor(
    private readonly width: number,
    height: number,
  ) {
    this.root.name = 'wheelhouseDoor';
    const w = width;
    const t = 0.04;
    // The window: from waist height to near the top, most of the door's width.
    const sill = 1.0;
    const head = height - 0.18;
    const side = 0.1;
    const frame = new THREE.MeshLambertMaterial({ color: 0xd8dcdc, flatShading: true });
    const box = (bw: number, bh: number, x: number, y: number) => this.panel.add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t).translate(x, y, 0), frame));
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
    // A recessed pull on each face.
    const handle = new THREE.MeshLambertMaterial({ color: 0x5a6066 });
    for (const z of [-t, t]) this.panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.012).translate(w / 2 - 0.08, 1.05, z * 0.6), handle));
    this.root.add(this.panel);
    this.place();
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

/**
 * The door's push button on its frame: a square plate on the wall with a round button,
 * green while the door is open. A press opens a shut door and shuts an open one (it sends
 * the new state, `door` 1 / 0, so two crew pressing at once agree). Its root sits on the
 * wall face; local +y points out of the wall, local +z up it.
 */
export class DoorButton extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Wheelhouse door: open / shut';
  private readonly cap: THREE.Mesh;
  private doorOpen = true;
  private pressed = false;

  private readonly read: (s: VesselState) => number;

  constructor(id: string, wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'door');
    this.read = wiring.read ?? ((s) => s.controls.door);
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.14), new THREE.MeshLambertMaterial({ color: 0x2a2e33 })));
    plate.position.y = 0.006;
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 14), this.material(0x3a9a4a));
    this.cap.position.y = 0.022;
    // A bar engraved under the button (local -z is down on the wall).
    const arrow = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.008), new THREE.MeshLambertMaterial({ color: 0xe8e2cc })));
    arrow.position.set(0, 0.013, -0.05);
    this.root.add(plate, this.cap, arrow);
    this.hitObjects.push(this.cap, plate);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.cap.position);
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.cap.position.y = 0.016;
    this.doorOpen = !this.doorOpen;
    this.markPending();
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.doorOpen ? 1 : 0);
  }

  pressEnd(): void {
    this.pressed = false;
    this.cap.position.y = 0.022;
  }

  sync(state: VesselState): void {
    const open = this.read(state) > 0.5;
    if (this.awaiting(open === this.doorOpen)) return;
    this.doorOpen = open;
    if (!this.hovered) (this.cap.material as THREE.MeshLambertMaterial).emissive.setHex(open ? 0x1a4a1a : 0x000000);
  }
}
