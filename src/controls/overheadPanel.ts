import { isPowered } from '../vessel/electrics';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { part } from '../render/geometryUtils';
import type { WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';
import type { Control } from './Control';
import { Toggle } from './Toggle';

const W = 256;
const H = 96;

/**
 * The overhead switch panel under the wheelhouse roof, above and ahead of the helm: deck
 * light switches (foredeck flood, aft deck flood, rail lights) and the FM radio (a small
 * display, a power switch and a TUNE button that steps through the stations). The
 * switches hang upside down from the panel (pressed from below); the labels are on the
 * panel's underside, readable from the helm.
 *
 * Draw calls: the panel body is baked with the bridge's fixed parts; labels (1), FM
 * display (1, redrawn only when its text changes), plus the controls.
 */
export class OverheadPanel {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  /** The panel box, in the bridge root frame, for baking with the other fixed parts. */
  readonly body: THREE.BufferGeometry;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private text = '';
  /** What the FM set is doing, set by the App from the player (tuning, playing, no signal). */
  fmStatus = '';

  constructor(def: WorkboatDef) {
    const c = def.overheadPanel;
    const [px, py, pz] = c.position;
    this.root.name = 'overheadPanel';
    this.root.position.set(px, py, pz);
    // Body hangs from the roof (top at the roof) down to the panel face at py.
    const roofY = def.layout.wheelhouse.roofY;
    const h = roofY - py;
    this.body = part(new THREE.BoxGeometry(c.width, h, c.depth).translate(px, py + h / 2, pz), 0x2a2f33);

    // Switches hang down from the panel face: a toggle turned upside down.
    const hang = (ctl: Control, x: number) => {
      ctl.root.position.set(x, 0, 0);
      ctl.root.rotation.x = Math.PI;
      this.root.add(ctl.root);
      this.controls.push(ctl);
    };
    hang(new Toggle('deckFore', 'deckFore', 'Foredeck floodlight', (s) => s.controls.deckFore), c.deckFore);
    hang(new Toggle('deckAft', 'deckAft', 'Aft deck floodlight', (s) => s.controls.deckAft), c.deckAft);
    hang(new Toggle('railLights', 'railLights', 'Rail lights', (s) => s.controls.railLights), c.railLights);
    hang(new Toggle('fmOn', 'fmOn', 'FM radio on/off', (s) => s.controls.fmOn), c.fmPower);
    hang(new Button('fmTune', 'fmTune', 'FM: next station', 'pulse', 0xd88a2a, (s) => s.controls.fmOn > 0), c.fmTune);

    // FM display on the underside, facing down (toward the helm).
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.064), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    // Facing down, top edge toward the bow, so it reads from the helm looking up.
    screen.rotation.x = Math.PI / 2;
    screen.position.set(c.fmDisplay, -0.002, 0);
    this.root.add(screen, this.labels(c));
    this.draw('FM  OFF');
  }

  private labels(c: WorkboatDef['overheadPanel']): THREE.Mesh {
    const items: [string, number][] = [
      ['FOREDECK', c.deckFore],
      ['AFT DECK', c.deckAft],
      ['RAIL', c.railLights],
      ['FM', c.fmPower],
      ['TUNE', c.fmTune],
    ];
    const slotW = 256;
    const slotH = 64;
    const canvas = document.createElement('canvas');
    canvas.width = slotW;
    canvas.height = slotH * items.length;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#e8e2cc';
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    items.forEach(([t], i) => g.fillText(t, slotW / 2, slotH * i + slotH / 2));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geos = items.map(([, x], i) => {
      const p = new THREE.PlaneGeometry(0.09, 0.0225);
      const uv = p.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), 1 - (i + 1) / items.length + uv.getY(k) / items.length);
      // On the underside, aft of the switch (toward the helm), facing down.
      p.rotateX(Math.PI / 2);
      p.translate(x, -0.002, 0.07);
      return p;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    merged.name = 'overheadLabels';
    return merged;
  }

  update(state: VesselState): void {
    const st = CONFIG.fmRadio.stations[state.controls.fmStation];
    // No 12 V: the FM display is dark (an empty text draws a blank screen).
    const text = !isPowered(state) ? '' : state.controls.fmOn && st ? `FM ${st.freq}\n${st.name}${this.fmStatus ? `  ${this.fmStatus}` : ''}` : 'FM  OFF';
    if (text !== this.text) this.draw(text);
  }

  private draw(text: string): void {
    this.text = text;
    const g = this.g;
    g.fillStyle = text ? '#0a1418' : '#020303';
    g.fillRect(0, 0, W, H);
    if (!text) {
      this.texture.needsUpdate = true;
      return;
    }
    g.fillStyle = text.includes('OFF') ? '#3a5560' : '#7fe3ff';
    g.textBaseline = 'middle';
    const [a, b] = text.split('\n');
    g.font = 'bold 34px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(a, 10, b ? 28 : H / 2, W - 20);
    if (b) {
      g.font = '24px system-ui, sans-serif';
      g.fillText(b, 10, 70, W - 20);
    }
    this.texture.needsUpdate = true;
  }
}
