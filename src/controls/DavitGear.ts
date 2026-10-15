import * as THREE from 'three';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';

type Davit = NonNullable<VesselDef['davit']>;

const STEEL = 0xc8ccd0;
const ROPE = 0xe8dcc0;
/** How far the empty falls hang below the arm heads (m). */
const SLACK = 0.7;

/**
 * The stern davit on the ship (its two arms and the falls) and its LAUNCH / RECOVER button,
 * in the ship's axes (`root` goes in the ship's view root).
 *
 * The falls run from the arm heads down to the tender's lifting points while she's on
 * them; with her afloat they hang short, hooks dangling. The button sends `<tenderId>:davit`
 * (one click: launch if stowed, recover if she's under the stern); its hover text says
 * which, or why she can't be recovered yet.
 */
export class DavitGear {
  readonly root = new THREE.Group();
  readonly button: Button;
  private readonly falls: THREE.Mesh[] = [];
  private readonly hooks: THREE.Mesh[] = [];
  private readonly heads: THREE.Vector3[];
  private readonly a = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly q = new THREE.Quaternion();

  constructor(
    readonly tenderId: string,
    private readonly davit: Davit,
  ) {
    const d = davit;
    const steel = new THREE.MeshLambertMaterial({ color: STEEL });
    this.heads = [-1, 1].map((sx) => new THREE.Vector3(sx * d.armX, d.topY, d.headZ));
    for (const sx of [-1, 1]) {
      const x = sx * d.armX;
      // Post up from the quarter, then a knee and the arm reaching aft over the tender.
      const postH = d.topY - d.baseY;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, postH, 10), steel);
      post.position.set(x, d.baseY + postH / 2, d.baseZ);
      const reach = d.headZ - d.baseZ;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, reach + 0.08, 10).rotateX(Math.PI / 2), steel);
      arm.position.set(x, d.topY, d.baseZ + reach / 2);
      const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(0.5, 0.5), 8).rotateX(Math.PI / 4), steel);
      knee.position.set(x, d.topY - 0.25, d.baseZ + 0.25);
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a2e33 }));
      block.position.set(x, d.topY - 0.1, d.headZ);
      this.root.add(post, arm, knee, block);
      // Falls: a unit-length rope (scaled each frame) and the hook at its end.
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5).translate(0, -0.5, 0), new THREE.MeshLambertMaterial({ color: ROPE }));
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 10, Math.PI * 1.5), steel);
      this.falls.push(fall);
      this.hooks.push(hook);
      this.root.add(fall, hook);
    }
    this.button = new Button(`davit:${tenderId}`, `${tenderId}:davit`, 'Skiff: launch / recover', 'pulse', 0x2a8f3a, () => this.moving);
    this.button.root.position.fromArray(d.button);
    this.button.root.rotation.x = -Math.PI / 2; // facing forward, onto the aft deck
    this.root.add(this.button.root);
  }

  private moving = false;

  /**
   * @param tender      the tender's state
   * @param recover     can she be recovered now, and if not why
   * @param tenderRoot  her (interpolated) view root, for the lifting points
   */
  update(tender: VesselState, recover: { ok: boolean; why: string }, tenderRoot: THREE.Object3D | undefined): void {
    const phase = tender.tender?.phase ?? 'free';
    this.moving = phase === 'lowering' || phase === 'hoisting';
    const charge = Math.round((tender.battery ?? 0) * 100);
    this.button.label =
      phase === 'stowed'
        ? `Skiff: LAUNCH (battery ${charge} %)`
        : phase === 'lowering'
          ? 'Skiff: lowering...'
          : phase === 'hoisting'
            ? 'Skiff: hoisting...'
            : recover.ok
              ? 'Skiff: RECOVER'
              : `Skiff: RECOVER - ${recover.why}`;
    this.button.sync(tender);

    // Falls: to her lifting points while she's on them, else hanging slack.
    const onFalls = phase !== 'free' && !!tenderRoot;
    this.root.updateWorldMatrix(true, false);
    for (let i = 0; i < 2; i++) {
      const head = this.heads[i];
      if (onFalls) {
        // Her lifting points are at her ends; with her athwartships, the one at her stern
        // (+z, the outboard) is under the starboard arm.
        const z = (i === 1 ? 1 : -1) * this.davit.liftZ;
        tenderRoot!.localToWorld(this.a.set(0, 0.45, z));
        this.root.worldToLocal(this.a);
      } else {
        this.a.set(head.x, head.y - SLACK, head.z);
      }
      const dir = this.a.clone().sub(head);
      const len = Math.max(0.05, dir.length());
      const fall = this.falls[i];
      fall.position.copy(head);
      fall.quaternion.copy(this.q.setFromUnitVectors(this.up.set(0, -1, 0), dir.normalize()));
      this.up.set(0, 1, 0);
      fall.scale.set(1, len, 1);
      this.hooks[i].position.copy(this.a);
    }
  }
}
