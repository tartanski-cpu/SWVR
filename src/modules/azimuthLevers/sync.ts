/**
 * Module control.azimuth-sync (owner, 27 Oct 2026: "a switch that synchronizes the
 * throttles"): the SYNC button at an azimuth-drive helm. A press synchronises the two
 * throttles, both taking the port lever's power, and from then on either lever sets both;
 * a press again splits them, each lever its own drive's power. Lit while they're synchronised.
 * It sends the same `aziSync` intent as a lever's thumbstick clicked in (vessel/vesselControl.ts),
 * so the button, the stick click and the on-screen dials always agree. Its cap is drawn with
 * every other button's (one shared part).
 */
import { Button } from '../../controls/Button';
import type { ModuleDefinition } from '../../modular/module';
import type { VesselState } from '../../vessel/vesselState';

export interface AzimuthSyncConfig {
  /** The cap's colour. */
  color: number;
}

const synced = (s: VesselState) => (s.controls.aziSync ?? 0) > 0;

export const AZIMUTH_SYNC: ModuleDefinition<AzimuthSyncConfig> = {
  id: 'control.azimuth-sync',
  version: 1,
  fits: ['panel.slot'],
  defaults: { color: 0x3a9ad9 },
  ports: {},
  view: {
    build({ config, share }) {
      // (The boat's state as last seen: read again at a press, for what it sends, on or off.)
      let last: VesselState | null = null;
      const button = new Button(
        'aziSync',
        'aziSync',
        'SYNC: both throttles at the port lever\'s power, then either lever sets both (press again to split them)',
        'pulse',
        config.color,
        (s) => {
          last = s;
          return synced(s);
        },
        () => (last && synced(last) ? 0 : 1),
      );
      share(button.cap, 'buttonCap');
      return {
        staticParts: [],
        movingParts: [],
        controls: [button],
        labels: [{ text: 'SYNC', at: [0, 0, 0] }],
        update: () => {},
      };
    },
  },
};
