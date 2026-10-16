import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { CONFIG } from '../config';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { hullPlan } from '../vessel/layout';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { bowEyeLocal, lineLength, towPoint, towPostLocal, winchLeadLocal } from './tow';

const SEGMENTS = 14;

/**
 * The towline, drawn between our stern fairlead and the tow's bow eye on the rendered
 * (interpolated) boats: one instanced mesh of short cylinders (a single draw call, no
 * geometry rebuilt per frame). Slack, it hangs in a parabola whose sag makes the curve
 * about the line's length (s = sqrt(3 d (L - d) / 8) for chord d, length L); taut, it's
 * straight. It's yellow polypropylene: it floats, so a slack bight lies on the surface.
 * Also the stern roller itself (in a notch in the transom bulwark) and the short lead of line
 * from the winch drum over it.
 */
export class TowlineView {
  readonly root = new THREE.Group();
  private readonly rope: THREE.InstancedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private post: THREE.Mesh | null = null;
  private lead: THREE.Mesh | null = null;

  constructor() {
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true).translate(0, 0.5, 0);
    this.rope = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xf2c84a }), SEGMENTS);
    this.rope.frustumCulled = false;
    this.rope.name = 'towline';
    this.root.add(this.rope);
    this.root.visible = false;
  }

  /**
   * The stern roller on the workboat (once): in the notch in the transom bulwark on the
   * centreline (no towing post on deck: owner request), a steel roller across the notch that
   * the towline runs over, between two upright cheeks that keep it in, on a short plate
   * closing the notch below. The line leaves us from the top of the roller. And the length
   * of line from the winch drum aft to it, shown while a tow is on. One mesh for the roller
   * fitting, one for the lead.
   */
  attachPost(root: THREE.Object3D, def: VesselDef): void {
    if (this.post) return;
    const [, y, z] = towPostLocal(def); // the top of the roller
    const plan = hullPlan(def);
    const deck = plan.deckY(z);
    const half = (def.layout.fairleadGap || 0.44) / 2;
    const r = CONFIG.tow.fairlead.rollerRadius;
    const axle = y - r;
    const zc = plan.transom - 0.03; // in the bulwark's line
    const top = deck + (def.layout.bulwarkHeight ?? 0.3) + 0.04;
    const box = (x0: number, x1: number, y0: number, y1: number, d: number, c: number) => part(new THREE.BoxGeometry(x1 - x0, y1 - y0, d).translate((x0 + x1) / 2, (y0 + y1) / 2, zc), c);
    const parts = [
      box(-half, half, deck, axle - r * 0.5, 0.05, 0x3a3f44), // plate closing the notch below the roller
      box(-half, -half + 0.04, deck, top, 0.1, 0x3a3f44), // the cheeks
      box(half - 0.04, half, deck, top, 0.1, 0x3a3f44),
      part(new THREE.CylinderGeometry(r, r, 2 * half - 0.08, 12).rotateZ(Math.PI / 2).translate(0, axle, zc), 0x9aa0a6), // the roller
    ];
    this.post = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    this.post.name = 'sternRoller';
    root.add(this.post);
    // The lead from the drum to the fairlead: a straight length of the same line.
    const from = winchLeadLocal(def);
    if (from) {
      const a = new THREE.Vector3(...from);
      const b = new THREE.Vector3(0, y, z);
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(0.022, 0.022, len, 5, 1, true).translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      this.lead = new THREE.Mesh(g.translate(a.x, a.y, a.z), (this.rope.material as THREE.Material));
      this.lead.name = 'towLead';
      this.lead.visible = false;
      root.add(this.lead);
    }
  }

  update(world: WorldState, roots: Map<string, THREE.Object3D>, tugId: string, waves: readonly PreparedWave[]): void {
    const line = world.tow?.line;
    if (this.lead) this.lead.visible = !!line;
    const tug = roots.get(tugId);
    const tugS = world.vessels[tugId];
    if (!line || !tug || !tugS) {
      this.root.visible = false;
      return;
    }
    // A vessel's bow eye from her drawn pose (it rides the swell with her); debris at the
    // drawn surface.
    const towRoot = line.target.startsWith('v:') ? roots.get(line.target.slice(2)) : undefined;
    const ts = towRoot && world.vessels[line.target.slice(2)];
    if (towRoot && ts) towRoot.localToWorld(this.b.fromArray(bowEyeLocal(VESSEL_DEFS[ts.defId])));
    else if (towPoint(world, line.target, this.b)) {
      // Debris and afloat logs ride the drawn surface; a log on the beach keeps its height.
      const log = world.salvage?.logs.find((l) => `l:${l.id}` === line.target);
      if (!log || log.afloat) this.b.setY(surfaceHeight(waves, this.b.x, this.b.z) + 0.15);
    }
    else {
      this.root.visible = false;
      return;
    }
    tug.localToWorld(this.a.fromArray(towPostLocal(VESSEL_DEFS[tugS.defId])));
    const d = this.a.distanceTo(this.b);
    const L = lineLength(line);
    const sag = d < L ? Math.sqrt((3 * d * (L - d)) / 8) : 0;
    const point = (t: number, out: THREE.Vector3) => {
      out.lerpVectors(this.a, this.b, t);
      return out.setY(Math.max(out.y - 4 * sag * t * (1 - t), surfaceHeight(waves, out.x, out.z) + 0.03));
    };
    point(0, this.p0);
    for (let i = 0; i < SEGMENTS; i++) {
      point((i + 1) / SEGMENTS, this.p1);
      const len = this.p0.distanceTo(this.p1);
      this.q.setFromUnitVectors(this.up, this.s.copy(this.p1).sub(this.p0).divideScalar(Math.max(1e-6, len)));
      this.m.compose(this.p0, this.q, this.s.set(1, len, 1));
      this.rope.setMatrixAt(i, this.m);
      this.p0.copy(this.p1);
    }
    this.rope.instanceMatrix.needsUpdate = true;
    this.root.visible = true;
  }
}
