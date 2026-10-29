/**
 * Drawing a fish farm's crew change (aqua/farmCrew.ts): its people, in the wind farm technicians'
 * hi-vis overalls and hard hats (transfer/transferView.ts technicianFigure), standing in a row on
 * the base harbour's quay or on the feed barge, or sitting on their seats aboard (in the boat's
 * frame, so they move with her). Gone home, they're gone. One mesh each, only while there's a crew
 * change and only within `drawRange` of the viewer.
 */
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial } from '../render/geometryUtils';
import { technicianFigure, type Figure } from '../transfer/transferView';
import { landFloor } from '../world/landWalkArea';
import { handSpot } from './farmCrew';

/** Drawn only this near (m). */
const DRAW_RANGE = 700;

export class FarmCrewView {
  readonly root = new THREE.Group();
  private readonly mat = flatVertexColorMaterial();
  private readonly figures = new Map<string, Figure>();

  constructor() {
    this.root.name = 'farmCrew';
  }

  update(world: WorldState, viewer: THREE.Vector3, boatRoot: (id: string) => THREE.Object3D | undefined): void {
    const live = new Set<string>();
    for (const [farmId, site] of Object.entries(world.aqua?.sites ?? {})) {
      const call = site.call;
      if (call?.kind !== 'crew' || !call.hands) continue;
      // Each row's place along the quay or the barge, counted per place.
      const rows = { quay: 0, barge: 0 };
      for (const hand of call.hands) {
        if (hand.phase === 'home') continue;
        let f = this.figures.get(hand.id);
        if (!f) {
          f = technicianFigure(hand.id, this.mat);
          this.figures.set(hand.id, f);
        }
        live.add(hand.id);
        f.sitting.visible = hand.phase === 'aboard';
        f.standing.visible = !f.sitting.visible;
        if (hand.phase === 'aboard') {
          const boat = hand.vesselId ? boatRoot(hand.vesselId) : undefined;
          if (!boat || !hand.seat) {
            f.root.visible = false;
            continue;
          }
          if (f.root.parent !== boat) boat.add(f.root);
          f.root.visible = true;
          f.root.position.set(hand.seat[0], hand.seat[1], hand.seat[2]);
          f.root.rotation.set(0, ((hand.seatYaw ?? 0) * Math.PI) / 180, 0);
          continue;
        }
        const k = rows[hand.phase]++;
        const spot = handSpot(call, farmId, hand, k);
        if (f.root.parent !== this.root) this.root.add(f.root);
        f.root.visible = !!spot && Math.hypot(spot.x - viewer.x, spot.z - viewer.z) < DRAW_RANGE;
        if (!spot) continue;
        f.root.position.set(spot.x, landFloor(spot.x, spot.z) ?? 1.6, spot.z);
        f.root.rotation.set(0, (-spot.yawDeg * Math.PI) / 180, 0);
      }
    }
    for (const [id, f] of this.figures) {
      if (live.has(id)) continue;
      f.root.removeFromParent();
      f.standing.geometry.dispose();
      f.sitting.geometry.dispose();
      this.figures.delete(id);
    }
  }
}
