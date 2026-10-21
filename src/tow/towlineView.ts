import * as THREE from 'three';
import { barGeometry, layFrom, sagOf } from '../mechanisms/line';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { bowEyeLocal, lineLength, towPoint, towPostLocal, winchLeadLocal } from './tow';

const SEGMENTS = 14;

/**
 * The towline, drawn between our stern fairlead and the tow's bow eye on the rendered
 * (interpolated) boats: one instanced mesh of short cylinders (a single draw call, no
 * geometry rebuilt per frame). Slack, it hangs in a parabola whose sag makes the curve
 * about the line's length (s = sqrt(3 d (L - d) / 8) for chord d, length L); taut, it's
 * straight. It's yellow polypropylene: it floats, so a slack bight lies on the surface.
 * Also the short lead of line from the winch drum over the stern roller.
 */
export class TowlineView {
  readonly root = new THREE.Group();
  private readonly rope: THREE.InstancedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
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
   * The length of line from her tow winch's drum aft to the top of her stern roller (once),
   * shown while a tow is on: one mesh. (The roller and the winch are her modules: deck.stern-
   * roller, deck.tow-winch.) Nothing on a boat without a winch.
   */
  attachLead(root: THREE.Object3D, v: { defId: string }): void {
    // Another boat's (multi-boat M2): the old lead goes.
    this.lead?.removeFromParent();
    this.lead = null;
    const from = winchLeadLocal(v);
    if (!from) return;
    const g = barGeometry(new THREE.Vector3(...from), new THREE.Vector3(...towPostLocal(v)), 0.022, 5, true);
    this.lead = new THREE.Mesh(g, this.rope.material as THREE.Material);
    this.lead.name = 'towLead';
    this.lead.visible = false;
    root.add(this.lead);
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
    tug.localToWorld(this.a.fromArray(towPostLocal(tugS)));
    const d = this.a.distanceTo(this.b);
    const sag = sagOf(d, lineLength(line));
    const point = (t: number, out: THREE.Vector3) => {
      out.lerpVectors(this.a, this.b, t);
      return out.setY(Math.max(out.y - 4 * sag * t * (1 - t), surfaceHeight(waves, out.x, out.z) + 0.03));
    };
    point(0, this.p0);
    for (let i = 0; i < SEGMENTS; i++) {
      point((i + 1) / SEGMENTS, this.p1);
      layFrom(this.rope, i, this.p0, this.p1, this.m);
      this.p0.copy(this.p1);
    }
    this.rope.instanceMatrix.needsUpdate = true;
    this.root.visible = true;
  }
}
