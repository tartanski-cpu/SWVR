import { isPowered } from '../vessel/electrics';
import { panelLit } from './panelLighting';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BreakerName } from '../vessel/vesselState';
import { CONFIG } from '../config';
import { gearOf } from '../boats/sims';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { groundHeight } from '../world/terrain';
import type { EnvironmentState } from '../environment/environmentState';
import { beaufort, windVector } from '../environment/weather';
import { formatPosition } from '../nav/geo';

/**
 * The bridge's screens (speed, heading, rpm, rudder, engine monitor, NAV / WIND) and the
 * display atlas they share.
 *
 * Modular boats (M3): each screen is its own instrument module (src/modules/screen), and
 * the screens a boat carries all share ONE canvas (an atlas of 512 x 256 regions) and ONE
 * merged mesh whose UVs map each screen to its region: one texture upload and one draw
 * call, redrawn at a modest rate (CONFIG.interaction.displayHz), cheap on the headset.
 * The assembler owns the atlas; a screen module claims a region with its painter.
 *
 * The atlas repaints (and re-uploads) only when something shown has changed: each screen
 * gives a key, its values rounded to what you could see change (a tenth of a knot, a
 * degree of heading, 10 rpm...); equal keys mean identical screens. Without 12 V on its
 * circuit a screen goes black.
 *
 * Until the engine is a module (M4) the painters read the boat's state and definition
 * directly, as they always have. They only READ, like any other view.
 */
const W = 1024;
const H = 768;
const RW = 512;
const RH = 256;
const COLS = W / RW;
const MAX_REGIONS = (W / RW) * (H / RH);
const AMBER = '#ffb340';
const DIM = '#6b4a1a';
const BG = '#0d1210';
const GREEN = '#6fe08a';
const RED = '#ff5a45';

/** Each screen reads her state and her vessel definition; her engine and rudder are her modules' (gearOf). */
type Painter = (g: CanvasRenderingContext2D, s: VesselState, def: VesselDef, env: EnvironmentState | null) => void;
type ScreenKey = (s: VesselState, def: VesselDef, env: EnvironmentState | null) => string;

/** One screen: how to draw it and what it shows. */
export interface Screen {
  paint: Painter;
  key: ScreenKey;
}

/** A screen as fitted: its region, its circuit, its plane (vessel axes). */
interface Region {
  screen: Screen;
  circuit: BreakerName;
  index: number;
}

export class DisplayAtlas {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly regions: Region[] = [];
  private readonly planes: THREE.BufferGeometry[] = [];
  private sinceDraw = Infinity;
  private lastKey = '';
  /** The merged screens (built by `finish()`). */
  mesh: THREE.Mesh | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /**
   * Fit a screen. `plane` is the screen's face in vessel axes, its UVs 0..1 across it;
   * they are remapped into the screen's region of the atlas.
   */
  add(screen: Screen, plane: THREE.BufferGeometry, circuit: BreakerName): void {
    const index = this.regions.length;
    if (index >= MAX_REGIONS) throw new Error(`the display atlas holds ${MAX_REGIONS} screens`);
    const cx = (index % COLS) * RW;
    const cy = Math.floor(index / COLS) * RH;
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k) * RW) / W, 1 - (cy + (1 - uv.getY(k)) * RH) / H);
    this.regions.push({ screen, circuit, index });
    this.planes.push(plane);
  }

  /** Merge the fitted screens into one mesh (after every screen is added). */
  finish(): THREE.Mesh | null {
    if (!this.planes.length) return null;
    this.mesh = new THREE.Mesh(mergeGeometries(this.planes), panelLit(new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })));
    this.mesh.name = 'instruments';
    return this.mesh;
  }

  update(state: VesselState, def: VesselDef, dt: number, env: EnvironmentState | null = null): void {
    if (!this.regions.length) return;
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / CONFIG.interaction.displayHz) return;
    this.sinceDraw = 0;
    // Only repaint (and re-upload the 3 MB atlas) when something shown has changed: moored
    // or drifting with the engine off, the screens cost nothing. No 12 V: black (drawn once).
    const powered = this.regions.map((r) => isPowered(state, r.circuit));
    const key = this.regions.map((r, i) => (powered[i] ? r.screen.key(state, def, env) : 'off')).join('#');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.g;
    this.regions.forEach((r, i) => {
      g.save();
      g.translate((r.index % COLS) * RW, Math.floor(r.index / COLS) * RH);
      g.beginPath();
      g.rect(0, 0, RW, RH);
      g.clip();
      if (!powered[i]) {
        g.fillStyle = '#020303';
        g.fillRect(0, 0, RW, RH);
        g.restore();
        return;
      }
      g.fillStyle = BG;
      g.fillRect(0, 0, RW, RH);
      r.screen.paint(g, state, def, env);
      // Bezel.
      g.strokeStyle = '#2b2f2c';
      g.lineWidth = 10;
      g.strokeRect(5, 5, RW - 10, RH - 10);
      g.restore();
    });
    this.texture.needsUpdate = true;
  }
}

/** Speed screen: speed, the echo sounder and the anchor (flash phases while it moves). */
function speedKey(s: VesselState, def: VesselDef): string {
  const a = s.anchor;
  const anchorFlash = a.phase !== 'stowed' && (a.phase !== 'set' || a.dragging) ? Math.floor(performance.now() / 500) % 2 : 0;
  return [knots(s).toFixed(1), Math.min(99.9, depthUnderKeel(s, def)).toFixed(1), a.phase, a.rodeM.toFixed(0), a.dragging ? 1 : 0, anchorFlash].join('|');
}

function engineKey(s: VesselState): string {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return '';
  const e = s.engine;
  const al = engineAlarms(s, diesel);
  const alarmBlink = al.highTemp || al.lowFuel ? Math.floor(performance.now() / 400) % 2 : 0;
  return [e.coolantC.toFixed(0), e.oilC.toFixed(0), e.fuelL.toFixed(0), e.fuelFlowLph.toFixed(1), al.highTemp ? 1 : 0, al.lowFuel ? 1 : 0, alarmBlink, e.coolingFault ? 1 : 0].join('|');
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

/**
 * Echo sounder: water under the keel, from the still waterline (like a real sounder's
 * smoothing, it doesn't jump with every wave's heave).
 */
function depthUnderKeel(s: VesselState, def: VesselDef): number {
  return -groundHeight(s.position[0], s.position[2]) + def.hull.params.keelY;
}

function knots(s: VesselState): number {
  return Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) * 1.943844;
}

function headingDeg(s: VesselState): number {
  const q = new THREE.Quaternion().fromArray(s.orientation);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
}

const paintSpeed: Painter = (g, s, def) => {
  title(g, 'SPEED  SOG');
  // Echo sounder: water under the keel.
  const underKeel = depthUnderKeel(s, def);
  g.textAlign = 'right';
  g.fillStyle = underKeel < 2 ? RED : GREEN;
  g.font = 'bold 26px ui-monospace, Menlo, Consolas, monospace';
  g.textBaseline = 'top';
  g.fillText(underKeel > 99 ? 'DEPTH >99 m' : `DEPTH ${underKeel.toFixed(1)} m`, 488, 18);
  const kn = knots(s);
  g.textAlign = 'right';
  big(g, kn.toFixed(1), 380, 128, 120);
  g.textAlign = 'left';
  big(g, 'kn', 392, 150, 40, DIM);
  // 0-15 kn bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(24, 206, 464, 22);
  g.fillStyle = AMBER;
  g.fillRect(24, 206, Math.min(464, (kn / 15) * 464), 22);
  paintAnchor(g, s);
};

/**
 * Anchor indicator on the speed screen (left, under the title), so it's plain whether the
 * anchor is down: UP (dim) when stowed, DOWN with the chain out (steady amber) when it's
 * on the bottom, flashing while the chain runs out or comes in, red DRAGGING.
 */
function paintAnchor(g: CanvasRenderingContext2D, s: VesselState): void {
  const a = s.anchor;
  const flash = Math.floor(performance.now() / 500) % 2 === 0;
  let text: string;
  let color = AMBER;
  switch (a.phase) {
    case 'stowed':
      text = 'ANCHOR UP';
      color = DIM;
      break;
    case 'set':
      text = a.dragging ? 'DRAGGING' : `ANCHOR DOWN ${a.rodeM.toFixed(0)} m`;
      color = a.dragging ? (flash ? RED : DIM) : AMBER;
      break;
    case 'paying':
      text = `LETTING GO ${a.rodeM.toFixed(0)} m`;
      color = flash ? AMBER : DIM;
      break;
    default: // weighing, hanging
      text = `HEAVING IN ${a.rodeM.toFixed(0)} m`;
      color = flash ? AMBER : DIM;
  }
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = 'bold 24px ui-monospace, Menlo, Consolas, monospace';
  g.fillStyle = color;
  g.fillText(text, 24, 172);
}

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

const paintRpm: Painter = (g, s) => {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return;
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
  g.arc(cx, cy, r, ang(diesel.engine.ratedRpm + 50), a1);
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
  big(g, (Math.round(e.rpm / 10) * 10).toString(), 488, 92, 72); // in tens, like a real tacho
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

const paintRudder: Painter = (g, s) => {
  const rudder = gearOf(s, 'rudder');
  if (!rudder) return;
  title(g, 'RUDDER');
  const max = rudder.maxAngleDeg;
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

/** Engine monitor: coolant and oil temperature, fuel, consumption, alarm lamps. */
const paintEngineMonitor: Painter = (g, s) => {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return;
  title(g, 'ENGINE MONITOR');
  const e = s.engine;
  const th = diesel.engine.thermal;
  const al = engineAlarms(s, diesel);
  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  // Two horizontal bar gauges: coolant 40-120 °C, fuel 0-100 %.
  const bar = (y: number, label: string, frac: number, value: string, color: string, marks: number[] = []) => {
    g.fillStyle = DIM;
    g.font = 'bold 24px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, 24, y);
    g.fillStyle = '#1f2a24';
    g.fillRect(130, y - 13, 230, 26);
    g.fillStyle = color;
    g.fillRect(130, y - 13, 230 * Math.max(0, Math.min(1, frac)), 26);
    g.fillStyle = '#ffe6b0';
    for (const m of marks) g.fillRect(130 + 230 * m - 1, y - 17, 3, 34);
    g.textAlign = 'right';
    big(g, value, 492, y, 34, color);
  };
  const tFrac = (c: number) => (c - 40) / 80;
  const tempColor = e.coolantC > th.alarmC ? RED : e.coolantC < 60 ? '#7fb8ff' : GREEN;
  bar(78, 'TEMP', tFrac(e.coolantC), `${e.coolantC.toFixed(0)}°C`, tempColor, [tFrac(th.alarmC)]);
  bar(118, 'OIL', tFrac(e.oilC), `${e.oilC.toFixed(0)}°C`, e.oilC > th.alarmC + 10 ? RED : AMBER);
  const fuelFrac = e.fuelL / (e.tankL ?? diesel.engine.fuel.tankL);
  bar(158, 'FUEL', fuelFrac, `${e.fuelL.toFixed(0)} L`, al.lowFuel ? RED : AMBER, [diesel.engine.fuel.lowFraction]);
  g.fillStyle = DIM;
  g.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'left';
  g.fillText(`${e.fuelFlowLph.toFixed(1)} L/h`, 24, 204);
  // Alarm lamps.
  const lamp = (x: number, text: string, on: boolean) => {
    g.fillStyle = on ? (blink ? RED : '#7a1c12') : '#2a1a16';
    g.fillRect(x, 188, 120, 34);
    g.fillStyle = on ? '#fff2e8' : '#4a3430';
    g.font = 'bold 20px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.fillText(text, x + 60, 206);
  };
  lamp(236, 'HIGH TEMP', al.highTemp);
  lamp(368, 'LOW FUEL', al.lowFuel);
};

/** True and apparent wind where the boat is: speed (m/s) and the direction it blows FROM. */
function winds(s: VesselState, env: EnvironmentState | null): { trueFrom: number; trueSpd: number; appRel: number; appSpd: number } {
  const w = env ? windVector(env, { x: 0, z: 0 }) : { x: 0, z: 0 };
  const trueSpd = Math.hypot(w.x, w.z);
  // Blowing toward (x, z); FROM is the opposite bearing (0 = north = -z).
  const trueFrom = trueSpd > 0.05 ? ((Math.atan2(-w.x, w.z) * 180) / Math.PI + 360) % 360 : 0;
  // Apparent: the wind you feel on deck = true wind minus the boat's velocity.
  const ax = w.x - s.linearVelocity[0];
  const az = w.z - s.linearVelocity[2];
  const appSpd = Math.hypot(ax, az);
  const appFrom = ((Math.atan2(-ax, az) * 180) / Math.PI + 360) % 360;
  // Relative to the bow: -180..180, + to starboard.
  const appRel = ((appFrom - headingDeg(s) + 540) % 360) - 180;
  return { trueFrom, trueSpd, appRel, appSpd };
}

/** Course over ground (deg). */
function cogDeg(s: VesselState): number {
  return ((Math.atan2(s.linearVelocity[0], -s.linearVelocity[2]) * 180) / Math.PI + 360) % 360;
}

function navKey(s: VesselState, env: EnvironmentState | null): string {
  const w = winds(s, env);
  return [formatPosition(s.position[0], s.position[2]), Math.round(cogDeg(s)), Math.round(w.trueFrom / 5), Math.round(w.trueSpd * 2), Math.round(w.appRel / 5), Math.round(w.appSpd * 2)].join('|');
}

const paintNav: Painter = (g, s, _def, env) => {
  title(g, 'NAV  /  WIND');
  const mono = 'ui-monospace, Menlo, Consolas, monospace';
  const [lat, lon] = formatPosition(s.position[0], s.position[2]).split(' ');
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = AMBER;
  g.font = `bold 34px ${mono}`;
  g.fillText(lat, 24, 92);
  g.fillText(lon, 24, 132);
  const kn = knots(s);
  g.font = `bold 26px ${mono}`;
  g.fillStyle = GREEN;
  g.fillText(`SOG ${kn.toFixed(1)} kn`, 24, 174);
  g.fillText(`COG ${kn > 0.3 ? String(Math.round(cogDeg(s))).padStart(3, '0') + '°' : '---'}`, 24, 206);
  g.fillText(`HDG ${String(Math.round(headingDeg(s)) % 360).padStart(3, '0')}°`, 24, 238);
  // Wind: true (from, speed, force) as text; apparent on a dial, bow up.
  const w = winds(s, env);
  const toKn = 1.943844;
  g.fillStyle = AMBER;
  g.font = `bold 22px ${mono}`;
  g.fillText(`TRUE ${String(Math.round(w.trueFrom)).padStart(3, '0')}° ${(w.trueSpd * toKn).toFixed(0)} kn F${beaufort(w.trueSpd)}`, 268, 66);
  const cx = 388;
  const cy = 156;
  const r = 66;
  g.strokeStyle = DIM;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  // Ticks every 30 degrees.
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    g.beginPath();
    g.moveTo(cx + Math.sin(t) * (r - 8), cy - Math.cos(t) * (r - 8));
    g.lineTo(cx + Math.sin(t) * r, cy - Math.cos(t) * r);
    g.stroke();
  }
  // The boat, bow up.
  g.fillStyle = '#3a4a40';
  g.beginPath();
  g.moveTo(cx, cy - 26);
  g.lineTo(cx + 11, cy + 4);
  g.lineTo(cx + 9, cy + 24);
  g.lineTo(cx - 9, cy + 24);
  g.lineTo(cx - 11, cy + 4);
  g.closePath();
  g.fill();
  // Apparent wind: an arrow from the rim (where it comes from) toward the boat.
  if (w.appSpd > 0.3) {
    const t = (w.appRel * Math.PI) / 180;
    const ox = cx + Math.sin(t) * (r - 4);
    const oy = cy - Math.cos(t) * (r - 4);
    const ix = cx + Math.sin(t) * 30;
    const iy = cy - Math.cos(t) * 30;
    g.strokeStyle = GREEN;
    g.fillStyle = GREEN;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ix, iy);
    g.stroke();
    const hx = -Math.sin(t);
    const hy = Math.cos(t);
    g.beginPath();
    g.moveTo(ix, iy);
    g.lineTo(ix - hx * 14 + hy * 9, iy - hy * 14 - hx * 9);
    g.lineTo(ix - hx * 14 - hy * 9, iy - hy * 14 + hx * 9);
    g.closePath();
    g.fill();
  }
  g.fillStyle = GREEN;
  g.font = `bold 20px ${mono}`;
  g.textAlign = 'center';
  const side = Math.abs(w.appRel) < 2 || Math.abs(w.appRel) > 178 ? '' : w.appRel > 0 ? ' S' : ' P';
  g.fillText(`APP ${Math.abs(Math.round(w.appRel))}°${side} ${(w.appSpd * toKn).toFixed(0)} kn`, cx, 246);
};

/** The screens there are, for the screen module (modules/screen) to pick from. */
export const SCREENS = {
  speed: { paint: paintSpeed, key: speedKey },
  heading: { paint: paintHeading, key: (s) => String(Math.round(headingDeg(s))) },
  rpm: { paint: paintRpm, key: (s) => [Math.round(s.engine.rpm / 10), s.engine.phase, s.engine.gear, Math.round(s.engine.rack * 50)].join('|') },
  rudder: { paint: paintRudder, key: (s) => [Math.round(((s.rudder * 180) / Math.PI) * 2), Math.round(s.controls.helm * 100)].join('|') },
  engineMonitor: { paint: paintEngineMonitor, key: engineKey },
  nav: { paint: paintNav, key: (s, _def, env) => navKey(s, env) },
} satisfies Record<string, Screen>;

export type ScreenName = keyof typeof SCREENS;
