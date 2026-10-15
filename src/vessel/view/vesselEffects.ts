import { isPowered } from '../electrics';
import type * as THREE from 'three';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { isWorkboat, type VesselDef, type WorkboatDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { ExhaustSmoke } from './exhaustSmoke';
import { NavLightsView } from './navLights';
import { AnchorChainView } from './anchorView';
import { WakeTrail } from './wakeTrail';
import { Spray } from './spray';
import { CabinLight } from './cabinLight';
import { MooringLines } from './mooringLines';
import { Searchlight } from './searchlight';
import { DeckLights } from './deckLights';

/**
 * Per-vessel visual effects driven by its state: navigation lights, cabin and deck lights,
 * searchlight, exhaust smoke, anchor chain, wake and spray.
 */
/** What only a fully equipped boat (the workboat) shows. */
class Equipment {
  readonly nav: NavLightsView;
  readonly smoke = new ExhaustSmoke();
  readonly chain = new AnchorChainView();
  readonly cabin: CabinLight;
  readonly deckLights: DeckLights;
  readonly lines = new MooringLines();
  readonly searchlight: Searchlight;

  constructor(
    readonly def: WorkboatDef,
    root: THREE.Object3D,
    world: THREE.Object3D,
  ) {
    this.nav = new NavLightsView(def);
    this.cabin = new CabinLight(def);
    this.deckLights = new DeckLights(def);
    this.searchlight = new Searchlight(def);
    root.add(this.nav.root, this.cabin.root, this.deckLights.root, this.searchlight.root);
    world.add(this.smoke.root, this.chain.line, this.lines.mesh);
  }
}

export class VesselEffects {
  private readonly wake: WakeTrail;
  private readonly spray: Spray;
  private readonly equip: Equipment | null;

  /**
   * @param root   the vessel view's root (nav lights ride on it)
   * @param world  where world-space effects (smoke, wake, spray) live
   * @param ocean  the ocean's shared uniforms (the wake displaces with the same waves)
   */
  constructor(
    def: VesselDef,
    private readonly root: THREE.Object3D,
    world: THREE.Object3D,
    ocean: Record<string, { value: unknown }>,
  ) {
    this.wake = new WakeTrail(ocean, def.hull.params.length / 2 - 0.2);
    this.spray = new Spray(def);
    this.equip = isWorkboat(def) ? new Equipment(def, root, world) : null;
    world.add(this.wake.mesh, this.spray.points);
  }

  /** The searchlight, on boats that have one (the ocean shader lights the water with it). */
  get searchlight(): Searchlight | null {
    return this.equip?.searchlight ?? null;
  }

  /**
   * @param darkness 0 (day) .. 1 (night)
   * @param time     render time (s), the waves' clock
   * @returns slam and lap strengths 0..1 this frame (bow hitting the water), for sound and haptics
   */
  update(dt: number, s: VesselState, waves: PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number): { slam: number; lap: number } {
    const light = 1 - 0.8 * darkness;
    const e = this.equip;
    if (e) {
      // Lights need 12 V (master on, battery not flat).
      const p = isPowered(s);
      e.nav.update(s.controls.navLights > 0 && p, darkness, viewer);
      e.smoke.setLight(light);
      e.smoke.update(dt, s, e.def, this.root, (x, z) => surfaceHeight(waves, x, z), viewer);
      e.chain.update(s, e.def, this.root);
      e.cabin.update(s.controls.cabinLight > 0 && p);
      e.deckLights.update(s, p);
      e.searchlight.update(s, darkness, p);
      e.lines.update(s, e.def, this.root);
    }
    // A tender hanging on the davit throws no wake or spray.
    if (s.tender && s.tender.phase !== 'free') return { slam: 0, lap: 0 };
    this.wake.update(s, this.root, waves, time);
    return this.spray.update(dt, s, this.root, waves, viewer, light);
  }
}
