/** Windows raked out all round, the window sills one height all round (low with the screens on stalks), and wipers sized to their panes (owner). */
import { beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, SILLS, type ShipDesign, fromSteps } from '../../src/shipyard/design';
import { houseFlare } from '../../src/vessel/houseFlare';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { wiperFit } from '../../src/vessel/view/rainGlass';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const typeOf = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults, ...more });

describe('codes', () => {
  it('upright windows and standard sills keep codes as they were; the new choices read back', () => {
    expect(BASE.flare).toBe(0);
    expect(BASE.sills).toBe(0);
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    for (const flare of [0, 1])
      // (Standard and low: the high sills travel as a link or file, highSills.test.ts.)
      for (let sills = 0; sills < 2; sills++) {
        const d = { ...BASE, flare, sills, facets: 1, engine: 3, hull: 4, skiff: 1 };
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
      }
  });
});

describe('raked out all round', () => {
  it('every hull type: the walls lean out by the rake over the window band; the floor and below the sill stay put; the aft door hinged; no side door', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const b = useDesign(typeOf(hull, { flare: 1, sideDoor: 1, houseWidth: 0.8 }));
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      const fl = houseFlare(wh)!;
      expect(fl).not.toBeNull();
      const tan = Math.tan((CONFIG.shipyard.flareDeg * Math.PI) / 180);
      expect(fl.D).toBeCloseTo(tan * (wh.windowHead - wh.windowSill), 3);
      const sill = wh.floorY + wh.windowSill;
      // Below the sill nothing moves (you walk about as before); at the head the side walls are out by D, the aft wall aft by D, the front where it was.
      expect(fl.at(wh.halfWidth, sill - 0.2, wh.aft)).toEqual([wh.halfWidth, sill - 0.2, wh.aft]);
      const [x, , z] = fl.at(wh.halfWidth, wh.floorY + wh.windowHead, wh.aft);
      expect(x).toBeCloseTo(wh.halfWidth + fl.D, 6);
      expect(z).toBeCloseTo(wh.aft + fl.D, 6);
      expect(fl.at(0, wh.floorY + wh.windowHead, wh.front)[2]).toBe(wh.front);
      expect(wh.doorHinged).toBe(true);
      expect(wh.sideDoor).toBeUndefined();
      expect(b.warnings.join(' ')).toMatch(/side door slides along an upright wall/);
    }
  });

  it('upright windows: no flare, a sliding aft door', () => {
    useDesign(typeOf(2));
    const wh = VESSEL_DEFS.design.layout.wheelhouse!;
    expect(houseFlare(wh)).toBeNull();
    expect(wh.doorHinged).toBeFalsy();
  });
});

describe('window sills', () => {
  it('one height all round: standard, low with the console bare and its screens on stalks, or high; what hangs on the walls below the glass', () => {
    for (let sills = 0; sills < SILLS.length; sills++) {
      const b = useDesign(typeOf(2, { sills, controls: 1 }));
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      const h = [CONFIG.shipyard.windowSills.standard, CONFIG.shipyard.windowSills.low, CONFIG.shipyard.windowSills.high][sills];
      expect(wh.windowSill).toBe(h);
      expect(wh.frontSill).toBe(h);
      const helm = RECIPES.design.modules.find((m) => m.socket === 'helm')!;
      const bare = (helm.config as { bare?: { screens: string[] } }).bare;
      if (sills === 1) {
        expect(h).toBeLessThan(wh.consoleHeight);
        expect(bare!.screens.length).toBeGreaterThan(2);
        expect(wh.viewSill).toBe(wh.consoleHeight);
      } else expect(bare).toBeUndefined();
      // The duty board and the breaker panel below the sill.
      const sock = (id: string) => b.hull.sockets.find((s) => s.id === id)!.transform.position;
      expect(sock('dutyBoard')[1] + CONFIG.modules.dutyBoard.height / 2).toBeLessThanOrEqual(wh.floorY + h + 1e-9);
      expect(sock('breakerPanel')[1]).toBeLessThan(wh.floorY + h);
    }
  });
});

describe('wipers sized to their panes', () => {
  it('a taller pane gets a longer arm and blade; a narrow pane a shorter sweep; the blade stays on the glass across its sweep', () => {
    const c = CONFIG.rain;
    const short = wiperFit(0.6, 0.5);
    const tall = wiperFit(1.2, 0.5);
    expect(tall.arm).toBeGreaterThan(short.arm);
    expect(tall.blade).toBeGreaterThan(short.blade);
    const narrow = wiperFit(1.0, 0.2);
    expect(narrow.sweep).toBeLessThan(wiperFit(1.0, 0.6).sweep);
    for (const [h, half] of [[0.6, 0.5], [1.2, 0.5], [1.0, 0.2], [0.9, 0.35]]) {
      const f = wiperFit(h, half);
      const p = c.wiperPivotAbove;
      // Measured from the window head: the blade's foot at mid-sweep above the sill, its top at full sweep below the head, its reach inside the pane.
      expect(p - f.arm - f.blade / 2).toBeGreaterThanOrEqual(-h - 1e-6);
      expect(p - f.arm * Math.cos(f.sweep) + f.blade / 2).toBeLessThanOrEqual(1e-6);
      expect(f.arm * Math.sin(f.sweep)).toBeLessThanOrEqual(half - c.wiperEdge + 1e-6);
      expect(f.sweep).toBeLessThanOrEqual((c.wiperSweepDeg * Math.PI) / 180 + 1e-9);
    }
  });
});

describe('the console clear of the front glass (owner: it rose into the window band against the glass)', () => {
  it('every rake: the dash stands at least consoleClear behind the glass from the sill up to its top; more for glass raked aft; the helm and the console go back together', () => {
    const dashTop = 0.9 + CONFIG.modules.helmConsole.dash.top;
    let upright = 0;
    for (const windowRake of [0, 2, 4, 6, 8]) {
      const b = useDesign(typeOf(4, { ...fromSteps({ windowRake }), facets: 0 }));
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      const back = wh.consoleBack ?? 0;
      const lean = Math.tan(((wh.frontRakeDeg ?? 0) * Math.PI) / 180);
      const glassAft = Math.max(0, -lean * (dashTop - wh.frontSill!)); // the glass's furthest aft from the sill to the dash top
      // The dash's front: 0.06 aft of the house front with the console against the wall.
      expect(0.06 + back - glassAft, `${windowRake}`).toBeGreaterThanOrEqual(CONFIG.shipyard.consoleClear - 1e-6);
      expect(b.hull.helm.stand[2] - back, `${windowRake}`).toBeCloseTo(wh.front + 1.125, 6);
      const helm = b.hull.sockets.find((s) => s.id === 'helm')!;
      expect(helm.transform.position[2] - back).toBeCloseTo(wh.front + 0.56, 6);
      if (windowRake === 4) upright = back;
      if (windowRake === 0) expect(back).toBeGreaterThan(0.2); // raked aft 30 deg: well back
    }
    expect(upright).toBeGreaterThan(0);
  });

  it('raked out all round sets the front leaning out with the sides, whatever its own rake says', () => {
    for (const windowRake of [0, 4, 8]) {
      useDesign(typeOf(2, { flare: 1, ...fromSteps({ windowRake }) }));
      expect(VESSEL_DEFS.design.layout.wheelhouse!.frontRakeDeg).toBe(CONFIG.shipyard.flareDeg);
    }
  });
});
