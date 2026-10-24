import * as THREE from 'three';
import { CONFIG } from '../config';
import { planTableSpot } from '../voyage/planTable';
import { PORTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import type { MenuHost } from './mainMenu';
import { WristMenu } from './wristMenu';

/** A spot ashore for a sign: where it stands (its foot), and the way it faces (`farHeading`, as the planning table's: planTableSpot). */
export type SignSpot = { x: number; y: number; z: number; farHeading: number };

/** What the sign needs from the game. */
export type ShipyardDoorHost = Pick<MenuHost, 'shipyardStatus' | 'openShipyard'>;

/**
 * The way into the Shipyard (owner, Oct 2026; app/shipyardTrip.ts): a small sign on the quay.
 * One button: open the Shipyard on her design. Worked like the yard's board; shown only near
 * it. In Voyage it stands beside the planning table on the start quay (`update`), as the
 * Voyage maps have no boatyard shed. In the career one stands at every harbour (owner: "the
 * shipyard as a button which took you to the shipyard with your current boat ... should be in
 * career mode too", any harbour; `careerShipyardSpots`, `updateAt`); the yard's own board
 * keeps the same button (ui/yardBoard.ts).
 */
export class ShipyardDoor {
  readonly menu: WristMenu;
  private readonly world = new THREE.Vector3();

  constructor(h: ShipyardDoorHost, readonly at?: SignSpot) {
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

  /** Once a frame, the career's: standing on its own at `at` (its foot; the sign's face `up` above it) while the viewer is within `range`. */
  updateAt(scene: THREE.Object3D, viewer: THREE.Vector3): void {
    const at = this.at;
    if (!at) return;
    const d = CONFIG.voyage.shipyardSign;
    const near = viewer.distanceTo(this.world.set(at.x, at.y, at.z)) < d.range;
    if (near && !this.menu.isOpen) this.menu.openFixed(scene, at.x, at.y + d.up, at.z, -at.farHeading);
    else if (!near && this.menu.isOpen) this.menu.close();
    this.menu.refresh();
  }
}

/**
 * Where the career's signs stand: one at each harbour of the world, on the quay behind its
 * cargo berth (or its first), found as Voyage's planning table finds its spot (planTableSpot:
 * on level ground clear of the buildings, a little back from the water). A harbour with no
 * berth, or no room, gets none.
 */
export function careerShipyardSpots(): SignSpot[] {
  const berths = REGIONS.flatMap((r) => r.berths);
  const spots: SignSpot[] = [];
  for (const p of PORTS) {
    const own = berths.filter((b) => b.portId === p.id);
    const b = own.find((x) => x.id.endsWith('-cargo')) ?? own[0];
    const at = b ? planTableSpot(b.id) : null;
    if (at) spots.push(at);
  }
  return spots;
}
