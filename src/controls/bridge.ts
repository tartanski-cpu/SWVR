import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { EnvironmentState } from '../environment/environmentState';
import { Button } from './Button';
import type { Control } from './Control';
import type { AssembledView, PlacedLabel } from '../modular/assemble';
import { LABEL_OFFSET } from '../modular/module';
import type { RadioSet } from '../rescue/radioView';
import type { ChartPlotter } from '../nav/chartPlotter';
import type { ChartTableView } from '../vessel/view/chartTable';
import type { BoardView } from '../board/boardView';
import type { DutyBoardView } from '../duties/dutyBoardView';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { WheelhouseDoor } from './WheelhouseDoor';
import { MonitorView } from '../fire/monitorView';
import { hullPlan } from '../vessel/layout';
import { RainGlass } from '../vessel/view/rainGlass';
import { Cleat, FenderBasket, FendersView } from './deckGear';
import { swimLadderOf } from '../player/body';
import { aFrameOf } from '../fishing/fishing';

/**
 * Builds a vessel's bridge from its config: controls, instrument dash, labels.
 * Everything is in vessel axes and is added to the vessel's root, so it rides the boat.
 */
export class Bridge {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  /** Empty object at the centre of the instrument dash (for visibility checks; the console module's). */
  dashAnchor: THREE.Object3D = new THREE.Object3D();
  /** The VHF (a module; the app feeds it the rescue and tow calls), if she has one. */
  readonly radio: RadioSet | null;
  /** The chartplotter (a module; the app feeds it the world), if she has one. */
  readonly chart: ChartPlotter | null;
  /** The chart table (a module; the app works its pencil and dividers), if she has one. */
  readonly chartTable: ChartTableView | null;
  /** The crew whiteboard (a module; the app writes the notes on it), if she has one. */
  readonly whiteboard: BoardView | null;
  /** The duty board (a module; the app feeds it the game's tasks), if she has one. */
  readonly dutyBoard: DutyBoardView | null;
  /** The FM set (a module; the app plays its station near it), if the boat has one. */
  readonly fmSet: THREE.Object3D | null;
  /** Rain on the front windows and the wipers (the App feeds it the weather). */
  readonly rainGlass: RainGlass;
  /** The fire monitor on the roof (boats that have one). */
  private monitor: MonitorView | null = null;
  /** The tow winch's drum (it turns while the winch runs). */
  private readonly winchDrum = new THREE.Group();
  /** The winch drum's motion this frame (+1 heaving in, -1 paying out, 0 still); set by App. */
  drumTurn = 0;
  /** The aft door (its push buttons on the frame open / shut it). */
  readonly door: WheelhouseDoor;
  /** The fenders over the side or stowed (boats that carry them). */
  private readonly fenders: FendersView | null = null;

  /**
   * @param modules the boat's modules, already built from her recipe (modular boats): their
   *                controls join the bridge's, and their fixed parts are baked with the
   *                bridge's into its one merged mesh. Since M2 the throttle lever is one.
   */
  constructor(
    private readonly def: WorkboatDef,
    private readonly modules: AssembledView,
  ) {
    const b = def.bridge;
    this.root.name = 'bridge';
    for (const m of modules.modules) this.root.add(m.root);

    this.radio = modules.api<RadioSet>('radio.vhf');
    this.chart = modules.api<ChartPlotter>('nav.chartplotter');
    this.chartTable = modules.api<ChartTableView>('furniture.chart-table');
    this.whiteboard = modules.api<BoardView>('furniture.whiteboard');
    this.dutyBoard = modules.api<DutyBoardView>('furniture.duty-board');
    this.controls.push(...modules.controls);
    this.fmSet = modules.modules.find((m) => m.id === 'radio.fm')?.root ?? null;
    // The modules' engraved labels, drawn with the bridge's own.
    const extraLabels: Label[] = [...modules.labels];
    const extraFixed: THREE.BufferGeometry[] = [];
    // The fire monitor on the roof (its FIRE PUMP switch and joystick are modules on the console).
    if (def.fireMonitor) {
      this.monitor = new MonitorView(def.fireMonitor);
      this.root.add(this.monitor.root);
    }
    // Fishing: the trawl's by-hand buttons on the A-frame (the TRAWL switch is a module).
    if (def.fishing) {
      // By hand on the A-frame: PAY OUT / HAUL (hold-to-run) on a control box built onto
      // the starboard leg's inboard side at waist height, read from inboard facing the leg
      // (PAY OUT forward, HAUL aft).
      const af = aFrameOf(def);
      if (af) {
        const t = (af.buttonY - af.deck) / (af.top - af.deck);
        const legZ = af.footZ + (af.headZ - af.footZ) * t;
        const x0 = af.x - 0.06; // the leg's inboard face
        extraFixed.push(part(new THREE.BoxGeometry(0.32, 0.2, 0.4).translate(x0 - 0.16, af.buttonY - 0.1, legZ), 0xb8261a));
        extraFixed.push(part(new THREE.BoxGeometry(0.3, 0.012, 0.38).translate(x0 - 0.16, af.buttonY + 0.006, legZ), 0x3a4148));
        const bx = x0 - 0.21;
        const y = af.buttonY + 0.012;
        const out = new Button('netOut', 'netOut', 'Trawl net: PAY OUT (hold)', 'momentary', 0xe0a020);
        out.root.position.set(bx, y, legZ - 0.09);
        const haul = new Button('netIn', 'netIn', 'Trawl net: HAUL (hold)', 'momentary', 0x3a9a4a);
        haul.root.position.set(bx, y, legZ + 0.09);
        this.controls.push(out, haul);
        extraLabels.push(label('PAY OUT', [bx, y, legZ - 0.09], false, -Math.PI / 2), label('HAUL', [bx, y, legZ + 0.09], false, -Math.PI / 2));
      }
    }
    // The tow winch just forward of the transom (the line leads aft over the stern roller): a small drum (it turns while it runs)
    // between two cheeks, driven from a gearbox housing on its starboard end, with HEAVE IN /
    // PAY OUT (hold-to-run) on the housing's top. You stand forward of it facing aft: the
    // winch, the post and the tow beyond.
    const tw = def.towWinch;
    if (tw) {
      const plan = hullPlan(def);
      const dy = plan.deckY(tw.z);
      const r = tw.drumRadius;
      const hw = tw.drumWidth / 2;
      const axle = dy + 0.18 + r; // tow/tow.ts winchLeadLocal matches this
      const hs = tw.housing;
      const hx0 = hw + 0.095;
      const hx = hx0 + hs.width / 2;
      extraFixed.push(part(new THREE.BoxGeometry(tw.drumWidth + 0.2 + hs.width, 0.1, 0.5).translate(hs.width / 2, dy + 0.05, tw.z), 0x5a5f64)); // bed
      for (const s of [-1, 1]) extraFixed.push(part(new THREE.BoxGeometry(0.05, axle + 0.12 - dy, 0.34).translate(s * (hw + 0.07), (axle + 0.12 + dy) / 2, tw.z), 0x5a5f64));
      extraFixed.push(part(new THREE.BoxGeometry(hs.width, hs.height, 0.4).translate(hx, dy + hs.height / 2, tw.z), 0x5a5f64)); // gearbox housing
      extraFixed.push(part(new THREE.BoxGeometry(hs.width - 0.02, 0.012, 0.38).translate(hx, dy + hs.height + 0.006, tw.z), 0x3a4148)); // its control panel
      const drum = new THREE.Mesh(
        mergeParts([
          part(new THREE.CylinderGeometry(r, r, tw.drumWidth, 14).rotateZ(Math.PI / 2), 0x2a2a2a), // wire wound on it
          ...[-1, 1].map((s) => part(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.035, 14).rotateZ(Math.PI / 2).translate(s * hw, 0, 0), 0xb8261a)),
          part(new THREE.BoxGeometry(tw.drumWidth, 0.03, 0.03).translate(0, r, 0), 0xd8d8d0), // a stripe: you see it turn
        ]),
        flatVertexColorMaterial(),
      );
      drum.name = 'towWinchDrum';
      this.winchDrum.position.set(0, axle, tw.z);
      this.winchDrum.add(drum);
      this.root.add(this.winchDrum);
      // Facing aft, HEAVE IN is on your left (outboard), PAY OUT on your right.
      const top = dy + hs.height + 0.012;
      const heave = new Button('winchHeave', 'winchHeave', 'Tow winch: HEAVE IN (hold)', 'momentary', 0x3a9a4a);
      heave.root.position.set(hx + 0.095, top, tw.z + 0.06);
      const payOut = new Button('winchPayOut', 'winchPayOut', 'Tow winch: PAY OUT (hold)', 'momentary', 0xe0a020);
      payOut.root.position.set(hx - 0.095, top, tw.z + 0.06);
      this.controls.push(heave, payOut);
      // Read facing aft: the labels lie forward of the buttons, toward you.
      extraLabels.push(label('HEAVE IN', [hx + 0.095, top, tw.z + 0.06], false, Math.PI), label('PAY OUT', [hx - 0.095, top, tw.z + 0.06], false, Math.PI));
    }
    // The skiff crane's console button belongs to the crane (controls/TenderCraneView.ts);
    // its label goes with the others.
    if (def.tenderCrane) extraLabels.push(label('SKIFF CRANE', b.craneButton));
    const wh = def.layout.wheelhouse;
    this.door = new WheelhouseDoor(wh.doorWidth, wh.doorHeight);
    this.door.root.position.set(0, wh.floorY, wh.aft + 0.03);
    this.root.add(this.door.root);
    // Its push buttons on the door post, inside and out, are modules (control.door-button).
    this.rainGlass = new RainGlass(def);
    this.root.add(this.rainGlass.root);
    // Mooring cleats on the bulwark tops, forward and aft each side (they replace the DOCK
    // button): port forward, starboard forward, port aft, starboard aft.
    {
      const plan = hullPlan(def);
      const mo = def.mooring;
      [mo.cleatFwdZ, mo.cleatFwdZ, mo.cleatAftZ, mo.cleatAftZ].forEach((z, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const cleat = new Cleat(i);
        cleat.root.position.set(side * (plan.halfBeam(z) - 0.03), plan.deckY(z) + def.layout.bulwarkHeight, z);
        this.controls.push(cleat);
      });
    }
    // Fenders: the basket on the aft deck, and the six fenders themselves.
    if (def.fenders) {
      const plan = hullPlan(def);
      const basket = new FenderBasket();
      const [fx, fz] = def.fenders.basket;
      basket.root.position.set(fx, plan.deckY(fz), fz);
      this.controls.push(basket);
      this.fenders = new FendersView(def.fenders.z, plan);
      this.root.add(this.fenders.mesh);
    }
    // Swim ladder over the starboard side: two stainless rails hooked over the bulwark top,
    // down past the waterline, with flat treads (see player/body.ts climbOut).
    if (def.swimLadder) {
      const lad = swimLadderOf({ plan: hullPlan(def), state: { defId: def.id } as VesselState })!;
      const steel = 0xc8ccd0;
      const len = lad.top - lad.bottom;
      for (const dz of [-lad.width / 2, lad.width / 2]) {
        extraFixed.push(part(new THREE.CylinderGeometry(0.016, 0.016, len, 6).translate(lad.x, lad.bottom + len / 2, lad.z + dz), steel));
        // The hook over the bulwark top, back to the deck side.
        extraFixed.push(part(new THREE.BoxGeometry(lad.x - lad.deckX - 0.45, 0.03, 0.03).translate((lad.x + lad.deckX + 0.45) / 2, lad.top + 0.02, lad.z + dz), steel));
      }
      for (let y = lad.bottom + 0.15; y < lad.top - 0.1; y += 0.3) {
        extraFixed.push(part(new THREE.BoxGeometry(0.08, 0.025, lad.width).translate(lad.x + 0.02, y, lad.z), 0x9aa0a6));
      }
    }
    // The engine, under the hatch in the wheelhouse floor (aft starboard): open the hatch to
    // see it. The hatch cover, the dipstick and the oil can are modules (M3c); the engine's
    // look and the can's shelf stay here until the engine is a module (M4).
    const mt = def.maintenance;
    const eh = def.layout.engineHatch;
    if (mt && eh) {
      const fy = def.layout.wheelhouse.floorY;
      const box = (ax: number, bx: number, ay: number, by: number, az: number, bz: number, col: number) =>
        part(new THREE.BoxGeometry(bx - ax, by - ay, bz - az).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), col);
      const e = mt.engine;
      const top = fy - 0.12; // the rocker cover's top, just under the floor
      const x0 = e.x - e.width / 2;
      const x1 = e.x + e.width / 2;
      const z0 = e.z - e.length / 2;
      const z1 = e.z + e.length / 2;
      const base = top - e.height;
      const GREEN = 0x2f6b4a; // engine paint
      // Bearers, sump, block, head, rocker cover.
      for (const bx of [x0 + 0.04, x1 - 0.04]) extraFixed.push(box(bx - 0.03, bx + 0.03, fy - eh.pitDepth, base + 0.05, z0 - 0.08, z1 + 0.08, 0x3a3f44));
      extraFixed.push(box(x0 + 0.05, x1 - 0.05, base, base + 0.12, z0 + 0.04, z1 - 0.04, 0x2a2e32));
      extraFixed.push(box(x0, x1, base + 0.12, top - 0.16, z0, z1, GREEN));
      extraFixed.push(box(x0 + 0.03, x1 - 0.03, top - 0.16, top - 0.07, z0 + 0.02, z1 - 0.02, GREEN));
      extraFixed.push(box(x0 + 0.06, x1 - 0.06, top - 0.07, top, z0 + 0.06, z1 - 0.06, 0x3f8a5f)); // rocker cover
      // The air filter on the forward end of the cover, and the fuel filter on the inboard side.
      extraFixed.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14).translate(e.x, top - 0.035, z0 + 0.03), 0x2a2e32));
      extraFixed.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10).translate(x0 - 0.035, top - 0.22, z1 - 0.15), 0xd8d8d0));
      // Exhaust manifold along the outboard side, the riser going aft; the alternator and
      // belt on the forward end; the flywheel housing aft.
      extraFixed.push(box(x1, x1 + 0.06, top - 0.2, top - 0.12, z0 + 0.06, z1 - 0.06, 0x6a5a4a));
      extraFixed.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10).translate(x1 + 0.03, top - 0.32, z1 + 0.02), 0x6a5a4a));
      extraFixed.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12).rotateZ(Math.PI / 2).translate(x0 + 0.05, top - 0.24, z0 - 0.05), 0xb0b4b8));
      extraFixed.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14).rotateX(Math.PI / 2).translate(e.x, base + 0.24, z0 - 0.015), 0x2a2e32));
      extraFixed.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16).rotateX(Math.PI / 2).translate(e.x, base + 0.22, z1 + 0.04), 0x2a2e32));
      // The oil filler cap on the rocker cover (yellow, like the dipstick ring).
      extraFixed.push(part(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12).translate(mt.filler[0], top + 0.015, mt.filler[1]), 0xe8c020));
      // The oil can's shelf on the engine space's outboard wall.
      const shelfY = fy - mt.shelfDrop;
      extraFixed.push(box(mt.oilCan[0] - 0.09, eh.x1, shelfY - 0.02, shelfY, mt.oilCan[1] - 0.1, mt.oilCan[1] + 0.1, 0x8a9096));
    }
    for (const c of this.controls) if (!c.root.parent) this.root.add(c.root);

    // The console, the overhead panel, the breaker panel and what's on them are modules now
    // (src/modules/): their fixed parts are baked in here with the bridge's, their screens
    // are one mesh, their switch bats and button caps are shared instanced meshes, and
    // their labels go with the bridge's.
    this.dashAnchor = this.root.getObjectByName('dashAnchor') ?? this.dashAnchor;
    this.root.add(bakeFixedParts(this.root, [...extraFixed, ...modules.staticParts]), buildLabels(extraLabels));
    if (modules.screens) this.root.add(modules.screens);
    for (const m of modules.shared) this.root.add(m);
  }

  /** What only this machine knows, for the modules' views ('fm.status': the FM player's). */
  setLocal(name: string, value: string): void {
    this.modules.setLocal(name, value);
  }

  /** How many parts each shared instanced mesh draws ('toggleBat': 18; debug overlay). */
  get sharedCounts(): Record<string, number> {
    return this.modules.sharedCounts;
  }

  /** The mounted modules, as "socket: module id" (debug overlay). */
  get moduleList(): string[] {
    return this.modules.modules.map((m) => `${m.path}: ${m.id}`);
  }

  /**
   * Visuals from authoritative state (controls skip this while locally held).
   * @param displaysInView false when nobody can see the dash: the instrument canvas then
   *                       skips its redraw and texture upload (the costly part on Quest).
   */
  update(state: VesselState, dt: number, displaysInView = true, env: EnvironmentState | null = null): void {
    for (const c of this.controls) {
      c.sync(state);
      c.tick(dt);
    }
    this.modules.update(state, dt, { inView: displaysInView, def: this.def, env });
    this.door.sync(state);
    this.fenders?.update(state);
    // The winch drum turns only while it really runs (hydraulic pressure, and line or net
    // actually coming in or going out): App sets `drumTurn` each frame (+1 in, -1 out, 0 still).
    if (this.drumTurn) this.winchDrum.rotation.x += this.drumTurn * 2.5 * dt;
    this.monitor?.update(state);
  }
}

/**
 * Bake every control part marked `fixed` (bases, housings, plates) plus `extra` parts into
 * one vertex-coloured mesh: one draw call instead of one per part. The original meshes are
 * hidden but kept, so the pointer ray (which ignores visibility) still hits them.
 */
function bakeFixedParts(root: THREE.Object3D, extra: THREE.BufferGeometry[]): THREE.Mesh {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const parts = [...extra];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.fixed) return;
    const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld.clone().premultiply(toRoot));
    parts.push(part(geo, (o.material as THREE.MeshLambertMaterial).color.getHex()));
    o.visible = false;
  });
  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'bridgeFixed';
  return mesh;
}

/** An engraved label (modular/module.ts, EngravedLabel), in vessel axes. */
type Label = PlacedLabel;

/**
 * A label: its text, the control it names (it lies just aft of it), dark-on-light (a group
 * title), and its yaw (rad; default 0: read facing forward. It is turned, and moved round
 * the control, to be read facing another way - PI: facing aft).
 */
function label(text: string, at: [number, number, number], title = false, yaw = 0): Label {
  return { text, at, title, yaw };
}

/** The labels size their letters by their height; this many pixels high in the texture. */
const SLOT_W = 512;
const SLOT_H = 64;
/** The usual label (m): on a console top. */
const LABEL_SIZE = [0.16, 0.02] as const;

/**
 * Every small engraved label on the bridge, in one mesh (one draw call). Each has a slot in
 * the texture, its text centred; a label narrower for its height than the usual one uses
 * only the middle of its slot, so the letters keep the same size for the label's height.
 */
function buildLabels(labels: Label[]): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = SLOT_W;
  canvas.height = SLOT_H * labels.length;
  const g = canvas.getContext('2d')!;
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  labels.forEach(({ text, title }, i) => {
    g.fillStyle = title ? '#101418' : '#e8e2cc';
    g.fillText(text, SLOT_W / 2, SLOT_H * i + SLOT_H / 2);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const planes = labels.map(({ at: pos, yaw, size = LABEL_SIZE, offset = LABEL_OFFSET, underside }, i) => {
    const [w, h] = size;
    const plane = new THREE.PlaneGeometry(w, h);
    // The middle `across` of its slot: as wide (in pixels) as the label is for its height.
    const across = Math.min(1, ((w / h) * SLOT_H) / SLOT_W);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      const v0 = 1 - (i + 1) / labels.length;
      uv.setXY(k, 0.5 - across / 2 + uv.getX(k) * across, v0 + uv.getY(k) / labels.length);
    }
    // Lying on top of a panel, read from above; or under one, read from below.
    plane.rotateX(underside ? Math.PI / 2 : -Math.PI / 2).rotateY(yaw);
    plane.translate(pos[0] + Math.sin(yaw) * offset, pos[1] + (underside ? -0.002 : 0.002), pos[2] + Math.cos(yaw) * offset);
    return plane;
  });
  const mesh = new THREE.Mesh(mergeGeometries(planes), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.name = 'bridgeLabels';
  return mesh;
}
