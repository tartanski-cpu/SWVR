/**
 * The house kit (the settlements brief, Part A3): a coast region's buildings made from
 * their footprints by type, not one house stretched to fit. The coast pipeline decides each
 * building's type, roof, floors and colours from OpenStreetMap's tags or its rules
 * (tools/coast/src/houses.ts); here each type is a small generator:
 *
 *   cottage    a storey and a half under a steep gable, chimneys at both gable ends
 *   house      two storeys or more, gabled or hipped (or the theme's: flat on Syros), a chimney
 *   terrace    a row of houses along the footprint, each its own front colour and eaves a
 *              little higher or lower than its neighbour's (steps in the roofline), a chimney
 *              stack on every other party wall
 *   shed       low walls under a wide shallow roof, corrugated sheet
 *   church     a stone nave, and a tower with a spire at its landward end (a small chapel: a
 *              bellcote on its gable)
 *   warehouse  long, two storeys, a shallow roof, big doors in the gable facing the water
 *   boathouse  small and low, boarded, a wide door in the gable facing the water
 *   castle     a stone keep, flat-topped; ruin: four roofless walls of uneven height
 *
 * Every building is one closed shell (a gabled house is 14 triangles: two long walls, two
 * gable ends, two roof slopes), cheaper than the old box-and-prism (20). The windows are
 * the `facade` pixel paint on the walls (render/pixelPaint.ts): a window in every 3 m bay and
 * storey, laid out so each wall holds whole bays, some of them lit at night. They cost no
 * triangles. Doors and a pub's or shop's sign are two triangles each; chimneys and towers a
 * few more. A `plain` building (beyond the harbour's full-detail reach) is its shell alone.
 * Merged per chunk with the rest of the town into one draw call (coastView.ts).
 *
 * Original, generic shapes (not any real building), in the game's flat-shaded style.
 */
import * as THREE from 'three';
import type { PaintName } from '../../render/pixelPaint';
import { paintIndex } from '../../render/pixelPaint';
import { CONFIG } from '../../config';
import type { BuildingDef } from '../defs';

/** A storey, and a window bay: the facade paint's tile (3 m; the pipeline's houses.ts STOREY too). */
const STOREY_M = CONFIG.pixelPaint.tileMetres.facade;

type V3 = [number, number, number];
type V2 = [number, number];

/** A building's triangles in its own frame: x across, z along its length, y up from its ground. */
class Shell {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly paint: number[] = [];
  readonly uv: number[] = [];
  private readonly c = new THREE.Color();

  /** A triangle facing away from `inside` (a point within the closed piece it belongs to). */
  tri(a: V3, b: V3, c: V3, colour: number, paint: PaintName | undefined, ua: V2, ub: V2, uc: V2, inside: V3): void {
    // Flip it if its winding faces inwards (the renderer draws only faces turned towards you).
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]; // prettier-ignore
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; // prettier-ignore
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - inside[0];
    const my = (a[1] + b[1] + c[1]) / 3 - inside[1];
    const mz = (a[2] + b[2] + c[2]) / 3 - inside[2];
    if (nx * mx + ny * my + nz * mz < 0) [b, c, ub, uc] = [c, b, uc, ub];
    this.c.set(colour);
    const p = paintIndex(paint);
    for (const [v, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ] as [V3, V2][]) {
      this.pos.push(v[0], v[1], v[2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.paint.push(p);
      this.uv.push(t[0], t[1]);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, colour: number, paint: PaintName | undefined, uvs: [V2, V2, V2, V2], inside: V3): void {
    this.tri(a, b, c, colour, paint, uvs[0], uvs[1], uvs[2], inside);
    this.tri(a, c, d, colour, paint, uvs[0], uvs[2], uvs[3], inside);
  }

  /**
   * A wall from (x0, z0) to (x1, z1), from y0 up to y1 at each end (a sloping top for a
   * skillion's or a gable's). Its paint coordinates: metres along it, stretched so a house
   * front holds whole 3 m bays (no window cut by a corner), and height above the ground.
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1a: number, y1b: number, colour: number, paint: PaintName | undefined, inside: V3, bayShift = 0): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const scale = paint === 'facade' ? (Math.max(1, Math.round(len / STOREY_M)) * STOREY_M) / Math.max(0.1, len) : 1;
    const u0 = bayShift * STOREY_M;
    const u1 = u0 + len * scale;
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1b, z1], [x0, y1a, z0], colour, paint, [[u0, y0], [u1, y0], [u1, y1b], [u0, y1a]], inside);
  }

  /** A box with no bottom (a chimney, a tower, a keep): 10 triangles. */
  box(cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, colour: number, paint: PaintName | undefined, top = true): void {
    const inside: V3 = [cx, (y0 + y1) / 2, cz];
    const c: V2[] = [
      [cx + hx, cz + hz],
      [cx + hx, cz - hz],
      [cx - hx, cz - hz],
      [cx - hx, cz + hz],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i];
      const [bx, bz] = c[(i + 1) % 4];
      this.wall(ax, az, bx, bz, y0, y1, y1, colour, paint, inside);
    }
    if (top) this.quad([c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]], colour, paint, [[c[0][0], c[0][1]], [c[1][0], c[1][1]], [c[2][0], c[2][1]], [c[3][0], c[3][1]]], inside);
  }

  /** The triangles, placed in the world by `m`, ready to merge (render/geometryUtils mergeParts). */
  geometry(m: THREE.Matrix4): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('paint', new THREE.Float32BufferAttribute(this.paint, 1));
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.userData.paintUvFixed = true;
    return g.applyMatrix4(m);
  }
}

/** A building's small choices, from its seed: the same every build. */
function rand(seed: number, k: number): number {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Roof rise as a share of the width, by type (a tagged roof:height wins). */
const PITCH: Record<NonNullable<BuildingDef['kind']>, number> = { cottage: 0.62, house: 0.42, terrace: 0.42, shed: 0.2, church: 0.62, warehouse: 0.28, boathouse: 0.45, castle: 0, ruin: 0 };

interface Look {
  wall: number;
  roof: number;
  wallPaint: PaintName;
  roofPaint: PaintName;
  /** The gable's triangle above the eaves (no windows). */
  gablePaint: PaintName;
}

/**
 * One segment of a building, from z0 to z1 along it, the full width across: walls (sunk
 * 2 m into the ground, as every building's are, for a sloping site), and its roof.
 * `end0` / `end1`: draw its end walls (and gables) at z0 / z1. A terrace's house leaves out
 * an end hidden inside its higher neighbour.
 */
function segment(s: Shell, z0: number, z1: number, hw: number, H: number, rise: number, shape: NonNullable<BuildingDef['roofShape']>, look: Look, bayShift: number, end0 = true, end1 = true): void {
  const B = -2;
  const top = H + rise;
  const inside: V3 = [0, H / 2, (z0 + z1) / 2];
  const roofIn: V3 = [0, H + rise / 3, (z0 + z1) / 2];
  const len = z1 - z0;
  if (shape === 'skillion') {
    // Higher along the +x side.
    s.wall(hw, z1, hw, z0, B, top, top, look.wall, look.wallPaint, inside, bayShift);
    s.wall(-hw, z0, -hw, z1, B, H, H, look.wall, look.wallPaint, inside, bayShift + 1);
    if (end0) s.wall(hw, z0, -hw, z0, B, top, H, look.wall, look.wallPaint, inside, bayShift + 2);
    if (end1) s.wall(-hw, z1, hw, z1, B, H, top, look.wall, look.wallPaint, inside, bayShift + 3);
    s.quad([hw, top, z1], [hw, top, z0], [-hw, H, z0], [-hw, H, z1], look.roof, look.roofPaint, [[0, len], [0, 0], [hw * 2, 0], [hw * 2, len]], roofIn);
    return;
  }
  // Four walls to the eaves (a gabled roof closes its ends above them with gable triangles).
  s.wall(hw, z1, hw, z0, B, H, H, look.wall, look.wallPaint, inside, bayShift);
  s.wall(-hw, z0, -hw, z1, B, H, H, look.wall, look.wallPaint, inside, bayShift + 1);
  if (end0) s.wall(hw, z0, -hw, z0, B, H, H, look.wall, look.wallPaint, inside, bayShift + 2);
  if (end1) s.wall(-hw, z1, hw, z1, B, H, H, look.wall, look.wallPaint, inside, bayShift + 3);
  const slope = Math.hypot(hw, rise);
  if (shape === 'flat' || rise <= 0.05) {
    s.quad([hw, H, z1], [hw, H, z0], [-hw, H, z0], [-hw, H, z1], look.roof, look.roofPaint, [[hw, z1], [hw, z0], [-hw, z0], [-hw, z1]], inside);
  } else if (shape === 'gabled') {
    // The gable triangles, then the two slopes up to the ridge along the length.
    if (end0) s.tri([hw, H, z0], [-hw, H, z0], [0, top, z0], look.wall, look.gablePaint, [hw, H], [-hw, H], [0, top], roofIn);
    if (end1) s.tri([-hw, H, z1], [hw, H, z1], [0, top, z1], look.wall, look.gablePaint, [-hw, H], [hw, H], [0, top], roofIn);
    s.quad([hw, H, z1], [hw, H, z0], [0, top, z0], [0, top, z1], look.roof, look.roofPaint, [[len, 0], [0, 0], [0, slope], [len, slope]], roofIn);
    s.quad([-hw, H, z0], [-hw, H, z1], [0, top, z1], [0, top, z0], look.roof, look.roofPaint, [[0, 0], [len, 0], [len, slope], [0, slope]], roofIn);
  } else {
    // Hipped (or pyramidal, or a hipped roof on a squarish plan): a ridge shortened by the
    // width at each end (none: an apex), the ends sloping as steeply as the sides.
    const r = shape === 'pyramidal' ? 0 : Math.max(0, len / 2 - hw);
    const zm = (z0 + z1) / 2;
    const ra: V3 = [0, top, zm - r];
    const rb: V3 = [0, top, zm + r];
    s.quad([hw, H, z1], [hw, H, z0], ra, rb, look.roof, look.roofPaint, [[len, 0], [0, 0], [len / 2 - r, slope], [len / 2 + r, slope]], roofIn);
    s.quad([-hw, H, z0], [-hw, H, z1], rb, ra, look.roof, look.roofPaint, [[0, 0], [len, 0], [len / 2 + r, slope], [len / 2 - r, slope]], roofIn);
    s.tri([hw, H, z0], [-hw, H, z0], ra, look.roof, look.roofPaint, [hw, 0], [-hw, 0], [0, slope], roofIn);
    s.tri([-hw, H, z1], [hw, H, z1], rb, look.roof, look.roofPaint, [-hw, 0], [hw, 0], [0, slope], roofIn);
  }
}

/** A door (or a sign: no paint) on a wall: a rectangle standing just proud of it. */
function panel(s: Shell, onX: boolean, side: number, along: number, half: number, y0: number, y1: number, hw: number, hl: number, colour: number, paint: PaintName | undefined): void {
  const out = 0.05;
  if (onX) {
    const x = side * (hw + out);
    s.quad([x, y0, along - half], [x, y0, along + half], [x, y1, along + half], [x, y1, along - half], colour, paint, [[0, 0], [half * 2, 0], [half * 2, y1 - y0], [0, y1 - y0]], [0, (y0 + y1) / 2, along]);
  } else {
    const z = side * (hl + out);
    s.quad([along - half, y0, z], [along + half, y0, z], [along + half, y1, z], [along - half, y1, z], colour, paint, [[0, 0], [half * 2, 0], [half * 2, y1 - y0], [0, y1 - y0]], [along, (y0 + y1) / 2, 0]);
  }
}

/** Is this one of the kit's buildings (from a coast region's pipeline), rather than the old pitched box? */
export function isKitBuilding(bd: BuildingDef): boolean {
  return bd.kind !== undefined;
}

/**
 * Build one kit building into `parts`, standing at `base` (m, its lowest corner's ground).
 * Its frame: local x across, z along its length, turned to its bearing as the old houses were.
 */
export function buildKitHouse(bd: BuildingDef, base: number, parts: THREE.BufferGeometry[]): void {
  const kind = bd.kind ?? 'house';
  const seed = bd.seed ?? 0;
  const full = !bd.plain;
  const hw = bd.width / 2;
  const hl = bd.depth / 2;
  const front = bd.front ?? 1;
  const gable = bd.gable ?? 1;
  const shape = bd.roofShape ?? 'gabled';
  // Eaves: whole storeys plus a little; a storey and a half puts the half in a steeper roof.
  const levels = bd.levels ?? bd.height / STOREY_M;
  const whole = Math.max(1, Math.floor(levels + 1e-6));
  const H = bd.levels !== undefined && bd.height === Math.round(levels * STOREY_M * 10) / 10 ? whole * STOREY_M + 0.4 : bd.height;
  const rise = bd.roofRise ?? Math.min(7, bd.width * PITCH[kind] + (levels - whole) * STOREY_M * 0.8);
  const stone = bd.cladding === 'stone';
  const wallPaint: PaintName = bd.cladding === 'boards' ? 'boards' : bd.cladding === 'sheet' ? 'sheet' : stone && (kind === 'church' || kind === 'castle' || kind === 'ruin') ? 'stone' : 'facade';
  const roofPaint: PaintName = kind === 'shed' || kind === 'warehouse' || bd.cladding === 'sheet' ? 'sheet' : shape === 'flat' ? 'render' : 'slates';
  const look: Look = { wall: bd.wall, roof: bd.roof, wallPaint, roofPaint, gablePaint: wallPaint === 'facade' ? 'render' : wallPaint };
  const s = new Shell();
  const chimneyColour = 0x7a7670;
  // A chimney stack: four sides, no top (from the water you look up at it).
  const chimney = (z: number, top: number) => s.box(0, z, 0.35, 0.45, top - 1.4, top + 0.9, chimneyColour, 'stone', false);
  const door = full ? bd.door ?? 0x3a2a22 : 0;

  if (kind === 'ruin') {
    // Four roofless walls, each its own height, drawn both sides (you can see in).
    const c: V2[] = [
      [hw, hl],
      [hw, -hl],
      [-hw, -hl],
      [-hw, hl],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i];
      const [bx, bz] = c[(i + 1) % 4];
      const h1 = bd.height * (0.45 + 0.55 * rand(seed, i));
      const h2 = bd.height * (0.45 + 0.55 * rand(seed, i + 7));
      s.wall(ax, az, bx, bz, -2, h1, h2, bd.wall, 'stone', [0, 0, 0]);
      s.wall(ax, az, bx, bz, -2, h1, h2, bd.wall, 'stone', [ax * 3, 0, az * 3]);
    }
  } else if (kind === 'castle') {
    s.box(0, 0, hw, hl, -2, bd.height, bd.wall, 'stone');
  } else if (kind === 'terrace' && (bd.units?.length ?? 0) > 1) {
    // A row of houses: each its own colour, its eaves stepping a little up or down.
    // (Hipped houses in a row would each hip at both ends: a terrace's roofs run on, gabled.)
    const n = bd.units!.length;
    const lu = bd.depth / n;
    const row = shape === 'hipped' || shape === 'pyramidal' ? 'gabled' : shape;
    const eaves = Array.from({ length: n }, (_, i) => H + (rand(seed, i) - 0.5) * 0.8);
    for (let i = 0; i < n; i++) {
      const z0 = -hl + i * lu;
      // An end shows only at the row's ends, or where this house stands higher than its neighbour.
      const end0 = i === 0 || eaves[i] > eaves[i - 1];
      const end1 = i === n - 1 || eaves[i] > eaves[i + 1];
      segment(s, z0, z0 + lu, hw, eaves[i], rise, row, { ...look, wall: bd.units![i] }, seed + i, end0, end1);
      if (full) {
        panel(s, true, front, z0 + lu * (0.3 + 0.4 * rand(seed, i + 20)), 0.5, 0, 2.1, hw, hl, bd.door ?? 0x3a2a22, 'boards');
        if (row !== 'flat' && i % 3 === 1) chimney(z0, Math.max(eaves[i], eaves[i - 1]) + rise);
      }
    }
  } else {
    segment(s, -hl, hl, hw, H, rise, kind === 'church' ? 'gabled' : shape, look, seed);
    const ridge = H + (shape === 'flat' ? 0 : rise);
    if (kind === 'church') {
      if (bd.width * bd.depth > 120) {
        // A tower at the landward end, a spire on it.
        const t = Math.min(5, bd.width * 0.75) / 2;
        const tz = -gable * (hl - t);
        const th = ridge + 5;
        s.box(0, tz, t, t, -2, th, bd.wall, 'stone', false);
        const apex: V3 = [0, th + t * 2.4, tz];
        const cs: V3[] = [
          [t, th, tz + t],
          [t, th, tz - t],
          [-t, th, tz - t],
          [-t, th, tz + t],
        ];
        for (let i = 0; i < 4; i++) s.tri(cs[i], cs[(i + 1) % 4], apex, bd.roof, 'slates', [0, 0], [t * 2, 0], [t, t * 2.4], [0, th + t, tz]);
      } else if (full) {
        // A chapel's bellcote on its seaward gable.
        s.box(0, gable * (hl - 0.3), 0.45, 0.3, ridge - 0.6, ridge + 1.3, bd.wall, 'stone');
      }
      if (full) panel(s, false, gable, 0, 0.8, 0, 3, hw, hl, door, 'boards');
    } else if (kind === 'warehouse') {
      // Big doors in the gable facing the water (kept on a plain one: they say what it is).
      panel(s, false, gable, 0, Math.min(2, hw * 0.4), 0, Math.min(3.6, H - 0.5), hw, hl, bd.door ?? 0x3a3e44, 'boards');
    } else if (kind === 'boathouse') {
      panel(s, false, gable, 0, hw * 0.7, 0, Math.min(2.6, H - 0.3), hw, hl, bd.door ?? 0x3a2a22, 'boards');
    } else if (full) {
      // A front door on the side facing the water, a sign over it for a pub or a shop, chimneys.
      const dz = (rand(seed, 3) - 0.5) * Math.max(0, bd.depth - 3);
      if (kind !== 'shed') panel(s, true, front, dz, 0.5, 0, 2.1, hw, hl, door, 'boards');
      else panel(s, true, front, dz, Math.min(1.5, hl * 0.4), 0, Math.min(2.4, H - 0.2), hw, hl, bd.door ?? 0x3a3e44, 'boards');
      if (bd.sign !== undefined) panel(s, true, front, dz, Math.min(1.6, hl * 0.8), 2.35, 2.95, hw, hl, bd.sign, undefined);
      if ((kind === 'cottage' || kind === 'house' || kind === 'terrace') && shape !== 'flat') {
        const end = hl - 0.6;
        const zc = shape === 'gabled' ? end : Math.max(0, hl - hw);
        if (kind === 'cottage') {
          chimney(zc, ridge);
          chimney(-zc, ridge);
        } else chimney(rand(seed, 5) < 0.5 ? zc : -zc, ridge);
      }
    }
  }
  const m = new THREE.Matrix4().makeRotationY((-bd.yawDeg * Math.PI) / 180).setPosition(bd.x, base, bd.z);
  parts.push(s.geometry(m));
}
