/**
 * Module deck.fire-monitor: the fire monitor on the wheelhouse roof, and its gauge on the
 * helm console (modular boats M5b). The monitor pans and elevates as its joystick sets
 * 'monitor.pan' / 'monitor.tilt'; water comes out while the FIRE PUMP switch is on, the
 * engine is running (the pump is on its power take-off) and there's 12 V for the pump's
 * clutch. Stabilised, it holds its aim level against her roll and pitch. The gauge ahead
 * of the joystick shows how big the fire still is and lights ON TARGET while the jet lands
 * on it (the app feeds it the fire job, `api.gauge`: the fire is the world's, not the
 * boat's). It holds its aim level only while the pump is on; off, it rides with the boat.
 *
 * It gives the boat a fire monitor: where the nozzle is, how fast the water leaves it, its
 * aim limits; the world's fire system (fire/fire.ts) shoots the jet from it. Drawn in the
 * boat's axes from its config (the vessel's, CONFIG.vessels.workboat.fireMonitor, until
 * M6): the monitor on the roof, the gauge on the console (its track and labels merged with
 * the boat's fixed parts), like the crane's console button.
 *
 * On the wheelhouse roof (a roof.mount, `pole` null) it's worked from the helm. On the
 * working deck (a deck.equipment socket, owner) it stands on a pole (`pole`, modules/
 * deckPole.ts) with its own FIRE PUMP switch, joystick and gauge in a box at hand height (the
 * config's gauge is put there), as well as the helm's controls if she has them: both work
 * the same keys.
 */
import { CONFIG } from '../../config';
import { FireGauge } from '../../fire/fireGauge';
import { Joystick } from '../../controls/Joystick';
import { Toggle } from '../../controls/Toggle';
import { MonitorView } from '../../fire/monitorView';
import { busOf } from '../../modular/bus';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';
import { poleBoxTop, poleFootprint, poleParts, type DeckPole } from '../../mechanisms/deckPole';

export type FireMonitorConfig = typeof CONFIG.vessels.workboat.fireMonitor & {
  /** On a deck pole (null: on the roof). */
  pole: DeckPole | null;
};

/** How far below the barrel's pivot the monitor's own red riser ends (fire/monitorView.ts). */
const POST_DROP = 0.38;

/** Where the FIRE gauge sits in a pole's box (vessel axes): ahead of the joystick and switch. */
export function poleGaugeAt(at: readonly [number, number, number], pole: DeckPole): [number, number, number] {
  const [x, y, z] = poleBoxTop(at, pole);
  return [x - 0.03, y + 0.002, z - 0.06];
}

/** What the app feeds the monitor: its gauge, which shows the fire job. */
export interface FireMonitorApi {
  readonly gauge: FireGauge;
}

export const FIRE_MONITOR: ModuleDefinition<FireMonitorConfig> = {
  id: 'deck.fire-monitor',
  version: 1,
  fits: ['roof.mount', 'deck.equipment'],
  defaults: { ...CONFIG.vessels.workboat.fireMonitor, pole: null },
  validateConfig: (c) => (c.nozzleSpeed > 0 && c.panLimitDeg > 0 ? [] : ['the monitor needs a nozzle speed and room to pan']),
  ports: {
    pan: { dir: 'read', key: 'monitor.pan' },
    tilt: { dir: 'read', key: 'monitor.tilt' },
    pump: { dir: 'read', key: 'firePump.on' },
  },
  // The pump on the engine's power take-off, its clutch on 12 V.
  needs: () => [{ power: 'pto' }, { power: 'electrical' }],
  provides: () => [{ gear: 'fireMonitor' }],
  gear: (c) => ({ fireMonitor: c }),
  footprints: (c) => (c.pole ? [poleFootprint(c.position, c.position[1] - POST_DROP)] : []),
  view: {
    frame: 'boat',
    build({ config: c, keys, socket }) {
      const monitor = new MonitorView(c);
      const aim = new TickSmoother([60, 30]);
      // On a deck pole, its gauge goes in the pole's box.
      const gp = c.pole ? { ...c.gauge, position: poleGaugeAt(c.position, c.pole) } : c.gauge;
      const gauge = new FireGauge(gp.length, gp.lampX);
      gauge.root.position.fromArray(gp.position);
      const [x, y, z] = gp.position;
      // On a deck pole: the pole, and its box with the FIRE PUMP switch and a joystick.
      const controls = [];
      const poleLabels = [];
      if (c.pole) {
        const [bx, by, bz] = poleBoxTop(c.position, c.pole);
        const stick = new Joystick(
          `${socket.id}PoleJoystick`,
          { ...CONFIG.modules.joystick, panLimitDeg: c.panLimitDeg, tiltMinDeg: c.tiltMinDeg, tiltMaxDeg: c.tiltMaxDeg },
          { pan: keys.pan, tilt: keys.tilt },
          'Fire monitor joystick (on its pole)',
          0xc8281a,
          { pan: (s) => busOf(s).num(keys.pan), tilt: (s) => busOf(s).num(keys.tilt) },
        );
        stick.root.position.set(bx - 0.08, by, bz + 0.04);
        const pump = new Toggle(`${socket.id}PoleSwitch`, keys.pump, 'FIRE PUMP (on the monitor\'s pole)', (s) => busOf(s).num(keys.pump));
        pump.root.position.set(bx + 0.11, by, bz + 0.04);
        controls.push(stick, pump);
        poleLabels.push({ text: 'FIRE PUMP', at: [bx + 0.11, by, bz + 0.1] as const }, { text: 'MONITOR', at: [bx - 0.08, by, bz + 0.105] as const });
      }
      return {
        staticParts: [
          part(FireGauge.track(gp.length).translate(x, y, z), 0x14171a),
          ...(c.pole ? poleParts(c.position, c.pole, c.position[1] - POST_DROP) : []),
        ],
        movingParts: [monitor.root, gauge.root],
        controls,
        labels: [
          { text: 'FIRE', at: [x, y, z - 0.03] },
          { text: 'ON TARGET', at: [x + gp.length / 2 + gp.lampX, y, z - 0.03] },
          ...poleLabels,
        ],
        update: (read, _s, dt) => {
          // (Its pan and tilt drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const [pan, tilt] = aim.update([read.num(keys.pan), read.num(keys.tilt)], dt);
          monitor.update(pan, tilt, !!read.get(keys.pump));
        },
        api: { gauge } satisfies FireMonitorApi,
      };
    },
  },
};
