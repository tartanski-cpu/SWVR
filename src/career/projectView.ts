import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { PreparedWave } from '../ocean/waves';
import { NavMarksView } from '../world/view/navMarksView';
import { laidMarks } from './projects';

/**
 * A construction project's marks as they're laid (career/projects.ts): the met buoy, the
 * site's cardinals, drawn and lit as the map's own buoys are (world/view/navMarksView.ts), in a
 * view of their own made again when one is laid (a handful at most: one draw call per kind).
 */
export class ProjectView {
  readonly root = new THREE.Group();
  private marks: NavMarksView | null = null;
  /** Which marks the view was made for. */
  private key = '';

  constructor() {
    this.root.name = 'projectMarks';
  }

  update(world: WorldState, waves: readonly PreparedWave[], time: number, darkness: number, viewer: { x: number; z: number }): void {
    const laid = laidMarks(world);
    const key = laid.map((m) => m.name).join('|');
    if (key !== this.key) {
      this.key = key;
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
  }
}
