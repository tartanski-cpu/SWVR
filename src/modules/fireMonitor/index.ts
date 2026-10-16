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
 */
import { CONFIG } from '../../config';
import { FireGauge } from '../../fire/fireGauge';
import { MonitorView } from '../../fire/monitorView';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type FireMonitorConfig = typeof CONFIG.vessels.workboat.fireMonitor;

/** What the app feeds the monitor: its gauge, which shows the fire job. */
export interface FireMonitorApi {
  readonly gauge: FireGauge;
}

export const FIRE_MONITOR: ModuleDefinition<FireMonitorConfig> = {
  id: 'deck.fire-monitor',
  version: 1,
  fits: ['roof.mount'],
  defaults: CONFIG.vessels.workboat.fireMonitor,
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
  view: {
    frame: 'boat',
    build({ config: c, keys }) {
      const monitor = new MonitorView(c);
      const gp = c.gauge;
      const gauge = new FireGauge(gp.length, gp.lampX);
      gauge.root.position.fromArray(gp.position);
      const [x, y, z] = gp.position;
      return {
        staticParts: [part(FireGauge.track(gp.length).translate(x, y, z), 0x14171a)],
        movingParts: [monitor.root, gauge.root],
        controls: [],
        labels: [
          { text: 'FIRE', at: [x, y, z - 0.03] },
          { text: 'ON TARGET', at: [x + gp.length / 2 + gp.lampX, y, z - 0.03] },
        ],
        update: (read) => monitor.update(read.num(keys.pan), read.num(keys.tilt), !!read.get(keys.pump)),
        api: { gauge } satisfies FireMonitorApi,
      };
    },
  },
};
