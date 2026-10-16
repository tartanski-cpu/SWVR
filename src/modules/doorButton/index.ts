/**
 * Module control.door-button: a push button on a door frame that opens or shuts the door
 * (modular boats M3c). The door is the hull's (a hull feature); the button only throws its
 * key: 'door.aft.open' by default, rebound in the recipe for another door (the workboat's
 * port side door, 'door.side.open'). Its cap glows green while the door is open; its door
 * starts open or shut as its key does. Its config: what it says on hover.
 */
import { DoorButton } from '../../controls/WheelhouseDoor';
import { busOf, specOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface DoorButtonConfig {
  /** Hover text. */
  label: string;
}

export const DOOR_BUTTON: ModuleDefinition<DoorButtonConfig> = {
  id: 'control.door-button',
  version: 1,
  fits: ['wall.panel'],
  defaults: { label: 'Wheelhouse door: open / shut' },
  ports: { door: { dir: 'write', key: 'door.aft.open' } },
  view: {
    build({ config, keys, socket }) {
      const key = keys.door;
      const button = new DoorButton(socket.id, { channel: key, read: (s) => busOf(s).num(key) }, { label: config.label, startsOpen: !!specOf(key).default });
      return { staticParts: [], movingParts: [], controls: [button], update: () => {} };
    },
  },
};
