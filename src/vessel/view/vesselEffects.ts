import { isPowered } from '../electrics';
import type * as THREE from 'three';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { gearOf } from '../../boats/sims';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { ExhaustSmoke } from './exhaustSmoke';
import { NavLightsView } from './navLights';
import { AnchorChainView } from './anchorView';
import { WakeTrail } from './wakeTrail';
import { Spray } from './spray';
import { CabinLight } from './cabinLight';
import { MooringLines } from './mooringLines';
import { DeckLights } from './deckLights';

/**
 * Per-vessel visual effects driven by its state: navigation lights, cabin and deck lights,
 * exhaust smoke, anchor chain, wake and spray.
 */
/**
 * What only some boats show, each where she has it: lights and the exhaust outlet built
 * into her hull, the anchor chain with an anchor, mooring lines with cleats fore and aft
 * (modular boats M6b: her fittings and her modules' gear).
 */
class Equipment {
  readonly nav: NavLightsView | null;
  readonly smoke: { view: ExhaustSmoke; exhaust: NonNullable<VesselDef['exhaust']>; ratedRpm: number } | null;
  readonly chain: AnchorChainView | null;
  readonly cabin: CabinLight | null;
  readonly deckLights: DeckLights | null;
  readonly lines: MooringLines | null;

  constructor(
    readonly def: VesselDef,
    root: THREE.Object3D,
    world: THREE.Object3D,
  ) {
    const her = { defId: def.id };
    const diesel = gearOf(her, 'diesel');
    this.nav = def.navLights ? new NavLightsView(def.navLights) : null;
    this.smoke = def.exhaust && diesel ? { view: new ExhaustSmoke(), exhaust: def.exhaust, ratedRpm: diesel.engine.ratedRpm } : null;
    this.chain = gearOf(her, 'anchor') ? new AnchorChainView() : null;
    this.cabin = def.cabinLight ? new CabinLight(def.cabinLight) : null;
    this.deckLights = def.deckLights ? new DeckLights({ hull: def.hull, layout: def.layout, deckLights: def.deckLights }) : null;
    this.lines = gearOf(her, 'bowCleat') && gearOf(her, 'sternCleat') ? new MooringLines() : null;
    for (const o of [this.nav?.root, this.cabin?.root, this.deckLights?.root]) if (o) root.add(o);
    for (const o of [this.smoke?.view.root, this.chain?.line, this.lines?.mesh]) if (o) world.add(o);
  }
}

export class VesselEffects {
  private readonly wake: WakeTrail;
  private readonly spray: Spray;
  private readonly equip: Equipment;

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
    this.equip = new Equipment(def, root, world);
    world.add(this.wake.mesh, this.spray.points);
  }

  /** Take the world-space effects out of the scene (a tow taken away; never the workboat). */
  dispose(): void {
    for (const o of [this.wake.mesh, this.spray.points] as THREE.Mesh[]) {
      o.removeFromParent();
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }

  /**
   * @param darkness 0 (day) .. 1 (night)
   * @param time     render time (s), the waves' clock
   * @returns slam and lap strengths 0..1 this frame (bow hitting the water), for sound and haptics
   */
  update(dt: number, s: VesselState, waves: PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number): { slam: number; lap: number } {
    const light = 1 - 0.8 * darkness;
    const e = this.equip;
    // Lights need 12 V (master on, battery not flat).
    const deck = isPowered(s, 'deckLights');
    e.nav?.update(s.controls.navLights > 0 && isPowered(s, 'navLights'), darkness, viewer);
    if (e.smoke) {
      e.smoke.view.setLight(light);
      e.smoke.view.update(dt, s, e.smoke.exhaust, e.smoke.ratedRpm, this.root, (x, z) => surfaceHeight(waves, x, z), viewer);
    }
    e.chain?.update(s, this.root);
    e.cabin?.update(deck ? s.controls.cabinLight : 0);
    e.deckLights?.update(s, deck);
    e.lines?.update(s, e.def, this.root);
    // A tender in her cradle or on the crane throws no wake or spray.
    if (s.tender && s.tender.phase !== 'free') return { slam: 0, lap: 0 };
    this.wake.update(s, this.root, waves, time);
    return this.spray.update(dt, s, this.root, waves, viewer, light);
  }
}
