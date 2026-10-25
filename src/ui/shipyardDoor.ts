import * as THREE from 'three';
import { CONFIG } from '../config';
import { planTableSpot } from '../voyage/planTable';
import { PORTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import { PER_PAGE } from '../shipyard/takeHer';
import type { MainMenu, MenuHost } from './mainMenu';
import type { MenuRow } from './menuPanel';
import { WristMenu } from './wristMenu';

/** A spot ashore for a sign: where it stands (its foot), and the way it faces (`farHeading`, as the planning table's: planTableSpot). */
export type SignSpot = { x: number; y: number; z: number; farHeading: number };

/** What the sign needs from the game. */
export type ShipyardDoorHost = Pick<MenuHost, 'shipyardStatus' | 'openShipyard'>;
/** What the boats board needs: the menu's Office > Your boats. */
export type BoatsBoardHost = Pick<MenuHost, 'shipyardCodes' | 'takeDesign' | 'takeLabel' | 'boatNow'>;

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

  /**
   * @param at     the career's: where it stands on its own (updateAt); Voyage's stands by the table (update)
   * @param side   how far to the right of that spot, or of the table's side, it stands (m; − to the left)
   */
  constructor(
    spec: MainMenu,
    width: number,
    readonly at?: SignSpot,
    private readonly side = 0,
  ) {
    const d = CONFIG.voyage.shipyardSign;
    this.menu = new WristMenu(spec, width, { ray: d.reach, desktop: d.reach });
  }

  /** The Shipyard sign: one button into the Shipyard on her design. */
  static shipyard(h: ShipyardDoorHost, at?: SignSpot): ShipyardDoor {
    return new ShipyardDoor(
      {
        header: [
          { label: '', buttons: [{ text: 'Shipyard', weight: 3 }] },
          { label: '', buttons: [{ text: 'Refit her, or design her anew', weight: 3 }] },
          { label: '', buttons: [{ text: () => h.shipyardStatus() || 'Open the Shipyard', active: () => !h.shipyardStatus(), press: () => h.openShipyard(), weight: 3 }] },
        ],
        pages: [],
      },
      CONFIG.voyage.shipyardSign.width,
      at,
    );
  }

  /**
   * Your boats (owner, Oct 2026: "the favourites screen as an interactive board on the quay
   * side"): the Shipyard favourites saved in this browser, a page at a time, each with the
   * menu's button to take her out (Office > Your boats: a sea trial, or buy her at a yard, in
   * the career; the game starts again in her). Stands to the left of the Shipyard sign.
   */
  static boats(h: BoatsBoardHost, at?: SignSpot): ShipyardDoor {
    const b = CONFIG.voyage.boatsBoard;
    return new ShipyardDoor(
      { header: boatsBoardRows(h), pages: [] },
      b.width,
      at,
      -(b.besideM + (b.width + CONFIG.voyage.shipyardSign.width) / 2),
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
    // To the right of the table as you face it (the table's local +z is the reader's side), or
    // to the left (`side` < 0: the boats board, on the table's other side).
    const x = CONFIG.voyage.plan.table.width / 2 + d.besideM;
    if (near && !this.menu.isOpen) this.menu.openFixed(table, this.side < 0 ? -x : x, d.up, 0, 0);
    else if (!near && this.menu.isOpen) this.menu.close();
    this.menu.refresh();
  }

  /** Once a frame, the career's: standing on its own at `at` (its foot; the sign's face `up` above it) while the viewer is within `range`. */
  updateAt(scene: THREE.Object3D, viewer: THREE.Vector3): void {
    const at = this.at;
    if (!at) return;
    const d = CONFIG.voyage.shipyardSign;
    const near = viewer.distanceTo(this.world.set(at.x, at.y, at.z)) < d.range;
    // `side` along the sign's own right (its local +x, turned by its yaw −farHeading).
    const rx = Math.cos(at.farHeading) * this.side;
    const rz = Math.sin(at.farHeading) * this.side;
    if (near && !this.menu.isOpen) this.menu.openFixed(scene, at.x + rx, at.y + d.up, at.z + rz, -at.farHeading);
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

/** The Your boats board's rows (ShipyardDoor.boats): a heading, the boat you're in, a page of favourites, the page arrows. */
export function boatsBoardRows(h: BoatsBoardHost): MenuRow[] {
  const c = () => h.shipyardCodes();
  return [
    { label: '', buttons: [{ text: 'Your boats', weight: 3 }] },
    { label: '', buttons: [{ text: () => `Now: ${h.boatNow()}`, weight: 3 }] },
    ...Array.from({ length: PER_PAGE }, (_, i): MenuRow => ({
      label: '',
      buttons: [
        { text: () => c().favouriteAt(i)?.name ?? (i === 0 ? 'None saved: in the Shipyard, or Menu > Boat > Save her' : ''), weight: 2.2 },
        { text: () => (c().favouriteAt(i) ? h.takeLabel(c().favouriteAt(i)!.code) : ''), press: () => c().favouriteAt(i) && h.takeDesign(c().favouriteAt(i)!.code), weight: 1.4 },
      ],
    })),
    {
      label: '',
      buttons: [
        { text: '◀', press: () => c().turn(-1) },
        { text: () => `Page ${c().page + 1} of ${c().pages()}`, weight: 2 },
        { text: '▶', press: () => c().turn(1) },
      ],
    },
  ];
}
