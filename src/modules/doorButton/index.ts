/**
 * Module control.door-button: a push button on a door frame that opens or shuts the door
 * (modular boats M3c). The door is the hull's (a hull feature); the button only throws its
 * key, 'door.aft.open' on the workboat. Its cap glows green while the door is open.
 */
import { DoorButton } from '../../controls/WheelhouseDoor';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export const DOOR_BUTTON: ModuleDefinition<Record<string, never>> = {
  id: 'control.door-button',
  version: 1,
  fits: ['wall.panel'],
  defaults: {},
  ports: { door: { dir: 'write', key: 'door.aft.open' } },
  view: {
    build({ keys, socket }) {
      const key = keys.door;
      const button = new DoorButton(socket.id, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [button], update: () => {} };
    },
  },
};
