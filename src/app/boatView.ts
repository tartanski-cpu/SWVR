import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { panelLit } from '../controls/panelLighting';
import { Cleat } from '../controls/deckGear';
import { hasWheelhouse, type VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { EnvironmentState } from '../environment/environmentState';
import type { Control } from '../controls/Control';
import type { AssembledView, PlacedLabel } from '../modular/assemble';
import { LABEL_OFFSET, type ViewFrame } from '../modular/module';
import type { RadioSet } from '../rescue/radioView';
import type { ChartPlotter } from '../nav/chartPlotter';
import type { ChartTableView } from '../vessel/view/chartTable';
import type { BoardView } from '../board/boardView';
import type { DutyBoardView } from '../duties/dutyBoardView';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { WheelhouseDoor } from '../controls/WheelhouseDoor';
import { SideGate } from '../controls/SideGate';
import { BowRamp } from '../controls/BowRamp';
import { paintOf } from '../vessel/view/hullMesh';
import { hullPlan } from '../vessel/layout';
import { RainGlass } from '../vessel/view/rainGlass';

/**
 * One boat as drawn and worked (modular boats M6c; it was the hand-built Bridge): her
 * modules, built from her recipe, and the parts of her hull that move: the wheelhouse doors
 * and the deck gate, and the rain on the front windows. Everything is in vessel axes and is
 * added to the vessel's root, so it rides the boat. Every boat with modules has one (the
 * workboat, the skiff); a tow, a hull with none, needs none.
 *
 * What the modules share is put together here: their fixed parts baked into one mesh (one
 * draw call), their engraved labels into another, their screens on one display atlas, their
 * switch bats and button caps one instanced mesh per kind.
 */
export class BoatView {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  /** Empty object at the centre of the instrument dash (for visibility checks; the console module's), if she has one. */
  readonly dashAnchor: THREE.Object3D | null;
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
  /** The FM set (a module; the app plays its station near it), if she has one. */
  readonly fmSet: THREE.Object3D | null;
  /** Rain on the front windows and the wipers (the app feeds it the weather), if she has a wheelhouse. */
  readonly rainGlass: RainGlass | null = null;
  /** The wheelhouse's aft door (its push buttons on the frame open / shut it), if she has a wheelhouse. */
  readonly door: WheelhouseDoor | null = null;
  /** The port side door (boats whose wheelhouse has one). */
  readonly sideDoor: WheelhouseDoor | null = null;
  /** The gate in the working-deck bulwark, if she has one (its buttons are door-button modules). */
  readonly sideGate: SideGate | null = null;
  /** The bow ramp, if her hull has one (the landing craft; its buttons are door-button modules). */
  readonly bowRamp: BowRamp | null = null;
  /** The cleats on the bulwark tops (modules; the app shows the skiff's painter on them). */
  readonly cleats: Cleat[];

  /**
   * @param vesselId whose boat this is
   * @param home     the home boat: her controls send plain channels; any other boat's
   *                 controls are routed to her (Control.route)
   * @param modules  her modules, built from her recipe (modular/assemble.ts)
   */
  constructor(
    readonly vesselId: string,
    private readonly def: VesselDef,
    private readonly modules: AssembledView,
    private readonly home: boolean,
  ) {
    this.root.name = home ? 'bridge' : `boat:${vesselId}`;
    for (const m of modules.modules) this.root.add(m.root);

    this.radio = modules.api<RadioSet>('radio.vhf');
    this.chart = modules.api<ChartPlotter>('nav.chartplotter');
    this.chartTable = modules.api<ChartTableView>('furniture.chart-table');
    this.whiteboard = modules.api<BoardView>('furniture.whiteboard');
    this.dutyBoard = modules.api<DutyBoardView>('furniture.duty-board');
    this.controls.push(...modules.controls);
    this.fmSet = modules.modules.find((m) => m.id === 'radio.fm')?.root ?? null;
    this.cleats = modules.controls.filter((c): c is Cleat => c instanceof Cleat);
    // The hull's moving parts: the doors and the gate (their push buttons are door-button
    // modules, inside and out), the rain on the glass.
    const layout = def.layout;
    const wh = layout.wheelhouse;
    if (wh) {
      this.door = new WheelhouseDoor(wh.doorWidth, wh.doorHeight, 'door', !!wh.doorHinged);
      this.door.root.position.set(0, wh.floorY, wh.aft + 0.03);
      this.root.add(this.door.root);
      // The port side door, between the console and the chart table: slides aft outside the
      // wall.
      const sd = wh.sideDoor;
      if (sd) {
        const door = new WheelhouseDoor(sd.z1 - sd.z0, sd.height, 'sideDoor');
        door.root.position.set(-wh.halfWidth - 0.025, wh.floorY, (sd.z0 + sd.z1) / 2);
        door.root.rotation.y = Math.PI / 2; // its slide (local -x) runs aft
        this.root.add(door.root);
        this.sideDoor = door;
      }
    }
    // The gate in the working-deck bulwark: hinged on its forward post.
    const gt = layout.sideGate;
    if (gt) {
      const plan = hullPlan(def);
      const at = (z: number) => new THREE.Vector3(gt.side * (plan.halfBeam(z) - 0.03), plan.deckY(z), z);
      const gate = new SideGate(at(gt.z0), at(gt.z1), layout.bulwarkHeight, layout.railHeight, gt.side, (gt.openDeg * Math.PI) / 180);
      this.root.add(gate.root);
      this.sideGate = gate;
    }
    // The bow ramp: hinged across the top of her bow plate.
    const br = layout.bowRamp;
    if (br) {
      const plan = hullPlan(def);
      const paint = paintOf(def.livery);
      const ramp = new BowRamp(new THREE.Vector3(0, plan.deckY(plan.stem), plan.stem), plan.deckY(plan.stem + br.ram.aft), br, { plate: paint.topsides, grip: paint.deck, fittings: paint.mast });
      this.root.add(ramp.root);
      this.bowRamp = ramp;
    }
    if (hasWheelhouse(def)) {
      this.rainGlass = new RainGlass(def);
      this.root.add(this.rainGlass.root);
    }
    for (const c of this.controls) if (!c.root.parent) this.root.add(c.root);
    if (!home) for (const c of this.controls) c.route = vesselId;

    // Her modules' fixed parts in one mesh, their labels in another, the screens, the
    // shared bats and caps.
    this.dashAnchor = this.root.getObjectByName('dashAnchor') ?? null;
    const fixed = bakeFixedParts(this.root, modules.staticParts);
    if (fixed) this.root.add(fixed);
    if (modules.labels.length) this.root.add(buildLabels(modules.labels));
    if (modules.screens) this.root.add(modules.screens);
    for (const m of modules.shared) this.root.add(m);
  }

  /** A control the app makes for her (the skiff's bow cleat, for the painter): it rides and routes with her. */
  addControl(c: Control): void {
    this.controls.push(c);
    if (!c.root.parent) this.root.add(c.root);
    if (!this.home) c.route = this.vesselId;
  }

  /** Under a cover (the skiff in her cradle, under her tarpaulin): not drawn, not usable. */
  setCovered(covered: boolean): void {
    this.root.visible = !covered;
    for (const c of this.controls) c.enabled = !covered;
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

  /** A module's own handle (its `api`), by module id; null if she has none. */
  api<T extends object>(moduleId: string): T | null {
    return this.modules.api<T>(moduleId);
  }

  /** A module's group on the boat (its place), by module id; null if she has none. */
  moduleRoot(moduleId: string): THREE.Object3D | null {
    return this.modules.modules.find((m) => m.id === moduleId)?.root ?? null;
  }

  /**
   * Visuals from authoritative state (controls skip this while locally held).
   * @param displaysInView false when nobody can see the dash: the instrument canvas then
   *                       skips its redraw and texture upload (the costly part on Quest).
   * @param frame          how dark it is and where the viewer is (her lights)
   */
  update(state: VesselState, dt: number, displaysInView: boolean, env: EnvironmentState | null, frame: ViewFrame): void {
    for (const c of this.controls) {
      c.sync(state);
      c.tick(dt);
    }
    this.modules.update(state, dt, { inView: displaysInView, def: this.def, env }, frame);
    this.door?.sync(state);
    this.sideDoor?.sync(state);
    this.sideGate?.sync(state);
    this.bowRamp?.sync(state);
    this.bowRamp?.tick(dt);
  }
}

/**
 * Bake every control part marked `fixed` (bases, housings, plates) plus `extra` parts into
 * one vertex-coloured mesh: one draw call instead of one per part. The original meshes are
 * hidden but kept, so the pointer ray (which ignores visibility) still hits them.
 */
function bakeFixedParts(root: THREE.Object3D, extra: THREE.BufferGeometry[]): THREE.Mesh | null {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const parts = [...extra];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.fixed) return;
    const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld.clone().premultiply(toRoot));
    parts.push(part(geo, (o.material as THREE.MeshLambertMaterial).color.getHex()));
    o.visible = false;
  });
  if (!parts.length) return null;
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
    if (underside) {
      // Under a panel (the overhead's), read from below.
      plane.rotateX(Math.PI / 2).rotateY(yaw);
      plane.translate(pos[0] + Math.sin(yaw) * offset, pos[1] - 0.002, pos[2] + Math.cos(yaw) * offset);
    } else {
      // Tilted up 45 degrees toward whoever reads it (owner: flat on the dash they were hard
      // to read), standing on its near edge.
      plane.rotateX(-Math.PI / 4).rotateY(yaw);
      const lift = (h / 2) * Math.SQRT1_2;
      plane.translate(pos[0] + Math.sin(yaw) * (offset - lift), pos[1] + 0.002 + lift, pos[2] + Math.cos(yaw) * (offset - lift));
    }
    return plane;
  });
  const mesh = new THREE.Mesh(mergeGeometries(planes), panelLit(new THREE.MeshBasicMaterial({ map: texture, transparent: true })));
  mesh.name = 'bridgeLabels';
  return mesh;
}
