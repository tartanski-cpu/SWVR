import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { BowRampLayout } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

const X = new THREE.Vector3(1, 0, 0);

/**
 * The landing craft's bow ramp (layout.bowRamp): a plate hinged across the top of her bow
 * plate, raised to close the bow, lowered to put its lip on a beach. Not itself a control:
 * push buttons (door-button modules on 'ramp.bow.down', `controls.bowRamp` 1 = lowered)
 * work it. Two hydraulic rams, one each side, pivot on posts on the deck (drawn with the
 * hull) and push on lugs on the ramp's edges: their cylinders and rods are turned each frame
 * to stay joined as it swings. Three meshes: the ramp, the two cylinders, the two rods.
 *
 * Built along -z from its hinge (its walking face up) and turned about the hinge's x axis:
 * `raisedDeg` above the horizontal raised, `loweredDeg` (negative) below it lowered.
 *
 * Its toe flaps (`flap`; owner: to reach further): a row of hinged fingers along the lip,
 * one mesh. Folded back flat on the walking face while it's raised; as it comes down (from
 * `flopAt` of the way) they flop over, to hang `hangDeg` below the horizontal, or to lie on
 * the slip at the angle she's landed with (VesselState.slip.flapDeg, world/slipway.ts). A
 * set animation, not physics.
 */
export class BowRamp {
  readonly root = new THREE.Group();
  private readonly ramp = new THREE.Group();
  private readonly cylinders: THREE.Mesh;
  private readonly rods: THREE.Mesh;
  /** The toe flaps, hinged at the lip (a child of the ramp). */
  private readonly flaps = new THREE.Group();
  /** Where the flaps go once it's down: degrees below the horizontal. */
  private flapTo: number;
  /** 0 raised .. 1 lowered, and where it's going. */
  private down = 0;
  private target = 0;
  /** The rams' pivots on their posts (y, z in the root's axes: from the hinge). */
  private readonly base: THREE.Vector3;
  private readonly eye = new THREE.Vector3();

  /**
   * @param hinge the hinge line's middle, on the top of the bow plate (vessel axes)
   * @param deckAtRam the deck's height under the rams' posts
   * @param colours its plate (her topsides), its grip bars (her deck), its fittings
   */
  constructor(
    hinge: THREE.Vector3,
    deckAtRam: number,
    private readonly cfg: BowRampLayout,
    colours: { plate: number; grip: number; fittings: number },
  ) {
    this.root.name = 'bowRamp';
    this.root.position.copy(hinge);
    const { width: w, length: L, ram } = cfg;
    const t = 0.06; // plate thickness, under the walking face
    const parts = [
      part(new THREE.BoxGeometry(w, t, L).translate(0, -t / 2, -L / 2), colours.plate),
      // Its edges turned up, stiffening it (and keeping a wheel on it).
      ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.04, 0.16, L).translate(s * (w / 2 - 0.02), 0.02, -L / 2), colours.plate)),
      // Its lip, bevelled down to meet the beach.
      part(new THREE.BoxGeometry(w, 0.03, 0.12).rotateX(0.35).translate(0, -0.05, -L - 0.05), colours.plate),
      // The hinge's knuckles along the bow.
      ...[-0.7, 0, 0.7].map((x) => part(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10).rotateZ(Math.PI / 2).translate(x * (w / 2), -0.03, 0), colours.fittings)),
      // The rams' lugs, out past its edges.
      ...[-1, 1].map((s) => part(new THREE.BoxGeometry(Math.abs(ram.x - w / 2) + 0.08, 0.1, 0.1).translate(s * (w / 2 + ram.x) / 2, 0.04, -ram.along), colours.fittings)),
    ];
    // Grip bars across the walking face.
    for (let z = -0.15; z > -L + 0.08; z -= 0.2) parts.push(part(new THREE.BoxGeometry(w - 0.1, 0.025, 0.035).translate(0, 0.0125, z), colours.grip));
    const plate = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    this.ramp.add(plate);
    this.root.add(this.ramp);
    // The toe flaps: fingers across the lip, each built along -z from the hinge.
    const f = cfg.flap;
    const fw = (w - (f.count - 1) * f.gap) / f.count;
    const fingers = [];
    for (let i = 0; i < f.count; i++) {
      const x = -w / 2 + fw / 2 + i * (fw + f.gap);
      fingers.push(part(new THREE.BoxGeometry(fw, 0.035, f.length).translate(x, -0.0175, -f.length / 2), colours.plate));
      fingers.push(part(new THREE.BoxGeometry(fw - 0.06, 0.02, 0.03).translate(x, 0.01, -f.length * 0.55), colours.grip));
      fingers.push(part(new THREE.CylinderGeometry(0.03, 0.03, fw * 0.6, 8).rotateZ(Math.PI / 2).translate(x, -0.01, 0), colours.fittings));
    }
    this.flaps.add(new THREE.Mesh(mergeParts(fingers), flatVertexColorMaterial()));
    this.flaps.position.set(0, 0.02, -L - 0.08);
    this.ramp.add(this.flaps);
    this.flapTo = f.hangDeg;

    // The rams: a cylinder from its post, a rod from the ramp's lug; each built along its own
    // +z and long enough to meet the other at full stroke without either poking out past the
    // far pivot at the shortest (the extremes are checked in tests/landingCraft.test.ts).
    this.base = new THREE.Vector3(0, deckAtRam + ram.height - hinge.y, ram.aft);
    const [shortest, longest] = this.ramSpan();
    const each = Math.min(shortest - 0.05, (longest + 0.2) / 2);
    const pair = (r: number, color: number) =>
      new THREE.Mesh(mergeParts([-1, 1].map((s) => part(new THREE.CylinderGeometry(r, r, each, 10).rotateX(Math.PI / 2).translate(s * ram.x, 0, each / 2), color))), flatVertexColorMaterial());
    this.cylinders = pair(0.045, colours.fittings);
    this.rods = pair(0.022, 0xc9ced3);
    this.cylinders.position.copy(this.base);
    this.root.add(this.cylinders, this.rods);
    this.place();
  }

  /** The rams' pivot-to-pivot length, raised and lowered (m). */
  ramSpan(): [number, number] {
    const at = (deg: number) => this.lugAt((deg * Math.PI) / 180, new THREE.Vector3()).distanceTo(this.base);
    const a = at(this.cfg.raisedDeg);
    const b = at(this.cfg.loweredDeg);
    return [Math.min(a, b), Math.max(a, b)];
  }

  /** Lowered (1) or raised (0), as it stands now. */
  get lowered(): number {
    return this.down;
  }

  sync(state: VesselState): void {
    this.target = (state.controls.bowRamp ?? 0) > 0.5 ? 1 : 0;
    // Landed on a slip: the flaps lie on it; else they hang.
    const to = state.slip ? state.slip.flapDeg : this.cfg.flap.hangDeg;
    if (to !== this.flapTo) {
      this.flapTo = to;
      this.place();
    }
  }

  /** Swing toward up / down (call every frame). */
  tick(dt: number): void {
    if (this.down === this.target) return;
    this.down += Math.sign(this.target - this.down) * Math.min(Math.abs(this.target - this.down), dt / this.cfg.travelSec);
    this.place();
  }

  /** Where a ram's lug is with the ramp at `angle` (rad above the horizontal), in the root's axes (x 0). */
  private lugAt(angle: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0.04, -this.cfg.ram.along).applyAxisAngle(X, angle);
  }

  private place(): void {
    // Eased, so it starts and stops gently, as a hydraulic valve opens and closes.
    const e = this.down * this.down * (3 - 2 * this.down);
    const angle = (((1 - e) * this.cfg.raisedDeg + e * this.cfg.loweredDeg) * Math.PI) / 180;
    this.ramp.rotation.x = angle;
    // The flaps: folded back on the face (172° about the lip), flopping over from `flopAt` of
    // the way down to their angle below the horizontal (relative to the ramp: less its own).
    const f = this.cfg.flap;
    const k = Math.min(1, Math.max(0, (this.down - f.flopAt) / (1 - f.flopAt)));
    const kf = k * k * (3 - 2 * k);
    const folded = (172 * Math.PI) / 180;
    const open = (-this.flapTo * Math.PI) / 180 - angle;
    this.flaps.rotation.x = folded + (open - folded) * kf;
    // Each ram pointed along its pivots' line: the cylinder from its post, the rod back from
    // the lug. (About x only: both sides are alike.) Rx(b) takes +z to (0, -sin b, cos b).
    const lug = this.lugAt(angle, this.eye);
    const dy = lug.y - this.base.y;
    const dz = lug.z - this.base.z;
    this.cylinders.rotation.x = Math.atan2(-dy, dz);
    this.rods.position.copy(lug);
    this.rods.rotation.x = Math.atan2(dy, -dz);
  }
}
