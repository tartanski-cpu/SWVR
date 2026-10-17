/**
 * Module mount.mast: the signal mast on the wheelhouse roof (modular boats M5b): a square
 * pole with a yard across it, the wind sock at its head (it streams with the wind over the
 * deck; the app hands it the weather, `api.windSock`), and a socket at the masthead for the
 * navigation lights ('masthead', a hull.light). On the roof you walk round its foot.
 *
 * Drawn in the boat's axes from its config (CONFIG.modules.mast) and the roof's height
 * (the hull's cabinRoof, plus the roof's thickness from the hull's layout); its pole
 * and yard are merged with the boat's fixed parts (they were the hull mesh's).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { HullQueries, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';
import { WindSock } from '../../vessel/view/windSock';

export type MastConfig = typeof CONFIG.modules.mast & {
  /** The roof's thickness (m): the mast stands on its top. */
  roofThickness: number;
  /** Where the navigation lights' socket is (the boat's axes). */
  masthead: readonly [number, number, number];
};

/** What the app hands the mast: the weather, for its wind sock. */
export interface MastApi {
  readonly windSock: WindSock;
}

/** The roof's underside and top where the mast stands. */
function roofOf(c: MastConfig, hull: HullQueries): { under: number; top: number } {
  const under = hull.cabinRoof ?? 0;
  return { under, top: under + c.roofThickness };
}

export const MAST: ModuleDefinition<MastConfig> = {
  id: 'mount.mast',
  version: 1,
  fits: ['roof.mount'],
  defaults: { ...CONFIG.modules.mast, roofThickness: CONFIG.vessels.workboat.layout.roof.thickness, masthead: CONFIG.vessels.workboat.navLights.masthead },
  validateConfig: (c) => (c.height > c.yardHeight && c.yardHeight > c.roofThickness ? [] : ['the yard has to be on the mast, above the roof']),
  ports: {},
  sockets: (c) => [{ id: 'masthead', type: 'hull.light', transform: { position: [...c.masthead] }, label: 'Masthead (the navigation lights)' }],
  footprints: (c, hull) => {
    const { under, top } = roofOf(c, hull);
    const k = c.keepClear;
    return [{ x0: c.x - k, x1: c.x + k, z0: c.z - k, z1: c.z + k, base: top, top: under + c.height }];
  },
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const { under, top } = roofOf(c, hull);
      const colour = 0x3a3f44;
      const box = (hx: number, y0: number, y1: number, hz: number) =>
        part(new THREE.BoxGeometry(2 * hx, y1 - y0, 2 * hz).translate(c.x, (y0 + y1) / 2, c.z), colour);
      const windSock = new WindSock([c.x, under + c.height, c.z]);
      return {
        staticParts: [
          box(c.size / 2, top, under + c.height, c.size / 2), // the pole
          box(c.yardSpan / 2, under + c.yardHeight, under + c.yardHeight + c.yardDepth, c.yardDepth / 2), // the yard
        ],
        movingParts: [windSock.root],
        controls: [],
        update: () => {},
        api: { windSock } satisfies MastApi,
      };
    },
  },
};
