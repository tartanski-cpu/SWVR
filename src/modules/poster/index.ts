/**
 * Module furniture.poster: a printed poster on a wall (owner, Oct 2026: the harbour tug's
 * driving guide "as a poster somewhere inside the wheelhouse"). Which poster is its config
 * (`poster`: a painter in POSTERS); its size, the config's `width` and `height` (m). On the
 * panel lighting, as the start-up card: dims at dusk, red at night. One draw call.
 *
 * Its socket's frame: it lies in the socket's x-y plane, facing +z (out from the wall).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { panelLit } from '../../controls/panelLighting';
import type { ModuleDefinition } from '../../modular/module';
import { paintAzimuthGuide } from './azimuthGuide';

/** The posters there are: each paints itself onto a canvas `w` x `h` px. */
export const POSTERS = {
  azimuthGuide: paintAzimuthGuide,
} as const satisfies Record<string, (g: CanvasRenderingContext2D, w: number, h: number) => void>;

export interface PosterConfig {
  poster: keyof typeof POSTERS;
  width: number;
  height: number;
}

export const POSTER: ModuleDefinition<PosterConfig> = {
  id: 'furniture.poster',
  version: 1,
  fits: ['wall.panel'],
  defaults: { poster: 'azimuthGuide', ...CONFIG.modules.poster },
  validateConfig: (c) => [...(c.poster in POSTERS ? [] : [`poster '${c.poster}' isn't one of ${Object.keys(POSTERS).join(', ')}`]), ...(c.width > 0 && c.height > 0 ? [] : ['width and height should be over 0'])],
  ports: {},
  view: {
    build({ config }) {
      const px = CONFIG.modules.poster.px;
      const c = document.createElement('canvas');
      c.width = px;
      c.height = Math.round((px * config.height) / config.width);
      POSTERS[config.poster](c.getContext('2d')!, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(config.width, config.height), panelLit(new THREE.MeshBasicMaterial({ map: tex })));
      // (A hair off the wall: no flicker against it.)
      sheet.position.z = 0.004;
      sheet.name = 'poster';
      return { staticParts: [], movingParts: [sheet], controls: [], update: () => {} };
    },
  },
};
