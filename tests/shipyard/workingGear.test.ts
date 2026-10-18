/** A Shipyard boat with the working deck gear does the game's jobs with it: she tows on her winch and trawls. */
import { describe, expect, it } from 'vitest';
import { FISHING_GROUNDS } from '../../src/world/archipelago';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { placeVessel } from '../../src/vessel/vesselControl';
import { startEngine } from '../helpers/engine';

const DT = 1 / 60;
const WORKBOAT = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[2].defaults, hull: 2, towWinch: 1, sternRoller: 1, aFrame: 1 };

function setup() {
  useDesign(WORKBOAT);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  world.geography = 'openSea';
  world.tow!.calls = false;
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('a Shipyard boat with the working deck gear', () => {
  it('tows: the line made fast, her winch heaves it in', () => {
    const { world, v, send, run } = setup();
    startEngine(world, v);
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1);
    send('towMake');
    const line = world.tow!.line!;
    expect(line).toBeTruthy();
    const made = line.length!;
    send('winch.heaveIn', 1);
    run(3);
    expect(made - line.length!).toBeCloseTo(CONFIG.tow.winch.heaveSpeed * 3, 1);
  });

  it('trawls: the net goes out on a fishing ground', () => {
    const { world, v, send, run } = setup();
    const g = FISHING_GROUNDS[1];
    placeVessel(v, g.x, 0, g.z + 100, 0);
    startEngine(world, v);
    send('trawl.shoot', 1);
    run(2);
    expect(world.fishing?.t ?? 0).toBeGreaterThan(0);
  });
});
