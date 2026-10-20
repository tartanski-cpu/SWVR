import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Pixel painting (owner, Oct 2026): detail painted onto the boats' flat panels as small,
 * crisp, low-resolution images, Stormworks style: a non-slip deck, wood lining, floor
 * matting, chequer plate. (Hull plating was tried and dropped, owner: workboats are mostly
 * GRP, or aluminium in big sheets.) The shapes, and the draw calls, stay as they were.
 *
 * - The images ("tiles") are made here in code at start-up: nothing to download. Each is
 *   64 x 64 greyscale pixels, mid-grey on average, and multiplies the part's own colour
 *   (mid-grey leaves it as it is), so a tile takes any livery's paint.
 * - A part says which tile it wears (`part(shape, colour, 'wood')`, render/geometryUtils);
 *   where on the tile each point falls is worked out when parts are merged: a flat
 *   projection in metres along the face, so the pixels are the same size everywhere.
 * - Drawn in the shared flat-shaded material (flatVertexColorMaterial), one texture for all
 *   the tiles. Pixels are kept crisp up close but their edges are blended over a fraction of
 *   a screen pixel, and far away they average out (mipmaps): plain hard pixels shimmer and
 *   crawl in VR as the head moves.
 */

/**
 * The tiles, in their order in the texture (0 is no paint). The first four are the boats';
 * the rest dress the cargo, the harbours and the sea marks (step 2, owner: the crates, the
 * houses, the buoys and nav marks). `crate` and `window` are whole pictures, one to a face
 * (`fitPaint`, render/geometryUtils); the others repeat every `tileMetres`. The last four dress
 * the wheelhouse inside (CONFIG.interiors and CONFIG.cabinFloors, chosen in the Shipyard).
 */
export const PAINTS = ['nonSlip', 'wood', 'mat', 'chequer', 'crate', 'sacking', 'worn', 'boards', 'render', 'sheet', 'slates', 'concrete', 'stone', 'window', 'rust', 'teak', 'deckTeak', 'steel', 'brushed'] as const;
export type PaintName = (typeof PAINTS)[number];

/** A tile's index in the texture (0: none). */
export const paintIndex = (p?: PaintName): number => (p ? PAINTS.indexOf(p) + 1 : 0);

/** Pixels along each side of a tile. */
export const TILE = 64;

/** A small seeded random number generator (mulberry32), so the tiles are the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seamless value noise over the tile: random values on a grid every `cell` pixels, blended smoothly between. */
function noise(seed: number, cell: number): (x: number, y: number) => number {
  const r = rng(seed);
  const n = TILE / cell;
  const g = Array.from({ length: n * n }, () => r());
  const at = (i: number, j: number) => g[((j + n) % n) * n + ((i + n) % n)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = s(fx - i);
    const v = s(fy - j);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
}

/** Each tile's pixels: brightness 0..1 at (x, y), y up the face. Every tile repeats seamlessly. */
const PAINTERS: Record<PaintName, () => (x: number, y: number) => number> = {
  /** Non-slip deck paint: a grit of raised flecks over a slightly mottled ground. */
  nonSlip: () => {
    const r = rng(23);
    const px = Array.from({ length: TILE * TILE }, () => {
      const v = r();
      return v > 0.82 ? 0.6 : v < 0.12 ? 0.41 : 0.48 + 0.04 * r();
    });
    return (x, y) => px[y * TILE + x];
  },
  /** Wood lining: planks 12.5 cm wide (4 pixels), each its own tone, with grain and staggered ends. */
  wood: () => {
    const r = rng(37);
    const rows = TILE / 4;
    const plank = Array.from({ length: rows }, () => ({ tone: 0.45 + 0.18 * r(), end: Math.floor(r() * TILE), grain: Array.from({ length: TILE }, () => (r() - 0.5) * 0.06) }));
    return (x, y) => {
      const row = Math.floor(y / 4);
      const p = plank[row];
      if (y % 4 === 0) return 0.3; // the gap between planks
      if (x === p.end) return 0.33; // a plank's end
      // Grain: streaks along the plank, a little different on each of its rows of pixels.
      return p.tone + p.grain[(x + (y % 4) * 17) % TILE];
    };
  },
  /** Floor matting: a fine speckle, like rubber matting or hard-wearing carpet. */
  mat: () => {
    const r = rng(41);
    const px = Array.from({ length: TILE * TILE }, () => 0.43 + 0.14 * r());
    return (x, y) => px[y * TILE + x];
  },
  /** Chequer (tread) plate: raised bars, alternately one way and the other, in an 8-pixel grid. */
  chequer: () => {
    const r = rng(53);
    const speck = Array.from({ length: TILE * TILE }, () => (r() - 0.5) * 0.03);
    return (x, y) => {
      const cx = x % 8;
      const cy = y % 8;
      const flip = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 1;
      const along = flip ? cx : cy;
      const across = flip ? cy : cx;
      const bar = across >= 3 && across <= 4 && along >= 1 && along <= 6;
      const edge = across === 5 && along >= 1 && along <= 6;
      return (bar ? 0.64 : edge ? 0.4 : 0.48) + speck[y * TILE + x];
    };
  },
  /**
   * A cargo crate's side, the whole face (one to a face): a frame of boards round the edge,
   * planks across inside, a diagonal brace, and nail heads at the frame's corners.
   */
  crate: () => {
    const r = rng(61);
    const grain = Array.from({ length: TILE * TILE }, () => (r() - 0.5) * 0.05);
    const plankTone = Array.from({ length: 8 }, () => 0.44 + 0.1 * r());
    const F = 7; // the frame boards' width (pixels)
    return (x, y) => {
      const g = grain[y * TILE + x];
      if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) return 0.36; // the face's edge
      const inFrame = x < F || y < F || x >= TILE - F || y >= TILE - F;
      if (inFrame) {
        // Nail heads: two at each corner of the frame.
        const cx = x < F ? 3 : x >= TILE - F ? TILE - 4 : -9;
        const cy = y < F ? 3 : y >= TILE - F ? TILE - 4 : -9;
        if (cx > 0 && cy > 0 && (Math.abs(x - cx) + Math.abs(y - cy) === 0 || (Math.abs(x - cx) === 0 && Math.abs(y - cy) === 2))) return 0.2;
        if (x === F - 1 || y === F - 1 || x === TILE - F || y === TILE - F) return 0.38; // the frame's inner edge
        return 0.6 + g;
      }
      // The brace, corner to corner across the planks.
      const d = Math.abs(x - y);
      if (d <= 3) return d === 3 ? 0.36 : 0.62 + g;
      // Planks across, 7 pixels each with a dark gap.
      const row = Math.floor((y - F) / 7);
      if ((y - F) % 7 === 6) return 0.3;
      return plankTone[row % 8] + g;
    };
  },
  /** Sacking: a coarse weave of 2-pixel threads, a little uneven. */
  sacking: () => {
    const r = rng(67);
    const fuzz = Array.from({ length: TILE * TILE }, () => (r() - 0.5) * 0.08);
    return (x, y) => (((x >> 1) + (y >> 1)) % 2 ? 0.56 : 0.44) + fuzz[y * TILE + x];
  },
  /**
   * Worn paint, for drums, buoys, posts and fittings: the paint mottled, scuffed in short
   * streaks, a few rust spots each with a run down from it.
   */
  worn: () => {
    const r = rng(71);
    const mottle = noise(72, 8);
    const px = Array.from({ length: TILE * TILE }, (_, i) => 0.47 + 0.07 * mottle(i % TILE, Math.floor(i / TILE)) + (r() - 0.5) * 0.03);
    // Scuffs: short light streaks along the face.
    for (let k = 0; k < 14; k++) {
      const x0 = Math.floor(r() * TILE);
      const y0 = Math.floor(r() * TILE);
      const len = 3 + Math.floor(r() * 6);
      for (let i = 0; i < len; i++) px[y0 * TILE + ((x0 + i) % TILE)] = 0.6;
    }
    // Rust: a spot and a run down the face from it.
    for (let k = 0; k < 6; k++) {
      const x0 = Math.floor(r() * TILE);
      const y0 = Math.floor(r() * TILE);
      px[y0 * TILE + x0] = 0.24;
      px[y0 * TILE + ((x0 + 1) % TILE)] = 0.3;
      const run = 4 + Math.floor(r() * 10);
      for (let i = 1; i <= run; i++) px[((y0 - i + TILE) % TILE) * TILE + x0] = 0.34 + (0.12 * i) / run;
    }
    return (x, y) => px[y * TILE + x];
  },
  /** Weatherboarding: boards lapped 25 cm apart (8 pixels at 2 m), a shadow under each lap, staggered butt joints. */
  boards: () => {
    const r = rng(79);
    const rows = TILE / 8;
    const board = Array.from({ length: rows }, () => ({ tone: 0.5 + 0.06 * r(), joint: Math.floor(r() * TILE) }));
    const grain = Array.from({ length: TILE * TILE }, () => (r() - 0.5) * 0.03);
    return (x, y) => {
      const b = board[Math.floor(y / 8)];
      const k = y % 8;
      if (k === 0) return 0.28; // the shadow under the board above
      if (k === 1) return 0.4;
      if (x === b.joint) return 0.36;
      return b.tone + (k === 7 ? 0.05 : 0) + grain[y * TILE + x];
    };
  },
  /** Render (harled or rendered masonry): a rough speckle with soft patches. */
  render: () => {
    const r = rng(83);
    const patch = noise(84, 16);
    const px = Array.from({ length: TILE * TILE }, (_, i) => 0.46 + 0.06 * patch(i % TILE, Math.floor(i / TILE)) + (r() < 0.12 ? -0.06 : r() < 0.1 ? 0.06 : 0) + (r() - 0.5) * 0.03);
    return (x, y) => px[y * TILE + x];
  },
  /** Corrugated sheet: ribs every 4 pixels (12.5 cm at 2 m) running up the face, a lap between sheets. */
  sheet: () => {
    const r = rng(89);
    const profile = [0.62, 0.54, 0.38, 0.46];
    const streak = noise(90, 8);
    return (x, y) => {
      if (y === 0) return 0.34; // where one sheet laps the next
      return profile[x % 4] + 0.06 * (streak(x, y) - 0.5) + (r() - 0.5) * 0.02;
    };
  },
  /** Slates: courses 25 cm deep (8 pixels at 2 m), each slate its own shade, staggered course to course, a shadow under each. */
  slates: () => {
    const r = rng(97);
    const tone = Array.from({ length: (TILE / 8) * (TILE / 8) }, () => 0.49 + 0.1 * r());
    return (x, y) => {
      const course = Math.floor(y / 8);
      const xs = (x + (course % 2) * 4) % TILE;
      const k = y % 8;
      if (k === 0) return 0.28;
      if (xs % 8 === 0) return 0.34;
      return tone[course * (TILE / 8) + Math.floor(xs / 8)] + (k === 7 ? 0.04 : 0);
    };
  },
  /** Concrete: slabs 2 m square (32 pixels at 4 m) with their joints, a fine speckle, darker stains. */
  concrete: () => {
    const r = rng(101);
    const stain = noise(102, 16);
    const px = Array.from({ length: TILE * TILE }, (_, i) => 0.49 + 0.07 * (stain(i % TILE, Math.floor(i / TILE)) - 0.5) + (r() - 0.5) * 0.05);
    return (x, y) => (x % 32 === 0 || y % 32 === 0 ? 0.33 : px[y * TILE + x]);
  },
  /** Rock armour: blotches of lighter and darker stone, finely grained. */
  stone: () => {
    const r = rng(107);
    const big = noise(108, 8);
    const small = noise(109, 2);
    return (x, y) => 0.36 + 0.18 * big(x, y) + 0.1 * small(x, y) + (r() - 0.5) * 0.04;
  },
  /**
   * Rust, for old steel laid up ashore (the boatyard's boats): blotches of scale, darker
   * and lighter, pitting, and runs of rust down the plating from the worst patches.
   */
  rust: () => {
    const r = rng(113);
    const big = noise(114, 16);
    const mid = noise(115, 8);
    const px = Array.from({ length: TILE * TILE }, (_, i) => {
      const x = i % TILE;
      const y = Math.floor(i / TILE);
      return 0.44 + 0.12 * big(x, y) + 0.08 * mid(x, y) + (r() < 0.06 ? -0.1 : 0) + (r() - 0.5) * 0.05;
    });
    // Runs: streaks down the face (+y is down the plating) from a dark patch.
    for (let k = 0; k < 16; k++) {
      const x0 = Math.floor(r() * TILE);
      const y0 = Math.floor(r() * TILE);
      const run = 6 + Math.floor(r() * 18);
      for (let i = 0; i < run; i++) px[((y0 + i) % TILE) * TILE + x0] = 0.27 + 0.06 * (i / run);
    }
    return (x, y) => px[y * TILE + x];
  },
  /**
   * A window, the whole face (one to a face): a light frame and a cross of glazing bars over
   * four dark panes, with a pale glint across the glass.
   */
  window: () => (x, y) => {
    const F = 5;
    if (x < F || y < F || x >= TILE - F || y >= TILE - F) return 0.86; // the frame
    if (Math.abs(x - 31.5) < 2 || Math.abs(y - 31.5) < 2) return 0.86; // glazing bars
    const glint = Math.abs(x + y - 70) < 5 || Math.abs(x + y - 84) < 2;
    return glint ? 0.5 : 0.3;
  },
  /** Teak strip lining, varnished: narrow strips (4 pixels, 9 cm at 1.5 m), dark seams between, a close even grain and a sheen along each strip. */
  teak: () => {
    const r = rng(127);
    const rows = TILE / 4;
    const strip = Array.from({ length: rows }, () => ({ tone: 0.5 + 0.08 * r(), end: Math.floor(r() * TILE), grain: Array.from({ length: TILE }, () => (r() - 0.5) * 0.08) }));
    return (x, y) => {
      const s = strip[Math.floor(y / 4)];
      const k = y % 4;
      if (k === 0) return 0.24; // the seam
      if (x === s.end) return 0.3;
      // The varnish's sheen on the strip's top row; the grain in fine streaks along it.
      return s.tone + (k === 3 ? 0.06 : 0) + s.grain[(x * 3 + k * 11) % TILE];
    };
  },
  /**
   * A teak cabin sole, laid fore and aft (owner, Oct 2026, from a photo of one): dark teak
   * strips 7.5 cm wide (4 pixels at 1.2 m) running up the tile (fore and aft on a floor: a
   * floor's tile runs across her one way, along her the other), a pale caulked seam between
   * each, the strips' butt joints staggered.
   */
  deckTeak: () => {
    const r = rng(131);
    const cols = TILE / 4;
    const strip = Array.from({ length: cols }, () => ({ tone: 0.42 + 0.08 * r(), end: Math.floor(r() * TILE), grain: Array.from({ length: TILE }, () => (r() - 0.5) * 0.07) }));
    return (x, y) => {
      const s = strip[Math.floor(x / 4)];
      if (x % 4 === 0) return 0.78; // the seam's pale caulking
      if (y === s.end) return 0.3;
      return s.tone + s.grain[(y * 3 + (x % 4) * 11) % TILE];
    };
  },
  /**
   * Painted steel, a tug's or a steel workboat's: plates 1.5 m (32 pixels at 3 m) with a weld
   * bead along each seam, the plates staggered row to row, a stiffener's shadow up the middle
   * of each, and the paint a little uneven over them.
   */
  steel: () => {
    const r = rng(137);
    const mottle = noise(138, 16);
    const px = Array.from({ length: TILE * TILE }, (_, i) => 0.49 + 0.05 * (mottle(i % TILE, Math.floor(i / TILE)) - 0.5) + (r() - 0.5) * 0.02);
    return (x, y) => {
      const xs = (x + (Math.floor(y / 32) % 2) * 16) % TILE;
      const jy = y % 32;
      const jx = xs % 32;
      if (jy === 0 || jx === 0) return 0.66; // the weld bead, standing proud
      if (jy === 1 || jx === 1) return 0.28; // its shadow
      if (jx === 16 || jx === 17) return 0.4; // the stiffener behind
      return px[y * TILE + x];
    };
  },
  /**
   * Bare aluminium, brushed: the sheet's streaks along it (each row of pixels its own shade),
   * sheets 1.2 m (32 pixels at 2.4 m) butted, a line of rivets each side of every joint.
   */
  brushed: () => {
    const r = rng(139);
    const row = Array.from({ length: TILE }, () => (r() - 0.5) * 0.16);
    const fleck = Array.from({ length: TILE * TILE }, () => (r() - 0.5) * 0.03);
    return (x, y) => {
      const jx = x % 32;
      if (jx === 0 || jx === 31) return 0.26;
      if ((jx === 2 || jx === 29) && y % 6 === 3) return 0.7; // rivet heads
      return 0.5 + row[y] + fleck[y * TILE + x];
    };
  },
};

/** Every tile's pixels as RGBA bytes, the tiles one after another (the texture's layers, after an empty layer 0). */
export function paintPixels(): Uint8Array {
  const data = new Uint8Array(TILE * TILE * 4 * (PAINTS.length + 1)).fill(128);
  PAINTS.forEach((name, k) => {
    const at = PAINTERS[name]();
    const base = (k + 1) * TILE * TILE * 4;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const v = Math.round(255 * Math.min(1, Math.max(0, at(x, y))));
        data.set([v, v, v, 255], base + (y * TILE + x) * 4);
      }
  });
  return data;
}

let tiles: THREE.DataArrayTexture | undefined;

/** The tiles as one texture (made once). */
function paintTexture(): THREE.DataArrayTexture {
  if (tiles) return tiles;
  tiles = new THREE.DataArrayTexture(paintPixels(), TILE, TILE, PAINTS.length + 1);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.magFilter = THREE.LinearFilter;
  tiles.minFilter = THREE.LinearMipmapLinearFilter;
  tiles.generateMipmaps = true;
  tiles.needsUpdate = true;
  return tiles;
}

/** The shared uniforms: one texture, each tile's size on the surface, how strongly they show. */
const uniforms = {
  paintTiles: { value: null as THREE.DataArrayTexture | null },
  paintMetres: { value: [1, ...PAINTS.map((p) => CONFIG.pixelPaint.tileMetres[p])] },
  paintStrength: { value: CONFIG.pixelPaint.strength },
};

/** Teaches a material to draw the tiles: reads each vertex's `paint` (tile) and `paintUv` (metres along the face). */
export function withPixelPaint<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    uniforms.paintTiles.value = paintTexture();
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;\nattribute vec2 paintUv;\nvarying float vPaint;\nvarying vec2 vPaintUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = paint;\nvPaintUv = paintUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2DArray paintTiles;
uniform float paintMetres[${PAINTS.length + 1}];
uniform float paintStrength;
varying float vPaint;
varying vec2 vPaintUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  int layer = clamp(int(vPaint + 0.5), 0, ${PAINTS.length});
  // Texel coordinates, and how fast they change across the screen (taken outside the branch).
  vec2 px = vPaintUv / paintMetres[layer] * ${TILE}.0;
  vec2 dx = dFdx(px);
  vec2 dy = dFdy(px);
  if (layer > 0 && paintStrength > 0.0) {
    // Crisp pixels with their edges blended over about one screen pixel (no crawl in VR).
    vec2 fw = max(abs(dx) + abs(dy), vec2(1e-4));
    vec2 cell = floor(px + 0.5);
    vec2 p = cell + clamp((px - cell) / fw, -0.5, 0.5);
    vec3 t = textureGrad(paintTiles, vec3(p / ${TILE}.0, float(layer)), dx / ${TILE}.0, dy / ${TILE}.0).rgb;
    diffuseColor.rgb *= mix(vec3(1.0), t * 2.0, paintStrength);
  }
}`,
      );
  };
  material.customProgramCacheKey = () => 'pixelPaint';
  return material;
}
