/**
 * Module hull.foils: a foiling boat's hydrofoils and their struts drawn on her (owner, 28 Oct
 * 2026: the Shipyard's foiling ferry). Drawing only: they fly her through her VesselDef's
 * `foils` (vessel/physics/foils.ts), which her lines carry (hulls/designs.ts `foilFerry`).
 *
 * Each foil a thin slab at its incidence, each strut a thin upright slab (hulls/foilsMesh.ts,
 * the hull study's drawing), in her own axes, merged into her fixed parts: no draw call of its
 * own. The Shipyard leaves out the strut her pod hangs from (modules/pods draws that one, and
 * the pod on it).
 */
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';
import { FOIL_GREY, foilsGeometry } from '../../hulls/foilsMesh';
import type { FoilSystem } from '../../vessel/physics/foils';

export type FoilsConfig = Pick<FoilSystem, 'panels' | 'struts'>;

export const FOILS: ModuleDefinition<FoilsConfig> = {
  id: 'hull.foils',
  version: 1,
  fits: ['hull.side'],
  defaults: { panels: [], struts: [] },
  validateConfig: (c) => [...(c.panels.length ? [] : ['no foils to draw']), ...(c.struts.every((s) => s.top > s.bottom) ? [] : ['a strut runs upside down (its top under its foot)'])],
  ports: {},
  view: {
    frame: 'boat',
    build({ config: c }) {
      // (The drawing reads only the panels and struts.)
      return { staticParts: [part(foilsGeometry(c as FoilSystem), FOIL_GREY)], movingParts: [], controls: [], update: () => {}, dispose: () => {} };
    },
  },
};
