import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { ParticlePool } from '../render/particlePool';
import { sprayTexture } from '../vessel/view/spray';

/**
 * The red spray when a swimmer goes into a turning propeller (propStrike.ts), seen by
 * everyone: when the host's `rescue.strike` changes, a burst of red drops thrown up and out
 * of the water there, then red froth churned up for a couple of seconds as the prop's wash
 * carries it. Its own small pool of drops (one draw call, drawn only while any are alive),
 * tinted red by its material; dimmer at night.
 */
export class PropStrikeView {
  readonly pool = new ParticlePool(CONFIG.rescue.propStrike.droplets + 120, 0.75, sprayTexture());
  /** The strike already seen (null until the first update: a strike from before we joined doesn't play). */
  private seen: number | null = null;
  private readonly at = new THREE.Vector3();
  private froth = 0;
  private frothAcc = 0;
  private readonly tint = new THREE.Color(1, 0.06, 0.04);

  /** Returns the strike's position if one just happened (for its sound), else null. */
  update(world: WorldState, waves: readonly PreparedWave[], dt: number, viewer: THREE.Vector3, darkness: number): THREE.Vector3 | null {
    const cfg = CONFIG.rescue.propStrike;
    const s = world.rescue?.strike;
    let fresh: THREE.Vector3 | null = null;
    if (this.seen === null) this.seen = s?.seq ?? 0;
    else if (s && s.seq !== this.seen) {
      this.seen = s.seq;
      this.at.fromArray(s.pos);
      this.at.y = surfaceHeight(waves, this.at.x, this.at.z);
      this.froth = cfg.frothSec;
      for (let i = 0; i < cfg.droplets; i++) {
        const a = Math.random() * Math.PI * 2;
        const out = 0.5 + Math.random() * 2.5;
        const up = 2 + Math.random() * 4.5;
        this.pool.emit(this.at.x, this.at.y + 0.1, this.at.z, Math.cos(a) * out, up, Math.sin(a) * out, 0.6 + Math.random() * 0.8, 0, 1, 1);
      }
      fresh = this.at;
    }
    if (this.froth > 0) {
      // Churned up in the wash: low, slow, spreading a little, for a couple of seconds.
      this.froth -= dt;
      this.frothAcc += cfg.frothRate * dt;
      while (this.frothAcc >= 1) {
        this.frothAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.2;
        const x = this.at.x + Math.cos(a) * r;
        const z = this.at.z + Math.sin(a) * r;
        this.pool.emit(x, surfaceHeight(waves, x, z) + 0.05, z, Math.cos(a) * 0.5, 0.8 + Math.random() * 1.2, Math.sin(a) * 0.5, 0.5 + Math.random() * 0.4, 0, 0.9, 1);
      }
    }
    (this.pool.points.material as THREE.PointsMaterial).color.copy(this.tint).multiplyScalar(1 - 0.75 * darkness);
    this.pool.step(dt, 1.4, 0, -9.81, () => 0.9, viewer);
    return fresh;
  }
}
