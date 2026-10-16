import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { EnvironmentState } from '../environment/environmentState';
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
import { RainGlass } from '../vessel/view/rainGlass';

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
  /** The aft door (its push buttons on the frame open / shut it). */
  readonly door: WheelhouseDoor;
  /** The port side door (boats whose wheelhouse has one). */
  readonly sideDoor: WheelhouseDoor | null = null;

  /**
   * @param modules the boat's modules, already built from her recipe (modular boats): their
   *                controls join the bridge's, and their fixed parts are baked with the
   *                bridge's into its one merged mesh. Since M2 the throttle lever is one.
   */
  constructor(
    private readonly def: WorkboatDef,
    private readonly modules: AssembledView,
  ) {
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
    // The deck gear (the tow winch, the stern roller, the A-frame and the trawl, the tender
    // crane, the anchor windlass) are modules since M5a, and the roof's (the searchlight,
    // the fire monitor with its console gauge, the mast) since M5b, drawn with the others
    // above.
    const wh = def.layout.wheelhouse;
    this.door = new WheelhouseDoor(wh.doorWidth, wh.doorHeight);
    this.door.root.position.set(0, wh.floorY, wh.aft + 0.03);
    this.root.add(this.door.root);
    // Its push buttons on the door post, inside and out, are modules (control.door-button).
    // The port side door, between the console and the chart table: slides aft outside the
    // wall. Its buttons on the forward jamb, inside and out, are door-button modules too.
    const sd = wh.sideDoor;
    if (sd) {
      const door = new WheelhouseDoor(sd.z1 - sd.z0, sd.height, 'sideDoor');
      door.root.position.set(-wh.halfWidth - 0.025, wh.floorY, (sd.z0 + sd.z1) / 2);
      door.root.rotation.y = Math.PI / 2; // its slide (local -x) runs aft
      this.root.add(door.root);
      this.sideDoor = door;
    }
    this.rainGlass = new RainGlass(def);
    this.root.add(this.rainGlass.root);
    // The cleats, the fenders, the swim ladder, the life ring station and the boat-hook rack
    // are modules since M5b.
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
  /** A module's own handle (its `api`), by module id; null if she has none. */
  api<T extends object>(moduleId: string): T | null {
    return this.modules.api<T>(moduleId);
  }

  update(state: VesselState, dt: number, displaysInView = true, env: EnvironmentState | null = null): void {
    for (const c of this.controls) {
      c.sync(state);
      c.tick(dt);
    }
    this.modules.update(state, dt, { inView: displaysInView, def: this.def, env });
    this.door.sync(state);
    this.sideDoor?.sync(state);
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
