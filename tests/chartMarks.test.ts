import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { applyChartOp, createMarks, parseMarks, pointCount, serializeMarks, type ChartMarks } from '../src/chart/marks';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';

describe('chart marks', () => {
  it('strokes are started, extended and replaced (straight lines); points are rounded', () => {
    const m = createMarks();
    applyChartOp(m, { k: 'start', id: 'a', pts: [10.2, 20.7, 10.2, 20.7] });
    applyChartOp(m, { k: 'add', id: 'a', pts: [30, 40, 50, 60] });
    expect(m.strokes[0].pts).toEqual([10, 20.5, 10, 20.5, 30, 40, 50, 60]);
    applyChartOp(m, { k: 'set', id: 'a', pts: [0, 0, 100, 0] });
    expect(m.strokes[0].pts).toEqual([0, 0, 100, 0]);
    expect(m.seq).toBe(3);
  });

  it('bad ops are ignored', () => {
    const m = createMarks();
    applyChartOp(m, { k: 'start', id: 'a', pts: [1] });
    applyChartOp(m, { k: 'add', id: 'nope', pts: [1, 2] });
    applyChartOp(m, { k: 'erase', x: NaN, z: 0, r: 1 });
    expect(m.strokes).toHaveLength(0);
    applyChartOp(m, { k: 'start', id: 'a', pts: [0, 0, 1, 1] });
    applyChartOp(m, { k: 'start', id: 'a', pts: [5, 5, 6, 6] }); // duplicate id
    expect(m.strokes).toHaveLength(1);
  });

  it('the eraser rubs out points and splits a stroke where it cuts it', () => {
    const m = createMarks();
    const pts: number[] = [];
    for (let x = 0; x <= 200; x += 20) pts.push(x, 0);
    applyChartOp(m, { k: 'start', id: 'a', pts });
    applyChartOp(m, { k: 'start', id: 'b', pts: [0, 500, 50, 500] });
    applyChartOp(m, { k: 'erase', x: 100, z: 0, r: 25 }); // takes out x = 80, 100, 120
    const parts = m.strokes.filter((s) => s.id.startsWith('a'));
    expect(parts).toHaveLength(2);
    expect(parts[0].pts.at(-2)).toBe(60);
    expect(parts[1].pts[0]).toBe(140);
    expect(m.strokes.find((s) => s.id === 'b')).toBeTruthy(); // untouched
    applyChartOp(m, { k: 'clear' });
    expect(m.strokes).toHaveLength(0);
  });

  it('over the point cap the oldest marks go', () => {
    const m = createMarks();
    const n = CONFIG.chartMarks.maxPoints / 2;
    const stroke = (y: number) => Array.from({ length: n }, (_, i) => [i, y]).flat();
    applyChartOp(m, { k: 'start', id: 'old', pts: stroke(0) });
    applyChartOp(m, { k: 'start', id: 'mid', pts: stroke(10) });
    applyChartOp(m, { k: 'start', id: 'new', pts: stroke(20) });
    expect(m.strokes.map((s) => s.id)).toEqual(['mid', 'new']);
    expect(pointCount(m)).toBeLessThanOrEqual(CONFIG.chartMarks.maxPoints);
  });

  it('saved marks load back; junk is dropped', () => {
    const m = createMarks();
    applyChartOp(m, { k: 'start', id: 'a', pts: [0, 0, 10, 10] });
    const back = parseMarks(serializeMarks(m))!;
    expect(back.strokes).toEqual(m.strokes);
    expect(parseMarks('{"strokes": [{"id": 3}]}')!.strokes).toHaveLength(0);
    expect(parseMarks('nope')).toBeNull();
  });

  it('multiplayer: a joiner gets the chart, and pencil ops reach everyone through the host', async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '1');
    const hostMarks = createMarks();
    host.marks = hostMarks;
    applyChartOp(hostMarks, { k: 'start', id: 'route', pts: [0, 0, 500, 500] });
    const join = () => {
      const c = new ClientSession(loop.client(), 'Mate');
      const mine: { marks: ChartMarks } = { marks: createMarks() };
      c.onWelcome = (_p, _w, chart) => (mine.marks = chart ?? createMarks());
      c.onChart = (op) => applyChartOp(mine.marks, op);
      return { c, mine };
    };
    const a = join();
    const b = join();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.mine.marks.strokes[0].id).toBe('route');
    // A draws: applies it locally and sends it; the host takes it and relays it to B.
    const op = { k: 'start' as const, id: 'a:1', pts: [100, 100, 120, 100] };
    applyChartOp(a.mine.marks, op);
    a.c.sendChart(op);
    expect(hostMarks.strokes.map((s) => s.id)).toEqual(['route', 'a:1']);
    expect(b.mine.marks.strokes.map((s) => s.id)).toEqual(['route', 'a:1']);
    expect(a.mine.marks.strokes).toHaveLength(2); // not echoed back to A
    // The host erases: everyone follows.
    const erase = { k: 'erase' as const, x: 110, z: 100, r: 30 };
    applyChartOp(hostMarks, erase);
    host.broadcastChart(erase);
    expect(a.mine.marks.strokes.map((s) => s.id)).toEqual(['route']);
    expect(b.mine.marks.strokes.map((s) => s.id)).toEqual(['route']);
  });
});
