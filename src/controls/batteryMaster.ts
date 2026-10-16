import * as THREE from 'three';
import { panelLit } from './panelLighting';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Wiring } from './Control';

/**
 * Battery master switch: the big red key on a yellow plate, low on the aft wall by the door
 * (where the engine-room switch is on a real boat), so you have to walk to it. A press
 * turns it a quarter turn: OFF (key across) / ON (key up). Sends `master` 1 / 0.
 */
export class MasterSwitch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Battery master: on / off';
  private readonly key = new THREE.Group();
  private on = false;

  private readonly read: (s: VesselState) => number;

  constructor(id = 'master', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'master');
    this.read = wiring.read ?? ((s) => s.electrics?.master ?? 1);
    // Plate faces +z in its own frame (the root is turned to face into the wheelhouse).
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.012), new THREE.MeshLambertMaterial({ color: 0xe0b020 })));
    const boss = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.025, 16).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c1f22 })));
    boss.position.z = 0.018;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), panelLit(new THREE.MeshBasicMaterial({ map: plateLabel(), transparent: true })));
    label.position.set(0, 0.068, 0.007);
    // The key: a red bar with a round grip, turning about the plate normal.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.03), this.material(0xc0281c));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12).rotateX(Math.PI / 2), this.material(0xc0281c));
    this.key.position.z = 0.045;
    this.key.add(bar, hub);
    this.root.add(plate, boss, label, this.key);
    this.hitObjects.push(bar, hub, plate);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0, 0.045));
  }

  pressStart(): void {
    this.show(!this.on);
    this.ctx?.haptic(0.8, 50);
    this.ctx?.emit(this.channel, this.on ? 1 : 0);
  }

  private show(on: boolean): void {
    this.on = on;
    this.key.rotation.z = on ? Math.PI / 2 : 0; // ON: key turned up
  }

  sync(state: VesselState): void {
    const on = this.read(state) > 0.5;
    if (on !== this.on) this.show(on);
  }
}

/** "BATTERY MASTER  OFF / ON" lettering for the plate (drawn once). */
function plateLabel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 104;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BATTERY MASTER', 128, 26);
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('OFF  ↔   ↕  ON', 128, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
