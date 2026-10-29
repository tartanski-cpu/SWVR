import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { cargoBerth } from '../cargo/cargo';
import { boatAtPort, capacityOf, hasCrane, orderBlocker, ORDER_WHAT, roomFor, terminalSpot, waitingHere, type OrderWhat } from '../cargo/order';
import { potsOwned } from '../potting/potting';
import { linesInPlay } from '../fishing/longline';
import { farmLine } from '../aqua/farmService';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';
import type { MenuButton, MenuRow } from './menuPanel';
import { WristMenu } from './wristMenu';

/** What the screen shows of the harbour it's at (CargoTerminal.facts). */
interface Facts {
  port: PortDef;
  boat: VesselState | null;
  room: Record<OrderWhat, number>;
  blocker: Record<OrderWhat, string | null>;
  waiting: Record<OrderWhat, number>;
  crane: boolean;
  pots: number;
  /** Longlines in play (tubs, shooting, in the water: fishing/longline.ts). */
  lines: number;
}

/** What the cargo screen needs from the game. */
export interface CargoTerminalHost {
  world(): WorldState;
  /** Your boat (the screen speaks of her if she's lying at its harbour). */
  ownBoatId(): string;
  /** A boat's name for the screen. */
  boatName(v: VesselState): string;
  /** An order to the host (cargo/order.ts applyOrderIntent): targetId the boat lying there (or yours). */
  send(control: string, targetId: string, value: number, port: string, args?: number[]): void;
  notify(text: string): void;
}

/**
 * The cargo screen (owner, 29 Oct 2026: "another set of buttons or mini screen, which allows you
 * to spawn cargo and lobster pots. So you walk up to it and ... it tells you how many slots of
 * cargo your ship has, which is docked at it. And it allows you to spawn individually or the
 * maximum amount, and the same with lobster pots"; cargo/order.ts).
 *
 * One stands at every harbour, on a post at the near end of its goods row, facing the water
 * (cargo/order.ts terminalSpot). From afar it's a small lit CARGO sign; within `range` its
 * screen lights up, worked like the boatyard's board (VR: point and pull the trigger; desktop:
 * aim and click). It shows:
 *
 *   her        the boat lying at this harbour (yours if she's here): her payload and slots free
 *   crates     room for how many more; Order 1, Full load
 *   crane      the same, for crane lifts on the quay edge (a harbour with a cargo quay; she needs a deck crane)
 *   pots       the same for lobster pots (and how many of yours are out)
 *   waiting    what's ordered and still on the quay; Send back
 *
 * One menu and one post for them all, moved to the harbour you're nearest: only one is ever
 * near enough to use, and the rest cost nothing.
 */
export class CargoTerminal {
  readonly menu: WristMenu;
  /** The post, the housing behind the screen and the lit CARGO sign over it. */
  private readonly post: THREE.Group;
  private readonly spots: { port: PortDef; x: number; y: number; z: number; yaw: number }[] = [];
  private at: (typeof this.spots)[number] | null = null;
  private readonly here = new THREE.Vector3();

  constructor(private readonly h: CargoTerminalHost) {
    for (const port of PORTS) {
      const s = terminalSpot(port);
      if (s) this.spots.push({ port, x: s.x, y: s.y, z: s.z, yaw: Math.atan2(s.face[0], s.face[1]) });
    }
    const t = CONFIG.cargo.terminal;
    this.menu = new WristMenu({ header: this.rows(), pages: [] }, t.width, { ray: t.reach, desktop: t.reach });
    this.post = this.makePost(this.menu.panel.height);
  }

  /**
   * What the screen shows, worked out at most every `refreshS` (her room is a dry run of
   * loading: too much to do every frame) and again straight after a press.
   */
  private facts(): Facts | null {
    const p = this.at?.port;
    if (!p) return null;
    const now = performance.now();
    if (this.known && this.known.port === p && now - this.knownAt < CONFIG.cargo.terminal.refreshS * 1000) return this.known;
    const world = this.h.world();
    const boat = boatAtPort(world, p, this.h.ownBoatId());
    const per = <T,>(f: (w: OrderWhat) => T) => Object.fromEntries(ORDER_WHAT.map((w) => [w, f(w)])) as Record<OrderWhat, T>;
    this.known = {
      port: p,
      boat,
      room: per((w) => (boat ? roomFor(world, boat, p, w) : 0)),
      blocker: per((w) => orderBlocker(world, p, w)),
      waiting: per((w) => waitingHere(world, p, w).length),
      crane: !!boat && hasCrane(boat),
      pots: potsOwned(world),
      lines: linesInPlay(world),
    };
    this.knownAt = now;
    return this.known;
  }
  private known: Facts | null = null;
  private knownAt = 0;

  /** The screen's rows, reading the harbour it's at as it's drawn. */
  private rows(): MenuRow[] {
    const sortRow = (what: OrderWhat, name: string): MenuRow => {
      const blocker = () => {
        const f = this.facts();
        return f ? f.blocker[what] : 'No harbour';
      };
      const fillBlocker = () => {
        const f = this.facts();
        if (!f) return 'No harbour';
        if (f.blocker[what]) return f.blocker[what];
        if (!f.boat) return 'No boat here';
        if (what === 'crane' && !f.crane) return 'No crane aboard';
        return f.room[what] === 0 ? 'She’s full' : null;
      };
      const button = (text: string, why: () => string | null, press: () => void): MenuButton => ({
        text: () => why() ?? text,
        active: () => !why(),
        press: () => {
          const w = why();
          if (w) this.h.notify(w);
          else press();
        },
        weight: 1.2,
      });
      return {
        label: '',
        buttons: [
          { text: name, weight: 1.3 },
          { text: () => this.roomText(what), weight: 1.8 },
          button('Order 1', blocker, () => this.order(what, 1)),
          button('Full load', fillBlocker, () => this.order(what, 0)),
        ],
      };
    };
    return [
      { label: '', buttons: [{ text: () => `CARGO  ·  ${this.at?.port.name.replace(' (anchorage)', '') ?? ''}`, weight: 3 }] },
      { label: '', buttons: [{ text: () => this.boatText(), weight: 3 }] },
      // A fish farm's line (aqua/farmService.ts): its silo and calls at its barge; a call this harbour can serve elsewhere.
      { label: '', buttons: [{ text: () => (this.at ? farmLine(this.h.world(), this.at.port) : '') || 'No fish farm is calling', weight: 3 }] },
      sortRow('crates', 'Crates'),
      sortRow('crane', 'Crane lifts'),
      sortRow('pots', 'Lobster pots'),
      sortRow('tubs', 'Line tubs'),
      {
        label: '',
        buttons: [
          { text: () => this.waitingText(), weight: 3 },
          {
            text: 'Send back',
            active: () => this.waitingCount() > 0,
            press: () => {
              const p = this.at?.port;
              if (!p || !this.waitingCount()) return this.h.notify('Nothing waiting on this quay');
              this.h.send('cargoOrderReturn', this.h.ownBoatId(), 1, p.id);
              this.h.notify('The goods waiting here are sent back');
              this.knownAt = 0;
            },
            weight: 1.2,
          },
        ],
      },
    ];
  }

  /** The boat line: who's lying here and what she has free. */
  private boatText(): string {
    const v = this.facts()?.boat;
    if (!v) return 'No boat here: bring her alongside the cargo berth (or anchor in the bay)';
    const c = capacityOf(this.h.world(), v);
    const kg = `${Math.round(c.kgFree).toLocaleString('en-GB')} of ${c.kg.toLocaleString('en-GB')} kg free`;
    const slots = Number.isFinite(c.slots) ? `${c.slotsFree} of ${c.slots} slots free` : 'no slot limit';
    return `${this.h.boatName(v)}:  ${kg}  ·  ${slots}`;
  }

  /** A sort's room on her, or why there's none. */
  private roomText(what: OrderWhat): string {
    const f = this.facts();
    if (!f) return '';
    if (what === 'crane' && !cargoBerth(f.port)) return 'no cargo quay here';
    const yours = what === 'pots' ? `${f.pots} of ${CONFIG.potting.pots} yours` : what === 'tubs' ? `${f.lines} of ${CONFIG.longline.maxLines} lines out` : '';
    if (!f.boat) return yours || 'no boat to fill';
    if (what === 'crane' && !f.crane) return 'she has no deck crane';
    const n = f.room[what];
    const more = what !== 'pots' && what !== 'tubs' && n >= CONFIG.cargo.terminal.countTo ? `${n}+` : `${n}`;
    return `room for ${more} more${yours ? `  (${yours})` : ''}`;
  }

  private waitingCount(): number {
    const f = this.facts();
    return f ? f.waiting.crates + f.waiting.crane + f.waiting.pots + f.waiting.tubs : 0;
  }

  private waitingText(): string {
    const f = this.facts();
    if (!f) return '';
    const { crates, crane, pots, tubs } = f.waiting;
    if (!crates && !crane && !pots && !tubs) return 'Nothing waiting on the quay';
    const parts = [crates && `${crates} crate${crates > 1 ? 's' : ''}`, crane && `${crane} crane lift${crane > 1 ? 's' : ''}`, pots && `${pots} pot${pots > 1 ? 's' : ''}`, tubs && `${tubs} line tub${tubs > 1 ? 's' : ''}`].filter(Boolean);
    return `On the quay: ${parts.join(', ')}`;
  }

  private order(what: OrderWhat, n: number): void {
    const f = this.facts();
    if (!f) return;
    this.h.send('cargoOrder', f.boat?.id ?? this.h.ownBoatId(), n, f.port.id, [ORDER_WHAT.indexOf(what)]);
    const name = what === 'crates' ? 'crate' : what === 'crane' ? 'crane lift' : what === 'tubs' ? 'line tub' : 'pot';
    const where = what === 'crane' ? ' edge: lift it aboard with her crane' : ', by this screen';
    this.h.notify(n === 1 ? `A ${name} on the quay${where}` : `A full load of ${name}s on the quay${where}`);
    // Read afresh once the host has made them.
    this.knownAt = 0;
  }

  /** The post, its housing behind the screen and the lit CARGO sign on the housing's top. */
  private makePost(panelH: number): THREE.Group {
    const t = CONFIG.cargo.terminal;
    const g = new THREE.Group();
    g.name = 'cargoTerminal';
    const w = t.width + 0.08;
    const h = panelH + 0.08;
    const base = t.up - panelH / 2;
    const metal = mergeGeometries([
      // The post, from the ground to the housing's foot, and a foot plate.
      new THREE.BoxGeometry(0.12, base, 0.12).translate(0, base / 2, -0.06),
      new THREE.BoxGeometry(0.4, 0.04, 0.3).translate(0, 0.02, -0.06),
      // The housing behind the screen.
      new THREE.BoxGeometry(w, h, 0.07).translate(0, t.up, -0.045),
      // A little hood over it.
      new THREE.BoxGeometry(w + 0.04, 0.03, 0.16).translate(0, t.up + h / 2 + 0.015, -0.01),
    ]);
    g.add(new THREE.Mesh(metal, new THREE.MeshLambertMaterial({ color: t.post })));
    // The sign along the hood's front (lit: readable from across the quay at night).
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const x = c.getContext('2d')!;
    x.fillStyle = '#14242c';
    x.fillRect(0, 0, 256, 48);
    x.fillStyle = '#ffc46b';
    x.font = 'bold 34px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('CARGO', 128, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.094), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(0, t.up + h / 2 + 0.08, 0.0);
    // Its back, so it isn't a hole seen from behind.
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.002;
    g.add(sign, back);
    g.visible = false;
    return g;
  }

  /**
   * Once a frame: the post at the nearest harbour's spot within `drawRange` of the viewer; the
   * screen open while the viewer's within `range` of it.
   */
  update(scene: THREE.Object3D, viewer: THREE.Vector3): void {
    const t = CONFIG.cargo.terminal;
    let best: (typeof this.spots)[number] | null = null;
    let bd = t.drawRange;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - viewer.x, s.z - viewer.z);
      if (d < bd) [best, bd] = [s, d];
    }
    if (best !== this.at) {
      if (this.menu.isOpen) this.menu.close();
      this.at = best;
      if (best) {
        if (!this.post.parent) scene.add(this.post);
        this.post.position.set(best.x, best.y, best.z);
        this.post.rotation.set(0, best.yaw, 0);
        this.post.updateMatrixWorld(true);
      }
      this.post.visible = !!best;
    }
    const s = this.at;
    const near = !!s && viewer.distanceTo(this.here.set(s.x, s.y + t.up, s.z)) < t.range;
    if (near && !this.menu.isOpen) this.menu.openFixed(scene, s.x, s.y + t.up, s.z, s.yaw);
    else if (!near && this.menu.isOpen) this.menu.close();
    this.menu.refresh();
  }
}
