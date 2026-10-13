import type * as THREE from 'three';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { ExhaustSmoke } from './exhaustSmoke';
import { NavLightsView } from './navLights';

/** Per-vessel visual effects driven by its state: navigation lights and exhaust smoke. */
export class VesselEffects {
  private readonly nav: NavLightsView;
  private readonly smoke = new ExhaustSmoke();

  /**
   * @param root  the vessel view's root (nav lights ride on it)
   * @param world where world-space effects (smoke) live
   */
  constructor(
    private readonly def: VesselDef,
    private readonly root: THREE.Object3D,
    world: THREE.Object3D,
  ) {
    this.nav = new NavLightsView(def);
    root.add(this.nav.root);
    world.add(this.smoke.root);
  }

  /** @param darkness 0 (day) .. 1 (night) */
  update(dt: number, s: VesselState, waves: PreparedWave[], viewer: THREE.Vector3, darkness: number): void {
    this.nav.update(s.controls.navLights > 0, darkness, viewer);
    this.smoke.update(dt, s, this.def, this.root, (x, z) => surfaceHeight(waves, x, z), viewer);
  }
}
