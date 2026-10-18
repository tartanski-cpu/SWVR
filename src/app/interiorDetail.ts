import * as THREE from 'three';
import { houseFloorLow, type WheelhouseDef } from '../vessel/vesselDef';

/**
 * Draw-call saving (performance pass): the wheelhouse's small parts - switches, knobs,
 * the radio and its handset, gauges, the binoculars - are each a draw call or two, and
 * WebXR draws every call once per eye. From out on deck they're a few pixels through the
 * windows, so while the viewer is outside the wheelhouse (and not right at its door) they
 * are hidden. The console, the wheel and the big displays stay.
 *
 * Hidden objects still take part in hit tests (three's Raycaster ignores `visible`) and
 * keep their world matrices, so pointing at a switch through a window still works.
 */
/**
 * Never hidden: the throttle lever (it reads through the windows), the binoculars (carried
 * about, they'd vanish in your hand on deck), the chartplotter and the VHF (their lit
 * screens read through the windows; they were never hidden while their brackets made them
 * big, and since M3c the brackets are merged into the boat's fixed parts). Nor anything
 * holding a light: switching a light's visibility recompiles every lit material (a hitch),
 * and the cabin lamp lights the wheelhouse seen through the windows.
 */
const KEEP = new Set(['control:lever', 'binoculars', 'chartPlotter', 'radio', 'gear:extinguisher', 'gear:torch']);

/** Is it, or does it hold, one of the KEEP parts? (A module's group holds its controls.) */
function holdsKept(o: THREE.Object3D): boolean {
  let found = false;
  o.traverse((c) => {
    if (KEEP.has(c.name)) found = true;
  });
  return found;
}

function hasLight(o: THREE.Object3D): boolean {
  let found = false;
  o.traverse((c) => {
    if ((c as THREE.Light).isLight) found = true;
  });
  return found;
}

export class InteriorDetail {
  private readonly small: THREE.Object3D[] = [];
  private shown = true;
  private readonly box = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();

  /**
   * @param roots   the groups whose children to consider (the bridge, the vessel root)
   * @param vesselRoot the vessel's root (its frame is the wheelhouse's)
   */
  constructor(
    roots: THREE.Object3D[],
    vesselRoot: THREE.Object3D,
    private readonly def: WheelhouseDef,
    maxRadius = 0.3,
  ) {
    const wh = def.layout.wheelhouse;
    vesselRoot.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(vesselRoot.matrixWorld).invert();
    for (const root of roots) {
      for (const o of root.children) {
        if (!o.visible) continue; // already hidden (baked fixed parts)
        if (holdsKept(o) || hasLight(o)) continue;
        // The shared switch bats and button caps span the wheelhouse, but each is small.
        if (o.userData.interiorDetail) {
          this.small.push(o);
          continue;
        }
        this.box.setFromObject(o);
        if (this.box.isEmpty()) continue;
        this.box.applyMatrix4(inv);
        this.box.getBoundingSphere(this.sphere);
        const c = this.sphere.center;
        const inside = Math.abs(c.x) < wh.halfWidth && c.z > wh.front && c.z < wh.aft && c.y > wh.floorY - 0.2 && c.y < wh.roofY;
        if (inside && this.sphere.radius < maxRadius) this.small.push(o);
      }
    }
  }

  get count(): number {
    return this.small.length;
  }

  /** @param viewer the viewer's position in the vessel's frame (null: not aboard her) */
  update(viewer: THREE.Vector3 | null): void {
    const wh = this.def.layout.wheelhouse;
    const m = 1.2; // at the door, or leaning in at a window: show them
    const near = !!viewer && Math.abs(viewer.x) < wh.halfWidth + m && viewer.z > wh.front - m && viewer.z < wh.aft + m && viewer.y > houseFloorLow(wh) - 1;
    if (near === this.shown) return;
    this.shown = near;
    for (const o of this.small) o.visible = near;
  }
}
