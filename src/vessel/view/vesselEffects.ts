import type * as THREE from 'three';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { ExhaustSmoke } from './exhaustSmoke';
import { NavLightsView } from './navLights';
import { AnchorChainView } from './anchorView';
import { WakeTrail } from './wakeTrail';
import { Spray } from './spray';
import { CabinLight } from './cabinLight';
import { MooringLines } from './mooringLines';

/**
 * Per-vessel visual effects driven by its state: navigation lights, exhaust smoke, anchor
 * chain, wake and spray.
 */
export class VesselEffects {
  private readonly nav: NavLightsView;
  private readonly smoke = new ExhaustSmoke();
  private readonly chain = new AnchorChainView();
  private readonly wake: WakeTrail;
  private readonly spray: Spray;
  private readonly cabin: CabinLight;
  private readonly lines = new MooringLines();

  /**
   * @param root   the vessel view's root (nav lights ride on it)
   * @param world  where world-space effects (smoke, wake, spray) live
   * @param ocean  the ocean's shared uniforms (the wake displaces with the same waves)
   */
  constructor(
    private readonly def: VesselDef,
    private readonly root: THREE.Object3D,
    world: THREE.Object3D,
    ocean: Record<string, { value: unknown }>,
  ) {
    this.nav = new NavLightsView(def);
    root.add(this.nav.root);
    this.wake = new WakeTrail(ocean, def.hull.params.length / 2 - 0.2);
    this.spray = new Spray(def);
    this.cabin = new CabinLight(def);
    root.add(this.cabin.root);
    world.add(this.smoke.root, this.chain.line, this.wake.mesh, this.spray.points, this.lines.mesh);
  }

  /**
   * @param darkness 0 (day) .. 1 (night)
   * @param time     render time (s), the waves' clock
   * @returns slam strength 0..1 this frame (bow hitting the water), for sound and haptics
   */
  update(dt: number, s: VesselState, waves: PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number): number {
    const light = 1 - 0.8 * darkness;
    this.nav.update(s.controls.navLights > 0, darkness, viewer);
    this.smoke.setLight(light);
    this.smoke.update(dt, s, this.def, this.root, (x, z) => surfaceHeight(waves, x, z), viewer);
    this.chain.update(s, this.def, this.root);
    this.cabin.update(s.controls.cabinLight > 0);
    this.lines.update(s, this.def, this.root);
    this.wake.update(s, this.root, waves, time);
    return this.spray.update(dt, s, this.root, waves, viewer, light);
  }
}
