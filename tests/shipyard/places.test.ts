/**
 * Parametric boats P4 (owner): a Shipyard boat's places (sockets) offered by the parts that
 * place them (src/shipyard/parts/): the wheelhouse its helm, panels and what hangs under its
 * roof; the engine room the engine, tank, batteries, rudder, hatch, dipstick and oil can;
 * the deck its gear and cleats; inside the house the chart table and the side door; outside
 * it the life ring and rod rack; the hull what protects her sides. Gathered into her hull
 * definition, each once, and every module in her recipe finds its place.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { FLEET } from '../../src/boats/fleet';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

afterAll(() => useDesign(DEFAULT_DESIGN));

// Every hull type as she comes, then with most of what can be fitted (deck gear, a saloon, a
// deckhouse with its cabin below, the side door and chart table, the advanced controls).
const loaded = (hull: number): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, controls: 1, chartTable: 1, sideDoor: 1, lifeRing: 2, rodRack: 1, towWinch: 1, deckCrane: 2, searchlight: 1, helmAssist: 1, skiff: 1 });
const designs: [string, ShipDesign][] = [
  ...FLEET.map((f): [string, ShipDesign] => [f.id, f.design]),
  ...DESIGN_HULLS.map((_, i): [string, ShipDesign] => [`type ${i}`, { ...DEFAULT_DESIGN, ...DESIGN_HULLS[i].defaults, hull: i }]),
  ...DESIGN_HULLS.map((_, i): [string, ShipDesign] => [`type ${i}, loaded`, loaded(i)]),
];

describe('her places, offered by her parts', () => {
  it('each place once, each with a label and a position', () => {
    for (const [name, d] of designs) {
      const sockets = buildDesign(d).hull.sockets;
      const ids = sockets.map((s) => s.id);
      expect(new Set(ids).size, `${name}: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`).toBe(ids.length);
      for (const s of sockets) {
        expect(s.label, `${name}: ${s.id}`).toBeTruthy();
        expect(s.transform.position.every(Number.isFinite), `${name}: ${s.id}`).toBe(true);
      }
      // The places every boat has: the helm, the engine room's, the deck's mooring cleats.
      for (const id of ['helm', 'breakerPanel', 'engine', 'engineHatch', 'dipstick', 'oilCan', 'rudder', 'cleatFwdPort', 'cleatAftStbd']) expect(ids, name).toContain(id);
    }
  });

  it('every module in her recipe finds its place', () => {
    for (const [name, d] of designs) {
      useDesign(d);
      expect(validateRecipe(RECIPES.design, LIBRARY), name).toEqual([]);
    }
  });
});
