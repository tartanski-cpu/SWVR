/**
 * Module furniture.chart-table: the drop-leaf chart table (modular boats M3c). The leaf is
 * hinged along the wall; unfolded it's a table with the paper chart, the pen holder and the
 * hand tools; folded it hangs flat against the wall and the floor in front is free. Its
 * lamp is on the wall above, its switch on the batten.
 *
 * It works two keys: 'chartTable.leafOpen' (the knob on the leaf's edge) and
 * 'chartTable.lamp' (the switch). The pencil, dividers and the chart's light are the app's
 * (chart/chartTools.ts), handed in through its `api` (the ChartTableView). Its footprint
 * says where you can't walk: the table, or a strip along the wall with the leaf folded.
 *
 * Its socket is the leaf's hinge corner on the floor, at the wall (forward end), facing
 * so +x is out from the wall and +z aft; CONFIG.modules.chartTable gives the rest from there.
 */
import { CONFIG } from '../../config';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { ChartTableView } from '../../vessel/view/chartTable';

export type ChartTableConfig = typeof CONFIG.modules.chartTable;

export const CHART_TABLE: ModuleDefinition<ChartTableConfig> = {
  id: 'furniture.chart-table',
  version: 1,
  fits: ['cabin.furniture'],
  defaults: CONFIG.modules.chartTable,
  validateConfig: (c) => (c.width > 0.2 && c.depth > 0.2 && c.height > 0.3 ? [] : ['width and depth should be over 0.2 m, height over 0.3 m']),
  physical: (c) => ({ size: [c.width, c.height, c.depth] }),
  ports: {
    leaf: { dir: 'write', key: 'chartTable.leafOpen' },
    lamp: { dir: 'write', key: 'chartTable.lamp' },
  },
  view: {
    build({ config: c, keys, share }) {
      // The table view builds from its own corner (its old config, now from the socket).
      const view = new ChartTableView(
        { x0: 0, x1: c.width, z0: 0, z1: c.depth, height: c.height, holder: c.holder, lamp: c.lamp, lampSwitch: c.lampSwitch },
        0,
        { lamp: { channel: keys.lamp, read: (s) => busOf(s).num(keys.lamp) }, leaf: { channel: keys.leaf, read: (s) => busOf(s).num(keys.leaf) } },
      );
      share(view.lampSwitch.batMesh, 'toggleBat');
      return {
        staticParts: [],
        movingParts: [view.root],
        controls: [view.lampSwitch, view.leafHandle],
        // Folded, only a strip along the wall is taken up.
        footprints: (read) => [{ x0: 0, x1: read.get(keys.leaf) ? c.width : 0.1, z0: 0, z1: c.depth, top: c.height }],
        update: () => {},
        api: view,
      };
    },
  },
};
