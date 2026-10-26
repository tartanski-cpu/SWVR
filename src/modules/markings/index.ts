/**
 * Module hull.markings: a service livery's markings on a boat's topsides (owner, 26 Oct 2026:
 * police, fire, rescue and coastguard liveries; the Shipyard's design.markings): bands of
 * colour, a chequer, the service's name along her side forward.
 *
 * A thin skin just proud of her side, both sides in one mesh, with one picture painted on it
 * from the config (its bands and name): one draw call, however many bands. Where the picture
 * is clear, the skin isn't drawn (her own paint shows). The Shipyard works out the skin's
 * corners from her lines (shipyard/parts/markings.ts) and hands them over in the config, so
 * this module needs nothing of her hull. The picture: its top half her starboard side, its
 * bottom half her port, each from her deck edge down, so the name reads the right way on both.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';

export interface MarkingBand {
  /** Where it starts and how deep it is down her side, as shares of the markings' depth. */
  top: number;
  height: number;
  /** One colour, or a chequer of two in two rows of squares. */
  kind: 'solid' | 'chequer';
  colours: number[];
}

export interface MarkingsConfig {
  /** The skin's corners (her axes) and picture coordinates, triangle by triangle. */
  positions: number[];
  uvs: number[];
  /** How long the skin is along her, and how deep down her side (m). */
  lengthM: number;
  depthM: number;
  bands: MarkingBand[];
  /** The name: its colour (and edge), down her side as shares, centred `at` along her (0 aft, 1 forward), at most `share` of the skin's length long. */
  text: { word: string; colour: number; outline?: number; top: number; height: number; at: number; share: number };
  /** The picture's pixels a metre along her, and its most pixels across. */
  pxPerM?: number;
  maxPx?: number;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The picture, at about `pxPerM` pixels a metre (at most `maxPx` across). */
function picture(c: MarkingsConfig, pxPerM = 64, maxPx = 2048): HTMLCanvasElement {
  const W = Math.min(maxPx, Math.round(c.lengthM * pxPerM));
  const k = W / c.lengthM; // pixels a metre
  const half = Math.max(8, Math.round(c.depthM * k));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = 2 * half;
  const g = cv.getContext('2d')!;
  for (const [y0, at] of [
    [0, c.text.at],
    [half, 1 - c.text.at],
  ] as const) {
    for (const b of c.bands) {
      const top = y0 + b.top * half;
      const h = b.height * half;
      if (b.kind === 'solid') {
        g.fillStyle = css(b.colours[0]);
        g.fillRect(0, top, W, h);
      } else {
        // Two rows of squares, alternating.
        const s = h / 2;
        for (let i = 0; i * s < W; i++)
          for (let r = 0; r < 2; r++) {
            g.fillStyle = css(b.colours[(i + r) % 2]);
            g.fillRect(i * s, top + r * s, Math.ceil(s), Math.ceil(s));
          }
      }
    }
    // The name, as tall as its share of her side, narrowed to fit its share of her length.
    const t = c.text;
    let size = t.height * half;
    g.font = `900 ${size}px system-ui, Arial, sans-serif`;
    const w = g.measureText(t.word).width;
    if (w > t.share * W) size *= (t.share * W) / w;
    g.font = `900 ${size}px system-ui, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const x = at * W;
    const y = y0 + (t.top + t.height / 2) * half;
    if (t.outline !== undefined) {
      g.lineWidth = Math.max(2, size * 0.12);
      g.strokeStyle = css(t.outline);
      g.lineJoin = 'round';
      g.strokeText(t.word, x, y);
    }
    g.fillStyle = css(t.colour);
    g.fillText(t.word, x, y);
  }
  return cv;
}

export const MARKINGS: ModuleDefinition<MarkingsConfig> = {
  id: 'hull.markings',
  version: 1,
  fits: ['hull.side'],
  defaults: { positions: [], uvs: [], lengthM: 1, depthM: 0.3, bands: [], text: { word: '', colour: 0, top: 0, height: 0.5, at: 0.6, share: 0.4 } },
  validateConfig: (c) => [
    ...(c.positions.length % 9 === 0 && c.uvs.length / 2 === c.positions.length / 3 ? [] : ['the markings mesh is cut short']),
    ...(c.lengthM > 0 && c.depthM > 0 ? [] : ['the markings have no room on her side']),
  ],
  ports: {},
  view: {
    frame: 'boat',
    build({ config: c }) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(c.uvs, 2));
      geo.computeVertexNormals();
      // (No picture without a page to paint it on: the tests' builds.)
      const map = typeof document === 'undefined' ? null : new THREE.CanvasTexture(picture(c, c.pxPerM, c.maxPx));
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
      }
      // Clear where the picture is clear; drawn over her paint, never fighting it for the nearer pixel.
      const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'markings';
      mesh.visible = c.positions.length > 0 && !!map;
      return { staticParts: [], movingParts: [mesh], controls: [], update: () => {}, dispose: () => { geo.dispose(); mat.dispose(); map?.dispose(); } };
    },
  },
};
