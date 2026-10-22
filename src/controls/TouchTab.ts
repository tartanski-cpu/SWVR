import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * One tab on a touchscreen's glass (CS5): an invisible patch over the tab the screen draws.
 * Pressing it (hand or laser) sends that tab's page on the screen's channel; the screen itself
 * shows the press, by turning to the page.
 */
export class TouchTab extends Control {
  readonly kind = 'press' as const;
  private readonly hit: THREE.Mesh;

  /** @param w, h the tab's size on the glass (m), centred on the root, facing +z. */
  constructor(id: string, channel: string, public label: string, private readonly page: number, w: number, h: number) {
    super(id, channel);
    // A thin box just proud of the glass; hidden, but the pointer and the hand still find it.
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01).translate(0, 0, 0.005), new THREE.MeshBasicMaterial());
    this.hit.visible = false;
    this.root.add(this.hit);
    this.hitObjects.push(this.hit);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    this.ctx?.haptic(0.4, 25);
    this.ctx?.emit(this.channel, this.page);
  }

  pressEnd(): void {}

  sync(_state: VesselState): void {}
}
