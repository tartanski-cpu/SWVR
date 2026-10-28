import * as THREE from 'three';
import { CONFIG } from '../config';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';
import { panelLit } from './panelLighting';

/**
 * A three-position rotary selector on a switch panel (owner, 28 Oct 2026: the foiling ferry's
 * ride height, "three ride heights"): a knob with a white pointer on a plate marked with its
 * three positions, the first to the left, the second straight ahead, the third to the right.
 * A press steps it on, 0 -> 1 -> 2 -> 0, with a click in the hand; it sends the position
 * number. The authoritative position comes from the vessel state, as a toggle's does.
 * The panel lies flat (y up), her bow is -z: "ahead" points forward, away from the helmsman.
 */
export class Selector3 extends Control {
  readonly kind = 'press' as const;
  private readonly knob = new THREE.Group();
  private pos = 1;

  /**
   * @param marks  what each position is called on the plate (short: two to four letters)
   */
  constructor(
    id: string,
    channel: string,
    readonly label: string,
    private readonly read: (s: VesselState) => number,
    marks: readonly [string, string, string],
  ) {
    super(id, channel);
    const k = CONFIG.interaction.switchScale;
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.07 * k, 0.012, 0.09 * k), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    plate.position.y = 0.006;
    // The marks, on the plate's face round the knob.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.068 * k, 0.088 * k).rotateX(-Math.PI / 2), panelLit(new THREE.MeshBasicMaterial({ map: marksTexture(marks), transparent: true })));
    face.position.y = 0.0125;
    // The knob: a black disc with a white pointer along its top, pointing out from the middle.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * k, 0.018 * k, 0.018, 18), this.material(0x15181a));
    disc.position.y = 0.009;
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.006 * k, 0.006, 0.02 * k).translate(0, 0, -0.008 * k), this.material(0xf2f2ee));
    pointer.position.y = 0.019;
    this.knob.add(disc, pointer);
    this.knob.position.set(0, 0.012, 0.012 * k);
    // What the pointer and reticle hit: the switch at a toggle's full size (hidden), so it's as easy to aim at.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.09).translate(0, 0.025, 0), new THREE.MeshBasicMaterial());
    hit.visible = false;
    this.root.add(plate, face, this.knob, hit);
    this.hitObjects.push(disc, pointer, plate, hit);
    this.show(1);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.03, 0));
  }

  pressStart(): void {
    this.show((this.pos + 1) % 3);
    this.markPending();
    this.ctx?.haptic(0.6, 35);
    this.ctx?.emit(this.channel, this.pos);
  }

  private show(pos: number): void {
    this.pos = pos;
    // 0 to the left (forward and to port), 1 straight ahead, 2 to the right.
    this.knob.rotation.y = (1 - pos) * (Math.PI / 3);
  }

  sync(state: VesselState): void {
    const pos = Math.max(0, Math.min(2, Math.round(this.read(state))));
    if (this.awaiting(pos === this.pos)) return;
    if (pos !== this.pos) this.show(pos);
  }
}

/** The plate's face: the three marks round the knob, each with a tick toward it. */
function marksTexture(marks: readonly [string, string, string]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 256;
  const g = c.getContext('2d')!;
  // (The knob's centre on the canvas: the plate's middle, a little toward the helmsman.)
  const cx = 96;
  const cy = 162;
  g.strokeStyle = '#e8e8e2';
  g.fillStyle = '#e8e8e2';
  g.lineWidth = 6;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  marks.forEach((m, i) => {
    const a = ((i - 1) * Math.PI) / 3; // -60, 0, +60 degrees from straight ahead (up the canvas)
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    g.beginPath();
    g.moveTo(cx + sx * 54, cy + sy * 54);
    g.lineTo(cx + sx * 64, cy + sy * 64);
    g.stroke();
    // (The side marks just inside the plate's edges: at 60 degrees out, x = 96 +- 0.87 r.)
    g.font = `bold ${m.length > 2 ? 26 : 32}px system-ui, sans-serif`;
    g.fillText(m, cx + sx * 80, cy + sy * 80 + (i === 1 ? 4 : 0));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
