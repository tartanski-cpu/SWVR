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
/*
 * Lettering (owner, Oct 2026: the text "can be slightly smaller" so each screen fits more).
 * Sizes in atlas pixels; a screen's 512 px span its 0.38 m width, so 20 px letters stand
 * about 15 mm tall: easy to read at arm's length in the headset. The room this freed holds
 * a few more readings: heading and course on the speed screen, rate of turn on the
 * heading screen, the helm's angle on the rudder screen, battery volts on the engine
 * monitor, the depth on NAV / WIND.
 */
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
/** Each screen's title, top left. */
const TITLE_PX = 20;
/** Labels and secondary readings. */
const TEXT_PX = 20;
/** Small print (the condition bars, the lamps). */
const SMALL_PX = 16;

function font(px: number): string {
  return `bold ${px}px ${MONO}`;
}

/** Speed screen: speed, the echo sounder, heading and course, and the anchor (flash phases while it moves). */
function speedKey(s: VesselState, def: VesselDef): string {
  const a = s.anchor;
  const anchorFlash = a.phase !== 'stowed' && (a.phase !== 'set' || a.dragging) ? Math.floor(performance.now() / 500) % 2 : 0;
  return [knots(s).toFixed(1), Math.min(99.9, depthUnderKeel(s, def)).toFixed(1), Math.round(headingDeg(s)), Math.round(cogDeg(s)), a.phase, a.rodeM.toFixed(0), a.dragging ? 1 : 0, anchorFlash].join('|');
}

function engineKey(s: VesselState): string {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return '';
  const e = s.engine;
  const al = engineAlarms(s, diesel);
  const alarmBlink = al.highTemp || al.lowFuel ? Math.floor(performance.now() / 400) % 2 : 0;
  return [e.coolantC.toFixed(0), e.oilC.toFixed(0), e.fuelL.toFixed(0), e.fuelFlowLph.toFixed(1), al.highTemp ? 1 : 0, al.lowFuel ? 1 : 0, alarmBlink, e.coolingFault ? 1 : 0, (s.damage ?? 0).toFixed(2), (e.wear ?? 0).toFixed(2), (s.electrics?.volts ?? 0).toFixed(1)].join('|');
}

function title(g: CanvasRenderingContext2D, text: string): void {
  g.fillStyle = DIM;
  g.font = font(TITLE_PX);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(text, 20, 16);
}

function big(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 80, color = AMBER): void {
  g.fillStyle = color;
  g.font = font(size);
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** A line of small text: `align` and `baseline` top. */
function text(g: CanvasRenderingContext2D, t: string, x: number, y: number, color = DIM, px = TEXT_PX, align: CanvasTextAlign = 'left'): void {
  g.fillStyle = color;
  g.font = font(px);
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillText(t, x, y);
}

/** Three-figure bearing, 000 to 359. */
function bearing(deg: number): string {
  return `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
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

export function headingDeg(s: VesselState): number {
  const q = new THREE.Quaternion().fromArray(s.orientation);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
}

/** Rate of turn (deg/min, + to starboard): her yaw rate; a turn to port raises her y spin. */
export function rateOfTurn(s: VesselState): number {
  return (-s.angularVelocity[1] * 180 * 60) / Math.PI;
}

/** Depth under her keel as the sounder shows it. */
function depthText(d: number): string {
  return d > 99 ? '>99' : d.toFixed(1);
}

const paintSpeed: Painter = (g, s, def) => {
  title(g, 'SPEED  SOG');
  text(g, 'DEPTH', 316, 16);
  const kn = knots(s);
  g.textAlign = 'right';
  big(g, kn.toFixed(1), 228, 92, 84);
  g.textAlign = 'left';
  big(g, 'kn', 236, 108, 28, DIM);
  // Echo sounder: water under the keel, red under 2 m.
  const underKeel = depthUnderKeel(s, def);
  g.textAlign = 'right';
  big(g, depthText(underKeel), 452, 92, 64, underKeel < 2 ? RED : GREEN);
  g.textAlign = 'left';
  big(g, 'm', 458, 108, 28, DIM);
  // Heading and course, under the speed and depth.
  text(g, `HDG ${bearing(headingDeg(s))}`, 24, 146, GREEN);
  text(g, `COG ${kn > 0.3 ? bearing(cogDeg(s)) : '---'}`, 316, 146, GREEN);
  paintAnchor(g, s);
  // 0-15 kn bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(24, 210, 464, 16);
  g.fillStyle = AMBER;
  g.fillRect(24, 210, Math.min(464, (kn / 15) * 464), 16);
};

/**
 * Anchor indicator on the speed screen (left, under the title), so it's plain whether the
 * anchor is down: UP (dim) when stowed, DOWN with the chain out (steady amber) when it's
 * on the bottom, flashing while the chain runs out or comes in, red DRAGGING.
 */
function paintAnchor(g: CanvasRenderingContext2D, s: VesselState): void {
  const a = s.anchor;
  const flash = Math.floor(performance.now() / 500) % 2 === 0;
  let t: string;
  let color = AMBER;
  switch (a.phase) {
    case 'stowed':
      t = 'ANCHOR UP';
      color = DIM;
      break;
    case 'set':
      t = a.dragging ? 'DRAGGING' : `ANCHOR DOWN ${a.rodeM.toFixed(0)} m`;
      color = a.dragging ? (flash ? RED : DIM) : AMBER;
      break;
    case 'paying':
      t = `LETTING GO ${a.rodeM.toFixed(0)} m`;
      color = flash ? AMBER : DIM;
      break;
    default: // weighing, hanging
      t = `HEAVING IN ${a.rodeM.toFixed(0)} m`;
      color = flash ? AMBER : DIM;
  }
  text(g, t, 24, 178, color);
}

const paintHeading: Painter = (g, s) => {
  title(g, 'HEADING');
  const h = headingDeg(s);
  g.textAlign = 'left';
  big(g, bearing(h), 24, 84, 72);
  // Course over ground and rate of turn, beside the heading.
  const kn = knots(s);
  const rot = rateOfTurn(s);
  text(g, `COG ${kn > 0.3 ? bearing(cogDeg(s)) : '---'}`, 488, 50, GREEN, TEXT_PX, 'right');
  // (Under 3°/min reads 0: a moored boat's sway isn't a turn.)
  const turning = Math.abs(rot) >= 3;
  text(g, `ROT ${turning ? String(Math.round(Math.abs(rot))).padStart(3, ' ') : '  0'}°/min ${!turning ? ' ' : rot > 0 ? 'S' : 'P'}`, 488, 82, !turning ? AMBER : rot > 0 ? GREEN : RED, TEXT_PX, 'right');
  // Compass tape: 90 degrees visible across the width, centre line = heading.
  const pxPerDeg = 464 / 90;
  g.save();
  g.beginPath();
  g.rect(24, 160, 464, 76);
  g.clip();
  g.strokeStyle = AMBER;
  g.fillStyle = AMBER;
  g.lineWidth = 3;
  g.font = font(TEXT_PX);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let d = Math.floor(h - 50); d <= h + 50; d++) {
    if (d % 5 !== 0) continue;
    const x = 256 + (d - h) * pxPerDeg;
    const major = d % 10 === 0;
    g.beginPath();
    g.moveTo(x, 162);
    g.lineTo(x, major ? 184 : 174);
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
  g.lineTo(246, 148);
  g.lineTo(266, 148);
  g.fill();
};

const paintRpm: Painter = (g, s) => {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return;
  title(g, 'ENGINE RPM');
  const e = s.engine;
  const max = 2000;
  const cx = 140;
  const cy = 156;
  const r = 92;
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  const ang = (rpm: number) => a0 + (a1 - a0) * Math.min(1, rpm / max);
  // Dial: arc, red zone above rated + 50, ticks every 250.
  g.lineWidth = 7;
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
    const inner = t % 500 === 0 ? r - 20 : r - 11;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  // Needle.
  const a = ang(e.rpm);
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
  g.stroke();
  g.fillStyle = '#ffe6b0';
  g.beginPath();
  g.arc(cx, cy, 8, 0, Math.PI * 2);
  g.fill();
  // Digital RPM, gear and engine state, then fuel burn and coolant.
  g.textAlign = 'right';
  big(g, (Math.round(e.rpm / 10) * 10).toString(), 488, 66, 56); // in tens, like a real tacho
  const gear = e.phase !== 'running' ? (e.phase === 'cranking' ? 'CRANKING' : 'ENGINE OFF') : e.gear === 1 ? 'AHEAD' : e.gear === -1 ? 'ASTERN' : 'NEUTRAL';
  const color = e.phase !== 'running' ? (e.phase === 'cranking' ? AMBER : RED) : e.gear === 1 ? GREEN : e.gear === -1 ? RED : AMBER;
  big(g, gear, 488, 118, 28, color);
  text(g, `${e.fuelFlowLph.toFixed(1)} L/h  ${e.coolantC.toFixed(0)}°C`, 488, 146, DIM, TEXT_PX, 'right');
  // Load (fuel rack) bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(300, 206, 188, 16);
  g.fillStyle = e.rack > 0.95 ? RED : AMBER;
  g.fillRect(300, 206, 188 * e.rack, 16);
  text(g, 'LOAD', 292, 205, DIM, SMALL_PX, 'right');
};

const paintRudder: Painter = (g, s) => {
  const rudder = gearOf(s, 'rudder');
  if (!rudder) return;
  title(g, 'RUDDER');
  const max = rudder.maxAngleDeg;
  const deg = (s.rudder * 180) / Math.PI;
  const cx = 256;
  const cy = 70;
  const r = 140;
  // Rudder indicators hang down: 0 straight down, port left (red), starboard right (green).
  const ang = (d: number) => Math.PI / 2 - (d / 45) * (Math.PI / 2) * 0.9;
  g.lineWidth = 9;
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
    const inner = d % 10 === 0 ? r - 18 : r - 9;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
    g.stroke();
  }
  // Commanded (helm) as a hollow marker, actual rudder as the needle.
  const helmDeg = s.controls.helm * max;
  const cmd = ang(helmDeg);
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx + Math.cos(cmd) * (r - 28), cy + Math.sin(cmd) * (r - 28), 8, 0, Math.PI * 2);
  g.stroke();
  const a = ang(deg);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
  g.stroke();
  const sideOf = (d: number) => (Math.abs(d) < 0.5 ? 'MID' : d > 0 ? 'STBD' : 'PORT');
  const colorOf = (d: number) => (Math.abs(d) < 0.5 ? AMBER : d > 0 ? GREEN : RED);
  // The helm's order, top right (the hollow marker, in figures).
  text(g, `HELM ${Math.abs(helmDeg).toFixed(0)}° ${sideOf(helmDeg)}`, 488, 16, colorOf(helmDeg), TEXT_PX, 'right');
  g.textAlign = 'left';
  big(g, `${Math.abs(deg).toFixed(0)}°`, 24, 206, 40, colorOf(deg));
  g.textAlign = 'right';
  big(g, sideOf(deg), 488, 206, 32, colorOf(deg));
};

/** Engine monitor: coolant and oil temperature, fuel, consumption, battery, alarm lamps, her condition. */
const paintEngineMonitor: Painter = (g, s) => {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return;
  title(g, 'ENGINE MONITOR');
  const e = s.engine;
  const th = diesel.engine.thermal;
  const al = engineAlarms(s, diesel);
  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  // Horizontal bar gauges: coolant and oil 40-120 °C, fuel 0-100 %.
  const bar = (y: number, label: string, frac: number, value: string, color: string, marks: number[] = []) => {
    g.fillStyle = DIM;
    g.font = font(TEXT_PX);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, 24, y);
    g.fillStyle = '#1f2a24';
    g.fillRect(100, y - 10, 270, 20);
    g.fillStyle = color;
    g.fillRect(100, y - 10, 270 * Math.max(0, Math.min(1, frac)), 20);
    g.fillStyle = '#ffe6b0';
    for (const m of marks) g.fillRect(100 + 270 * m - 1, y - 13, 3, 26);
    g.textAlign = 'right';
    big(g, value, 488, y, 26, color);
  };
  const tFrac = (c: number) => (c - 40) / 80;
  const tempColor = e.coolantC > th.alarmC ? RED : e.coolantC < 60 ? '#7fb8ff' : GREEN;
  bar(60, 'TEMP', tFrac(e.coolantC), `${e.coolantC.toFixed(0)}°C`, tempColor, [tFrac(th.alarmC)]);
  bar(90, 'OIL', tFrac(e.oilC), `${e.oilC.toFixed(0)}°C`, e.oilC > th.alarmC + 10 ? RED : AMBER);
  const fuelFrac = e.fuelL / (e.tankL ?? diesel.engine.fuel.tankL);
  bar(120, 'FUEL', fuelFrac, `${e.fuelL.toFixed(0)} L`, al.lowFuel ? RED : AMBER, [diesel.engine.fuel.lowFraction]);
  // Fuel burn and the battery, then the alarm lamps.
  text(g, `${e.fuelFlowLph.toFixed(1)} L/h`, 24, 142);
  const volts = s.electrics?.volts;
  if (volts !== undefined) text(g, `BATT ${volts.toFixed(1)} V`, 24, 166, volts < 11.8 ? RED : DIM);
  const lamp = (x: number, t: string, on: boolean) => {
    g.fillStyle = on ? (blink ? RED : '#7a1c12') : '#2a1a16';
    g.fillRect(x, 146, 112, 30);
    g.fillStyle = on ? '#fff2e8' : '#4a3430';
    g.font = font(SMALL_PX);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, x + 56, 162);
  };
  lamp(250, 'HIGH TEMP', al.highTemp);
  lamp(376, 'LOW FUEL', al.lowFuel);
  // Her condition (wear.ts; owner: damage and wear were invisible): two small bars, full when sound.
  const cond = (x: number, label: string, sound: number) => {
    g.fillStyle = DIM;
    g.font = font(SMALL_PX);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, x, 214);
    g.fillStyle = '#1f2a24';
    g.fillRect(x + 66, 208, 110, 12);
    g.fillStyle = sound > 0.7 ? GREEN : sound > 0.4 ? AMBER : RED;
    g.fillRect(x + 66, 208, 110 * Math.max(0, Math.min(1, sound)), 12);
    g.fillText(`${Math.round(sound * 100)}%`, x + 182, 214);
  };
  cond(24, 'HULL', 1 - (s.damage ?? 0));
  cond(264, 'ENGINE', 1 - (e.wear ?? 0));
};

/** True and apparent wind where the boat is: speed (m/s) and the direction it blows FROM. */
function winds(s: VesselState, env: EnvironmentState | null): { trueFrom: number; trueSpd: number; appRel: number; appSpd: number } {
  const w = env ? windVector(env, { x: 0, z: 0 }, { x: s.position[0], z: s.position[2] }) : { x: 0, z: 0 };
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

function navKey(s: VesselState, def: VesselDef, env: EnvironmentState | null): string {
  const w = winds(s, env);
  return [formatPosition(s.position[0], s.position[2]), knots(s).toFixed(1), Math.round(cogDeg(s)), Math.round(headingDeg(s)), Math.min(99.9, depthUnderKeel(s, def)).toFixed(1), Math.round(w.trueFrom / 5), Math.round(w.trueSpd * 2), Math.round(w.appRel / 5), Math.round(w.appSpd * 2)].join('|');
}

const paintNav: Painter = (g, s, def, env) => {
  title(g, 'NAV  /  WIND');
  const [lat, lon] = formatPosition(s.position[0], s.position[2]).split(' ');
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = AMBER;
  g.font = font(28);
  g.fillText(lat, 24, 76);
  g.fillText(lon, 24, 110);
  const kn = knots(s);
  const d = depthUnderKeel(s, def);
  text(g, `SOG ${kn.toFixed(1)} kn`, 24, 126, GREEN);
  text(g, `COG ${kn > 0.3 ? bearing(cogDeg(s)) : '---'}`, 24, 152, GREEN);
  text(g, `HDG ${bearing(headingDeg(s))}`, 24, 178, GREEN);
  text(g, `DEPTH ${depthText(d)} m`, 24, 204, d < 2 ? RED : GREEN);
  // Wind: true (from, speed, force) as text; apparent on a dial, bow up.
  const w = winds(s, env);
  const toKn = 1.943844;
  const cx = 392;
  text(g, `TRUE ${bearing(w.trueFrom)} ${(w.trueSpd * toKn).toFixed(0)} kn F${beaufort(w.trueSpd)}`, 488, 16, AMBER, SMALL_PX, 'right');
  const cy = 132;
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
  const side = Math.abs(w.appRel) < 2 || Math.abs(w.appRel) > 178 ? '' : w.appRel > 0 ? ' S' : ' P';
  text(g, `APP ${Math.abs(Math.round(w.appRel))}°${side} ${(w.appSpd * toKn).toFixed(0)} kn`, cx, 208, GREEN, SMALL_PX, 'center');
};

/** The screens there are, for the screen module (modules/screen) to pick from. */
export const SCREENS = {
  speed: { paint: paintSpeed, key: speedKey },
  heading: { paint: paintHeading, key: (s) => [Math.round(headingDeg(s)), knots(s) > 0.3 ? Math.round(cogDeg(s)) : -1, Math.abs(rateOfTurn(s)) < 3 ? 0 : Math.round(rateOfTurn(s))].join('|') },
  rpm: { paint: paintRpm, key: (s) => [Math.round(s.engine.rpm / 10), s.engine.phase, s.engine.gear, Math.round(s.engine.rack * 50), s.engine.fuelFlowLph.toFixed(1), s.engine.coolantC.toFixed(0)].join('|') },
  rudder: { paint: paintRudder, key: (s) => [Math.round(((s.rudder * 180) / Math.PI) * 2), Math.round(s.controls.helm * 100)].join('|') },
  engineMonitor: { paint: paintEngineMonitor, key: engineKey },
  nav: { paint: paintNav, key: (s, def, env) => navKey(s, def, env) },
} satisfies Record<string, Screen>;

export type ScreenName = keyof typeof SCREENS;
