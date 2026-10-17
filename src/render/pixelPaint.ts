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

/** The tiles, in their order in the texture (0 is no paint). */
export const PAINTS = ['nonSlip', 'wood', 'mat', 'chequer'] as const;
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
