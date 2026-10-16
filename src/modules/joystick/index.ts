/**
 * Module control.joystick: a spring-centred stick that drives two angles at a RATE
 * (modular boats M3): the searchlight's pan and tilt by default, or whatever the recipe binds
 * (the fire monitor's). Deflection squared times the rate, so it's fine near centre and
 * quick at the stops; let go and it springs back, the light stays. Its travel limits are
 * its keys' ranges in the registry. The existing Joystick control does the rest.
 */
import { CONFIG } from '../../config';
import { Joystick } from '../../controls/Joystick';
import { busOf, specOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { colourOf } from '../../modular/palette';

export interface JoystickConfig {
  label: string;
  engrave: string;
  /** Knob colour: a number, or '#rrggbb' in a recipe. */
  knob: number | string;
  /** deg/s at full deflection. */
  panRateDeg: number;
  tiltRateDeg: number;
}

export const JOYSTICK: ModuleDefinition<JoystickConfig> = {
  id: 'control.joystick',
  version: 1,
  fits: ['panel.slot'],
  defaults: { label: 'Joystick', engrave: '', knob: 0xe0b020, ...CONFIG.modules.joystick },
  validateConfig: (c) => (c.panRateDeg > 0 && c.tiltRateDeg > 0 ? [] : ['the rates should be over 0']),
  ports: { pan: { dir: 'write', key: 'searchlight.pan' }, tilt: { dir: 'write', key: 'searchlight.tilt' } },
  view: {
    build({ config, keys, socket }) {
      const pan = specOf(keys.pan).range ?? [-180, 180];
      const tilt = specOf(keys.tilt).range ?? [-90, 90];
      const stick = new Joystick(
        socket.id,
        { panRateDeg: config.panRateDeg, tiltRateDeg: config.tiltRateDeg, panLimitDeg: Math.max(-pan[0], pan[1]), tiltMinDeg: tilt[0], tiltMaxDeg: tilt[1] },
        { pan: keys.pan, tilt: keys.tilt },
        config.label,
        colourOf(config.knob, 0xe0b020),
        { pan: (s) => busOf(s).num(keys.pan), tilt: (s) => busOf(s).num(keys.tilt) },
      );
      return { staticParts: [], movingParts: [], controls: [stick], labels: config.engrave ? [{ text: config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};
