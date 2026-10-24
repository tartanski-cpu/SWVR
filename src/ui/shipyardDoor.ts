import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MenuHost } from './mainMenu';
import { WristMenu } from './wristMenu';

/** What the sign needs from the game. */
export type ShipyardDoorHost = Pick<MenuHost, 'shipyardStatus' | 'openShipyard'>;

/**
 * Voyage's way into the Shipyard (owner, Oct 2026; app/shipyardTrip.ts): a small sign standing
 * beside the planning table on the start quay, as the Voyage maps have no boatyard shed. One
 * button: open the Shipyard on her design. Worked like the yard's board; shown only near it.
 * In the career the yard's own board has the same button (ui/yardBoard.ts).
 */
export class ShipyardDoor {
  readonly menu: WristMenu;
  private readonly world = new THREE.Vector3();

  constructor(h: ShipyardDoorHost) {
    const d = CONFIG.voyage.shipyardSign;
    this.menu = new WristMenu(
      {
        header: [
          { label: '', buttons: [{ text: 'Shipyard', weight: 3 }] },
          { label: '', buttons: [{ text: 'Refit her, or design her anew', weight: 3 }] },
          { label: '', buttons: [{ text: () => h.shipyardStatus() || 'Open the Shipyard', active: () => !h.shipyardStatus(), press: () => h.openShipyard(), weight: 3 }] },
        ],
        pages: [],
      },
      d.width,
      { ray: d.reach, desktop: d.reach },
    );
  }

  /**
   * Once a frame: shown beside the table (`table`, its root: the sign goes with it when it
   * follows the host) while the viewer is within `range`.
   */
  update(table: THREE.Object3D, viewer: THREE.Vector3): void {
    const d = CONFIG.voyage.shipyardSign;
    table.getWorldPosition(this.world);
    const near = viewer.distanceTo(this.world) < d.range;
    // To the right of the table as you face it (the table's local +z is the reader's side).
    if (near && !this.menu.isOpen) this.menu.openFixed(table, CONFIG.voyage.plan.table.width / 2 + d.besideM, d.up, 0, 0);
    else if (!near && this.menu.isOpen) this.menu.close();
    this.menu.refresh();
  }
}
