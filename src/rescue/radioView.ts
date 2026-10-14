import * as THREE from 'three';
import type { RescueState } from './rescue';
import { Handset } from '../controls/Handset';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';

const W = 512;
const H = 256;

/**
 * The overhead VHF set: a box hung from the wheelhouse roof, tilted down toward the helm,
 * with a speaker grille, a call lamp that flashes red on an incoming distress call, a
 * small screen showing the latest message, and the handset on a clip (picking it up
 * answers a call; see Handset).
 *
 * Draw calls: body (merged), screen (canvas, redrawn only when the text changes), lamp,
 * handset and its cord.
 */
export class RadioSet {
  readonly root = new THREE.Group();
  readonly handset: Handset;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly lamp: THREE.Mesh;
  private signature = '';
  private flash = 0;

  constructor(cfg: { position: [number, number, number]; tiltDeg: number }, roofY: number) {
    this.root.name = 'radio';
    this.root.position.fromArray(cfg.position);
    // The set itself, tilted so its face (+z, aft) looks down toward the helmsman.
    const set = new THREE.Group();
    set.rotation.x = (cfg.tiltDeg * Math.PI) / 180;
    this.root.add(set);

    const w = 0.34;
    const h = 0.13;
    const d = 0.2;
    // Brackets up to the roof (in the root frame, untilted).
    const bracket = (x: number) =>
      part(new THREE.BoxGeometry(0.02, roofY - cfg.position[1], 0.04).translate(x, (roofY - cfg.position[1]) / 2, -0.02), 0x3a3f44);
    const bodyParts = [
      part(new THREE.BoxGeometry(w, h, d), 0x2b3034),
      // Front bezel, speaker grille slats (left of the screen) and two knobs.
      part(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.01).translate(0, 0, d / 2), 0x1d2124),
      ...[0, 1, 2, 3, 4].map((i) => part(new THREE.BoxGeometry(0.07, 0.006, 0.004).translate(-0.12, -0.03 + i * 0.014, d / 2 + 0.006), 0x0c0d0e)),
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2).translate(0.135, 0.03, d / 2 + 0.012), 0x8a8f94),
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2).translate(0.135, -0.025, d / 2 + 0.012), 0x8a8f94),
    ];
    const body = new THREE.Mesh(mergeParts(bodyParts), flatVertexColorMaterial());
    set.add(body);
    this.root.add(new THREE.Mesh(mergeParts([bracket(-0.12), bracket(0.12)]), flatVertexColorMaterial()));

    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.095), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    screen.position.set(0.01, 0.002, d / 2 + 0.0065);
    set.add(screen);

    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), new THREE.MeshBasicMaterial({ color: 0x401010, toneMapped: false }));
    this.lamp.position.set(-0.12, 0.048, d / 2 + 0.008);
    set.add(this.lamp);

    // Handset on a clip on the starboard side of the set, hanging upright.
    const clip = new THREE.Group();
    clip.position.set(w / 2 + 0.045, -0.04, 0.03);
    this.root.add(clip);
    this.handset = new Handset('handset', new THREE.Vector3(-0.04, 0.0, 0));
    clip.add(this.handset.root);
    this.draw(null, 'Listening, channel 16', false);
  }

  /**
   * @param r      rescue state (latest message, active incident)
   * @param status one line about the cargo run / rescue, for the bottom of the screen
   */
  update(r: RescueState | undefined, status: string, dt: number): void {
    const calling = r?.active?.phase === 'calling';
    this.flash += dt;
    const on = calling && this.flash % 0.8 < 0.4;
    (this.lamp.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff2a1a : calling ? 0x601010 : 0x401010);
    const msg = r?.radio ?? null;
    const sig = `${msg?.id ?? 0}|${status}|${calling}`;
    if (sig === this.signature) return;
    this.signature = sig;
    this.draw(msg?.text ?? null, status, calling);
  }

  private draw(text: string | null, status: string, calling: boolean): void {
    const g = this.g;
    g.fillStyle = '#0c1a12';
    g.fillRect(0, 0, W, H);
    g.fillStyle = calling ? '#ff6a50' : '#8fe0a0';
    g.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'top';
    g.fillText(calling ? 'CH16  ◉ INCOMING' : 'CH16', 14, 10);
    g.fillStyle = '#c8f5d2';
    g.font = '24px ui-monospace, Menlo, Consolas, monospace';
    const lines = wrap(g, text ?? 'No traffic.', W - 28).slice(0, 6);
    lines.forEach((l, i) => g.fillText(l, 14, 50 + i * 28));
    g.fillStyle = '#ffd27a';
    g.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(status, 14, H - 32, W - 28);
    this.texture.needsUpdate = true;
  }
}

/** Word-wrap text to a pixel width. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
