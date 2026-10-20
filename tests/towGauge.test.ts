/**
 * The TOW LINE screen's gauge (owner, Oct 2026: the tension, and "how close it is to
 * snapping"; on boats that can tow, with the advanced instruments): its tension, its load
 * toward parting, the peak held a while, PARTED after it goes.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { lineLength, towFast, towReach, towVessel } from '../src/tow/tow';
import { FLEET } from '../src/boats/fleet';
import { useDesign } from '../src/boats/sims';
import { buildDesign } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';

afterAll(() => useDesign(DEFAULT_DESIGN));
const DT = 1 / 60;

function setup(kind = 'barge') {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  placeVessel(v, 0, 0, -400, 0);
  run(1);
  send('towDebugNear', 1, kind);
  send('towMake');
  const tow = towVessel(world)!;
  /** Hold the tow `stretch` m beyond the line's length, still. */
  const stretchTo = (stretch: number) => {
    placeVessel(tow, tow.position[0], 0, tow.position[2] + (lineLength(world.tow!.line!) - towReach(world)) + stretch, 0);
  };
  return { world, v, send, run, tow, stretchTo };
}

describe('the tow line gauge', () => {
  it('reads the tension, and its load toward parting: half the breaking force reads half', () => {
    const { world, v, run, stretchTo } = setup();
    expect(towFast(world)).toBe(true);
    run(0.2);
    expect(v.towLine!.fast).toBe(true);
    stretchTo((0.5 * CONFIG.tow.breakForce) / CONFIG.tow.stiffness);
    run(0.05);
    expect(v.towLine!.tension).toBeCloseTo(world.tow!.line!.tension, 0);
    expect(v.towLine!.load).toBeGreaterThan(0.4);
    expect(v.towLine!.load).toBeLessThan(0.6);
  });

  it('a large tow’s heavy hawser takes more: the same pull reads less of its breaking load', () => {
    const a = setup('barge');
    const b = setup('trawler');
    const stretch = (0.6 * CONFIG.tow.breakForce) / CONFIG.tow.stiffness;
    a.stretchTo(stretch);
    b.stretchTo(stretch);
    a.run(0.05);
    b.run(0.05);
    expect(b.v.towLine!.load).toBeLessThan(a.v.towLine!.load * 0.8);
  });

  it('holds the peak a while after a snatch, then lets it go', () => {
    const { v, run, stretchTo } = setup();
    stretchTo((0.7 * CONFIG.tow.breakForce) / CONFIG.tow.stiffness);
    run(0.05);
    const peak = v.towLine!.peak;
    expect(peak).toBeGreaterThan(0.6);
    stretchTo(-2); // slack again
    run(1);
    expect(v.towLine!.load).toBeLessThan(0.05);
    expect(v.towLine!.peak).toBeCloseTo(peak, 3);
    run(CONFIG.tow.gauge.peakHoldS + 1);
    expect(v.towLine!.peak).toBeLessThan(0.05);
  });

  it('says PARTED when the line goes, for a while', () => {
    const { world, v, run, tow } = setup();
    tow.linearVelocity = [0, 0, 12];
    run(4);
    expect(towFast(world)).toBe(false);
    expect(v.towLine!.fast).toBe(false);
    expect(v.towLine!.parted).toBe(true);
    run(CONFIG.tow.gauge.partedShowS + 1);
    expect(v.towLine!.parted).toBe(false);
  });
});

describe('the TOW LINE screen in the Shipyard', () => {
  const screens = (d: typeof DEFAULT_DESIGN) => buildDesign(d).recipe.modules.find((m) => m.socket === 'helm')!.modules!.filter((m) => m.module === 'instrument.screen').map((m) => (m.config as { screen: string }).screen);
  it('on a boat that can tow (a stern roller), with the advanced instruments: last in the row', () => {
    const tug = FLEET.find((f) => f.id === 'smallTug')!.design;
    expect(tug.sternRoller).toBeTruthy();
    expect(screens(tug).at(-1)).toBe('towline');
  });
  it('not without a stern roller, nor with the basic instruments', () => {
    const tug = FLEET.find((f) => f.id === 'smallTug')!.design;
    expect(screens({ ...tug, sternRoller: 0, towWinch: 0 })).not.toContain('towline');
    expect(screens({ ...tug, controls: 0 })).not.toContain('towline');
  });
});
