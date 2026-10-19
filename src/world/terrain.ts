/**
 * Terrain height: one analytic function of (x, z) for land AND seabed, shared by the
 * terrain mesh, hull-vs-ground contacts, the anchor and the depth sounder - so what you see
 * is what you run aground on.
 *
 *   island  : coastline radius r(θ) = R·(1 + Σ a_k cos(kθ + φ_k)); inland of it the ground
 *             rises over a beach of slope 1:12 into hills (smoothstep profile plus gentle
 *             sinusoidal undulation); offshore the seabed falls away as
 *             −MAX_DEPTH·(1 − e^(−d/SHELF)), d = distance offshore.
 *   islands : combined with max() (the shallower wins), floor at −MAX_DEPTH.
 *   flats   : waterfronts: land brought down to a level (never raised), blended at the edge.
 *   cuts    : basins and bays lower everything inside to a fixed depth, with a sloped edge.
 *   channels: fjords and narrows: the same, along a line of varying width (ChannelDef).
 *   ridges  : breakwaters raise a trapezoidal mound along a segment.
 *   slipways: a concrete slip (SLIPWAYS) is its own plane, top - slope x (distance down it),
 *             wherever it lies (built up over the seabed, cut into the bank), square-edged.
 */
import { CHANNELS, CUTS, FLATS, ISLANDS, MAX_DEPTH, RIDGES, SHELF, SLIPWAYS, type ChannelDef, type IslandDef } from './archipelago';

/** Each slipway's axes: the unit vector up it (world x, z), for slipSurface. */
const SLIP_AXES = SLIPWAYS.map((s) => {
  const a = (s.headingDeg * Math.PI) / 180;
  return { s, ux: Math.sin(a), uz: -Math.cos(a), reach: Math.hypot(s.length, s.width / 2) };
});

/**
 * The slipway surface at (x, z), if a slipway covers it: its height, and which one. `along`
 * is the distance down the slip from its top edge (0 .. length).
 */
export function slipSurface(x: number, z: number): { h: number; id: string; along: number } | null {
  for (const { s, ux, uz, reach } of SLIP_AXES) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const down = -(dx * ux + dz * uz);
    const across = dx * uz - dz * ux;
    if (down < 0 || down > s.length || Math.abs(across) > s.width / 2) continue;
    return { h: s.top - s.slope * down, id: s.id, along: down };
  }
  return null;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Each channel's reach (its points' box grown by the widest half-width and the edge), to skip it quickly. */
const CHANNEL_BOX = CHANNELS.map((c) => {
  const grow = Math.max(...c.points.map((p) => p[2])) + c.edge;
  return {
    c,
    x0: Math.min(...c.points.map((p) => p[0])) - grow,
    x1: Math.max(...c.points.map((p) => p[0])) + grow,
    z0: Math.min(...c.points.map((p) => p[1])) - grow,
    z1: Math.max(...c.points.map((p) => p[1])) + grow,
  };
});

/**
 * How far into a channel's cut (x, z) is: 1 on its floor, 0 beyond its edge. The nearest
 * point of its line decides, with the half-width eased between the two points there.
 */
function channelWeight(c: ChannelDef, x: number, z: number): number {
  let w = 0;
  const p = c.points;
  for (let i = 0; i + 1 < p.length; i++) {
    const [ax, az, aw] = p[i];
    const [bx, bz, bw] = p[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    const half = aw + (bw - aw) * t;
    if (d >= half + c.edge) continue;
    w = Math.max(w, 1 - smoothstep(half, half + c.edge, d));
  }
  return w;
}

/** Distance beyond which an island no longer shallows the seabed noticeably (m). */
const INFLUENCE = 6 * SHELF;

function coastRadius(isl: IslandDef, theta: number): number {
  let f = 1;
  for (const [k, a, p] of isl.shape) f += a * Math.cos(k * theta + p);
  return isl.radius * f;
}

function islandHeight(isl: IslandDef, x: number, z: number): number {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const dist = Math.hypot(dx, dz);
  if (dist > isl.radius * 1.4 + INFLUENCE) return -MAX_DEPTH;
  const r = coastRadius(isl, Math.atan2(dz, dx));
  const inland = r - dist;
  if (inland < 0) return -MAX_DEPTH * (1 - Math.exp(inland / SHELF));
  // Beach, then hills.
  const beach = inland / 12;
  const s = isl.seed;
  const undulate = 0.5 + 0.25 * Math.sin(x * 0.021 + s * 1.7) * Math.sin(z * 0.017 + s * 2.3) + 0.15 * Math.sin((x + z) * 0.043 + s);
  const hills = isl.height * smoothstep(isl.beach * 0.5, r * (isl.rise ?? 0.75), inland) * (0.55 + 0.45 * undulate) * (0.75 + 0.25 * smoothstep(0, r, inland));
  return Math.max(Math.min(beach, 1.5 + inland * 0.02), hills);
}

/**
 * Ground (land or seabed) height at (x, z), m above MSL.
 * @param ridges include breakwater mounds (the terrain MESH leaves them out; they have
 *               their own rock-armour mesh)
 */
export function groundHeight(x: number, z: number, ridges = true): number {
  let h = -MAX_DEPTH;
  for (const isl of ISLANDS) {
    if (Math.abs(x - isl.x) > isl.radius * 1.4 + INFLUENCE || Math.abs(z - isl.z) > isl.radius * 1.4 + INFLUENCE) continue;
    h = Math.max(h, islandHeight(isl, x, z));
  }
  for (const f of FLATS) {
    if (h <= f.height || Math.abs(x - f.x) >= f.radius || Math.abs(z - f.z) >= f.radius) continue;
    const d = Math.hypot(x - f.x, z - f.z);
    if (d >= f.radius) continue;
    const w = 1 - smoothstep(f.radius - f.edge, f.radius, d);
    h += (f.height - h) * w;
  }
  for (const c of CUTS) {
    if (Math.abs(x - c.x) >= c.radius || Math.abs(z - c.z) >= c.radius) continue;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d >= c.radius) continue;
    const w = 1 - smoothstep(c.radius - c.edge, c.radius, d);
    h = Math.min(h, h + (-c.depth - h) * w);
  }
  for (const b of CHANNEL_BOX) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    const w = channelWeight(b.c, x, z);
    if (w > 0) h = Math.min(h, h + (-b.c.depth - h) * w);
  }
  if (ridges) {
    for (const r of RIDGES) {
      const d = distanceToSegment(x, z, r.ax, r.az, r.bx, r.bz);
      if (d > r.halfWidth + (r.crest + MAX_DEPTH) / r.slope) continue;
      h = Math.max(h, r.crest - Math.max(0, d - r.halfWidth) * r.slope);
    }
  }
  const slip = slipSurface(x, z);
  if (slip) h = slip.h;
  return h;
}

/** Unit ground normal at (x, z) by central differences. */
export function groundNormal(x: number, z: number, out: { x: number; y: number; z: number }, e = 0.5): void {
  const hx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const hz = groundHeight(x, z + e) - groundHeight(x, z - e);
  const nx = -hx;
  const ny = 2 * e;
  const nz = -hz;
  const len = Math.hypot(nx, ny, nz);
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
}

export function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}
