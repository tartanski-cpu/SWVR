/**
 * The planning chart on a surface (voyage/chartPad.ts; owner, 29 Oct 2026, "steps 2 and 3"):
 * the quay table, the chart table's PLAN sheet, the plotter's PLAN mode and the board in the
 * hand all work it the same way: press and let go puts a point or presses a key, held and
 * moved drags the chart, zoom keeps the spot pointed at; its view is this page's own.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import type { ChartPad as Pad } from '../src/voyage/chartPad';
import { planTableSize, planTableSpot } from '../src/voyage/planTable';
import { tableBerthNear } from '../src/voyage/plan';
import { FARMS, PORTS } from '../src/world/archipelago';
import { BERTHS } from '../src/world/archipelago';

// The pad draws on a canvas: a stand-in page whose 2D context takes any call.
let ChartPad: typeof Pad;
beforeAll(async () => {
  const anything: unknown = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : anything), apply: () => anything, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => anything, style: {} }) });
  ChartPad = (await import('../src/voyage/chartPad')).ChartPad;
});

function pad() {
  const { world, vesselId } = createWorld(new IdFactory(), 'pilotBoat');
  const sent: { ref: string; args?: number[] }[] = [];
  const p = new ChartPad({ world: () => world, ownBoatId: () => vesselId, send: (ref, args) => sent.push({ ref, args }) }, { px: 1000, aspect: 1.5, toolbarShare: 0.1, keys: ['way', 'stop', 'look', 'remove', 'undo', 'clear', 'boat', 'all', 'out', 'in'], redrawS: 0 });
  // A key's middle along the foot.
  const key = (i: number): [number, number] => [(i + 0.5) * 100, p.H - 10];
  const tap = (at: [number, number]) => {
    p.input(at, true);
    return p.input(at, false);
  };
  return { world, vesselId, p, sent, key, tap };
}

describe('a planning chart pad', () => {
  it('a press let go on the chart puts a point there with the tool in hand; a key changes the tool', () => {
    const { p, sent, key, tap } = pad();
    const at: [number, number] = [400, 300];
    const [x, z] = p.worldAt(at);
    expect(tap(at)).toBe(true);
    expect(sent).toEqual([{ ref: 'add:way', args: [x, z] }]);
    tap(key(1)); // STOP
    tap(at);
    expect(sent[1].ref).toBe('add:stop');
    tap(key(3)); // DEL: the nearest point off, within a share of the chart
    tap(at);
    expect(sent[2].ref).toBe('remove');
    tap(key(4)); // UNDO
    expect(sent[3].ref).toBe('undo');
    // CLEAR wants pressing twice.
    tap(key(5));
    expect(sent).toHaveLength(4);
    tap(key(5));
    expect(sent[4].ref).toBe('clear');
  });

  it('held and moved, the chart moves with the pointer (the spot pressed stays under it) and nothing is sent', () => {
    const { p, sent } = pad();
    const from: [number, number] = [500, 300];
    const spot = p.worldAt(from);
    p.input(from, true);
    p.input([560, 330], true);
    p.input([620, 380], true);
    const under = p.worldAt([620, 380]);
    expect(under[0]).toBeCloseTo(spot[0], 3);
    expect(under[1]).toBeCloseTo(spot[1], 3);
    p.input([620, 380], false);
    expect(sent).toHaveLength(0);
  });

  it('zoomed about where it points (the spot stays put); let go off the chart, nothing', () => {
    const { p, sent } = pad();
    const at: [number, number] = [300, 200];
    const spot = p.worldAt(at);
    const before = p.worldAt([0, 0]);
    p.input(at, false, 2);
    const after = p.worldAt(at);
    expect(after[0]).toBeCloseTo(spot[0], 3);
    expect(after[1]).toBeCloseTo(spot[1], 3);
    expect(Math.abs(p.worldAt([0, 0])[0] - spot[0])).toBeLessThan(Math.abs(before[0] - spot[0]));
    p.input(at, true);
    p.input(null, false);
    expect(sent).toHaveLength(0);
  });

  it('BOAT puts your boat in the middle', () => {
    const { world, vesselId, p, key, tap } = pad();
    p.input([100, 100], true);
    p.input([400, 300], true);
    p.input([400, 300], false);
    tap(key(6));
    const [x, z] = p.worldAt([p.W / 2, p.chartH / 2]);
    const b = world.vessels[vesselId].position;
    expect(Math.hypot(x - b[0], z - b[2])).toBeLessThan(1);
  });
});

describe("the quay's planning table", () => {
  it('stands at every harbour of the career world (none on a feed barge); the stand needs less room than the table', () => {
    const t = planTableSize('table');
    const s = planTableSize('stand');
    expect(s.width * s.depth).toBeLessThan((t.width * t.depth) / 3);
    for (const p of PORTS) {
      const b = tableBerthNear(p.x, p.z);
      expect(b, p.id).toBeTruthy();
      expect(FARMS.some((f) => f.port === BERTHS.find((x) => x.id === b)!.portId)).toBe(false);
      expect(planTableSpot(b, t) ?? planTableSpot(b, s), p.id).toBeTruthy();
    }
  });
});
