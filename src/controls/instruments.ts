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
import { addCurrent } from '../world/currents';
import { litresPerNm, newEfficiencyLog, rangeNm, record, sweetSpot, type EfficiencyLog } from './efficiency';

/**
 * The bridge's screens (speed, heading, rpm, rudder, engine monitor, NAV / WIND) and the
 * display atlas they share.
 *
 * Modular boats (M3): each screen is its own instrument module (src/modules/screen), and
 * the screens a boat carries all share ONE canvas (an atlas) and ONE merged mesh whose UVs
 * map each screen to its region: one texture upload and one draw call, redrawn at a modest
 * rate (CONFIG.interaction.displayHz), cheap on the headset. The assembler owns the atlas;
 * a screen module claims a region with its painter.
 *
 * Screen sizes (owner, Oct 2026: "a full size screen, and then there'll be a half size or
 * a quarter size"): a screen is made of quarter cells (256 x 128 px: half a full screen's
 * width and half its height): a full screen is 2 x 2 of them (512 x 256), a
 * strip 2 x 1 (two quarters side by side: the TOW LINE), a quarter 1 x 1 (the ANCHOR). The
 * atlas packs them in its grid of cells; the screen module sizes the glass to match.
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
/** (1024 tall since the ANCHOR and TOW LINE screens: a tug with the advanced instruments carries six full screens, a strip and a quarter: 27 cells.) */
const H = 1024;
/** A quarter cell (px): half a full screen's width and height. */
const CW = 256;
const CH = 128;
const COLS = W / CW;
const ROWS = H / CH;
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
  /** Its size in quarter cells, across and down: [2, 2] a full screen (the default), [2, 1] a strip, [1, 1] a quarter. */
  cells?: [1 | 2, 1 | 2];
  /**
   * An analogue gauge (old school; owner, Oct 2026: "a circular backing plate, and integrate
   * more directly onto the" dash): painted on a clear ground, so only the round gauge and its
   * name show on the dash, with no screen's black rectangle or bezel; and shown without 12 V
   * too (a gauge doesn't go black).
   */
  round?: boolean;
}

/** A screen's size in quarter cells. */
export const cellsOf = (s: Screen): [number, number] => s.cells ?? [2, 2];

/** A screen as fitted: its region's corner and size (atlas px), its circuit. */
interface Region {
  screen: Screen;
  circuit: BreakerName;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where screens of these sizes (quarter cells, across and down) go in the atlas's grid, in
 * turn: each at the first place, row by row, where all its cells are free. Throws if one
 * doesn't fit (more screens than the atlas holds).
 */
export function packCells(sizes: [number, number][]): { col: number; row: number }[] {
  const used = Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false));
  return sizes.map(([w, h]) => {
    for (let row = 0; row + h <= ROWS; row++)
      for (let col = 0; col + w <= COLS; col++) {
        let free = true;
        for (let r = row; r < row + h && free; r++) for (let c = col; c < col + w && free; c++) free = !used[r][c];
        if (!free) continue;
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) used[r][c] = true;
        return { col, row };
      }
    throw new Error(`the display atlas is full (it holds ${COLS * ROWS} quarter cells)`);
  });
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
    // Its place: packed with those before it (they keep theirs).
    const sizes = [...this.regions.map((r) => [r.w / CW, r.h / CH] as [number, number]), cellsOf(screen)];
    const at = packCells(sizes).at(-1)!;
    const [cw, ch] = cellsOf(screen);
    const region = { screen, circuit, x: at.col * CW, y: at.row * CH, w: cw * CW, h: ch * CH };
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (region.x + uv.getX(k) * region.w) / W, 1 - (region.y + (1 - uv.getY(k)) * region.h) / H);
    this.regions.push(region);
    this.planes.push(plane);
  }

  /** Merge the fitted screens into one mesh (after every screen is added). */
  finish(): THREE.Mesh | null {
    if (!this.planes.length) return null;
    // (Alpha-tested: an analogue gauge's clear ground is cut away, so it sits on the dash; the
    // screens are opaque, unchanged.)
    this.mesh = new THREE.Mesh(mergeGeometries(this.planes), panelLit(new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, alphaTest: 0.5 })));
    this.mesh.name = 'instruments';
    return this.mesh;
  }

  update(state: VesselState, def: VesselDef, dt: number, env: EnvironmentState | null = null): void {
    if (!this.regions.length) return;
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / CONFIG.interaction.displayHz) return;
    this.sinceDraw = 0;
    // Only repaint (and re-upload the 4 MB atlas) when something shown has changed: moored
    // or drifting with the engine off, the screens cost nothing. No 12 V: black (drawn once).
    const powered = this.regions.map((r) => r.screen.round || isPowered(state, r.circuit));
    const key = this.regions.map((r, i) => (powered[i] ? r.screen.key(state, def, env) : 'off')).join('#');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.g;
    this.regions.forEach((r, i) => {
      g.save();
      g.translate(r.x, r.y);
      g.beginPath();
      g.rect(0, 0, r.w, r.h);
      g.clip();
      if (!powered[i]) {
        g.fillStyle = '#020303';
        g.fillRect(0, 0, r.w, r.h);
        g.restore();
        return;
      }
      if (r.screen.round) {
        // A gauge: on a clear ground (cut away by the material's alpha test), no bezel.
        g.clearRect(0, 0, r.w, r.h);
        r.screen.paint(g, state, def, env);
        g.restore();
        return;
      }
      g.fillStyle = BG;
      g.fillRect(0, 0, r.w, r.h);
      r.screen.paint(g, state, def, env);
      // Bezel (thinner round a small screen).
      const b = r.h < 2 * CH ? 6 : 10;
      g.strokeStyle = '#2b2f2c';
      g.lineWidth = b;
      g.strokeRect(b / 2, b / 2, r.w - b, r.h - b);
      g.restore();
    });
    this.texture.needsUpdate = true;
  }
}

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

/** Speed screen: the log (speed through the water), the echo sounder, heading and course. */
function speedKey(s: VesselState, def: VesselDef): string {
  return [logKnots(s).toFixed(1), Math.min(99.9, depthUnderKeel(s, def)).toFixed(1), Math.round(headingDeg(s)), Math.round(cogDeg(s))].join('|');
}

function engineKey(s: VesselState): string {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return '';
  const e = s.engine;
  const al = engineAlarms(s, diesel);
  const alarmBlink = al.highTemp || al.lowFuel ? Math.floor(performance.now() / 400) % 2 : 0;
  return [e.coolantC.toFixed(0), e.oilC.toFixed(0), e.fuelL.toFixed(0), e.fuelFlowLph.toFixed(1), al.highTemp ? 1 : 0, al.lowFuel ? 1 : 0, alarmBlink, e.coolingFault ? 1 : 0, (s.damage ?? 0).toFixed(2), (e.wear ?? 0).toFixed(2), (s.electrics?.volts ?? 0).toFixed(1), Math.round((s.battery ?? 0) * 1000), (e.powerKw ?? 0).toFixed(1)].join('|');
}

/** Electric motors (modules/pods `electric`): her battery's usable kWh; null for a diesel. */
function batteryKWhOf(s: VesselState): number | null {
  return gearOf(s, 'diesel')?.electric?.usableKWh ?? null;
}
/** What she's using now: a diesel's litres an hour, or electric motors' kilowatts from her battery. */
function burnOf(s: VesselState): number {
  return batteryKWhOf(s) === null ? s.engine.fuelFlowLph : Math.max(0, s.engine.powerKw ?? 0);
}
function burnText(s: VesselState): string {
  return batteryKWhOf(s) === null ? `${s.engine.fuelFlowLph.toFixed(1)} L/h` : `${Math.max(0, s.engine.powerKw ?? 0).toFixed(1)} kW`;
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

/** Speed over the ground (kn): what the GPS gives (the overhead NAV panel's SOG). */
function knots(s: VesselState): number {
  return Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) * 1.943844;
}

/**
 * Speed through the water (kn): what the log reads (owner, Oct 2026: "the speed gauge should
 * actually read speed through water"): her speed over the ground less the tidal current where
 * she is (world/currents.ts), as her hull feels it.
 */
export function logKnots(s: VesselState): number {
  const c = { x: 0, z: 0 };
  addCurrent(s.position[0], s.position[2], c);
  return Math.hypot(s.linearVelocity[0] - c.x, s.linearVelocity[2] - c.z) * 1.943844;
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
  // The log: speed through the water (over the ground is the overhead NAV panel's SOG).
  title(g, 'SPEED  LOG');
  text(g, 'DEPTH', 316, 16);
  const kn = logKnots(s);
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
  text(g, `COG ${knots(s) > 0.3 ? bearing(cogDeg(s)) : '---'}`, 316, 146, GREEN);
  // 0-15 kn bar.
  g.fillStyle = '#1f2a24';
  g.fillRect(24, 210, 464, 16);
  g.fillStyle = AMBER;
  g.fillRect(24, 210, Math.min(464, (kn / 15) * 464), 16);
};

const paintHeading: Painter = (g, s) => {
  title(g, 'HEADING');
  const h = headingDeg(s);
  g.textAlign = 'left';
  big(g, bearing(h), 24, 84, 72);
  // Course over ground, beside the heading. (No rate of turn: owner, Oct 2026, its flicker
  // between port and starboard told nothing.)
  const kn = knots(s);
  text(g, `COG ${kn > 0.3 ? bearing(cogDeg(s)) : '---'}`, 488, 50, GREEN, TEXT_PX, 'right');
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

/**
 * Engine and steering (on every boat: the basic controls' too): revs, gear and engine state,
 * fuel burn and coolant, load; and where the rudder (or the outboards' or stern drives' legs)
 * actually is against where the helm asks for it (owner, Oct 2026: "see the actual position of
 * the rudder or the Kort nozzle ... a slight delay between especially the Xbox controller input
 * and what the position of that thing"; the round rev counter, which said what the figures
 * say, made room for it).
 */
const paintRpm: Painter = (g, s) => {
  const diesel = gearOf(s, 'diesel');
  if (!diesel) return;
  const rudder = gearOf(s, 'rudder');
  const e = s.engine;
  // (A word for each engine's state and gear, and its colour.)
  const gearOf2 = (x: typeof e) => (x.phase !== 'running' ? (x.phase === 'cranking' ? 'CRANKING' : 'ENGINE OFF') : x.gear === 1 ? 'AHEAD' : x.gear === -1 ? 'ASTERN' : 'NEUTRAL');
  const colourOf2 = (x: typeof e) => (x.phase !== 'running' ? (x.phase === 'cranking' ? AMBER : RED) : x.gear === 1 ? GREEN : x.gear === -1 ? RED : AMBER);
  if (e.stbd) {
    // Twin engines worked separately: a line each, port then starboard.
    title(g, 'ENGINES');
    [e, e.stbd].forEach((x, k) => {
      const y = 50 + k * 40;
      text(g, k ? 'S' : 'P', 24, y - 6, k ? GREEN : RED, 26);
      g.textAlign = 'right';
      big(g, (Math.round(x.rpm / 10) * 10).toString(), 196, y, 36);
      g.textAlign = 'left';
      big(g, 'rpm', 204, y, 18, DIM);
      g.textAlign = 'right';
      big(g, gearOf2(x), 488, y, 26, colourOf2(x));
    });
    text(g, `${e.fuelFlowLph.toFixed(1)} L/h`, 488, 122, DIM, TEXT_PX, 'right');
    if (diesel.azimuth) {
      // Azimuth drives (the harbour tug's): a dial each, port then starboard, seen from above,
      // her bow up: the arrow where the drive points (the way it pushes), the ring where its
      // lever asks it to (they part while it turns), TRANSIT when the wheel has them.
      const asks = [s.controls.aziAngle ?? 0, s.controls.aziAngle2 ?? s.controls.aziAngle ?? 0];
      const levers = [s.controls.lever, s.controls.lever2 ?? s.controls.lever];
      [e, e.stbd].forEach((x, k) => azimuthDial(g, k ? 370 : 142, 192, ((x.azimuth ?? 0) * 180) / Math.PI, (levers[k] ?? 0) < 0 ? asks[k] + 180 : asks[k], k ? GREEN : RED));
      if (s.controls.aziTransit) text(g, 'TRANSIT', 256, 196, AMBER, SMALL_PX, 'center');
      return;
    }
  } else {
  title(g, 'ENGINE');
  // Revs in figures (in tens, like a real tacho), gear and engine state beside them.
  g.textAlign = 'right';
  big(g, (Math.round(e.rpm / 10) * 10).toString(), 236, 66, 56);
  g.textAlign = 'left';
  big(g, 'rpm', 244, 78, 20, DIM);
  const gear = e.phase !== 'running' ? (e.phase === 'cranking' ? 'CRANKING' : 'ENGINE OFF') : e.gear === 1 ? 'AHEAD' : e.gear === -1 ? 'ASTERN' : 'NEUTRAL';
  const color = e.phase !== 'running' ? (e.phase === 'cranking' ? AMBER : RED) : e.gear === 1 ? GREEN : e.gear === -1 ? RED : AMBER;
  g.textAlign = 'right';
  big(g, gear, 488, 54, 28, color);
  // (Fuel burn, or an electric boat's power; the coolant's on the ENGINE MONITOR: owner, Oct 2026.)
  text(g, burnText(s), 488, 78, DIM, TEXT_PX, 'right');
  // Load (fuel rack) bar.
  text(g, 'LOAD', 24, 108, DIM, SMALL_PX);
  g.fillStyle = '#1f2a24';
  g.fillRect(80, 110, 408, 12);
  g.fillStyle = e.rack > 0.95 ? RED : AMBER;
  g.fillRect(80, 110, 408 * Math.min(1, e.rack), 12);
  }
  if (!rudder) return;
  // Steering: a scale across, port red, starboard green; the needle where it is, the ring
  // where the helm asks for it.
  const max = rudder.maxAngleDeg;
  const deg = (s.rudder * 180) / Math.PI;
  const helmDeg = s.controls.helm * max;
  const sideOf = (d: number) => (Math.abs(d) < 0.5 ? 'MID' : d > 0 ? 'STBD' : 'PORT');
  const colorOf = (d: number) => (Math.abs(d) < 0.5 ? AMBER : d > 0 ? GREEN : RED);
  text(g, diesel.units ? 'DRIVES' : 'RUDDER', 24, 140, DIM);
  text(g, `${Math.abs(deg).toFixed(0)}° ${sideOf(deg)}`, 488, 136, colorOf(deg), 26, 'right');
  const cx = 256;
  const half = 212;
  const y = 200;
  const xAt = (d: number) => cx + (Math.max(-max, Math.min(max, d)) / max) * half;
  g.lineWidth = 6;
  g.strokeStyle = RED;
  g.beginPath();
  g.moveTo(xAt(-max), y);
  g.lineTo(cx, y);
  g.stroke();
  g.strokeStyle = GREEN;
  g.beginPath();
  g.moveTo(cx, y);
  g.lineTo(xAt(max), y);
  g.stroke();
  g.strokeStyle = AMBER;
  g.lineWidth = 2;
  for (let d = -Math.floor(max / 5) * 5; d <= max; d += 5) {
    const x = xAt(d);
    g.beginPath();
    g.moveTo(x, y - (d % 10 === 0 ? 14 : 8));
    g.lineTo(x, y + (d % 10 === 0 ? 14 : 8));
    g.stroke();
  }
  // The helm's order: a hollow ring.
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(xAt(helmDeg), y, 11, 0, Math.PI * 2);
  g.stroke();
  // Where it is: the needle.
  g.fillStyle = '#ffe6b0';
  g.fillRect(xAt(deg) - 3, y - 26, 6, 52);
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
  const lamp = (x: number, t: string, on: boolean) => {
    g.fillStyle = on ? (blink ? RED : '#7a1c12') : '#2a1a16';
    g.fillRect(x, 146, 112, 30);
    g.fillStyle = on ? '#fff2e8' : '#4a3430';
    g.font = font(SMALL_PX);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, x + 56, 162);
  };
  const usable = batteryKWhOf(s);
  const volts = s.electrics?.volts;
  if (usable !== null) {
    // Electric motors: her battery's charge and the kWh left, what the motors draw (of their
    // most; green while they give some back), the 12 V side, and LOW BATT.
    const soc = s.battery ?? 0;
    bar(60, 'BATT', soc, `${Math.round(soc * 100)}%`, al.lowFuel ? RED : GREEN, [diesel.engine.fuel.lowFraction]);
    const kw = e.powerKw ?? 0;
    bar(90, 'POWER', Math.abs(kw) / (diesel.engine.powerKw * (diesel.units?.length ?? 1)), `${kw.toFixed(1)} kW`, kw < 0 ? GREEN : AMBER);
    text(g, `${(soc * usable).toFixed(1)} kWh LEFT`, 24, 142);
    if (volts !== undefined) text(g, `12 V ${volts.toFixed(1)} V`, 24, 166, volts < 11.8 ? RED : DIM);
    lamp(376, 'LOW BATT', al.lowFuel);
  } else {
    const tempColor = e.coolantC > th.alarmC ? RED : e.coolantC < 60 ? '#7fb8ff' : GREEN;
    bar(60, 'TEMP', tFrac(e.coolantC), `${e.coolantC.toFixed(0)}°C`, tempColor, [tFrac(th.alarmC)]);
    bar(90, 'OIL', tFrac(e.oilC), `${e.oilC.toFixed(0)}°C`, e.oilC > th.alarmC + 10 ? RED : AMBER);
    const fuelFrac = e.fuelL / (e.tankL ?? diesel.engine.fuel.tankL);
    bar(120, 'FUEL', fuelFrac, `${e.fuelL.toFixed(0)} L`, al.lowFuel ? RED : AMBER, [diesel.engine.fuel.lowFraction]);
    // Fuel burn and the battery, then the alarm lamps.
    text(g, `${e.fuelFlowLph.toFixed(1)} L/h`, 24, 142);
    if (volts !== undefined) text(g, `BATT ${volts.toFixed(1)} V`, 24, 166, volts < 11.8 ? RED : DIM);
    lamp(250, 'HIGH TEMP', al.highTemp);
    lamp(376, 'LOW FUEL', al.lowFuel);
  }
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
  cond(264, usable !== null ? 'MOTORS' : 'ENGINE', 1 - (e.wear ?? 0));
};

/**
 * EFFICIENCY (owner, 27 Oct 2026: "an efficiency instrument ... litres per nautical mile, so
 * that basically we can find the sweet spot"; controls/efficiency.ts): litres a mile now, big;
 * her fuel flow and speed; how far her fuel takes her at this speed; and the sweet-spot chart,
 * her litres a mile against her speed as she's been driven (each player's screen gathers its
 * own), its lowest point marked. Stage 1: diesel; her energy, CO2 and trips to come.
 */
const effLogs = new Map<string, EfficiencyLog>();
function effLog(def: VesselDef): EfficiencyLog {
  let log = effLogs.get(def.id);
  if (!log) effLogs.set(def.id, (log = newEfficiencyLog()));
  return log;
}
function efficiencyKey(s: VesselState, def: VesselDef): string {
  const log = effLog(def);
  const kn = logKnots(s);
  const burn = burnOf(s);
  record(log, performance.now() / 1000, kn, burn);
  const l = litresPerNm(burn, kn);
  return [l === null ? '-' : l.toFixed(2), kn.toFixed(1), burn.toFixed(1), Math.round(s.engine.fuelL), Math.round((s.battery ?? 0) * 1000), log.version].join('|');
}
const paintEfficiency: Painter = (g, s, def) => {
  title(g, 'EFFICIENCY');
  const log = effLog(def);
  const kn = logKnots(s);
  // (Electric motors: kilowatt-hours a mile, from what they draw; the range from her battery's charge.)
  const usable = batteryKWhOf(s);
  const unit = usable === null ? 'L' : 'kWh';
  const flow = burnOf(s);
  const l = litresPerNm(flow, kn);
  // Left: litres a mile now, then the flow and speed it's from, and the range at this speed.
  g.textAlign = 'left';
  big(g, l === null ? '--' : l < 10 ? l.toFixed(2) : l.toFixed(1), 20, 84, 52);
  text(g, `${unit} / nm`, 22, 114, AMBER);
  text(g, burnText(s), 22, 150);
  text(g, `${kn.toFixed(1)} kn`, 22, 174);
  const r = rangeNm(usable === null ? s.engine.fuelL : (s.battery ?? 0) * usable, l);
  text(g, r === null ? 'RANGE --' : `RANGE ${Math.round(r)} nm`, 22, 206, r !== null && r < 10 ? RED : GREEN);
  // Right: the sweet-spot chart (speed across, litres a mile up), its axes scaled to what's seen.
  const x0 = 200;
  const x1 = 492;
  const y0 = 228;
  const y1 = 50;
  const c = CONFIG.efficiency;
  let topKn = 10;
  let topL = 1;
  log.bins.forEach((v, i) => {
    if (!Number.isNaN(v)) {
      topKn = Math.max(topKn, (i + 1) * c.binKn);
      topL = Math.max(topL, v);
    }
  });
  topKn = Math.ceil(topKn / 5) * 5;
  topL = Math.ceil(topL * 1.15);
  const X = (k: number) => x0 + ((x1 - x0) * k) / topKn;
  const Y = (v: number) => y0 - ((y0 - y1) * v) / topL;
  g.strokeStyle = DIM;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y1);
  g.lineTo(x0, y0);
  g.lineTo(x1, y0);
  g.stroke();
  text(g, `${topL} ${unit}/nm`, x0 + 6, y1 - 4, DIM, SMALL_PX);
  text(g, `${topKn} kn`, x1, y0 + 6, DIM, SMALL_PX, 'right');
  // Her readings: a dot each speed she's been steady at, joined in order of speed.
  const pts: [number, number][] = [];
  log.bins.forEach((v, i) => {
    if (!Number.isNaN(v)) pts.push([X((i + 0.5) * c.binKn), Y(v)]);
  });
  g.strokeStyle = AMBER;
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.stroke();
  g.fillStyle = AMBER;
  for (const [px, py] of pts) g.fillRect(px - 3, py - 3, 6, 6);
  // Her sweet spot (green), and where she is now (a hollow ring).
  const best = sweetSpot(log);
  if (best) {
    g.fillStyle = GREEN;
    g.beginPath();
    g.arc(X(best.knots), Y(best.lpnm), 7, 0, Math.PI * 2);
    g.fill();
    text(g, `BEST ${best.knots.toFixed(1)} kn ${best.lpnm.toFixed(2)} ${unit}/nm`, x1, 18, GREEN, SMALL_PX, 'right');
  } else text(g, 'DRIVE STEADY TO FILL', x1, 18, DIM, SMALL_PX, 'right');
  if (l !== null && kn <= topKn && l <= topL) {
    g.strokeStyle = '#ffe6b0';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(X(kn), Y(l), 9, 0, Math.PI * 2);
    g.stroke();
  }
};

/**
 * SOLAR & BATTERY (owner, 27 Oct 2026, the solar catamaran's; modules/solarRoof): her battery
 * (%, kWh), the sun's power into her (and the sunlight), what her motors draw, the net (green
 * charging), how long to full or to flat at that, and a chart of the last hour: the sun in
 * (green) and the motors out (amber), a point every `CONFIG.solarScreen.sampleS` (each
 * player's screen gathers its own). Plugged in at the quay: SHORE POWER and its kW.
 */
interface SolarLog {
  t: number;
  sun: number[];
  out: number[];
  version: number;
}
const solarLogs = new Map<string, SolarLog>();
function solarLog(def: VesselDef): SolarLog {
  let log = solarLogs.get(def.id);
  if (!log) solarLogs.set(def.id, (log = { t: -Infinity, sun: [], out: [], version: 0 }));
  return log;
}
/** Into her battery now (sun and shore), and out of it to her motors (kW). */
function solarFlows(s: VesselState): { sun: number; shore: number; out: number; net: number } {
  const sun = s.solar?.chargeKw ?? 0;
  const shore = s.shore?.chargeKw ?? 0;
  const out = Math.max(0, s.engine.powerKw ?? 0);
  return { sun, shore, out, net: sun + shore - (s.engine.powerKw ?? 0) };
}
function solarKey(s: VesselState, def: VesselDef): string {
  const log = solarLog(def);
  const now = performance.now() / 1000;
  const c = CONFIG.solarScreen;
  const f = solarFlows(s);
  if (now - log.t >= c.sampleS) {
    log.t = now;
    log.sun.push(s.solar?.panelKw ?? 0);
    log.out.push(f.out);
    const keep = Math.round(c.windowS / c.sampleS);
    if (log.sun.length > keep) {
      log.sun.splice(0, log.sun.length - keep);
      log.out.splice(0, log.out.length - keep);
    }
    log.version++;
  }
  return [Math.round((s.battery ?? 0) * 1000), (s.solar?.panelKw ?? 0).toFixed(1), f.out.toFixed(1), f.shore.toFixed(1), Math.round((s.solar?.wm2 ?? 0) / 10), log.version].join('|');
}
/** Hours as "3 h 20" (or "--"). */
function hoursText(h: number): string {
  if (!Number.isFinite(h) || h > 99) return '--';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
const paintSolar: Painter = (g, s, def) => {
  title(g, 'SOLAR & BATTERY');
  const usable = batteryKWhOf(s) ?? 0;
  const soc = s.battery ?? 0;
  const f = solarFlows(s);
  const sunKw = s.solar?.panelKw ?? 0;
  // Left: the battery, then the flows and how long at this rate.
  g.textAlign = 'left';
  big(g, `${Math.round(soc * 100)}%`, 20, 84, 52, soc < (gearOf(s, 'diesel')?.engine.fuel.lowFraction ?? 0.1) ? RED : GREEN);
  text(g, `${(soc * usable).toFixed(1)} kWh`, 22, 114, AMBER);
  text(g, `SUN ${sunKw.toFixed(1)} kW`, 22, 146, GREEN);
  text(g, `MOTORS ${f.out.toFixed(1)} kW`, 22, 170, AMBER);
  text(g, `NET ${f.net >= 0 ? '+' : ''}${f.net.toFixed(1)} kW`, 22, 194, f.net >= 0 ? GREEN : RED);
  const hours = f.net > 0.05 ? ((1 - soc) * usable) / f.net : f.net < -0.05 ? (soc * usable) / -f.net : Infinity;
  text(g, f.net > 0.05 ? `FULL IN ${hoursText(hours)}` : f.net < -0.05 ? `FLAT IN ${hoursText(hours)}` : 'STEADY', 22, 218, DIM);
  // Top right: the sunlight, or shore power when plugged in.
  if (s.shore) text(g, `SHORE POWER ${s.shore.ratedKw} kW`, 492, 18, GREEN, SMALL_PX, 'right');
  else text(g, `SUN ${Math.round(s.solar?.wm2 ?? 0)} W/m²`, 492, 18, DIM, SMALL_PX, 'right');
  // Right: the last hour, the sun in and the motors out.
  const log = solarLog(def);
  const c = CONFIG.solarScreen;
  const x0 = 200;
  const x1 = 492;
  const y0 = 228;
  const y1 = 50;
  const top = Math.max(5, Math.ceil(Math.max(...log.sun, ...log.out, 0) / 5) * 5);
  const keep = Math.round(c.windowS / c.sampleS);
  g.strokeStyle = DIM;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y1);
  g.lineTo(x0, y0);
  g.lineTo(x1, y0);
  g.stroke();
  text(g, `${top} kW`, x0 + 6, y1 - 4, DIM, SMALL_PX);
  text(g, 'LAST HOUR', x1, y0 + 6, DIM, SMALL_PX, 'right');
  const line = (vals: number[], colour: string) => {
    if (vals.length < 2) return;
    g.strokeStyle = colour;
    g.beginPath();
    vals.forEach((v, i) => {
      const x = x1 - ((vals.length - 1 - i) / (keep - 1)) * (x1 - x0);
      const y = y0 - ((y0 - y1) * v) / top;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  };
  line(log.out, AMBER);
  line(log.sun, GREEN);
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

/**
 * TOW LINE (owner, Oct 2026: the tension, and "how close it is to snapping"; on a boat that
 * can tow, with the advanced instruments). A strip, two quarter cells side by side (512 x
 * 128; owner: "the instrument is too big"): the line's pull in kN and what it's doing (SLACK,
 * TAUT, EASE OFF; PARTED or NO LINE), and a bar of its load toward parting (CONFIG.tow.gauge:
 * the nearer of its tension to its breaking force and its stretch to the most it takes),
 * green, amber from half, red near breaking, with the highest load lately held as a white
 * mark (a snatch is over before you can look).
 */
const paintTowline: Painter = (g, s) => {
  const t = s.towLine;
  const c = CONFIG.tow.gauge;
  g.fillStyle = DIM;
  g.font = font(SMALL_PX);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('TOW LINE', 14, 10);
  const load = t?.fast ? Math.min(1, t.load) : 0;
  const colour = load >= c.red ? RED : load >= c.amber ? AMBER : GREEN;
  if (!t?.fast) {
    big(g, t?.parted ? 'PARTED' : 'NO LINE', 14, 52, 36, t?.parted ? RED : DIM);
  } else {
    g.textAlign = 'left';
    big(g, (t.tension / 1000).toFixed(1), 14, 52, 44, AMBER);
    text(g, 'kN', 14 + g.measureText((t.tension / 1000).toFixed(1)).width + 8, 52, DIM, SMALL_PX);
    const state = t.tension < 50 ? 'SLACK' : load >= c.red ? 'EASE OFF' : 'TAUT';
    text(g, state, 498, 30, state === 'EASE OFF' ? RED : state === 'SLACK' ? DIM : GREEN, 24, 'right');
    text(g, `${Math.round(load * 100)} % OF BREAKING`, 498, 60, colour, SMALL_PX, 'right');
  }
  // The bar: its frame, the load, the amber and red marks, the peak held.
  const x0 = 14;
  const x1 = 498;
  const y0 = 88;
  const bh = 24;
  g.strokeStyle = DIM;
  g.lineWidth = 2;
  g.strokeRect(x0, y0, x1 - x0, bh);
  if (load > 0) {
    g.fillStyle = colour;
    g.fillRect(x0 + 3, y0 + 3, (x1 - x0 - 6) * load, bh - 6);
  }
  for (const [f, col] of [
    [c.amber, AMBER],
    [c.red, RED],
  ] as const) {
    const x = x0 + (x1 - x0) * f;
    g.fillStyle = col;
    g.fillRect(x - 1, y0 - 4, 3, bh + 8);
  }
  if (t?.fast && t.peak > load + 0.02) {
    const x = x0 + (x1 - x0) * Math.min(1, t.peak);
    g.fillStyle = '#ffffff';
    g.fillRect(x - 2, y0 - 2, 4, bh + 4);
  }
};

/**
 * ANCHOR (owner, Oct 2026: from the helm "you need to know, is the chain going down? Is the
 * anchor set? Is the chain going up? Is it in?"). A quarter screen (256 x 128) beside the
 * speed screen: the chain out (m) and what the anchor's doing, with an arrow while the chain
 * moves: ▼ LETTING GO, SET (holding; red DRAGGING), ▲ HEAVING IN, OFF THE BOTTOM (hanging:
 * in too deep, or coming up), and HOUSED once it's stowed in the roller; a bar of the chain
 * out against all she carries.
 */
const paintAnchorScreen: Painter = (g, s) => {
  const a = s.anchor;
  const chainM = gearOf(s, 'anchor')?.chainM ?? 0;
  const flash = Math.floor(performance.now() / 500) % 2 === 0;
  g.fillStyle = DIM;
  g.font = font(SMALL_PX);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('ANCHOR', 12, 10);
  let state: string;
  let colour = AMBER;
  switch (a.phase) {
    case 'stowed':
      state = 'HOUSED';
      colour = DIM;
      break;
    case 'paying':
      state = '▼ LETTING GO';
      colour = flash ? AMBER : DIM;
      break;
    case 'set':
      state = a.dragging ? 'DRAGGING' : 'SET';
      colour = a.dragging ? (flash ? RED : DIM) : GREEN;
      break;
    case 'weighing':
      state = '▲ HEAVING IN';
      colour = flash ? AMBER : DIM;
      break;
    default:
      state = chainM && a.rodeM >= chainM ? 'NO BOTTOM' : 'OFF BOTTOM';
      colour = AMBER;
  }
  g.textAlign = 'right';
  big(g, a.phase === 'stowed' ? '0' : a.rodeM.toFixed(0), 168, 54, 44, a.phase === 'stowed' ? DIM : AMBER);
  g.textAlign = 'left';
  big(g, 'm', 174, 60, 20, DIM);
  text(g, state, 12, 80, colour, 18);
  // The chain out against all she carries.
  if (chainM > 0) {
    const x0 = 12;
    const x1 = 244;
    g.fillStyle = '#1f2a24';
    g.fillRect(x0, 106, x1 - x0, 10);
    g.fillStyle = a.phase === 'stowed' ? DIM : AMBER;
    g.fillRect(x0, 106, (x1 - x0) * Math.min(1, a.rodeM / chainM), 10);
    text(g, `${chainM.toFixed(0)}`, x1, 10, DIM, SMALL_PX, 'right');
  }
};

// ── Old school (owner, Oct 2026: "three tiers of instruments, old school (analogue), basic
// electronic, and then advanced") ──
// Round analogue gauges, each a quarter cell (a dial in a black panel): cream faces, black
// figures, an orange needle. Drawn on the same atlas as the screens (no more draw calls).

const FACE = '#efe6cf';
const INK = '#1b1a17';
const NEEDLE = '#e2571f';

/**
 * A round gauge in a quarter cell (256 x 128): its face, `ticks` major marks from `min` to
 * `max` round a 270 degree sweep (with figures at each, `fig` choosing what's written), a red
 * arc from `red` up if given, its label and units, and the needle at `value`.
 */
/** A gauge's round backing plate on the dash, and its four screws: behind the rim. */
function backingPlate(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.fillStyle = '#1b1f22';
  g.beginPath();
  g.arc(cx, cy, r + 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5a6066';
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), 2, 0, Math.PI * 2);
    g.fill();
  }
}

function dial(g: CanvasRenderingContext2D, o: { min: number; max: number; value: number; ticks: number; label: string; units?: string; red?: number; fig?: (v: number) => string; note?: string; noteColour?: string }): void {
  const cx = 128;
  const cy = 64;
  const r = 52;
  backingPlate(g, cx, cy, r);
  // The rim and face.
  g.fillStyle = '#3a3d3c';
  g.beginPath();
  g.arc(cx, cy, r + 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = FACE;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  const a0 = (135 * Math.PI) / 180;
  const sweep = (270 * Math.PI) / 180;
  const angle = (v: number) => a0 + sweep * Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min)));
  if (o.red !== undefined) {
    g.strokeStyle = '#c2321e';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, r - 6, angle(o.red), angle(o.max));
    g.stroke();
  }
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.font = font(13);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let k = 0; k <= o.ticks; k++) {
    const v = o.min + ((o.max - o.min) * k) / o.ticks;
    const a = angle(v);
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    g.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    g.stroke();
    g.fillText(o.fig ? o.fig(v) : String(Math.round(v)), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
  }
  if (o.units) {
    g.font = font(11);
    // In the gap at the foot of the sweep.
    g.fillText(o.units, cx, cy + 30);
  }
  // Its name on the plate to the left of the dial, clear of the figures.
  g.fillStyle = FACE;
  g.font = font(15);
  g.fillText(o.label, 38, cy);
  // The needle, and its boss.
  const a = angle(o.value);
  g.strokeStyle = NEEDLE;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8);
  g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx, cy, 6, 0, Math.PI * 2);
  g.fill();
  // A word beside the dial (the chain counter's state), on the plate to its right.
  if (o.note) {
    g.fillStyle = o.noteColour ?? AMBER;
    g.font = font(12);
    g.fillText(o.note, 218, cy);
  }
}

/** The rev counter: rpm in hundreds, red from her rated revs. */
const paintDialRpm: Painter = (g, s) => {
  const rated = gearOf(s, 'diesel')?.engine.ratedRpm ?? 3000;
  const max = Math.ceil((rated * 1.15) / 500) * 500;
  dial(g, { min: 0, max, value: s.engine.rpm, ticks: max / 500, label: 'RPM', units: 'x100', red: rated, fig: (v) => String(Math.round(v / 100)) });
};
/** The speed log: knots, 0 to 30. */
const paintDialSpeed: Painter = (g, s) => dial(g, { min: 0, max: 30, value: logKnots(s), ticks: 6, label: 'LOG', units: 'kn' });
/** The depth gauge: the water under her keel, 0 to 50 m (red under 2 m: a mark, as on an old sounder). */
const paintDialDepth: Painter = (g, s, def) => dial(g, { min: 0, max: 50, value: depthUnderKeel(s, def), ticks: 5, label: 'DEPTH', units: 'm', note: depthUnderKeel(s, def) < 2 ? 'SHALLOW' : undefined, noteColour: RED });
/** Coolant temperature, 40 to 120 C, red from her alarm. */
const paintDialTemp: Painter = (g, s) => {
  const alarm = gearOf(s, 'diesel')?.engine.thermal.alarmC ?? 95;
  dial(g, { min: 40, max: 120, value: s.engine.coolantC, ticks: 4, label: 'TEMP', units: '°C', red: alarm });
};
/** Fuel, empty to full (E, half, F), red under her low-fuel mark. */
const paintDialFuel: Painter = (g, s) => {
  // (Electric motors: her battery's charge.)
  if (batteryKWhOf(s) !== null) return dial(g, { min: 0, max: 1, value: s.battery ?? 0, ticks: 2, label: 'BATT', fig: (v) => (v === 0 ? 'E' : v === 1 ? 'F' : '½') });
  const diesel = gearOf(s, 'diesel');
  const tank = s.engine.tankL ?? diesel?.engine.fuel.tankL ?? 1;
  dial(g, { min: 0, max: 1, value: s.engine.fuelL / tank, ticks: 2, label: 'FUEL', fig: (v) => (v === 0 ? 'E' : v === 1 ? 'F' : '½') });
};
/**
 * The magnetic compass: a card turning so her heading stands at the lubber line (top), its
 * points marked; the heading in figures under it.
 */
const paintDialCompass: Painter = (g, s) => {
  const cx = 128;
  const cy = 64;
  const r = 52;
  const h = headingDeg(s);
  backingPlate(g, cx, cy, r);
  g.fillStyle = '#3a3d3c';
  g.beginPath();
  g.arc(cx, cy, r + 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#20262a';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = FACE;
  g.strokeStyle = FACE;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    // The card turns the other way to her: her heading at the top.
    const a = ((d - h - 90) * Math.PI) / 180;
    const major = d % 30 === 0;
    g.lineWidth = major ? 2.5 : 1.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
    g.lineTo(cx + Math.cos(a) * (r - (major ? 11 : 7)), cy + Math.sin(a) * (r - (major ? 11 : 7)));
    g.stroke();
    if (d % 90 === 0) {
      g.font = font(16);
      g.fillStyle = d === 0 ? '#ff7a5a' : FACE;
      g.fillText(['N', 'E', 'S', 'W'][d / 90], cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
      g.fillStyle = FACE;
    }
  }
  // The lubber line, and the heading in figures.
  g.fillStyle = NEEDLE;
  g.fillRect(cx - 2, cy - r - 4, 4, 16);
  g.font = font(16);
  g.fillStyle = AMBER;
  g.fillText(bearing(h), cx, cy + 6);
  g.fillStyle = FACE;
  g.font = font(15);
  g.fillText('HDG', 38, cy);
};
/** The chain counter: the chain out against all she carries, and what the anchor's doing. */
const paintDialChain: Painter = (g, s) => {
  const a = s.anchor;
  const chainM = gearOf(s, 'anchor')?.chainM ?? 60;
  const flash = Math.floor(performance.now() / 500) % 2 === 0;
  const note = a.phase === 'stowed' ? 'HOUSED' : a.phase === 'paying' ? '▼ OUT' : a.phase === 'weighing' ? '▲ IN' : a.phase === 'set' ? (a.dragging ? 'DRAGGING' : 'SET') : 'HANGING';
  const colour = a.phase === 'set' && !a.dragging ? GREEN : a.dragging ? (flash ? RED : DIM) : a.phase === 'stowed' ? DIM : flash ? AMBER : DIM;
  dial(g, { min: 0, max: chainM, value: a.phase === 'stowed' ? 0 : a.rodeM, ticks: Math.max(2, Math.round(chainM / 20)), label: 'CHAIN', units: 'm', note, noteColour: colour });
};

// ── The ship's clock (CS5; owner, Oct 2026: "a ship's clock would be good") ──

/** The time of day as hours and minutes (the world's clock; noon with no environment). */
function clockOf(env: EnvironmentState | null): { h: number; m: number } {
  const t = ((env?.timeOfDay ?? 12) % 24 + 24) % 24;
  const h = Math.floor(t);
  return { h, m: Math.floor((t - h) * 60) };
}
/** "14:05". */
const hhmm = (env: EnvironmentState | null) => {
  const { h, m } = clockOf(env);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const clockKey: ScreenKey = (_s, _d, env) => hhmm(env);

/** Old school: a brass-rimmed ship's clock, twelve hours, an hour and a minute hand. */
const paintDialClock: Painter = (g, _s, _def, env) => {
  const cx = 128;
  const cy = 64;
  const r = 52;
  backingPlate(g, cx, cy, r);
  g.fillStyle = '#a8843a';
  g.beginPath();
  g.arc(cx, cy, r + 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = FACE;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(12);
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    g.lineTo(cx + Math.cos(a) * (r - 9), cy + Math.sin(a) * (r - 9));
    g.stroke();
    g.fillText(String(k), cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
  }
  const { h, m } = clockOf(env);
  const hand = (turns: number, len: number, width: number) => {
    const a = turns * Math.PI * 2 - Math.PI / 2;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.stroke();
  };
  g.strokeStyle = INK;
  hand(((h % 12) + m / 60) / 12, r * 0.5, 5);
  hand(m / 60, r * 0.78, 3);
  g.beginPath();
  g.arc(cx, cy, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = FACE;
  g.font = font(15);
  g.fillText('TIME', 38, cy);
};

/** Basic electronic: the time in figures, 24 hours. */
const paintClock: Painter = (g, _s, _def, env) => {
  g.fillStyle = DIM;
  g.font = font(SMALL_PX);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('TIME', 12, 10);
  g.fillStyle = AMBER;
  g.font = font(54);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(hhmm(env), 128, 70);
};

/** An azimuth drive's dial (centre x, y): her bow up, the drive's arrow (deg, + to starboard), its lever's ring. */
function azimuthDial(g: CanvasRenderingContext2D, cx: number, cy: number, deg: number, askDeg: number, colour: string): void {
  const r = 52;
  g.strokeStyle = DIM;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  // Ticks every 45 deg, longer ahead.
  for (let d = 0; d < 360; d += 45) {
    const a = (d * Math.PI) / 180;
    const k = d === 0 ? 14 : 7;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    g.lineTo(cx + Math.sin(a) * (r - k), cy - Math.cos(a) * (r - k));
    g.stroke();
  }
  // The lever's ask: a hollow ring on the rim.
  const q = (askDeg * Math.PI) / 180;
  g.strokeStyle = '#ffe6b0';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx + Math.sin(q) * r, cy - Math.cos(q) * r, 8, 0, Math.PI * 2);
  g.stroke();
  // The drive: an arrow from the middle the way it pushes.
  const a = (deg * Math.PI) / 180;
  const tip = [cx + Math.sin(a) * (r - 6), cy - Math.cos(a) * (r - 6)];
  g.strokeStyle = colour;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx - Math.sin(a) * 18, cy + Math.cos(a) * 18);
  g.lineTo(tip[0], tip[1]);
  g.stroke();
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(tip[0] + Math.sin(a) * 6, tip[1] - Math.cos(a) * 6);
  g.lineTo(tip[0] + Math.cos(a) * 9 - Math.sin(a) * 8, tip[1] + Math.sin(a) * 9 + Math.cos(a) * 8);
  g.lineTo(tip[0] - Math.cos(a) * 9 - Math.sin(a) * 8, tip[1] - Math.sin(a) * 9 + Math.cos(a) * 8);
  g.fill();
}

/** The screens there are, for the screen module (modules/screen) to pick from. */
export const SCREENS = {
  speed: { paint: paintSpeed, key: speedKey },
  heading: { paint: paintHeading, key: (s) => [Math.round(headingDeg(s)), knots(s) > 0.3 ? Math.round(cogDeg(s)) : -1].join('|') },
  rpm: { paint: paintRpm, key: (s) => [Math.round(s.engine.rpm / 10), s.engine.phase, s.engine.gear, s.engine.stbd ? `${Math.round(s.engine.stbd.rpm / 10)}${s.engine.stbd.phase}${s.engine.stbd.gear}` : '', s.engine.azimuth === undefined ? '' : `${Math.round((s.engine.azimuth * 180) / Math.PI)},${Math.round(((s.engine.stbd?.azimuth ?? 0) * 180) / Math.PI)},${Math.round(s.controls.aziAngle ?? 0)},${Math.round(s.controls.aziAngle2 ?? 0)},${s.controls.aziTransit ?? 0},${Math.sign(s.controls.lever)},${Math.sign(s.controls.lever2 ?? 0)}`, Math.round(s.engine.rack * 50), s.engine.fuelFlowLph.toFixed(1), (s.engine.powerKw ?? 0).toFixed(1), Math.round(((s.rudder * 180) / Math.PI) * 2), Math.round(s.controls.helm * 100)].join('|') },
  rudder: { paint: paintRudder, key: (s) => [Math.round(((s.rudder * 180) / Math.PI) * 2), Math.round(s.controls.helm * 100)].join('|') },
  engineMonitor: { paint: paintEngineMonitor, key: engineKey },
  efficiency: { paint: paintEfficiency, key: efficiencyKey },
  solar: { paint: paintSolar, key: solarKey },
  nav: { paint: paintNav, key: (s, def, env) => navKey(s, def, env) },
  towline: { paint: paintTowline, cells: [2, 1], key: (s) => (s.towLine ? [s.towLine.fast ? 1 : 0, s.towLine.parted ? 1 : 0, Math.round(s.towLine.tension / 100), Math.round(s.towLine.load * 100), Math.round(s.towLine.peak * 100)].join('|') : '') },
  // Old school: the analogue gauges, each a quarter.
  dialRpm: { paint: paintDialRpm, cells: [1, 1], round: true, key: (s) => String(Math.round(s.engine.rpm / 25)) },
  dialSpeed: { paint: paintDialSpeed, cells: [1, 1], round: true, key: (s) => logKnots(s).toFixed(1) },
  dialDepth: { paint: paintDialDepth, cells: [1, 1], round: true, key: (s, def) => Math.min(60, depthUnderKeel(s, def)).toFixed(1) },
  dialTemp: { paint: paintDialTemp, cells: [1, 1], round: true, key: (s) => s.engine.coolantC.toFixed(0) },
  dialFuel: { paint: paintDialFuel, cells: [1, 1], round: true, key: (s) => `${s.engine.fuelL.toFixed(0)}|${Math.round((s.battery ?? 0) * 100)}` },
  dialCompass: { paint: paintDialCompass, cells: [1, 1], round: true, key: (s) => Math.round(headingDeg(s)).toString() },
  dialChain: {
    paint: paintDialChain,
    cells: [1, 1],
    round: true,
    key: (s) => {
      const a = s.anchor;
      const moving = a.phase === 'paying' || a.phase === 'weighing' || (a.phase === 'set' && a.dragging);
      return [a.phase, a.rodeM.toFixed(0), a.dragging ? 1 : 0, moving ? Math.floor(performance.now() / 500) % 2 : 0].join('|');
    },
  },
  anchor: {
    paint: paintAnchorScreen,
    cells: [1, 1],
    key: (s) => {
      const a = s.anchor;
      const moving = a.phase === 'paying' || a.phase === 'weighing' || (a.phase === 'set' && a.dragging);
      return [a.phase, a.rodeM.toFixed(0), a.dragging ? 1 : 0, moving ? Math.floor(performance.now() / 500) % 2 : 0].join('|');
    },
  },
  // The ship's clock: in figures, or the old school's round clock.
  clock: { paint: paintClock, cells: [1, 1], key: clockKey },
  dialClock: { paint: paintDialClock, cells: [1, 1], round: true, key: clockKey },
  // The advanced touchscreen (a full screen; the screen module makes each one with her own
  // pages: touchScreen below). This one, every page, is what's listed.
  touch: { paint: (g, s, def, env) => touchScreen([...TOUCH_PAGES], 'touchPage1', 0).paint(g, s, def, env), key: () => '' },
} satisfies Record<string, Screen>;

export type ScreenName = keyof typeof SCREENS;

// ── The touchscreen (CS5; owner, Oct 2026: "with the advanced package ... just one screen that
// you have tabs that you have to flip between to see the different information") ──

/** The pages a touchscreen can show, in tab order: each is one of the screens above, drawn in it. */
export const TOUCH_PAGES = ['speed', 'heading', 'rpm', 'engineMonitor', 'efficiency', 'solar', 'anchor', 'towline', 'nav'] as const;
export type TouchPage = (typeof TOUCH_PAGES)[number];
/** What each page's tab says. */
export const TOUCH_TABS: Record<TouchPage, string> = { speed: 'SPEED', heading: 'HDG', rpm: 'ENGINE', engineMonitor: 'SYSTEMS', efficiency: 'ECO', solar: 'SOLAR', anchor: 'ANCHOR', towline: 'TOW', nav: 'WIND' };
/**
 * The tab bar and the page area, in the screen's own pixels (512 x 256; the bezel is the outer
 * 10). The tabs are along the top: from the helm the wheel's rim hides a dash screen's foot.
 */
export const TOUCH_BAR = { y0: 12, y1: 42, x0: 12, x1: 420, clockX: 466 } as const;
const TOUCH_PAGE = { y: 46, h: 210 } as const;
/** Each tab's span across the bar (px), for `n` tabs: the screen draws them, the screen module presses them. */
export function touchTabs(n: number): { x0: number; x1: number }[] {
  const w = (TOUCH_BAR.x1 - TOUCH_BAR.x0) / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({ x0: TOUCH_BAR.x0 + i * w + 2, x1: TOUCH_BAR.x0 + (i + 1) * w - 2 }));
}
/** The page a touchscreen is on: the boat's (`channel` in her controls, so the whole crew sees the same page), else its first. */
export function touchPageOf(s: VesselState, channel: 'touchPage1' | 'touchPage2', first: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(s.controls[channel] ?? first)));
}

/**
 * A touchscreen with these pages: the page shown (any of the screens, scaled whole into the page
 * area: a quarter or a strip drawn large) and the tab bar over it, the page's tab lit, the time
 * at its end. Repainted only when the page, what it shows or the minute changes, like any screen.
 */
export function touchScreen(pages: readonly TouchPage[], channel: 'touchPage1' | 'touchPage2', first: number): Screen {
  const at = (s: VesselState) => touchPageOf(s, channel, first, pages.length);
  return {
    cells: [2, 2],
    key: (s, def, env) => {
      const i = at(s);
      return [i, SCREENS[pages[i]].key(s, def, env), hhmm(env)].join('#');
    },
    paint: (g, s, def, env) => {
      const i = at(s);
      const inner: Screen = SCREENS[pages[i]];
      const [cw, ch] = cellsOf(inner);
      const iw = cw * CW;
      const ih = ch * CH;
      const k = Math.min(512 / iw, TOUCH_PAGE.h / ih);
      g.save();
      g.beginPath();
      g.rect(0, TOUCH_PAGE.y, 512, TOUCH_PAGE.h);
      g.clip();
      g.translate((512 - iw * k) / 2, TOUCH_PAGE.y + (TOUCH_PAGE.h - ih * k) / 2);
      g.scale(k, k);
      inner.paint(g, s, def, env);
      g.restore();
      // The tab bar.
      g.fillStyle = '#16201b';
      g.fillRect(0, 0, 512, TOUCH_BAR.y1 + 4);
      g.font = font(13);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ym = (TOUCH_BAR.y0 + TOUCH_BAR.y1) / 2;
      touchTabs(pages.length).forEach((t, j) => {
        const on = j === i;
        g.fillStyle = on ? AMBER : '#24302a';
        g.fillRect(t.x0, TOUCH_BAR.y0, t.x1 - t.x0, TOUCH_BAR.y1 - TOUCH_BAR.y0);
        g.fillStyle = on ? BG : AMBER;
        g.fillText(TOUCH_TABS[pages[j]], (t.x0 + t.x1) / 2, ym + 1);
      });
      g.fillStyle = AMBER;
      g.font = font(18);
      g.fillText(hhmm(env), TOUCH_BAR.clockX, ym + 1);
    },
  };
}
