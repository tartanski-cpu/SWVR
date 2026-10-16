import * as THREE from 'three';
import { panelLit } from '../controls/panelLighting';
import type { FireJob } from './fire';

/**
 * The fire gauge on the console, just ahead of the monitor joystick (owner: better feedback
 * on fire missions, where you're looking while you aim): a bar showing how big the fire
 * still is, and an ON TARGET lamp that lights green while the jet is landing on it.
 * Reads the shared fire job, so the whole crew sees the same. Two small draw calls (the bar
 * and the lamp); the dark track under the bar is baked with the console.
 *
 * Root: centre of the gauge on the console top. The bar runs along +x from `-length/2`,
 * the lamp sits `lampX` beyond the bar's right end.
 */
export class FireGauge {
  readonly root = new THREE.Group();
  private readonly bar: THREE.Mesh;
  private readonly barMat = panelLit(new THREE.MeshBasicMaterial({ color: 0x401010 }));
  private readonly lampMat = panelLit(new THREE.MeshBasicMaterial({ color: 0x173a1c }));
  private shown = -1;
  private lit = false;

  /** The track under the bar, in the gauge's own frame (to bake with the console's fixed parts). */
  static track(length: number): THREE.BufferGeometry {
    return new THREE.BoxGeometry(length + 0.012, 0.004, 0.026).translate(0, 0.002, 0);
  }

  constructor(readonly length: number, readonly lampX: number) {
    // Unit-length bar along +x from the origin; scaled to the fire's size.
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.004, 0.018).translate(0.5, 0, 0), this.barMat);
    this.bar.position.set(-length / 2, 0.006, 0);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.008, 12), this.lampMat);
    lamp.position.set(length / 2 + lampX, 0.004, 0);
    this.bar.name = 'fireGaugeBar';
    lamp.name = 'fireGaugeLamp';
    this.root.add(this.bar, lamp);
  }

  /**
   * @param job the fire job (null: none), its intensity 0..1 and wetting 0..1
   */
  update(job: FireJob | null): void {
    const burning = job && job.phase !== 'calling' ? job.intensity : 0;
    // The bar: dull red with no fire; bright red-orange, as long as the fire is big.
    const size = Math.round(burning * 50) / 50;
    if (size !== this.shown) {
      this.shown = size;
      this.bar.visible = size > 0;
      this.bar.scale.x = Math.max(0.001, size * this.length);
      this.barMat.color.setHex(size > 0.5 ? 0xff3a10 : size > 0.2 ? 0xff8a10 : 0xffc020);
    }
    const lit = !!job && job.phase === 'accepted' && job.wetting > 0.05;
    if (lit !== this.lit) {
      this.lit = lit;
      this.lampMat.color.setHex(lit ? 0x40ff60 : 0x173a1c);
    }
  }
}
