import * as THREE from 'three';
import { CONFIG } from '../config';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * Push button. 'momentary' buttons send 1 while held and 0 on release (horn);
 * 'pulse' buttons send a single 1 on press (engine start/stop).
 * The cap visibly travels in when pressed.
 */
export class Button extends Control {
  readonly kind = 'press' as const;
  /** The cap (modules draw it as a shared part: modular/sharedParts.ts). */
  readonly cap: THREE.Mesh;
  private pressed = false;
  /** The cap's height out and pressed in (m). */
  private readonly capOut: number;
  private readonly capIn: number;

  constructor(
    id: string,
    channel: string,
    /** Hover text; may be changed (the tender crane's button says what it will do). */
    public label: string,
    private readonly mode: 'momentary' | 'pulse',
    capColor: number,
    /** Optional: read a "lit" state from the vessel (e.g. engine running). */
    private readonly litWhen?: (s: VesselState) => boolean,
  ) {
    super(id, channel);
    const k = CONFIG.interaction.switchScale;
    const housing = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.038 * k, 0.042 * k, 0.022 * k, 14), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    housing.position.y = 0.011 * k;
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * k, 0.028 * k, 0.018 * k, 14), this.material(capColor));
    this.capOut = 0.028 * k;
    this.capIn = 0.02 * k;
    this.cap.position.y = this.capOut;
    // What the pointer and reticle hit: the button at its first, full size (a hidden
    // cylinder drawn by nothing), so a smaller button is no harder to aim at.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.037, 14).translate(0, 0.0185, 0), new THREE.MeshBasicMaterial());
    hit.visible = false;
    this.root.add(housing, this.cap, hit);
    this.hitObjects.push(this.cap, housing, hit);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.cap.position);
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.cap.position.y = this.capIn;
    this.ctx?.haptic(0.6, 40);
    this.ctx?.emit(this.channel, 1);
  }

  pressEnd(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.cap.position.y = this.capOut;
    if (this.mode === 'momentary') this.ctx?.emit(this.channel, 0);
  }

  sync(state: VesselState): void {
    if (!this.litWhen) return;
    const mat = this.cap.material as THREE.MeshLambertMaterial;
    // Lit buttons glow faintly (on top of the hover highlight).
    if (!this.hovered) mat.emissive.setHex(this.litWhen(state) ? 0x2a4a10 : 0x000000);
  }
}
