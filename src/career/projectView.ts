import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { NavMarksView } from '../world/view/navMarksView';
import { nacelleGeometry, rotorGeometry, transitionPieceParts, WindFarmView } from '../world/view/windFarmView';
import { landingAxis } from '../world/windFarm';
import { foundations, installAt, jackUpAt, laidMarks, syncProjectBlocks } from './projects';

/** How deep the piles are drawn (m): well under the surface, out of sight below. */
const PILE_FOOT = -12;
/** A driven pile's top (m above the sea), and a pile's as it's pitched upright, before driving. */
const PILE_TOP = 4;
const PILE_PITCHED = 14;
/** How high over its foundation a transition piece starts as it's lifted on (m). */
const TP_LIFT = 12;
/** How high over its place a nacelle and a rotor start as they're lifted on (m). */
const PART_LIFT = 14;

/**
 * A construction project in the world (career/projects.ts): its marks as they're laid (the
 * met buoy, the site's cardinals, drawn and lit as the map's own buoys are), its foundations
 * (each driven pile standing at its turbine), the pile being driven, and the jack-up working
 * on site; the turbines going up (tower, nacelle, rotor: still, they're not turning till
 * they're commissioned) and the installation ship putting them up. A commissioned turbine
 * (and a finished project's farm) is drawn as the map's farms are (world/view/windFarmView.ts:
 * into the wind, its rotor turning, lit at night), made again when another is commissioned. Each a single merged mesh
 * (one draw call), made again only when what's built changes. It also keeps the collision's added blocks in step on the crew's side (the host's
 * tick does on its own).
 */
export class ProjectView {
  readonly root = new THREE.Group();
  private marks: NavMarksView | null = null;
  /** Which marks, and which foundations, the meshes were made for. */
  private marksKey = '';
  private pilesKey = '';
  private piles: THREE.Mesh | null = null;
  private readonly material = flatVertexColorMaterial();
  /** The pile being driven: a unit-height tube, scaled to the height still standing. */
  private readonly driving: THREE.Mesh;
  private readonly jackUp: THREE.Mesh;
  /** The transition piece being lifted on: one piece, lowered onto its foundation as it goes. */
  private readonly lifting: THREE.Mesh;
  /** The turbine going up: its tower (a unit-height tube, scaled as it's lifted), nacelle and rotor, each lowered onto it in turn. */
  private readonly tower: THREE.Mesh;
  private readonly nacelle: THREE.Mesh;
  private readonly rotor: THREE.Mesh;
  private readonly installer: THREE.Mesh;
  /** The commissioned turbines, as a farm; which ones it was made for; the last frame's time. */
  private farm: WindFarmView | null = null;
  private farmKey = '';
  private lastTime: number | null = null;

  constructor() {
    this.root.name = 'project';
    const r = CONFIG.windFarm.pile.radius;
    this.driving = new THREE.Mesh(
      mergeParts([part(new THREE.CylinderGeometry(r, r, 1, 16).translate(0, 0.5, 0), CONFIG.windFarm.colors.pile, 'worn'), part(new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.02, 16).translate(0, 0.99, 0), 0xd2401e)]),
      this.material,
    );
    this.driving.name = 'pileDriving';
    this.driving.visible = false;
    this.jackUp = new THREE.Mesh(jackUpGeometry(), this.material);
    this.jackUp.name = 'jackUp';
    this.jackUp.visible = false;
    this.lifting = new THREE.Mesh(mergeParts(transitionPieceParts()), this.material);
    this.lifting.name = 'tpLifting';
    this.lifting.visible = false;
    const c = CONFIG.windFarm;
    this.tower = new THREE.Mesh(towerGeometry(0, 0, 1), this.material);
    this.nacelle = new THREE.Mesh(nacelleGeometry(), this.material);
    this.rotor = new THREE.Mesh(rotorGeometry(), this.material);
    this.installer = new THREE.Mesh(installerGeometry(), this.material);
    this.tower.name = 'towerGoingUp';
    this.nacelle.name = 'nacelleGoingUp';
    this.rotor.name = 'rotorGoingUp';
    this.rotor.rotation.z = Math.PI;
    this.installer.name = 'installationShip';
    for (const m of [this.tower, this.nacelle, this.rotor, this.installer]) m.visible = false;
    this.tower.position.y = c.platform.y;
    this.root.add(this.driving, this.jackUp, this.lifting, this.tower, this.nacelle, this.rotor, this.installer);
  }

  update(world: WorldState, waves: readonly PreparedWave[], time: number, darkness: number, viewer: { x: number; z: number }): void {
    syncProjectBlocks(world);
    // The marks laid.
    const laid = laidMarks(world);
    const key = laid.map((m) => m.name).join('|');
    if (key !== this.marksKey) {
      this.marksKey = key;
      if (this.marks) {
        this.root.remove(this.marks.root);
        this.marks.root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
        });
      }
      this.marks = laid.length ? new NavMarksView(laid) : null;
      if (this.marks) this.root.add(this.marks.root);
    }
    this.marks?.update(waves, time, darkness, viewer);
    // The foundations standing, and the pile being driven (its top coming down to PILE_TOP).
    const found = foundations(world);
    // (A commissioned turbine is the farm's to draw, below.)
    const standing = found.filter((f) => f.driving === null && !f.turning);
    const pk = standing.map((f) => `${f.x},${f.z},${f.tp === 1},${f.erect === 1}`).join('|');
    if (pk !== this.pilesKey) {
      this.pilesKey = pk;
      if (this.piles) {
        this.root.remove(this.piles);
        this.piles.geometry.dispose();
      }
      // Each foundation, and its transition piece once it's on (a turbine's own: windFarmView).
      // and the turbine itself once it's up.
      this.piles = standing.length ? new THREE.Mesh(mergeParts(standing.flatMap((f) => [pileGeometry(f.x, f.z), ...(f.tp === 1 ? tpPlaced(f.x, f.z, f.landingDeg) : []), ...(f.erect === 1 ? turbineUp(f.x, f.z) : [])])), this.material) : null;
      if (this.piles) {
        this.piles.name = 'foundations';
        this.root.add(this.piles);
      }
    }
    const d = found.find((f) => f.driving !== null);
    this.driving.visible = !!d;
    if (d) {
      const top = PILE_PITCHED + (PILE_TOP - PILE_PITCHED) * (d.driving ?? 0);
      this.driving.position.set(d.x, PILE_FOOT, d.z);
      this.driving.scale.set(1, top - PILE_FOOT, 1);
    }
    // The transition piece being lifted on: lowered from TP_LIFT over its foundation onto it.
    const lift = found.find((f) => f.tp !== null && f.tp < 1);
    this.lifting.visible = !!lift;
    if (lift) {
      const { ax, az } = landingAxis(lift.landingDeg);
      this.lifting.rotation.set(0, Math.atan2(-ax, -az), 0);
      this.lifting.position.set(lift.x, TP_LIFT * (1 - Math.min(1, (lift.tp ?? 0) * 1.25)), lift.z);
    }
    // The turbine going up: the tower rising to its height, then the nacelle lowered onto it,
    // then the rotor onto the nacelle (CONFIG.career.projectInstall's lifts).
    const up = found.find((f) => f.erect !== null && f.erect < 1);
    const ic = CONFIG.career.projectInstall;
    const wf = CONFIG.windFarm;
    const towerTop = wf.hub - wf.nacelle.height / 2;
    for (const m of [this.tower, this.nacelle, this.rotor]) m.visible = !!up;
    if (up) {
      const e = up.erect ?? 0;
      const lowered = (from: number, to: number) => PART_LIFT * (1 - Math.min(1, Math.max(0, (e - from) / ((to - from) * 0.8))));
      this.tower.position.set(up.x, wf.platform.y, up.z);
      this.tower.scale.set(1, Math.max(0.01, (towerTop - wf.platform.y) * Math.min(1, e / (ic.nacelleAt * 0.8))), 1);
      this.nacelle.visible = e >= ic.nacelleAt;
      this.nacelle.position.set(up.x, wf.hub + lowered(ic.nacelleAt, ic.rotorAt), up.z);
      this.rotor.visible = e >= ic.rotorAt;
      this.rotor.position.set(up.x, wf.hub + lowered(ic.rotorAt, 1), up.z);
    }
    // The commissioned turbines: a farm, turning and lit.
    const turning = found.filter((f) => f.turning);
    const fk = turning.map((f) => `${f.x},${f.z}`).join('|');
    if (fk !== this.farmKey) {
      this.farmKey = fk;
      if (this.farm) {
        this.root.remove(this.farm.root);
        this.farm.root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
        });
      }
      this.farm = turning.length ? new WindFarmView([{ name: '', turbines: turning.map((f) => ({ x: f.x, z: f.z, landingDeg: f.landingDeg })) }]) : null;
      if (this.farm) this.root.add(this.farm.root);
    }
    const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.farm?.update(world, darkness, dt);
    const inst = installAt(world);
    this.installer.visible = !!inst;
    if (inst) this.installer.position.set(inst.x, 0, inst.z);
    // The jack-up, on site while the piles go in.
    const ju = jackUpAt(world);
    this.jackUp.visible = !!ju;
    if (ju) this.jackUp.position.set(ju.x, 0, ju.z);
  }
}

/** A transition piece on its foundation at (x, z), its landing out along its bearing (as windFarmView places a turbine's). */
function tpPlaced(x: number, z: number, landingDeg: number): THREE.BufferGeometry[] {
  const { ax, az } = landingAxis(landingDeg);
  const yaw = Math.atan2(-ax, -az);
  return transitionPieceParts().map((g) => g.rotateY(yaw).translate(x, 0, z));
}

/** A tower from the platform (its base at y0) `h` m up, at (x, z): white, tapering. */
function towerGeometry(x: number, z: number, h: number): THREE.BufferGeometry {
  const c = CONFIG.windFarm;
  return part(new THREE.CylinderGeometry(c.tower.top, c.tower.base, h, 16).translate(x, h / 2, z), c.colors.tower);
}

/**
 * A turbine that's up, at (x, z): its tower, nacelle and rotor (still: they turn once it's
 * commissioned), the hub to the north, one blade hanging down (clear of the crane's boom).
 */
function turbineUp(x: number, z: number): THREE.BufferGeometry[] {
  const c = CONFIG.windFarm;
  const top = c.hub - c.nacelle.height / 2;
  return [towerGeometry(x, z, top - c.platform.y).translate(0, c.platform.y, 0), nacelleGeometry().translate(x, c.hub, z), rotorGeometry().rotateZ(Math.PI).translate(x, c.hub, z)];
}

/**
 * The installation ship (CONFIG.career.projectInstall), in her own axes: centred on her hull,
 * standing `offsetM` north of the turbine she's putting up (+z). A dark blue hull on four legs
 * (banded at the top), the accommodation and bridge forward on her north side with a helideck,
 * a tower section, a nacelle and a rack of blades on deck waiting, and her big crane on the
 * south side, its boom raised high over the turbine, the hook block over the hub.
 */
function installerGeometry(): THREE.BufferGeometry {
  const j = CONFIG.career.projectInstall;
  const wf = CONFIG.windFarm;
  const [L, W, D] = j.hull;
  const deck = j.hullY + D;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, color: number, paint?: 'worn') => parts.push(part(new THREE.BoxGeometry(w, h, l).translate(x, y, z), color, paint));
  // The hull: dark blue sides, a white band, a grey deck.
  box(L, D, W, 0, j.hullY + D / 2, 0, 0x1e3a5c, 'worn');
  box(L + 0.04, 0.6, W + 0.04, 0, deck - 0.3, 0, 0xeeeeee);
  box(L - 0.4, 0.1, W - 0.4, 0, deck + 0.05, 0, 0x6c7072);
  // The legs at her corners, from the seabed (drawn from -20) to 30 m above her deck.
  const lh = j.legHalf * 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = (sx * j.legSpacing[0]) / 2;
      const z = (sz * j.legSpacing[1]) / 2;
      const top = deck + 30;
      box(lh, top + 20, lh, x, (top - 20) / 2, z, 0xb8bcbe, 'worn');
      for (const b of [0, 2]) box(lh + 0.06, 1, lh + 0.06, x, top - 1.5 - b, z, b === 0 ? 0xc8281c : 0xeeeeee);
      box(lh + 2.6, 4, lh + 2.6, x, deck + 2, z, 0x1e3a5c);
    }
  // The accommodation and bridge at her west end, north side (-z); the helideck over it.
  const ax = -L / 2 + 12;
  box(18, 12, W - 10, ax, deck + 6, -2, 0xeceae4);
  box(18.04, 1.2, W - 9.9, ax, deck + 10.5, -2, 0x1c2a30);
  parts.push(part(new THREE.CylinderGeometry(10, 10, 0.3, 16).translate(ax - 2, deck + 12.8, -2), 0x2f4a36));
  parts.push(part(new THREE.TorusGeometry(7, 0.2, 4, 24).rotateX(Math.PI / 2).translate(ax - 2, deck + 13, -2), 0xe8c020));
  // On deck, waiting: a tower section and a nacelle, and a rack of blades along her.
  parts.push(part(new THREE.CylinderGeometry(wf.tower.base, wf.tower.base, 24, 12).rotateZ(Math.PI / 2).translate(8, deck + wf.tower.base + 0.6, -10), wf.colors.tower));
  box(wf.nacelle.length, wf.nacelle.height, wf.nacelle.width, 24, deck + wf.nacelle.height / 2 + 0.4, -10, wf.colors.tower);
  for (let k = 0; k < 3; k++) box(wf.blade, 0.4, 1.6, 10, deck + 1 + k * 0.8, 6, wf.colors.tower);
  box(wf.blade, 3, 0.4, 10, deck + 1.5, 7.2, 0xd8a020);
  // The crane: a pedestal on the south side (+z), its boom raised to put its tip high over the turbine.
  const cz = W / 2 - 5;
  const base = deck + 10;
  parts.push(part(new THREE.CylinderGeometry(2.4, 2.8, 10, 12).translate(0, deck + 5, cz), 0xd8a020));
  box(7, 5, 8, 0, base + 1.5, cz, 0xd8a020);
  const reach = j.offsetM - cz;
  const tipY = wf.hub + 20;
  const boom = Math.hypot(reach, tipY - base);
  const ang = Math.atan2(tipY - base, reach);
  const hookY = wf.hub + 6;
  parts.push(part(new THREE.BoxGeometry(2.2, 2.2, boom).translate(0, 0, boom / 2).rotateX(-ang).translate(0, base, cz), 0xd8a020));
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.08, tipY - hookY, 5).translate(0, (tipY + hookY) / 2, j.offsetM), 0x222222));
  box(1.8, 2.4, 1.8, 0, hookY, j.offsetM, 0xe8c020);
  return mergeParts(parts);
}

/** A driven pile at (x, z): the tube from below the surface to PILE_TOP, a flange round its top. */
function pileGeometry(x: number, z: number): THREE.BufferGeometry {
  const r = CONFIG.windFarm.pile.radius;
  return mergeParts([
    part(new THREE.CylinderGeometry(r, r, PILE_TOP - PILE_FOOT, 16).translate(x, (PILE_TOP + PILE_FOOT) / 2, z), CONFIG.windFarm.colors.pile, 'worn'),
    part(new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.3, 16).translate(x, PILE_TOP - 0.15, z), 0x5a6064),
  ]);
}

/**
 * The jack-up (CONFIG.career.projectJackUp), in its own axes: centred on its hull, standing
 * `offsetM` north of the turbine it works on, so the turbine is to its south (+z, as world z).
 * Its hull on four square lattice legs (drawn solid, banded red and white at the top), the
 * accommodation block and helideck on its north side, a crane on its south side, the boom
 * raised out over the turbine with the hook block hanging over the pile.
 */
function jackUpGeometry(): THREE.BufferGeometry {
  const j = CONFIG.career.projectJackUp;
  const [L, W, D] = j.hull;
  const y0 = j.hullY;
  const deck = y0 + D;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, color: number, paint?: 'worn') => parts.push(part(new THREE.BoxGeometry(w, h, l).translate(x, y, z), color, paint));
  // The hull: yellow sides, a grey working deck.
  box(L, D, W, 0, y0 + D / 2, 0, 0xd8a020, 'worn');
  box(L - 0.4, 0.1, W - 0.4, 0, deck + 0.05, 0, 0x6c7072);
  // The legs, through the hull at its corners, from the seabed (drawn from -20) to 20 m above it.
  const lh = j.legHalf * 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = (sx * j.legSpacing[0]) / 2;
      const z = (sz * j.legSpacing[1]) / 2;
      const top = deck + 20;
      box(lh, top + 20, lh, x, (top - 20) / 2, z, 0xb8bcbe, 'worn');
      for (const b of [0, 2]) box(lh + 0.06, 1, lh + 0.06, x, top - 1.5 - b, z, b === 0 ? 0xc8281c : 0xeeeeee);
      // The jacking house round each leg on deck.
      box(lh + 2.2, 3, lh + 2.2, x, deck + 1.5, z, 0xd8a020);
    }
  // The accommodation block on the north side (-z), its bridge windows, the helideck over it.
  const az = -(W / 2 - 5);
  box(L * 0.55, 8, 8, -L * 0.15, deck + 4, az, 0xeceae4);
  box(L * 0.55 + 0.04, 1, 0.1, -L * 0.15, deck + 7, az + 4.02, 0x1c2a30);
  parts.push(part(new THREE.CylinderGeometry(8, 8, 0.3, 16).translate(-L * 0.15, deck + 8.6, az), 0x2f4a36));
  parts.push(part(new THREE.TorusGeometry(5.5, 0.18, 4, 24).rotateX(Math.PI / 2).translate(-L * 0.15, deck + 8.8, az), 0xe8c020));
  // The crane: a pedestal on the south side (+z), its boom raised out over the turbine, the
  // angle that puts its tip over it (`offsetM` south of the hull's middle).
  const cx = 0;
  const cz = W / 2 - 4;
  parts.push(part(new THREE.CylinderGeometry(1.4, 1.6, 6, 12).translate(cx, deck + 3, cz), 0xd8a020));
  box(4, 3, 5, cx, deck + 7.5, cz, 0xd8a020);
  const boom = 52;
  const ang = Math.acos(Math.min(1, (j.offsetM - cz) / boom));
  const tipY = deck + 8 + boom * Math.sin(ang);
  const tipZ = cz + boom * Math.cos(ang);
  const hookY = PILE_PITCHED + 2;
  parts.push(part(new THREE.BoxGeometry(1.4, 1.4, boom).translate(0, 0, boom / 2).rotateX(-ang).translate(cx, deck + 8, cz), 0xd8a020));
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, tipY - hookY, 5).translate(cx, (tipY + hookY) / 2, tipZ), 0x222222));
  box(1.2, 1.6, 1.2, cx, hookY, tipZ, 0xe8c020);
  return mergeParts(parts);
}
