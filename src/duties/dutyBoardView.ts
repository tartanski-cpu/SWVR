import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { Duty } from './duties';

const CW = 1024;

/**
 * The duty board on the wheelhouse wall: a painted board with two sections,
 *   DUTIES             the game's task list (duties.ts): each duty with its steps ticking off;
 *   SHIPPING FORECAST  the last forecast received by radio, with its time (Part C).
 * One canvas texture, redrawn only when what it shows changes. Separate from the crew's
 * whiteboard, which never gets game tasks.
 */
export class DutyBoardView {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly ch: number;
  private signature = '';

  constructor(cfg: { position: [number, number, number]; width: number; height: number }) {
    this.ch = Math.round((CW * cfg.height) / cfg.width);
    this.canvas.width = CW;
    this.canvas.height = this.ch;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.root.position.fromArray(cfg.position);
    this.root.rotation.y = -Math.PI / 2; // on the starboard wall, facing inboard
    const frame = new THREE.Mesh(new THREE.BoxGeometry(cfg.width + 0.04, cfg.height + 0.04, 0.02), new THREE.MeshLambertMaterial({ color: 0x5a3c22 }));
    frame.position.z = -0.012;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), new THREE.MeshBasicMaterial({ map: this.texture }));
    this.root.add(frame, face);
    this.root.name = 'dutyBoard';
    this.draw([], null);
  }

  update(world: WorldState): void {
    const items = world.duties?.items ?? [];
    const fc = world.forecast ?? null;
    const sig = JSON.stringify([items.map((d) => [d.id, d.doneAt !== undefined, d.steps.map((s) => s.done)]), fc?.receivedAt ?? null]);
    if (sig === this.signature) return;
    this.signature = sig;
    this.draw(items, fc);
  }

  private draw(items: Duty[], fc: { text: string; receivedAt: string } | null): void {
    const g = this.g;
    const H = this.ch;
    // Board: dark green, chalky lettering.
    g.fillStyle = '#1d3a2c';
    g.fillRect(0, 0, CW, H);
    const forecastTop = H - 190;
    g.fillStyle = '#e8e2cc';
    g.textBaseline = 'top';
    g.font = 'bold 40px system-ui, sans-serif';
    g.fillText('DUTIES', 28, 18);
    let y = 76;
    const bottom = forecastTop - 20;
    if (!items.length) {
      g.font = 'italic 30px system-ui, sans-serif';
      g.fillStyle = '#9ab8a8';
      g.fillText('Nothing due.', 40, y);
    }
    for (const d of items) {
      if (y > bottom - 40) break;
      const done = d.doneAt !== undefined;
      g.font = 'bold 34px system-ui, sans-serif';
      g.fillStyle = done ? '#7fd08a' : '#ffe08a';
      g.fillText(`${done ? '✔' : '☐'}  ${d.title}`, 28, y);
      y += 46;
      if (done) continue; // finished: just the ticked title until it drops off
      g.font = '28px system-ui, sans-serif';
      for (const s of d.steps) {
        if (y > bottom - 30) break;
        g.fillStyle = s.done ? '#7fd08a' : s.optional ? '#a8c0b4' : '#e8e2cc';
        g.fillText(`${s.done ? '✔' : '·'}  ${s.text}`, 64, y);
        y += 38;
      }
      y += 10;
    }
    // Shipping forecast.
    g.strokeStyle = '#9ab8a8';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(24, forecastTop);
    g.lineTo(CW - 24, forecastTop);
    g.stroke();
    g.fillStyle = '#e8e2cc';
    g.font = 'bold 34px system-ui, sans-serif';
    g.fillText('SHIPPING FORECAST', 28, forecastTop + 14);
    g.font = '28px system-ui, sans-serif';
    if (fc) {
      g.fillStyle = '#9ab8a8';
      g.fillText(`received ${fc.receivedAt}`, 700, forecastTop + 20);
      g.fillStyle = '#e8e2cc';
      wrap(g, fc.text, CW - 60).slice(0, 3).forEach((l, i) => g.fillText(l, 28, forecastTop + 62 + i * 36));
    } else {
      g.fillStyle = '#9ab8a8';
      g.font = 'italic 28px system-ui, sans-serif';
      g.fillText('No forecast received. (Coastguard forecasts come by VHF radio.)', 28, forecastTop + 62);
    }
    this.texture.needsUpdate = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > width && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
