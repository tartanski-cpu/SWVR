/**
 * Module control.azimuth-levers (owner, Oct 2026: the harbour tug's ASD drives, "lean-to-point
 * levers, transit mode too"): the two levers of an azimuth stern drive tug, side by side, the
 * port drive's on the left and the starboard's on the right (lever.ts: lean one the way you want
 * its drive to push, further for more power), and between them TRANSIT (a press: on, a press:
 * off; lit while on). In TRANSIT the wheel swings both drives together as rudders (and the
 * autopilot can steer her); each lever then only sets its engine's power, ahead leaning into
 * its forward half, astern (the drives turned round) into its after half.
 *
 * What it writes: each lever's direction (azimuth.demand, azimuth.demand2, deg) and power
 * (throttle.demand, throttle.demand2: the engines' throttles, 0..1), and TRANSIT. The drives
 * are the diesel's (modules/dieselInboard `azimuth`); the engines' STARTs are the console's.
 * Draw calls: each lever's stick (two), the TRANSIT cap shared with the console's buttons.
 */
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { busOf } from '../../modular/bus';
import type { BusKey } from '../../modular/busKeys';
import type { ModuleDefinition } from '../../modular/module';
import { AzimuthLever } from './lever';

export type AzimuthLeversConfig = typeof CONFIG.modules.azimuth.lever;

export const AZIMUTH_LEVERS: ModuleDefinition<AzimuthLeversConfig> = {
  id: 'control.azimuth-levers',
  version: 1,
  fits: ['panel.slot'],
  defaults: CONFIG.modules.azimuth.lever,
  validateConfig: (c) => [
    ...(c.maxTiltDeg > 0 && c.maxTiltDeg <= 60 ? [] : ['maxTiltDeg should be between 0 and 60']),
    ...(c.spacing >= 0.12 ? [] : ['spacing should be at least 0.12 m (room for a hand on each lever)']),
  ],
  ports: {
    power: { dir: 'write', key: 'throttle.demand' },
    power2: { dir: 'write', key: 'throttle.demand2' },
    angle: { dir: 'write', key: 'azimuth.demand' },
    angle2: { dir: 'write', key: 'azimuth.demand2' },
    transit: { dir: 'write', key: 'azimuth.transit' },
  },
  view: {
    build(ctx) {
      const c = ctx.config;
      const k = ctx.keys;
      const make = (id: string, side: 'port' | 'stbd', angle: BusKey, power: BusKey, name: string) =>
        new AzimuthLever(
          id,
          { length: c.length, maxTiltDeg: c.maxTiltDeg, detent: c.detent, knobRadius: c.knobRadius, colour: c.colours[side], rodColour: c.colours.rod, baseColour: c.colours.base },
          { angle, power },
          { angle: (s) => busOf(s).num(angle), power: (s) => Math.max(0, busOf(s).num(power)) },
          `${name} drive: lean it the way to push, further for more power`,
        );
      // (The port lever keeps the throttle's id: held as 'lever', seen through the windows.)
      const port = make('lever', 'port', k.angle, k.power, 'Port');
      const stbd = make('lever2', 'stbd', k.angle2, k.power2, 'Starboard');
      port.root.position.x = -c.spacing / 2;
      stbd.root.position.x = c.spacing / 2;
      let transitOn = false;
      const transit = new Button('aziTransit', k.transit, 'TRANSIT: the wheel steers both drives as rudders; the levers set the power (press again: the levers steer)', 'pulse', 0xe0a020, (s) => !!busOf(s).get(k.transit), () => (transitOn ? 0 : 1));
      transit.root.position.set(0, 0, 0.03);
      ctx.share(transit.cap, 'buttonCap');
      return {
        staticParts: [],
        movingParts: [],
        controls: [port, stbd, transit],
        labels: [
          { text: 'PORT', at: [-c.spacing / 2, 0, 0.06] },
          { text: 'STBD', at: [c.spacing / 2, 0, 0.06] },
          { text: 'TRANSIT', at: [0, 0, 0.06], size: [0.1, 0.018] },
        ],
        update: (read) => {
          transitOn = !!read.get(k.transit);
        },
      };
    },
  },
};
