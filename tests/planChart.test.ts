/**
 * The planning chart (owner, 28 Oct 2026: "control over the map so they can zoom in and out",
 * "own view each, career too"; voyage/planChart.ts): each player's own view, zoomed about a
 * point so what's under it stays put, panned, kept on the map; a press with a tool makes the
 * same plan intent as the quay's table, and the plan works in the career as in Voyage.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { chartBounds, chartToWorld, clampChartView, panChart, toolIntent, wholeChartView, zoomChartAt } from '../src/voyage/planChart';

const W = 1200;
const H = 800;

describe('the planning chart', () => {
  it('zooms about a point: what is under the pointer stays under it', () => {
    const v = { cx: 0, cz: 0, span: 20000 };
    const [x0, z0] = chartToWorld(v, W, H, 900, 200);
    const zoomed = zoomChartAt(v, W, H, 900, 200, 2);
    expect(zoomed.span).toBeCloseTo(10000, 6);
    const [x1, z1] = chartToWorld(zoomed, W, H, 900, 200);
    expect(x1).toBeCloseTo(x0, 6);
    expect(z1).toBeCloseTo(z0, 6);
  });

  it('pans with the drag: the map moves the way the mouse does', () => {
    const v = { cx: 0, cz: 0, span: 12000 };
    const moved = panChart(v, W, H, 100, -50);
    // Dragged right and up: the view's centre moves left and down on the map (10 m a pixel).
    expect(moved.cx).toBeCloseTo(-1000, 6);
    expect(moved.cz).toBeCloseTo(500, 6);
  });

  it('is kept on the map: no closer in than its least span, no further out than the whole map, its centre on it', () => {
    const b = chartBounds();
    const whole = wholeChartView(W / H);
    expect(clampChartView({ cx: 0, cz: 0, span: 1 }, W / H).span).toBe(CONFIG.voyage.plan.chart.minSpan);
    expect(clampChartView({ cx: 0, cz: 0, span: 1e9 }, W / H).span).toBeCloseTo(whole.span, 6);
    const far = clampChartView({ cx: b.x1 + 1e6, cz: b.z0 - 1e6, span: 5000 }, W / H);
    expect(far.cx).toBe(b.x1);
    expect(far.cz).toBe(b.z0);
  });

  it('a press with a tool makes the plan intent the table does (Remove: within a share of the chart)', () => {
    expect(toolIntent('stop', 100, -200, 8000)).toEqual({ ref: 'add:stop', args: [100, -200] });
    expect(toolIntent('remove', 1, 2, 8000)).toEqual({ ref: 'remove', args: [1, 2, 8000 * CONFIG.voyage.plan.removeShare] });
  });

  it('plans in the career too: points added from the chart, and taken off', () => {
    const { world } = createWorld(new IdFactory(), 'workboat');
    const send = (ref: string, args?: number[]) => stepWorld(world, [{ playerId: 'p', targetId: ENVIRONMENT_ID, control: 'plan', value: 1, ref, ...(args ? { args } : {}) } as Intent], 1 / 60);
    const add = toolIntent('way', 1500, -800, 8000);
    send(add.ref, add.args);
    const stop = toolIntent('stop', 3000, 400, 8000);
    send(stop.ref, stop.args);
    expect(world.plan?.points.map((p) => p.kind)).toEqual(['way', 'stop']);
    const del = toolIntent('remove', 1510, -790, 8000);
    send(del.ref, del.args);
    expect(world.plan?.points.map((p) => p.kind)).toEqual(['stop']);
  });
});
