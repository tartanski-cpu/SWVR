import * as THREE from 'three';
import { CONFIG } from '../config';
import { Control } from '../controls/Control';
import type { HandFrame } from '../controls/InteractionSystem';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { VesselState } from '../vessel/vesselState';
import type { GearPose } from './playerState';
import type { Handedness } from './xrInput';

/**
 * Hand gear on brackets in the wheelhouse (owner request): the fire extinguisher and the
 * torch. Like the binoculars, a local tool held in a hand; unlike them, what it does is
 * shared: its pose (nozzle / lens and direction, working or not) goes out with the
 * player's pose (PlayerState.avatar.gear), so the host can put fires out with crew-mates'
 * sprays and everyone sees each other's gear, spray and beam.
 *
 *   VR       grip it on its bracket to take it; it stays in that hand while you hold the
 *            grip (carry it ashore, into the skiff...), and goes back to its bracket when
 *            you let go. The same hand's trigger works it: hold to spray (extinguisher),
 *            press to switch on / off (torch).
 *   desktop  click it on its bracket to take it: it's held low to your right, pointing
 *            where you look. Left button: hold to spray / click for on-off (a click on a
 *            control still works the control). Click the bracket again, or press U, to
 *            put it back.
 *
 * Drawn in the hand frame: the grip at the origin, the nozzle / lens toward -z (where the
 * controller points).
 */
export type GearKind = 'extinguisher' | 'torch';

/** The extinguisher: red bottle hanging under the handle, a short black hose to the nozzle. */
function extinguisherMesh(): { mesh: THREE.Mesh; tip: THREE.Vector3 } {
  const red = 0xc4201a;
  const black = 0x1e2124;
  const geo = mergeParts([
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12).translate(0, -0.27, 0.02), red), // the bottle
    part(new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, -0.06, 0.02), red), // its shoulder
    part(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10).translate(0, 0.0, 0.02), 0x9a9ea2), // valve head
    part(new THREE.BoxGeometry(0.03, 0.02, 0.13).translate(0, 0.035, -0.02), black), // the handle and its lever
    part(new THREE.BoxGeometry(0.03, 0.015, 0.11).rotateX(0.15).translate(0, 0.005, -0.03), black),
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).rotateX(Math.PI / 2).translate(0, -0.03, -0.1), black), // hose
    part(new THREE.CylinderGeometry(0.018, 0.012, 0.06, 8).rotateX(Math.PI / 2).translate(0, -0.03, -0.2), black), // nozzle
    part(new THREE.BoxGeometry(0.13, 0.05, 0.002).translate(0, -0.27, -0.056), 0xf2f2ee), // the white label band
  ]);
  return { mesh: new THREE.Mesh(geo, flatVertexColorMaterial()), tip: new THREE.Vector3(0, -0.03, -0.23) };
}

/** The torch: a yellow lantern body with a carrying handle on top, the lens forward. */
function torchMesh(): { mesh: THREE.Mesh; tip: THREE.Vector3 } {
  const yellow = 0xf2b81a;
  const black = 0x1e2124;
  const geo = mergeParts([
    part(new THREE.BoxGeometry(0.1, 0.1, 0.16).translate(0, -0.07, -0.02), yellow), // body
    part(new THREE.CylinderGeometry(0.065, 0.055, 0.06, 14).rotateX(Math.PI / 2).translate(0, -0.06, -0.12), black), // lens bezel
    part(new THREE.CircleGeometry(0.055, 14).translate(0, -0.06, -0.151).rotateY(Math.PI).translate(0, 0, -0.302), 0xf4f0d8), // lens
    part(new THREE.BoxGeometry(0.025, 0.025, 0.12).translate(0, 0.0, -0.02), black), // handle bar
    ...[-0.07, 0.03].map((z) => part(new THREE.BoxGeometry(0.025, 0.04, 0.02).translate(0, -0.015, z), black)), // its posts
  ]);
  return { mesh: new THREE.Mesh(geo, flatVertexColorMaterial()), tip: new THREE.Vector3(0, -0.06, -0.16) };
}

export function gearMesh(kind: GearKind): { mesh: THREE.Mesh; tip: THREE.Vector3 } {
  return kind === 'extinguisher' ? extinguisherMesh() : torchMesh();
}

/**
 * The bracket on the wall: a clickable spot (desktop) to take the gear or hang it back.
 * Its hit box covers the gear hanging there. Its channel `gear:<kind>` is handled by the
 * App (local, no intent).
 */
export class GearBracket extends Control {
  readonly kind = 'press' as const;
  readonly label: string;
  private pressed = false;
  /** Shown in the label: someone else has it. */
  takenElsewhere = false;

  constructor(readonly gear: GearKind) {
    super(`gear:${gear}`, `gear:${gear}`);
    this.label = gear === 'extinguisher' ? 'Fire extinguisher: take / hang back' : 'Torch: take / hang back';
    const h = gear === 'extinguisher' ? 0.55 : 0.2;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = gear === 'extinguisher' ? -0.22 : -0.04;
    // The bracket itself: a dark strap and back plate on the wall (aft of the gear, +z).
    const strap = new THREE.Mesh(
      mergeParts(
        gear === 'extinguisher'
          ? [part(new THREE.BoxGeometry(0.12, 0.3, 0.012).translate(0, -0.26, 0.1), 0x2a2e33), part(new THREE.BoxGeometry(0.17, 0.03, 0.03).translate(0, -0.32, 0.085), 0x2a2e33)]
          : [part(new THREE.BoxGeometry(0.08, 0.12, 0.012).translate(0, -0.05, 0.075), 0x2a2e33), part(new THREE.BoxGeometry(0.03, 0.03, 0.08).translate(0, 0.0, 0.04), 0x2a2e33)],
      ),
      flatVertexColorMaterial(),
    );
    this.root.add(hit, strap);
    this.hitObjects.push(hit);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.4, 30);
    this.ctx?.emit(this.channel, 1);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(_state: VesselState): void {}
}

export class HandGear {
  /** The gear itself: on its bracket (child of the ship's root) or in a hand (scene root). */
  readonly mesh: THREE.Mesh;
  /** The nozzle / lens point in the gear's frame. */
  private readonly tip: THREE.Vector3;
  readonly bracket: GearBracket;
  /** Which hand holds it ('desk' for the desktop mouse), or null: on its bracket. */
  held: Handedness | 'desk' | null = null;
  /** Spraying / lit. */
  on = false;
  /** The torch's own light (only the torch; only while lit, `realLight`). */
  readonly light: THREE.SpotLight | null = null;
  private home: THREE.Object3D | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  constructor(readonly kind: GearKind) {
    const g = gearMesh(kind);
    this.mesh = g.mesh;
    this.mesh.name = `gear:${kind}`;
    this.tip = g.tip;
    this.bracket = new GearBracket(kind);
    if (kind === 'torch' && CONFIG.handGear.torch.realLight) {
      const c = CONFIG.handGear.torch;
      // Not lit: invisible, so no shader includes it (one recompile when first switched on).
      const light = new THREE.SpotLight(0xfff4dc, c.intensity, c.distance, (c.angleDeg * Math.PI) / 180, 0.35, 2);
      light.visible = false;
      light.position.copy(this.tip);
      light.target.position.set(this.tip.x, this.tip.y, this.tip.z - 5);
      this.mesh.add(light, light.target);
      this.light = light;
    }
  }

  /** Hang it on its bracket in `parent` (the workboat's root), at `pos` (its axes). */
  mount(parent: THREE.Object3D, pos: readonly number[]): void {
    this.home = parent;
    // The bracket's root is the gear's hanging point (the handle).
    const up = this.kind === 'extinguisher' ? 0.27 : 0.07;
    this.bracket.root.position.set(pos[0], pos[1] + up, pos[2]);
    parent.add(this.bracket.root);
    this.hangBack();
  }

  hangBack(): void {
    this.held = null;
    this.setOn(false);
    if (!this.home) return;
    this.home.add(this.mesh);
    this.mesh.position.copy(this.bracket.root.position);
    this.mesh.quaternion.identity();
  }

  private take(h: Handedness | 'desk'): void {
    this.held = h;
    let o: THREE.Object3D = this.mesh;
    while (o.parent) o = o.parent;
    o.add(this.mesh);
  }

  private setOn(on: boolean): void {
    this.on = on;
    if (this.light) this.light.visible = on;
  }

  /** Is this hand holding it (its grip and trigger are the gear's)? */
  busy(h: Handedness): boolean {
    return this.held === h;
  }

  /**
   * VR: take it, carry it, work it with the trigger. `othersHave`: a crew-mate holds it
   * (you can't take it then). Returns the hands it used this frame.
   */
  updateXR(hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, othersHave: boolean, pulse: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (this.held === 'desk') this.hangBack();
    const held = this.held;
    if (held && held !== 'desk') {
      const f = hands[held];
      if (!f.tracked || !f.gripDown) {
        pulse(held, 0.3, 20);
        this.hangBack();
        return used;
      }
      used[held] = true;
      this.mesh.position.copy(f.grip);
      if (f.quat) this.mesh.quaternion.copy(f.quat);
      if (this.kind === 'extinguisher') this.setOn(f.triggerDown);
      else if (f.triggerPressed) {
        this.setOn(!this.on);
        pulse(held, 0.3, 20);
      }
      return used;
    }
    if (othersHave) return used;
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h] || !f.gripPressed) continue;
      if (this.mesh.getWorldPosition(this.tmp).distanceTo(f.grip) < CONFIG.handGear.grabRange) {
        this.take(h);
        used[h] = true;
        pulse(h, 0.5, 30);
        break;
      }
    }
    return used;
  }

  /** Desktop: take it from / hang it back on the bracket (a click on it, or U to hang back). */
  toggleDesk(othersHave: boolean): void {
    if (this.held) this.hangBack();
    else if (!othersHave) this.take('desk');
  }

  /**
   * Desktop, every frame while held: low to your right, pointing where you look.
   * `down` / `pressed`: the left button (not on a control).
   */
  updateDesktop(camera: THREE.Camera, down: boolean, pressed: boolean): void {
    if (this.held !== 'desk') return;
    const [x, y, z] = CONFIG.handGear.deskHold;
    camera.updateMatrixWorld();
    this.mesh.position.set(x, y, z).applyMatrix4(camera.matrixWorld);
    camera.getWorldQuaternion(this.mesh.quaternion);
    // Aim the nozzle / lens at what's under the reticle, a few metres on.
    const look = camera.getWorldDirection(this.tmpD);
    const target = this.tmp.setFromMatrixPosition(camera.matrixWorld).addScaledVector(look, 8);
    this.mesh.lookAt(target);
    this.mesh.rotateY(Math.PI); // lookAt points +z at the target; the nozzle is -z
    if (this.kind === 'extinguisher') this.setOn(down);
    else if (pressed) this.setOn(!this.on);
  }

  /** Where the hand is (desktop: for the avatar's "hand"). */
  handPoint(out: THREE.Vector3): THREE.Vector3 | null {
    return this.held === 'desk' ? this.mesh.getWorldPosition(out) : null;
  }

  /** Its nozzle / lens and direction (world). */
  tipWorld(outP: THREE.Vector3, outD: THREE.Vector3): void {
    this.mesh.updateMatrixWorld();
    outP.copy(this.tip).applyMatrix4(this.mesh.matrixWorld);
    outD.set(0, 0, -1).transformDirection(this.mesh.matrixWorld);
  }

  /** The pose to share (frame coordinates via `inv`, the inverse of your frame), or null on its bracket. */
  pose(inv: THREE.Matrix4): GearPose | null {
    if (!this.held) return null;
    const r = (x: number) => Math.round(x * 1000) / 1000;
    const p = this.tmp;
    const d = this.tmpD;
    this.tipWorld(p, d);
    p.applyMatrix4(inv);
    d.transformDirection(inv);
    return { kind: this.kind, on: this.on, p: [r(p.x), r(p.y), r(p.z)], d: [r(d.x), r(d.y), r(d.z)] };
  }
}
