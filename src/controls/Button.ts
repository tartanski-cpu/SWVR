import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * Push button. 'momentary' buttons send 1 while held and 0 on release (horn);
 * 'pulse' buttons send a single 1 on press (engine start/stop).
 * The cap visibly travels in when pressed.
 */
export class Button extends Control {
  readonly kind = 'press' as const;
  private readonly cap: THREE.Mesh;
  private pressed = false;

  constructor(
    id: string,
    channel: string,
    readonly label: string,
    private readonly mode: 'momentary' | 'pulse',
    capColor: number,
    /** Optional: read a "lit" state from the vessel (e.g. engine running). */
    private readonly litWhen?: (s: VesselState) => boolean,
  ) {
    super(id, channel);
    const housing = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.022, 14), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    housing.position.y = 0.011;
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.018, 14), this.material(capColor));
    this.cap.position.y = 0.028;
    this.root.add(housing, this.cap);
    this.hitObjects.push(this.cap, housing);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.cap.position);
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.cap.position.y = 0.02;
    this.ctx?.haptic(0.6, 40);
    this.ctx?.emit(this.channel, 1);
  }

  pressEnd(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.cap.position.y = 0.028;
    if (this.mode === 'momentary') this.ctx?.emit(this.channel, 0);
  }

  sync(state: VesselState): void {
    if (!this.litWhen) return;
    const mat = this.cap.material as THREE.MeshLambertMaterial;
    // Lit buttons glow faintly (on top of the hover highlight).
    if (!this.hovered) mat.emissive.setHex(this.litWhen(state) ? 0x2a4a10 : 0x000000);
  }
}
