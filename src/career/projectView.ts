import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import type { PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { NavMarksView } from '../world/view/navMarksView';
import { foundations, jackUpAt, laidMarks, syncProjectBlocks } from './projects';

/** How deep the piles are drawn (m): well under the surface, out of sight below. */
const PILE_FOOT = -12;
/** A driven pile's top (m above the sea), and a pile's as it's pitched upright, before driving. */
const PILE_TOP = 4;
const PILE_PITCHED = 14;

/**
 * A construction project in the world (career/projects.ts): its marks as they're laid (the
 * met buoy, the site's cardinals, drawn and lit as the map's own buoys are), its foundations
 * (each driven pile standing at its turbine), the pile being driven, and the jack-up working
 * on site. Each a single merged mesh (one draw call), made again only when what's built
 * changes. It also keeps the collision's added blocks in step on the crew's side (the host's
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
    this.root.add(this.driving, this.jackUp);
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
    const standing = found.filter((f) => f.driving === null);
    const pk = standing.map((f) => `${f.x},${f.z}`).join('|');
    if (pk !== this.pilesKey) {
      this.pilesKey = pk;
      if (this.piles) {
        this.root.remove(this.piles);
        this.piles.geometry.dispose();
      }
      this.piles = standing.length ? new THREE.Mesh(mergeParts(standing.map((f) => pileGeometry(f.x, f.z))), this.material) : null;
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
    // The jack-up, on site while the piles go in.
    const ju = jackUpAt(world);
    this.jackUp.visible = !!ju;
    if (ju) this.jackUp.position.set(ju.x, 0, ju.z);
  }
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
