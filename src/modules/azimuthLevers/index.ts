/**
 * Module control.azimuth-lever (owner, Oct 2026: the harbour tug's ASD drives, "a twist and
 * throttle ... at either side of the operator ... one hand each"): one azimuth drive's lever
 * (lever.ts: twist it to turn the drive, push it forward for power). An ASD tug has two, one
 * each side of her helmsman and a little ahead of him, the port drive's to the left; the recipe
 * puts one in each slot, binds its keys and gives it its colour and id.
 *
 * What it writes: its direction (`angle`, azimuth.demand or azimuth.demand2, deg) and power
 * (`power`, throttle.demand or throttle.demand2: its engine's throttle, 0..1). The drives are
 * the diesel's (modules/dieselInboard `azimuth`); TRANSIT and the engines' STARTs are the
 * console's own switches. Draw calls: the lever's moving parts (turntable, rod and grip).
 */
import { CONFIG } from '../../config';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { AzimuthLever } from './lever';

export interface AzimuthLeverConfig {
  /** The control's id ('lever' for the port one, as the single throttle's; 'lever2' the starboard's). */
  id: string;
  side: 'port' | 'stbd';
  /** Its name in the hints, and engraved below it. */
  name: string;
}

export const AZIMUTH_LEVER: ModuleDefinition<AzimuthLeverConfig> = {
  id: 'control.azimuth-lever',
  version: 1,
  fits: ['panel.slot'],
  defaults: { id: 'lever', side: 'port', name: 'PORT' },
  validateConfig: (c) => [...(c.side === 'port' || c.side === 'stbd' ? [] : ["side should be 'port' or 'stbd'"])],
  ports: {
    angle: { dir: 'write' },
    power: { dir: 'write' },
  },
  view: {
    build({ config, keys }) {
      const c = CONFIG.modules.azimuth.lever;
      const lever = new AzimuthLever(
        config.id,
        { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, twistGain: c.twistGain, turntableRadius: c.turntableRadius, drumRadius: c.drumRadius, drumWidth: c.drumWidth, barRadius: c.barRadius, handleColour: c.colours.handle, tipColour: c.colours.tip, colour: c.colours[config.side], baseColour: c.colours.base },
        { angle: keys.angle, power: keys.power },
        { angle: (s) => busOf(s).num(keys.angle), power: (s) => Math.max(0, busOf(s).num(keys.power)) },
        `${config.side === 'port' ? 'Port' : 'Starboard'} drive: twist its bar to point the drive (the white pointer), push it forward for power`,
      );
      return { staticParts: [], movingParts: [], controls: [lever], labels: [{ text: config.name, at: [0, 0, c.turntableRadius + 0.05] }], update: () => {} };
    },
  },
};
