/**
 * Module nav.chartplotter: the chartplotter hung from the wheelhouse roof (modular boats
 * M3c): the chart around her, the search area, her destination.
 *
 * What it draws (the world's islands, missions, the crew's pencil marks) is the world's:
 * the app feeds it through its `api` (the ChartPlotter), as it always has. Its case and
 * brackets are merged with the boat's fixed parts. Its zoom buttons send `chartZoom`.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { ChartPlotter } from '../../nav/chartPlotter';

export type ChartplotterConfig = typeof CONFIG.modules.chartplotter;

export const CHARTPLOTTER: ModuleDefinition<ChartplotterConfig> = {
  id: 'nav.chartplotter',
  version: 1,
  fits: ['cabin.overhead'],
  defaults: CONFIG.modules.chartplotter,
  ports: { live: { dir: 'read', key: 'circuit.chart.live' } },
  needs: () => [{ power: 'electrical', circuit: 'chart' }],
  power: (c) => [{ role: 'load', circuit: 'chart', amps: () => c.amps }],
  view: {
    build({ config, socket, hull, share }) {
      const y = socket.transform.position[1];
      const plotter = new ChartPlotter(config.tiltDeg, Math.max(0, (hull.cabinRoof ?? y) - y));
      // Its zoom buttons (−, AUTO, +) under the screen.
      for (const b of plotter.zoomButtons) share(b.cap, 'buttonCap'); // drawn with the boat's other button caps (one draw call)
      return { staticParts: plotter.fixedParts, movingParts: [plotter.root], controls: plotter.zoomButtons, update: () => {}, api: plotter };
    },
  },
};
