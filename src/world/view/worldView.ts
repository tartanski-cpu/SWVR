import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { BERTHS, BLOCKS, BUILDINGS, ISLANDS, LAMPS, LIGHTS, PORT_FLOODS, PORTS, RIDGES, type BlockDef } from '../archipelago';
import { CONFIG } from '../../config';
import { groundHeight } from '../terrain';
import { standingHeight } from '../geography';

/**
 * Everything static in the archipelago, built once at start-up from the level data:
 *   terrain     one flat-shaded, vertex-coloured mesh sampled from the same height function
 *               the physics uses (cells entirely below -3 m are skipped - the sea is opaque)
 *   structures  quays, pier decks and piles, fenders, bollards, fuel pumps, breakwater rock
 *               armour, buildings, light towers - one merged mesh
 *   trees       one instanced mesh
 *   lights      harbour and lighthouse lights (HarbourLights, animated)
 */
export class WorldView {
  readonly root = new THREE.Group();
  readonly lights: HarbourLights;
  readonly portLighting: PortLighting;

  constructor() {
    this.root.name = 'archipelago';
    const terrain = new THREE.Mesh(buildTerrain(), flatVertexColorMaterial());
    terrain.name = 'terrain';
    const structures = new THREE.Mesh(mergeParts(buildStructures()), flatVertexColorMaterial());
    structures.name = 'structures';
    this.lights = new HarbourLights();
    this.portLighting = new PortLighting();
    this.root.add(terrain, structures, buildTrees(), this.lights.points, this.portLighting.root);
    // Static: no per-frame matrix updates needed.
    this.root.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
  }
}

// ── Terrain ──────────────────────────────────────────────────────────────────────

const CELL = 6;
const SKIP_BELOW = -3;

function buildTerrain(): THREE.BufferGeometry {
  // Unique grid cells around every island (islands' boxes overlap, e.g. Gull Rocks).
  const cells = new Set<number>();
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  for (const isl of ISLANDS) {
    const reach = isl.radius * 1.35 + 40;
    const i0 = Math.floor((isl.x - reach) / CELL);
    const i1 = Math.ceil((isl.x + reach) / CELL);
    const j0 = Math.floor((isl.z - reach) / CELL);
    const j1 = Math.ceil((isl.z + reach) / CELL);
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) cells.add(key(i, j));
  }
  const heights = new Map<number, number>();
  const hAt = (i: number, j: number) => {
    const k = key(i, j);
    let h = heights.get(k);
    if (h === undefined) {
      h = groundHeight(i * CELL, j * CELL, false);
      heights.set(k, h);
    }
    return h;
  };

  const pos: number[] = [];
  const col: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const color = new THREE.Color();
  const tri = (ax: number, az: number, ah: number, bx: number, bz: number, bh: number, cx: number, cz: number, ch: number) => {
    if (Math.max(ah, bh, ch) < SKIP_BELOW) return;
    a.set(ax, ah, az);
    b.set(bx, bh, bz);
    c.set(cx, ch, cz);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (n.y < 0) n.negate();
    terrainColor((ah + bh + ch) / 3, n.y, (ax + bx + cx) / 3, (az + bz + cz) / 3, color);
    pos.push(ax, ah, az, bx, bh, bz, cx, ch, cz);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  for (const k of cells) {
    const i = Math.floor(k / 8192) - 4096;
    const j = (k % 8192) - 4096;
    const x0 = i * CELL;
    const z0 = j * CELL;
    const x1 = x0 + CELL;
    const z1 = z0 + CELL;
    const h00 = hAt(i, j);
    const h10 = hAt(i + 1, j);
    const h01 = hAt(i, j + 1);
    const h11 = hAt(i + 1, j + 1);
    // Counter-clockwise seen from above (+Y): (x0,z0) -> (x0,z1) -> (x1,z0).
    tri(x0, z0, h00, x0, z1, h01, x1, z0, h10);
    tri(x1, z0, h10, x0, z1, h01, x1, z1, h11);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Small deterministic hash in [0, 1) for colour and placement variation. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const SAND = new THREE.Color(0xd9c99a);
const WET_SAND = new THREE.Color(0xa99a70);
const SEABED = new THREE.Color(0x3e5a58);
const GRASS = new THREE.Color(0x58823c);
const HEATH = new THREE.Color(0x7b7a4a);
const ROCK = new THREE.Color(0x77736b);

function terrainColor(h: number, ny: number, x: number, z: number, out: THREE.Color): void {
  if (h < -0.3) out.copy(WET_SAND).lerp(SEABED, Math.min(1, -h / 5));
  else if (ny < 0.72) out.copy(ROCK);
  else if (h < 1.7 && ny > 0.8) out.copy(SAND);
  else if (h > 30) out.copy(HEATH);
  else out.copy(GRASS).lerp(HEATH, Math.min(1, Math.max(0, (h - 18) / 14)));
  const v = 0.92 + 0.16 * hash(Math.round(x), Math.round(z));
  out.multiplyScalar(v);
}

// ── Structures ───────────────────────────────────────────────────────────────────

const CONCRETE = 0x9c9a94;
const TIMBER = 0x7a5a3c;
const PILE = 0x3d3a36;
const FENDER = 0x1e1e1e;
const BOLLARD = 0x2a2c30;

function buildStructures(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const b of BLOCKS) buildBlock(b, parts);
  for (const r of RIDGES) buildBreakwater(r.ax, r.az, r.bx, r.bz, r.crest, r.halfWidth, r.slope, parts);
  for (const bd of BUILDINGS) buildBuilding(bd, parts);
  for (const l of LIGHTS) buildLightTower(l.x, l.z, l.y, l.color, l.tower, parts);
  // Lamp posts: a slim pole with a downward-facing head.
  for (const l of LAMPS) {
    const base = standingHeight(l.x, l.z);
    const h = l.y - base;
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.1, h, 6).translate(l.x, base + h / 2, l.z), 0x50565c));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.14, 0.28).translate(l.x, l.y + 0.05, l.z), 0x3a3f44));
    parts.push(part(new THREE.BoxGeometry(0.42, 0.04, 0.22).translate(l.x, l.y - 0.04, l.z), 0xfff1c8));
  }
  // Berth marks: a yellow strip along the quay/pier edge for each dockable berth.
  for (const b of BERTHS) {
    const yaw = (b.headingDeg * Math.PI) / 180;
    const ex = b.x + b.shoreX * (b.shoreDist + 0.3);
    const ez = b.z + b.shoreZ * (b.shoreDist + 0.3);
    const strip = new THREE.BoxGeometry(0.3, 0.03, 12).rotateY(-yaw).translate(ex, b.deckY + 0.015, ez);
    parts.push(part(strip, 0xf2c200));
  }
  for (const p of PORTS) {
    if (!p.fuel) continue;
    const top = standingHeight(p.fuel.pumpX, p.fuel.pumpZ);
    parts.push(part(new THREE.BoxGeometry(0.7, 1.5, 0.5).translate(p.fuel.pumpX, top + 0.75, p.fuel.pumpZ), 0xc8281e));
    parts.push(part(new THREE.BoxGeometry(0.72, 0.25, 0.52).translate(p.fuel.pumpX, top + 1.62, p.fuel.pumpZ), 0xf0f0f0));
  }
  return parts;
}

/**
 * Quay or pier. Geometry is built in the block's frame (local +Z along the axis) and
 * rotated to its bearing. A quay is a solid concrete wall; a pier is a timber deck on piles.
 * Fenders and bollards go only along faces that have water in front of them.
 */
function buildBlock(b: BlockDef, parts: THREE.BufferGeometry[]): void {
  const yaw = (b.yawDeg * Math.PI) / 180;
  // Local X (across) -> world (cos yaw, sin yaw) as in geography.ts; local Z runs along the
  // axis (reversed, which doesn't matter: everything here is symmetric end to end).
  const m = new THREE.Matrix4().makeRotationY(-yaw).setPosition(b.x, 0, b.z);
  const local: THREE.BufferGeometry[] = [];
  const L = b.halfLength;
  const W = b.halfWidth;
  const add = (g: THREE.BufferGeometry, color: number) => local.push(part(g, color));

  if (b.kind === 'quay') {
    add(new THREE.BoxGeometry(2 * W, b.top + 6, 2 * L).translate(0, (b.top - 6) / 2, 0), CONCRETE);
  } else {
    add(new THREE.BoxGeometry(2 * W, 0.45, 2 * L).translate(0, b.top - 0.225, 0), TIMBER);
    for (let s = -L + 2; s <= L - 2; s += 6) {
      for (const side of [-1, 1]) add(new THREE.CylinderGeometry(0.28, 0.28, b.top + 9, 7).translate(side * (W - 0.4), (b.top - 9) / 2 - 0.4, s), PILE);
    }
  }

  // Seaward faces: probe the water 2 m beyond each face's middle.
  const toWorld = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
  const faces: { nx: number; nz: number; half: number; offset: number; alongX: boolean }[] = [
    { nx: 1, nz: 0, half: L, offset: W, alongX: false },
    { nx: -1, nz: 0, half: L, offset: W, alongX: false },
    { nx: 0, nz: 1, half: W, offset: L, alongX: true },
    { nx: 0, nz: -1, half: W, offset: L, alongX: true },
  ];
  for (const f of faces) {
    const probe = toWorld(f.nx * (f.offset + 2), f.nz * (f.offset + 2));
    if (groundHeight(probe.x, probe.z) > -1) continue; // land or shallows: no berth
    for (let s = -f.half + 1.5; s <= f.half - 1.5; s += 4) {
      const x = f.alongX ? s : f.nx * (f.offset + 0.12);
      const z = f.alongX ? f.nz * (f.offset + 0.12) : s;
      if (b.fendered) add(new THREE.BoxGeometry(f.alongX ? 0.5 : 0.25, 1.6, f.alongX ? 0.25 : 0.5).translate(x, b.top - 0.9, z), FENDER);
    }
    for (let s = -f.half + 3; s <= f.half - 3; s += 12) {
      const x = f.alongX ? s : f.nx * (f.offset - 0.5);
      const z = f.alongX ? f.nz * (f.offset - 0.5) : s;
      add(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8).translate(x, b.top + 0.25, z), BOLLARD);
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8).translate(x, b.top + 0.52, z), BOLLARD);
    }
  }
  for (const g of local) parts.push(g.applyMatrix4(m));
}

/** Rubble-mound breakwater: a trapezoid of rough rock armour along the segment, round heads. */
function buildBreakwater(ax: number, az: number, bx: number, bz: number, crest: number, halfW: number, slope: number, parts: THREE.BufferGeometry[]): void {
  const base = -4;
  const baseHalf = halfW + (crest - base) / slope;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const px = -uz;
  const pz = ux;
  const n = Math.max(2, Math.ceil(len / 3));
  // Cross-section profile (across offset, height), jittered per ring.
  const profile: [number, number][] = [
    [-baseHalf, base],
    [-halfW - 0.6 * (baseHalf - halfW), crest - 0.6 * (crest - base)],
    [-halfW, crest],
    [halfW, crest],
    [halfW + 0.6 * (baseHalf - halfW), crest - 0.6 * (crest - base)],
    [baseHalf, base],
  ];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    rings.push(
      profile.map(([o, y], k) => {
        const j = (hash(i * 7.1 + k, ax + az) - 0.5) * 0.9;
        const jy = (hash(i * 3.3 + k * 1.7, bx) - 0.5) * 0.6;
        return new THREE.Vector3(ax + ux * t + px * (o + j), y + (k === 0 || k === 5 ? 0 : jy), az + uz * t + pz * (o + j));
      }),
    );
  }
  const pos: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const a = rings[i][k];
      const b = rings[i][k + 1];
      const c = rings[i + 1][k];
      const d = rings[i + 1][k + 1];
      // Counter-clockwise seen from outside the mound.
      pushTri(a, b, c);
      pushTri(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // merging needs the same attributes as the other parts
  parts.push(part(g, 0x7d7a74));
  // Round heads at both ends.
  for (const [x, z] of [
    [ax, az],
    [bx, bz],
  ]) {
    const head = new THREE.IcosahedronGeometry(1, 1);
    head.scale(baseHalf, crest - base, baseHalf).translate(x, base, z);
    parts.push(part(head, 0x75726c));
  }
}

function buildBuilding(bd: (typeof BUILDINGS)[number], parts: THREE.BufferGeometry[]): void {
  const yaw = (bd.yawDeg * Math.PI) / 180;
  const hw = bd.width / 2;
  const hd = bd.depth / 2;
  // Sit on the lowest corner (on the quay apron if it stands on one), walls sunk 2 m.
  let base = Infinity;
  for (const [cx, cz] of [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ]) {
    const x = bd.x + cx * Math.cos(yaw) - cz * Math.sin(yaw);
    const z = bd.z + cx * Math.sin(yaw) + cz * Math.cos(yaw);
    base = Math.min(base, Math.max(standingHeight(x, z), groundHeight(x, z)));
  }
  const m = new THREE.Matrix4().makeRotationY(-yaw).setPosition(bd.x, base, bd.z);
  const walls = new THREE.BoxGeometry(bd.width, bd.height + 2, bd.depth).translate(0, bd.height / 2 - 1, 0);
  // Gable roof: a triangular prism along the width, with a little overhang.
  const rh = bd.width * 0.35;
  const shape = new THREE.Shape([new THREE.Vector2(-hw - 0.4, 0), new THREE.Vector2(hw + 0.4, 0), new THREE.Vector2(0, rh)]);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: bd.depth + 0.8, bevelEnabled: false });
  roof.translate(0, bd.height, -hd - 0.4);
  // Door and windows as dark inset panels on the front (+z) face.
  const door = new THREE.BoxGeometry(1.1, 2.1, 0.1).translate(-hw * 0.4, 1.05, hd + 0.03);
  const win = new THREE.BoxGeometry(1.2, 1.0, 0.1).translate(hw * 0.35, bd.height * 0.55, hd + 0.03);
  for (const [g, c] of [
    [walls, bd.wall],
    [roof, bd.roof],
    [door, 0x3a2a22],
    [win, 0x2a3a48],
  ] as const) {
    parts.push(part(g.applyMatrix4(m), c));
  }
}

function buildLightTower(x: number, z: number, lampY: number, color: string, tower: string, parts: THREE.BufferGeometry[]): void {
  if (tower === 'none') return;
  const ground = groundHeight(x, z);
  if (tower === 'post') {
    const c = color === 'red' ? 0xc8281e : color === 'green' ? 0x1f8a3a : 0xe8e8e0;
    const h = lampY - ground - 0.4;
    parts.push(part(new THREE.CylinderGeometry(0.45, 0.6, h, 8).translate(x, ground + h / 2, z), c));
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8).translate(x, lampY, z), 0xf0f0e8));
  } else {
    const h = lampY - ground - 1.5;
    parts.push(part(new THREE.CylinderGeometry(1.4, 2.2, h, 10).translate(x, ground + h / 2, z), 0xf2f0ea));
    parts.push(part(new THREE.CylinderGeometry(1.75, 1.9, 1.6, 10).translate(x, ground + h * 0.55, z), 0xb8241c));
    parts.push(part(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 10).translate(x, lampY, z), 0xfff0c0));
    parts.push(part(new THREE.ConeGeometry(1.3, 1.4, 10).translate(x, lampY + 1.5, z), 0x2a2a2a));
    parts.push(part(new THREE.CylinderGeometry(1.8, 1.8, 0.2, 10).translate(x, lampY - 0.9, z), 0x2a2a2a));
  }
}

// ── Trees ────────────────────────────────────────────────────────────────────────

function buildTrees(): THREE.InstancedMesh {
  // Lean low-poly conifer (~16 triangles): open-ended cones, three-sided trunk.
  const geo = mergeParts([
    part(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 3, 1, true).translate(0, 0.8, 0), 0x5a4030),
    part(new THREE.ConeGeometry(1.6, 3.6, 5, 1, true).translate(0, 2.8, 0), 0xffffff),
    part(new THREE.ConeGeometry(1.15, 2.8, 5, 1, true).translate(0, 4.6, 0), 0xffffff),
  ]);
  const spots: [number, number, number, number][] = [];
  const step = 5;
  for (const isl of ISLANDS) {
    if (isl.trees <= 0) continue;
    const reach = isl.radius * 1.2;
    for (let x = isl.x - reach; x < isl.x + reach; x += step) {
      for (let z = isl.z - reach; z < isl.z + reach; z += step) {
        // Forest patches from low-frequency noise; trees thin out at the edges.
        const patch = Math.sin(x * 0.012 + isl.seed) * Math.sin(z * 0.015 - isl.seed) + 0.35 * Math.sin((x - z) * 0.03);
        if (patch < 0.05) continue;
        if (hash(x, z) > ((isl.trees * (step * step)) / 100) * 1.8 * Math.min(1, patch * 2)) continue;
        const jx = x + (hash(z, x) - 0.5) * step;
        const jz = z + (hash(x + 1, z - 1) - 0.5) * step;
        const h = groundHeight(jx, jz);
        if (h < 3 || h > 40) continue;
        const slope = Math.abs(groundHeight(jx + 2, jz) - h) + Math.abs(groundHeight(jx, jz + 2) - h);
        if (slope > 2.2) continue;
        if (PORTS.some((p) => Math.hypot(jx - p.x, jz - p.z) < p.clearRadius)) continue;
        if (BUILDINGS.some((b) => Math.hypot(jx - b.x, jz - b.z) < Math.max(b.width, b.depth))) continue;
        spots.push([jx, h - 0.2, jz, 0.7 + 0.7 * hash(jz, jx)]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), spots.length);
  mesh.name = 'trees';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  spots.forEach(([x, y, z, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(x, y) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.85 + 0.3 * hash(z, y)), s));
    mesh.setMatrixAt(i, m);
    // Instance colour tints the (white) foliage; the trunk is dark enough not to matter.
    c.setRGB(0.18 + 0.08 * hash(x, z), 0.36 + 0.1 * hash(z, x), 0.16 + 0.05 * hash(y, x));
    mesh.setColorAt(i, c);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

// ── Lights ───────────────────────────────────────────────────────────────────────

const LIGHT_COLORS = { red: 0xff3020, green: 0x30ff60, white: 0xfff4d8 };

/**
 * Harbour and lighthouse lights: one Points draw call with a constant on-screen size (so a
 * lighthouse is visible as a point miles off), flashing per their characteristic
 * (Fl = a 0.6 s flash every `period` s, F = fixed). Brighter and bigger at night.
 */
export class HarbourLights {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly colors: THREE.BufferAttribute;
  private readonly base: Float32Array;

  constructor() {
    const pos = new Float32Array(LIGHTS.length * 3);
    this.base = new Float32Array(LIGHTS.length * 3);
    const c = new THREE.Color();
    LIGHTS.forEach((l, i) => {
      pos.set([l.x, l.y + (l.tower === 'lighthouse' ? 0 : 0.35), l.z], i * 3);
      c.set(LIGHT_COLORS[l.color]);
      this.base.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.colors = new THREE.BufferAttribute(this.base.slice(), 3);
    geo.setAttribute('color', this.colors);
    this.material = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: false,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'harbourLights';
    this.points.frustumCulled = false;
  }

  /** @param time seconds; @param darkness 0 (noon) .. 1 (night) */
  update(time: number, darkness: number): void {
    const col = this.colors.array as Float32Array;
    LIGHTS.forEach((l, i) => {
      const on = l.period === 0 || time % l.period < 0.6;
      for (let k = 0; k < 3; k++) col[i * 3 + k] = on ? this.base[i * 3 + k] : 0;
    });
    this.colors.needsUpdate = true;
    this.material.size = 6 + 16 * darkness;
    this.material.opacity = 0.35 + 0.65 * darkness;
  }
}

function glowTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(g.canvas);
}

// ── Port lighting ────────────────────────────────────────────────────────────────

/**
 * Night lighting for the ports, frame-rate friendly:
 *  - every lamp post's head glows (one Points draw call, warm, world-sized sprites);
 *  - ONE real PointLight - the floodlight of the nearest port within `activeRange` - lights
 *    the quay, the boat and (in the ocean shader) the water near you. Moving between ports
 *    moves the light. It's hidden from dawn to dusk, so by day no shader pays for it (it
 *    comes into the shaders once at dusk and leaves once at dawn: one recompile each).
 */
export class PortLighting {
  readonly root = new THREE.Group();
  readonly flood: THREE.PointLight;
  private readonly glow: THREE.Points;
  private readonly glowMat: THREE.PointsMaterial;

  constructor() {
    const c = CONFIG.portLights;
    const pos = new Float32Array(LAMPS.length * 3);
    LAMPS.forEach((l, i) => pos.set([l.x, l.y - 0.12, l.z], i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glowMat = new THREE.PointsMaterial({
      color: c.lampColor,
      size: 2.2,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.glow = new THREE.Points(geo, this.glowMat);
    this.glow.name = 'lampGlow';
    this.glow.frustumCulled = false;
    this.flood = new THREE.PointLight(c.lampColor, 0, c.floodDistance, 2);
    this.flood.name = 'portFlood';
    this.root.add(this.glow, this.flood);
  }

  /**
   * @param near     a point near the action (the boat or the viewer)
   * @param darkness 0 (noon) .. 1 (night); lamps come on at dusk
   */
  update(near: THREE.Vector3, darkness: number): void {
    const c = CONFIG.portLights;
    const on = Math.min(1, Math.max(0, (darkness - 0.25) / 0.3));
    this.glow.visible = on > 0.01;
    this.glowMat.opacity = on;
    let best: (typeof PORT_FLOODS)[number] | null = null;
    let bestD = c.activeRange;
    for (const f of PORT_FLOODS) {
      const d = Math.hypot(near.x - f.x, near.z - f.z);
      if (d < bestD) [best, bestD] = [f, d];
    }
    if (best) this.flood.position.set(best.x, best.y, best.z);
    this.flood.intensity = best ? c.floodIntensity * on : 0;
    // In the scene's lights only from dusk to dawn (changes twice a day: one recompile each),
    // so in daylight no shader pays for it.
    this.flood.visible = on > 0.01;
    // Static group: refresh the moved light's matrix by hand.
    this.flood.updateMatrix();
    this.flood.updateMatrixWorld(true);
  }
}
