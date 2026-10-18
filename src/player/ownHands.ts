import * as THREE from 'three';
import { handGeometries } from '../net/avatarOutfits';
import { figureMaterial } from '../net/avatarView';
import type { HandPose } from './handGesture';
import type { XRControllers } from './xrControllers';
import type { Handedness } from './xrInput';

/**
 * Your own hands in VR (owner request: the Quest browser showed no hands, and you want to
 * see the gesture you're making): the same mitts crew-mates see on you, in your outfit's
 * colour, at each controller in its grip frame, in the pose of the moment. They take the
 * place of the controller models. One small mesh per hand; its geometry is swapped for the
 * pose (shared with crew-mates' figures).
 */
export class OwnHands {
  private readonly meshes: Record<Handedness, THREE.Mesh> = {
    left: new THREE.Mesh(undefined, figureMaterial()),
    right: new THREE.Mesh(undefined, figureMaterial()),
  };

  /** Debug > Hands: the controller's own axes drawn on it (X red, Y green, Z blue). */
  showAxes = false;
  private readonly axes: Record<Handedness, THREE.AxesHelper> = { left: new THREE.AxesHelper(0.15), right: new THREE.AxesHelper(0.15) };

  constructor() {
    for (const h of ['left', 'right'] as const) {
      this.meshes[h].name = `ownHand:${h}`;
      this.meshes[h].visible = false;
    }
  }

  /** Each frame in VR: on its controller (if tracked), in its pose. Out of VR: hidden. */
  update(controllers: XRControllers, inXR: boolean, look: number, pose: Record<Handedness, HandPose>): void {
    for (const h of ['left', 'right'] as const) {
      const mesh = this.meshes[h];
      const grip = inXR ? controllers.grips[h] : null;
      const axes = this.axes[h];
      if (!grip) {
        mesh.visible = false;
        axes.visible = false;
        continue;
      }
      if (mesh.parent !== grip) grip.add(mesh);
      if (axes.parent !== grip) grip.add(axes);
      axes.visible = this.showAxes;
      mesh.geometry = handGeometries(look, h === 'left' ? -1 : 1)[pose[h]];
      mesh.visible = true;
    }
  }
}
