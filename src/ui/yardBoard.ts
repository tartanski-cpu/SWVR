import * as THREE from 'three';
import { CONFIG } from '../config';
import { standingHeight } from '../world/geography';
import { groundHeight } from '../world/terrain';
import { money } from '../career/career';
import type { MenuHost } from './mainMenu';
import { PORTS } from '../world/archipelago';
import type { MenuRow } from './menuPanel';
import { WristMenu } from './wristMenu';

/** What the board needs from the game (the career's side of the menu host). */
export type YardHost = Pick<MenuHost, 'balance' | 'upgradeStatus' | 'buyUpgrade' | 'repairText' | 'repairStatus' | 'repair' | 'shipyardStatus' | 'openShipyard'>;

/**
 * The boatyard's board (owner, Oct 2026: the chandlery taken out of the O menu, into the
 * world): a big menu panel on the front of the boatyard shed at Calder Haven (CONFIG.boatyard),
 * worked like the menu: VR, point and pull the trigger (or touch it); desktop, aim and click.
 * Drawn only while you're within `range` of it. Three tabs:
 *   Add-ons   her equipment (CONFIG.career.upgrades with `fit`: the trawl gear, the skiff,
 *             the searchlight, the fire monitor); fitted, the game starts again with her refitted
 *   Upgrades  to what she has (radar, AIS, the bigger tank, the towing post, ...)
 *   Repairs   the hull and the engine
 * Buying and repairs want her in Calder Haven (career.ts buyBlocker, repairBlocker).
 */
export type BoatyardDef = (typeof CONFIG.boatyards)[number];

export class YardBoard {
  readonly menu: WristMenu;
  private readonly pos = new THREE.Vector3();
  private readonly yaw: number;

  /** @param yard which boatyard (CONFIG.boatyards); what it sells and charges is its port's `economy` */
  constructor(h: YardHost, readonly yard: BoatyardDef = CONFIG.boatyards[0]) {
    const port = PORTS.find((p) => p.id === yard.port);
    const sells = port?.economy?.sells;
    // This yard's list (PortDef.economy.sells; none listed: everything).
    const ups = CONFIG.career.upgrades.map((u, i) => ({ u, i })).filter(({ u }) => !sells || sells.includes(u.id));
    const portName = port?.name.replace(' (anchorage)', '') ?? yard.port;
    // Each item on two lines, big enough to read from a step back: its name and price with
    // Buy (or why not), then what it does.
    const item = (i: number): MenuRow[] => {
      const u = CONFIG.career.upgrades[i];
      return [
        {
          label: '',
          buttons: [
            { text: `${u.name}  ·  ${money(u.price)}`, weight: 2.2 },
            { text: () => h.upgradeStatus(i) || 'Buy', active: () => !h.upgradeStatus(i), press: () => h.buyUpgrade(i), weight: 1.3 },
          ],
        },
        { label: '', buttons: [{ text: u.desc, weight: 3.5 }] },
      ];
    };
    const repairs: MenuRow[] = [0, 1].map((i) => ({
      label: '',
      buttons: [
        { text: () => h.repairText(i), weight: 3 },
        { text: () => h.repairStatus(i) || (i === 0 ? 'Repair' : 'Overhaul'), active: () => !h.repairStatus(i), press: () => h.repair(i) },
      ],
    }));
    const header: MenuRow[] = [
      { label: '', buttons: [{ text: yard.name, weight: 2 }, { text: () => h.balance(), weight: 2 }] },
      // Into the Shipyard itself, on her design, to refit her (app/shipyardTrip.ts).
      { label: '', buttons: [{ text: () => h.shipyardStatus() || 'Open the Shipyard: refit her', active: () => !h.shipyardStatus(), press: () => h.openShipyard(), weight: 4 }] },
    ];
    this.menu = new WristMenu(
      {
        header,
        pages: [
          {
            name: 'Boatyard',
            sections: [
              { name: 'Add-ons', rows: [{ heading: 'Fitting one restarts the game' }, ...ups.filter(({ u }) => u.fit).flatMap(({ i }) => item(i))] },
              { name: 'Upgrades', rows: [{ heading: 'For the gear she has' }, ...ups.filter(({ u }) => !u.fit).flatMap(({ i }) => item(i))] },
              { name: 'Repairs', rows: [{ heading: port?.economy?.repairs === false ? 'No repairs here' : `With her in ${portName}` }, ...repairs] },
            ],
          },
        ],
      },
      yard.board.width,
      { ray: yard.board.reach, desktop: yard.board.reach },
    );
    const b = yard.board;
    this.pos.set(b.x, Math.max(standingHeight(b.x, b.z), groundHeight(b.x, b.z)) + b.up, b.z);
    // Facing that compass bearing: the panel's front (+z) turned to (sin f, -cos f).
    this.yaw = Math.PI - (b.facingDeg * Math.PI) / 180;
  }

  /** Once a frame: shown (and redrawn as things change) while the viewer is near it. */
  update(scene: THREE.Object3D, viewer: THREE.Vector3): void {
    const near = viewer.distanceTo(this.pos) < this.yard.board.range;
    if (near && !this.menu.isOpen) this.menu.openFixed(scene, this.pos.x, this.pos.y, this.pos.z, this.yaw);
    else if (!near && this.menu.isOpen) this.menu.close();
    this.menu.refresh();
  }
}
