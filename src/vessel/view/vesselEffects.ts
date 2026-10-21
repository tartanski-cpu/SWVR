import type * as THREE from 'three';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { gearOf } from '../../boats/sims';
import { CONFIG } from '../../config';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { ExhaustSmoke } from './exhaustSmoke';
import { AnchorChainView } from './anchorView';
import { WakeTrail } from './wakeTrail';
import { Spray } from './spray';
import { MooringLines } from './mooringLines';

/**
 * Per-vessel visual effects driven by its state: exhaust smoke, anchor chain, mooring lines,
 * wake and spray.
 */
/**
 * What only some boats show, each where she has it: exhaust smoke from the outlet built into
 * her hull (with a diesel), the anchor chain with an anchor, mooring lines with cleats fore
 * and aft (modular boats M6b: her fittings and her modules' gear). Her lights are her
 * modules' own views since M6c.
 */
class Equipment {
  readonly smoke: { view: ExhaustSmoke; exhaust: NonNullable<VesselDef['exhaust']> } | null;
  readonly chain: AnchorChainView | null;
  readonly lines: MooringLines | null;

  constructor(
    readonly def: VesselDef,
    world: THREE.Object3D,
  ) {
    const her = { defId: def.id };
    const diesel = gearOf(her, 'diesel');
    // Turbocharged if her engine's voice has a turbo (CONFIG.engineVoices): the smoke model's air.
    const turbo = !!diesel?.voice && !!CONFIG.engineVoices[diesel.voice]?.turbo;
    this.smoke = def.exhaust && diesel ? { view: new ExhaustSmoke(turbo, diesel), exhaust: def.exhaust } : null;
    this.chain = gearOf(her, 'anchor') ? new AnchorChainView() : null;
    this.lines = gearOf(her, 'bowCleat') && gearOf(her, 'sternCleat') ? new MooringLines() : null;
    for (const o of [this.smoke?.view.root, this.chain?.line, this.lines?.mesh]) if (o) world.add(o);
  }
}

export class VesselEffects {
  private readonly wake: WakeTrail;
  private readonly spray: Spray;
  private readonly equip: Equipment;

  /**
   * @param root   the vessel view's root (the smoke, chain and lines follow it)
   * @param world  where world-space effects (smoke, wake, spray) live
   * @param ocean  the ocean's shared uniforms (the wake displaces with the same waves)
   */
  constructor(
    def: VesselDef,
    private readonly root: THREE.Object3D,
    world: THREE.Object3D,
    ocean: Record<string, { value: unknown }>,
  ) {
    // Her propeller's size for the jet (the skiff's outboard: a small one).
    const propD = gearOf({ defId: def.id }, 'diesel')?.propeller.diameter ?? 0.25;
    this.wake = new WakeTrail(ocean, def.hull.params.length / 2 - 0.2, { propD, length: def.hull.params.length, planing: def.planing });
    this.spray = new Spray(def);
    this.equip = new Equipment(def, world);
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
  /** What's drawn by the viewer's distance (multi-boat M4): all; no smoke beyond `near`; no wake or spray either beyond `mid`. */
  private level: 'full' | 'noSmoke' | 'none' = 'full';

  update(dt: number, s: VesselState, waves: PreparedWave[], viewer: THREE.Vector3, darkness: number, time: number, level: 'full' | 'noSmoke' | 'none' = 'full'): { slam: number; lap: number } {
    const light = 1 - 0.8 * darkness;
    const e = this.equip;
    if (level !== this.level) {
      this.level = level;
      if (e.smoke) e.smoke.view.root.visible = level === 'full';
      this.wake.mesh.visible = this.spray.points.visible = level !== 'none';
    }
    if (e.smoke && level === 'full') {
      e.smoke.view.setLight(light);
      e.smoke.view.update(dt, s, e.smoke.exhaust, this.root, (x, z) => surfaceHeight(waves, x, z), viewer);
    }
    e.chain?.update(s, this.root);
    e.lines?.update(s, e.def, this.root);
    // A tender in her cradle or on the crane throws no wake or spray; nor does a far boat.
    if ((s.tender && s.tender.phase !== 'free') || level === 'none') return { slam: 0, lap: 0 };
    this.wake.update(s, this.root, waves, time);
    return this.spray.update(dt, s, this.root, waves, viewer, light);
  }
}
