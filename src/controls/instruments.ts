import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

/**
 * The bridge instrument displays: speed, heading, engine RPM (+ gear), rudder angle.
 *
 * All four screens share ONE canvas (an atlas, 2 x 2 regions) and ONE merged mesh whose
 * UVs map each screen to its region: one texture upload and one draw call, redrawn at a
 * modest rate (CONFIG.interaction.displayHz) - cheap on the headset.
 *
 * Displays only READ vessel state (they subscribe by sampling it), like any other view.
 */
const W = 1024;
const H = 512;
const RW = 512;
const RH = 256;
const AMBER = '#ffb340';
const DIM = '#6b4a1a';
const BG = '#0d1210';
const GREEN = '#6fe08a';
const RED = '#ff5a45';

type Painter = (g: CanvasRenderingContext2D, s: VesselState, def: VesselDef) => void;

export class InstrumentPanel {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private sinceDraw = Infinity;
  private readonly painters: Painter[] = [paintSpeed, paintHeading, paintRpm, paintRudder];

  constructor(cfg: VesselDef['bridge']) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const d = cfg.displays;
    const tilt = (-cfg.dash.tiltDeg * Math.PI) / 180;
    const faces = d.x.map((x, i) => {
      const plane = new THREE.PlaneGeometry(d.width, d.height);
      // Map this plane's UVs into atlas region i (canvas y grows down; texture v grows up).
      const cx = (i % 2) * RW;
      const cy = Math.floor(i / 2) * RH;
      const uv = plane.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, (cx + uv.getX(k) * RW) / W, 1 - (cy + (1 - uv.getY(k)) * RH) / H);
      }
      plane.rotateX(tilt);
      // Tilted back, the screen's top edge leans toward the dash: stand it off the face
      // far enough that the whole screen stays in front of it.
      plane.translate(x, d.y, cfg.dash.aft + 0.006 + (d.height / 2) * Math.sin(-tilt));
      return plane;
    });
    this.mesh = new THREE.Mesh(mergeGeometries(faces), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.name = 'instruments';
  }

  update(state: VesselState, def: VesselDef, dt: number): void {
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / CONFIG.interaction.displayHz) return;
    this.sinceDraw = 0;
    const g = this.g;
    this.painters.forEach((paint, i) => {
      g.save();
      g.translate((i % 2) * RW, Math.floor(i / 2) * RH);
      g.beginPath();
      g.rect(0, 0, RW, RH);
      g.clip();
      g.fillStyle = BG;
      g.fillRect(0, 0, RW, RH);
      paint(g, state, def);
      // Bezel.
      g.strokeStyle = '#2b2f2c';
      g.lineWidth = 10;
      g.strokeRect(5, 5, RW - 10, RH - 10);
      g.restore();
    });
    this.texture.needsUpdate = true;
  }
}

function title(g: CanvasRenderingContext2D, text: string): void {
  g.fillStyle = DIM;
  g.font = 'bold 26px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(text, 22, 18);
}

function big(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 110, color = AMBER): void {
  g.fillStyle = color;
  g.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

function knots(s: VesselState): number {
  return Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) * 1.943844;
}

function headingDeg(s: VesselState): number {
  const q = new THREE.Quaternion().fromArray(s.orientation);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
}

const paintSpeed: Painter = (g, s) => {
  title(g, 'SPEED  SOG');
  const kn = knots(s);
  g.textAlign = 'right';
  big(g, kn.toFixed(1), 380, 128, 120);
  g.textAlign = 'left';
  big(g, 'kn', 392, 150, 40, DIM);
  // 0-12 kn bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(24, 206, 464, 22);
  g.fillStyle = AMBER;
  g.fillRect(24, 206, Math.min(464, (kn / 12) * 464), 22);
};

const paintHeading: Painter = (g, s) => {
  title(g, 'HEADING');
  const h = headingDeg(s);
  g.textAlign = 'center';
  big(g, `${Math.round(h).toString().padStart(3, '0')}°`, 256, 100, 96);
  // Compass tape: 90 degrees visible across the width, centre line = heading.
  const pxPerDeg = 464 / 90;
  g.save();
  g.beginPath();
  g.rect(24, 160, 464, 76);
  g.clip();
  g.strokeStyle = AMBER;
  g.fillStyle = AMBER;
  g.lineWidth = 3;
  g.font = 'bold 26px ui-monospace, Menlo, Consolas, monospace';
  g.textBaseline = 'top';
  for (let d = Math.floor(h - 50); d <= h + 50; d++) {
    if (d % 5 !== 0) continue;
    const x = 256 + (d - h) * pxPerDeg;
    const major = d % 10 === 0;
    g.beginPath();
    g.moveTo(x, 162);
    g.lineTo(x, major ? 186 : 176);
    g.stroke();
    if (d % 30 === 0) {
      const w = ((d % 360) + 360) % 360;
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[w] ?? String(w);
      g.fillStyle = name.length === 1 ? RED : AMBER;
      g.fillText(name, x, 192);
    }
  }
  g.restore();
  g.fillStyle = GREEN;
  g.beginPath();
  g.moveTo(256, 160);
  g.lineTo(244, 146);
  g.lineTo(268, 146);
  g.fill();
};

const paintRpm: Painter = (g, s, def) => {
  title(g, 'ENGINE RPM');
  const e = s.engine;
  const max = 2000;
  const cx = 150;
  const cy = 160;
  const r = 104;
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  const ang = (rpm: number) => a0 + (a1 - a0) * Math.min(1, rpm / max);
  // Dial: arc, red zone above rated + 50, ticks every 250.
  g.lineWidth = 8;
  g.strokeStyle = '#3a3220';
  g.beginPath();
  g.arc(cx, cy, r, a0, a1);
  g.stroke();
  g.strokeStyle = RED;
  g.beginPath();
  g.arc(cx, cy, r, ang(def.engine.ratedRpm + 50), a1);
  g.stroke();
  g.strokeStyle = AMBER;
  g.lineWidth = 3;
  for (let t = 0; t <= max; t += 250) {
    const a = ang(t);
    const inner = t % 500 === 0 ? r - 22 : r - 12;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  // Needle.
  const a = ang(e.rpm);
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
  g.stroke();
  g.fillStyle = '#ffe6b0';
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  // Digital RPM, gear and engine state.
  g.textAlign = 'right';
  big(g, Math.round(e.rpm).toString(), 488, 92, 72);
  const gear = e.phase !== 'running' ? (e.phase === 'cranking' ? 'CRANKING' : 'ENGINE OFF') : e.gear === 1 ? 'AHEAD' : e.gear === -1 ? 'ASTERN' : 'NEUTRAL';
  const color = e.phase !== 'running' ? (e.phase === 'cranking' ? AMBER : RED) : e.gear === 1 ? GREEN : e.gear === -1 ? RED : AMBER;
  big(g, gear, 488, 160, 38, color);
  // Load (fuel rack) bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(300, 200, 188, 18);
  g.fillStyle = e.rack > 0.95 ? RED : AMBER;
  g.fillRect(300, 200, 188 * e.rack, 18);
  g.fillStyle = DIM;
  g.font = 'bold 20px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'right';
  g.textBaseline = 'top';
  g.fillText('LOAD', 290, 198);
};

const paintRudder: Painter = (g, s, def) => {
  title(g, 'RUDDER');
  const max = def.rudder.maxAngleDeg;
  const deg = (s.rudder * 180) / Math.PI;
  const cx = 256;
  const cy = 70;
  const r = 150;
  // Rudder indicators hang down: 0 straight down, port left (red), starboard right (green).
  const ang = (d: number) => Math.PI / 2 - (d / 45) * (Math.PI / 2) * 0.9;
  g.lineWidth = 10;
  g.strokeStyle = RED;
  g.beginPath();
  g.arc(cx, cy, r, ang(0), ang(-max));
  g.stroke();
  g.strokeStyle = GREEN;
  g.beginPath();
  g.arc(cx, cy, r, ang(max), ang(0));
  g.stroke();
  g.strokeStyle = AMBER;
  g.lineWidth = 3;
  for (let d = -max; d <= max; d += 5) {
    const a = ang(d);
    const inner = d % 10 === 0 ? r - 20 : r - 10;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
    g.stroke();
  }
  // Commanded (helm) as a hollow marker, actual rudder as the needle.
  const cmd = ang(s.controls.helm * max);
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx + Math.cos(cmd) * (r - 30), cy + Math.sin(cmd) * (r - 30), 9, 0, Math.PI * 2);
  g.stroke();
  const a = ang(deg);
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
  g.stroke();
  g.textAlign = 'left';
  const side = Math.abs(deg) < 0.5 ? 'MID' : deg > 0 ? 'STBD' : 'PORT';
  big(g, `${Math.abs(deg).toFixed(0)}°`, 24, 200, 54, Math.abs(deg) < 0.5 ? AMBER : deg > 0 ? GREEN : RED);
  g.textAlign = 'right';
  big(g, side, 488, 200, 44, Math.abs(deg) < 0.5 ? AMBER : deg > 0 ? GREEN : RED);
};
