import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { RadioPose } from './playerState';
import type { Handedness } from './xrInput';

/**
 * The handheld VHF every player carries (owner request), for talking to the crew beyond
 * shouting distance (net/voice.ts: one channel, a few kilometres).
 *
 * Only with voice chat on (Menu > Crew; off by default).
 *
 *   VR       it's clipped high on your left shoulder (CONFIG.radio.shoulder). Grip it to take it
 *            (it stays in that hand while you hold the grip); hold that hand's trigger to
 *            talk; let go of the grip and it clips back on.
 *   desktop  hold V to talk (no radio drawn: you've no hands to see).
 *
 * Others see it on your shoulder, or in your hand while you hold it (net/avatarView.ts), and
 * hear you through their own radios while you talk.
 */

/**
 * The radio, drawn in the hand frame: the grip at the origin, the aerial toward -z (out of
 * the top of the fist, where the controller points), the little screen and keypad on +y.
 * A dark body with a yellow bumper round it, and a red light that's lit while talking.
 */
export function radioGeometry(): THREE.BufferGeometry {
  const body = 0x26292c;
  const bumper = 0xe0a91c;
  return mergeParts([
    part(new THREE.BoxGeometry(0.055, 0.032, 0.115).translate(0, 0, -0.02), body), // the body
    part(new THREE.BoxGeometry(0.06, 0.036, 0.022).translate(0, 0, 0.03), bumper), // bumpers, bottom and top
    part(new THREE.BoxGeometry(0.06, 0.036, 0.02).translate(0, 0, -0.07), bumper),
    part(new THREE.BoxGeometry(0.036, 0.003, 0.03).translate(0, 0.0175, -0.045), 0x8fb7a8), // the screen
    part(new THREE.BoxGeometry(0.036, 0.003, 0.03).translate(0, 0.0175, -0.005), 0x45494d), // the keypad
    part(new THREE.CylinderGeometry(0.006, 0.008, 0.1, 6).rotateX(Math.PI / 2).translate(0.015, 0, -0.13), 0x1a1c1e), // the aerial
    part(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6).translate(-0.016, 0.02, -0.076), 0x3a3e42), // the knob
  ]);
}

/** The talk light's mesh: a small box at the top of the body (its own material, to light up). */
function talkLight(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.008).translate(0.012, 0.019, -0.076), new THREE.MeshBasicMaterial({ color: 0x401010 }));
  return m;
}

/** Hand frame -> clipped upright on the shoulder: the aerial up, the screen facing out (forward). */
export const CHEST_TURN = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)));

export class RadioHandset {
  readonly mesh: THREE.Mesh;
  private readonly light: THREE.Mesh;
  /** Which VR hand holds it (null: on the shoulder). */
  held: Handedness | null = null;
  /** Talking (the trigger in VR, V on the desktop). */
  tx = false;
  private readonly tmp = new THREE.Vector3();
  private readonly yawQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3();

  constructor() {
    this.mesh = new THREE.Mesh(radioGeometry(), flatVertexColorMaterial());
    this.mesh.name = 'vhf-handset';
    this.light = talkLight();
    this.mesh.add(this.light);
    this.mesh.visible = false;
  }

  /** Is this hand holding it (its grip and trigger are the radio's)? */
  busy(h: Handedness): boolean {
    return this.held === h;
  }

  /**
   * VR, every frame (`scene`: the radio is drawn in world axes). `headPos` / `headQ`: the
   * headset (world). Returns the hands it uses this frame.
   */
  updateXR(scene: THREE.Object3D, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, headPos: THREE.Vector3, headQ: THREE.Quaternion, pulse: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.mesh.visible = true;
    if (this.held) {
      const f = hands[this.held];
      if (!f.tracked || !f.gripDown) {
        pulse(this.held, 0.3, 20);
        this.held = null;
      } else {
        used[this.held] = true;
        this.mesh.position.copy(f.grip);
        if (f.quat) this.mesh.quaternion.copy(f.quat);
        const tx = f.triggerDown;
        if (tx !== this.tx) pulse(this.held, tx ? 0.5 : 0.25, 25);
        this.setTx(tx);
        return used;
      }
    }
    this.setTx(false);
    this.clipOn(headPos, headQ);
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h] || !f.gripPressed) continue;
      if (this.mesh.getWorldPosition(this.tmp).distanceTo(f.grip) < CONFIG.radio.grabRange) {
        this.held = h;
        used[h] = true;
        pulse(h, 0.5, 30);
        break;
      }
    }
    return used;
  }

  /** Desktop (or out of VR, or voice chat off): nothing drawn; talking while `talk` (the V key). Uses no hands. */
  updateDesktop(talk: boolean): Record<Handedness, boolean> {
    this.held = null;
    this.mesh.visible = false;
    this.setTx(talk);
    return { left: false, right: false };
  }

  /** On the shoulder: by and below the head, turned with your heading only (not your nod). */
  private clipOn(headPos: THREE.Vector3, headQ: THREE.Quaternion): void {
    const f = this.fwd.set(0, 0, -1).applyQuaternion(headQ);
    this.yawQ.setFromAxisAngle(UP, Math.atan2(-f.x, -f.z));
    const [x, y, z] = CONFIG.radio.shoulder;
    this.mesh.position.set(x, y, z).applyQuaternion(this.yawQ).add(headPos);
    this.mesh.quaternion.copy(this.yawQ).multiply(CHEST_TURN);
  }

  private setTx(on: boolean): void {
    this.tx = on;
    (this.light.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff3020 : 0x401010);
  }

  /** As others see it. */
  pose(): RadioPose {
    return { hand: this.held, tx: this.tx };
  }
}

const UP = new THREE.Vector3(0, 1, 0);
