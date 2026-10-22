import * as THREE from 'three';
import { CONFIG } from '../config';
import { barGeometry, layFrom, sagOf } from '../mechanisms/line';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { lineLength, towFittingLocal, towPoint, towPostLocal, winchLeadLocal } from './tow';

const SEGMENTS = 14;

/**
 * The towlines, each drawn between a boat's stern fairlead and the tow's bow eye on the
 * rendered (interpolated) boats: one instanced mesh of short cylinders for all of them (a
 * single draw call, no geometry rebuilt per frame; up to CONFIG.tow.drawLines). Slack, a
 * line hangs in a parabola whose sag makes the curve about the line's length
 * (s = sqrt(3 d (L - d) / 8) for chord d, length L); taut, it's straight. It's yellow
 * polypropylene: it floats, so a slack bight lies on the surface. Also the short lead of
 * line from the home boat's winch drum over her stern roller.
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
    this.rope = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xf2c84a }), SEGMENTS * CONFIG.tow.drawLines);
    this.rope.frustumCulled = false;
    this.rope.name = 'towline';
    this.root.add(this.rope);
    this.root.visible = false;
  }

  /**
   * The length of line from her tow winch's drum aft to the top of her stern roller (once),
   * shown while her tow is on: one mesh. (The roller and the winch are her modules: deck.stern-
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

  /** Every boat's towline this frame; `homeId`: the boat whose winch lead is drawn. */
  update(world: WorldState, roots: Map<string, THREE.Object3D>, homeId: string, waves: readonly PreparedWave[]): void {
    const lines = world.tow?.lines ?? {};
    if (this.lead) this.lead.visible = !!lines[homeId];
    let n = 0;
    for (const [tugId, line] of Object.entries(lines)) {
      if (n >= CONFIG.tow.drawLines) break;
      const tug = roots.get(tugId);
      const tugS = world.vessels[tugId];
      if (!tug || !tugS) continue;
      // A vessel's bow eye or fairlead from her drawn pose (it rides the swell with her); debris at the
      // drawn surface.
      const towRoot = line.target.startsWith('v:') ? roots.get(line.target.slice(2)) : undefined;
      const ts = towRoot && world.vessels[line.target.slice(2)];
      if (towRoot && ts) towRoot.localToWorld(this.b.fromArray(towFittingLocal(VESSEL_DEFS[ts.defId], line.at)));
      else if (towPoint(world, line.target, this.b, tugId)) {
        // Debris and afloat logs ride the drawn surface; a log on the beach keeps its height.
        const log = world.salvage?.logs.find((l) => `l:${l.id}` === line.target);
        if (!log || log.afloat) this.b.setY(surfaceHeight(waves, this.b.x, this.b.z) + 0.15);
      } else continue;
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
        layFrom(this.rope, n * SEGMENTS + i, this.p0, this.p1, this.m);
        this.p0.copy(this.p1);
      }
      n++;
    }
    this.rope.count = n * SEGMENTS;
    this.rope.instanceMatrix.needsUpdate = n > 0;
    this.root.visible = n > 0;
  }
}
