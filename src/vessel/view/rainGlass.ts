import * as THREE from 'three';
import { CONFIG } from '../../config';
import { frontMullions, houseX, type WheelhouseDef } from '../vesselDef';
import { facetDz, frontRake } from './hullMesh';
import { houseFlare } from '../houseFlare';

/**
 * Rain on the wheelhouse front windows, and the wipers. The windows are open frames until
 * it rains; then a transparent "wet glass" plane fills the front panes (three, or more on a
 * wide house: frontMullions):
 *
 *   - drops: a grid of cells (`glassCell`), each with a hashed chance of a drop; the share
 *     of cells with a drop rises with the rain and with the time since that spot was last
 *     wiped (back to full after `glassRefill` s at full rain);
 *   - wipers: one pantograph wiper per pane, pivoted on the header above the glass (owner
 *     request: off the glass, for a wider clear area). Its arm swings +-its sweep with a
 *     triangle wave of period `wiperPeriod`; a parallel link keeps the blade upright, so the
 *     blade (centred on the arm's tip) wipes a broad band rather than a fan, and parks
 *     upright by the window post. Each is sized to its pane (wiperFit): tall panes get long
 *     arms and blades, narrow ones a shorter sweep.
 *     A point at (x, y) from the pivot is under the blade when the arm is at
 *     asin(x / arm) and |y + arm cos(angle)| is within half the blade. When the blade last
 *     passed is worked out in the shader from the wiper's clock (two passes per sweep), so
 *     no texture is painted and nothing is uploaded per frame.
 *
 * The wipers run while switched on and powered (Instruments breaker); switched off they
 * finish the sweep and park. Everything here leans with the raked (pilot-house) front, and
 * goes out with the walls when the windows are raked out all round (houseFlare.ts).
 */
/** Parts per wiper (two links, carrier, blade, boss), and the links' spacing (m). */
const PARTS = 5;
const LINK = 0.07;
/** The most front panes the shader takes (CONFIG.shipyard.frontWindows.maxPanes). */
const MAX_PANES = 7;

/**
 * A pantograph wiper sized to its pane (h high from sill to head, `half` wide each side of
 * its pivot): the longest blade that stays on the glass. With the arm L, sweep A and pivot
 * p above the head, the blade (length b, centred on the arm's tip, upright) is lowest at
 * mid-sweep (its foot at head + p - L - b/2, kept above the sill) and highest at full sweep
 * (its top at head + p - L cos A + b/2, kept below the head). Making both limits meet gives
 * L = (h + 2p) / (1 + cos A) and b = 2 (L cos A - p - margin); A is the configured sweep,
 * narrowed until the arm's reach L sin A keeps the blade `edge` inside the pane's side.
 */
export function wiperFit(h: number, half: number): { arm: number; blade: number; sweep: number } {
  const c = CONFIG.rain;
  const p = c.wiperPivotAbove;
  let A = (c.wiperSweepDeg * Math.PI) / 180;
  let L = (h + 2 * p) / (1 + Math.cos(A));
  for (let i = 0; i < 8; i++) {
    const reach = Math.max(0.02, half - c.wiperEdge);
    if (L * Math.sin(A) <= reach + 1e-6) break;
    A = Math.asin(Math.min(1, reach / L));
    L = (h + 2 * p) / (1 + Math.cos(A));
  }
  const blade = Math.max(0.1, 2 * (L * Math.cos(A) - p - c.wiperMargin));
  return { arm: L, blade, sweep: A };
}

/** A list padded with zeros to MAX_PANES (the shader's arrays). */
const pad = (a: number[]): number[] => [...a, ...Array<number>(Math.max(0, MAX_PANES - a.length)).fill(0)].slice(0, MAX_PANES);

export class RainGlass {
  readonly root = new THREE.Group();
  private readonly glass: THREE.Mesh;
  /** Every wiper part is a scaled unit box: one instanced draw call (PARTS per wiper). */
  private readonly parts: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  /** The middle of each wiper's pair of pivots (the blade hangs below it at rest). */
  private readonly pivots: THREE.Vector3[];
  /** Wiper clock (s): runs while wiping; and time since they parked (s). */
  private clock = 0;
  private idle = 1000;
  private parked = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly level = new THREE.Quaternion();
  /** A faceted front's setback at x (0 for a flat one). */
  private readonly dz: (x: number) => number;
  /** Each wiper's arm, blade and sweep (rad), sized to its pane. */
  private readonly fit: { arm: number; blade: number; sweep: number }[];
  /** Raked out all round: a point (in the root's upright frame) moved as the house moves it. */
  private readonly flared: (v: THREE.Vector3) => THREE.Vector3;

  constructor(def: WheelhouseDef) {
    const wh = def.layout.wheelhouse;
    const c = CONFIG.rain;
    const sill = wh.floorY + (wh.frontSill ?? wh.windowSill); // the front panes' sill
    const head = wh.floorY + wh.windowHead;
    const x0 = -wh.halfWidth + wh.wall;
    const x1 = wh.halfWidth - wh.wall;
    // The panes' edges: the corner posts and the mullions between (at most MAX_PANES panes);
    // each pane's centre and half-width, and its wiper.
    const xs = [x0, ...frontMullions(wh).slice(0, MAX_PANES - 1), x1];
    const panes = xs.length - 1;
    const paneX = xs.slice(1).map((b, i) => (xs[i] + b) / 2);
    const paneHalf = xs.slice(1).map((b, i) => (b - xs[i]) / 2);
    // Each sized to the glass you look through: from the top of the dash in front of it (viewSill) up.
    const view = Math.max(sill, wh.floorY + (wh.viewSill ?? 0));
    this.fit = paneHalf.map((half) => wiperFit(head - view, half - 0.04)); // less half a mullion
    const pivotY = head + c.wiperPivotAbove;
    // Raked out all round (houseFlare.ts): the house moves points after the front's rake, so a
    // point here (before the root's rake matrix) goes to rake^-1 (flare (rake p)).
    const rake = frontRake(wh).matrix;
    const unrake = rake.clone().invert();
    const fl = houseFlare(wh);
    this.flared = fl ? (v) => v.applyMatrix4(rake).set(...fl.at(v.x, v.y, v.z)).applyMatrix4(unrake) : (v) => v;

    // A faceted front (hullMesh.ts facetDz): the outer panes set back on the angle, with their wipers.
    this.dz = facetDz(wh);
    this.pivots = paneX.map((x) => new THREE.Vector3(x, pivotY, wh.front - 0.015 + this.dz(x)));

    // A column a pane (its edges at the mullions), each pane's glass set back with its pane.
    const geo = new THREE.PlaneGeometry(1, head - sill, panes, 1).translate(0, (sill + head) / 2, wh.front + wh.wall * 0.5);
    const pos = geo.attributes.position;
    // The shader works in the panes' own (upright, unflared) coordinates: kept in `aPane`.
    const pane = new Float32Array(pos.count * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = xs[i % (panes + 1)];
      pane[2 * i] = x;
      pane[2 * i + 1] = pos.getY(i);
      this.flared(v.set(x, pos.getY(i), pos.getZ(i) + this.dz(x)));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.setAttribute('aPane', new THREE.BufferAttribute(pane, 2));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uRain: { value: 0 },
        uClock: { value: 0 },
        uIdle: { value: 1000 },
        uPeriod: { value: c.wiperPeriod },
        // Per pane (padded to MAX_PANES), and the mullions between them.
        uSweep: { value: pad(this.fit.map((f) => f.sweep)) },
        uArm: { value: pad(this.fit.map((f) => f.arm)) },
        uBlade: { value: pad(this.fit.map((f) => f.blade)) },
        uMullion: { value: pad(xs.slice(1, -1)) },
        uPanes: { value: panes },
        uRefill: { value: c.glassRefill },
        uCell: { value: c.glassCell },
        uPaneX: { value: pad(paneX) },
        uPivotY: { value: pivotY },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aPane;
        varying vec2 vPos;
        void main() {
          vPos = aPane; // the pane's own: x across, y up (vessel axes, before any flare)
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uRain, uClock, uIdle, uPeriod, uRefill, uCell, uPivotY, uLight;
        uniform float uPaneX[${MAX_PANES}], uSweep[${MAX_PANES}], uArm[${MAX_PANES}], uBlade[${MAX_PANES}], uMullion[${MAX_PANES}];
        uniform int uPanes;
        varying vec2 vPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // Seconds since the upright blade last passed this point (large if it never does).
        float sinceWiped(vec2 p) {
          // This pane's wiper (each sized to its pane): the pane is past as many mullions.
          int k = 0;
          for (int i = 0; i < ${MAX_PANES - 1}; i++) if (i < uPanes - 1 && p.x > uMullion[i]) k = i + 1;
          float px = uPaneX[k];
          float arm = uArm[k];
          float blade = uBlade[k];
          float A = uSweep[k];
          vec2 d = p - vec2(px, uPivotY);
          float s = d.x / arm;
          if (abs(s) > sin(A)) return 1000.0;
          float ang = asin(s); // the arm angle when the blade is over this x, + to starboard
          if (abs(d.y + arm * cos(ang)) > 0.5 * blade) return 1000.0;
          // Arm angle: a triangle wave, -A -> +A in the first half period, back in the second.
          float u = fract(uClock / uPeriod);
          float u1 = (ang + A) / (4.0 * A);       // passing on the way out
          float u2 = 0.5 + (A - ang) / (4.0 * A); // and on the way back
          float last = u >= u2 ? u2 : (u >= u1 ? u1 : u2 - 1.0);
          return (u - last) * uPeriod + uIdle;
        }
        void main() {
          float since = sinceWiped(vPos);
          float density = uRain * clamp(since * (0.4 + 0.6 * uRain) / uRefill, 0.0, 1.0);
          // Drops: one possible per cell, jittered, of random size.
          vec2 cell = floor(vPos / uCell);
          vec2 f = vPos / uCell - cell;
          float h = hash(cell);
          float present = step(h, density * 0.75);
          vec2 c = vec2(0.25 + 0.5 * hash(cell + 7.1), 0.25 + 0.5 * hash(cell + 3.3));
          float rad = 0.12 + 0.28 * hash(cell + 1.9);
          float dist = length(f - c) / rad;
          float drop = present * (1.0 - smoothstep(0.75, 1.0, dist));
          // A drop is a little lens: bright top-left, dark lower rim.
          float shade = clamp(0.6 + 0.6 * (c.y - f.y) / rad - 0.3 * dist, 0.0, 1.0);
          vec3 col = mix(vec3(0.15, 0.17, 0.2), vec3(0.85, 0.9, 0.95), shade) * (0.4 + 0.6 * uLight);
          // A faint wet film over the glass, plus the drops.
          float a = density * 0.07 + drop * 0.55;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.glass = new THREE.Mesh(geo, this.material);
    this.glass.name = 'rainGlass';
    this.glass.visible = false;
    this.glass.renderOrder = 3;

    // Outside the glass: arm, parallel link, blade carrier, blade, and the boss on the header.
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x15181a }), this.pivots.length * PARTS);
    this.parts.name = 'wipers';
    this.root.add(this.glass, this.parts);
    // Raked with the pilot-house front (hullMesh.ts frontRake): built upright as before, the
    // whole set (glass, wipers on the header) is sheared forward with the panes. Heights are
    // unchanged, so the shader's pane coordinates (x across, y up) still hold.
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(frontRake(wh).matrix);
    // (A house standing off her centreline: houseX.)
    if (houseX(wh)) this.root.matrix.premultiply(new THREE.Matrix4().makeTranslation(houseX(wh), 0, 0));
    this.pose(-1);
  }

  /** Where in its sweep each wiper is at the wiper clock: the shader's triangle wave, -1 .. 1. */
  private phase(): number {
    const u = (this.clock / CONFIG.rain.wiperPeriod) % 1;
    return u < 0.5 ? -1 + 4 * u : 1 - 4 * (u - 0.5);
  }

  /** Pose every wiper at `phase` of its own sweep (-1 .. 1: its arm at -sweep .. +sweep from hanging straight down, + to starboard). */
  private pose(phase: number): void {
    let i = 0;
    // Each part on its facet: set back by the facet at its x, less its pivot's (already in p.z);
    // and out with the walls if they're raked out all round.
    let px = 0;
    const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, turned: boolean) =>
      this.parts.setMatrixAt(i++, this.m.compose(this.flared(this.v.set(x, y, z + this.dz(x) - this.dz(px))), turned ? this.q : this.level, this.s.set(sx, sy, sz)));
    this.pivots.forEach((p, w) => {
      const { arm: L, blade, sweep } = this.fit[w];
      const angle = phase * sweep;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      this.q.setFromAxisAngle(this.z, angle);
      px = p.x;
      // The two links pivot LINK apart on the header and stay parallel (a parallelogram), so
      // the carrier across their tips - and the blade on it - stays level and upright.
      for (const [dx, w] of [[-LINK / 2, 0.016], [LINK / 2, 0.009]] as const) put(p.x + dx + (sin * L) / 2, p.y - (cos * L) / 2, p.z, w, L, 0.01, true);
      const bx = p.x + sin * L;
      const by = p.y - cos * L;
      put(bx, by, p.z + 0.004, LINK + 0.03, 0.02, 0.014, false);
      put(bx, by, p.z + 0.012, 0.012, blade, 0.012, false);
      put(p.x, p.y, p.z, LINK + 0.05, 0.05, 0.03, false);
    });
    this.parts.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param rain     0..1
   * @param running  wipers switched on and powered
   * @param light    daylight 0..1 (drops darker at night)
   */
  update(rain: number, running: boolean, light: number, dt: number): void {
    const P = CONFIG.rain.wiperPeriod;
    if (running || !this.parked) {
      // Running, or finishing the sweep back to park (the start of a period).
      const before = this.clock;
      this.clock += dt;
      this.parked = false;
      if (!running && Math.floor(this.clock / P) > Math.floor(before / P)) {
        this.clock = Math.floor(this.clock / P) * P;
        this.parked = true;
      }
      this.idle = 0;
      this.pose(this.parked ? -1 : this.phase());
    } else {
      this.idle += dt;
    }
    this.glass.visible = rain > 0.02;
    if (!this.glass.visible) return;
    const u = this.material.uniforms;
    u.uRain.value = rain;
    u.uClock.value = this.clock;
    u.uIdle.value = this.idle;
    u.uLight.value = light;
  }
}
