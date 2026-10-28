/**
 * The foiling ferry in a choppy sea (owner, 28 Oct 2026: "maybe a nice test to do for the
 * hydrofoils is take them out on a choppy sea, and obviously they should be pretty much
 * completely smooth because they ride over the waves"). The Shipyard's ferry in the game's own
 * seas (environment seaStateWaves: Slight, Moderate), into the waves, across them and with them,
 * at a steady throttle: flying, her flight computer holds her level over the waves
 * (CONFIG.foils.control.follow 0, "platforming"), so the up-and-down jolt at her helm is a small
 * fraction of what she feels on her hulls in the same sea; and with her pod's 1.6 : 1 reduction
 * she gets over the hump into a Moderate sea.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import type { Intent } from '../../src/core/intents';
import { seaStateWaves } from '../../src/environment/environmentState';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { FOIL_FERRY } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ferry: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[FOIL_FERRY].defaults, hull: FOIL_FERRY };
const DT = 1 / 60;
/** Where her helmsman stands (her axes): what he feels. */
const HELM = new THREE.Vector3(0, 2.5, -2.5);
/** Into the waves, across them, with them (the game's waves run toward about 45°). */
const INTO = 225;
const ACROSS = 135;
const WITH = 45;

/**
 * Her in sea scale `sea` on heading `heading`, flying (FOIL) or held on her hulls (HULL), the
 * throttle at `lever` from 20 s; measured over the last 30 s of 70: her speed, the rms and
 * largest up-and-down acceleration at her helm (m/s²), the least her hulls were clear of the
 * water (VesselState.foil.clear) and how often they touched.
 */
function voyage(sea: number, heading: number, foil: boolean, lever: number) {
  useDesign(ferry);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, heading);
  world.geography = 'openSea';
  // The open sea's long waves (the short wind-sea trains belong to enclosed water).
  const waves = seaStateWaves(sea).filter((w) => !w.chop);
  world.environment.seaScale = sea;
  world.environment.waves = waves;
  if (!foil) v.controls.foilMode = 0;
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  send('quickStart', 1);
  send('lever', 1);
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  let y1 = NaN;
  let y2 = NaN;
  let n = 0;
  let sum2 = 0;
  let most = 0;
  let speed = 0;
  let clear = 1;
  let touches = 0;
  for (let i = 0; i < 70 / DT; i++) {
    if (i === Math.round(20 / DT)) send('lever', lever);
    world.environment.waves = waves;
    stepWorld(world, [], DT);
    q.set(...(v.orientation as [number, number, number, number]));
    const y = v.position[1] + p.copy(HELM).applyQuaternion(q).y;
    if (i * DT > 40) {
      if (!Number.isNaN(y2)) {
        const a = (y - 2 * y1 + y2) / (DT * DT);
        sum2 += a * a;
        most = Math.max(most, Math.abs(a));
        n++;
      }
      speed += Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;
      const c = v.foil?.clear ?? 0;
      if (c < 0.98 && clear >= 0.98) touches++;
      clear = Math.min(clear, c);
    }
    y2 = y1;
    y1 = y;
  }
  return { kn: speed / (30 / DT), jolt: Math.sqrt(sum2 / n), most, clear, touches };
}

describe('the foiling ferry on a choppy sea', () => {
  it('in a Slight sea she flies level over the waves, any way to them: barely a jolt at her helm, far smoother than on her hulls', { timeout: 300000 }, () => {
    for (const heading of [INTO, ACROSS, WITH]) {
      const r = voyage(0.5, heading, true, 0.91);
      expect(r.kn, `${heading}`).toBeGreaterThan(22);
      expect(r.touches, `${heading}`).toBe(0);
      expect(r.clear, `${heading}`).toBe(1);
      // About 1/100 g (it was about 0.17 g into the waves, rising and falling with each one).
      expect(r.jolt, `${heading}`).toBeLessThan(0.3);
      expect(r.most, `${heading}`).toBeLessThan(2);
    }
    // On her hulls into the same sea (as fast as they'll go, about 17 kn) she feels many times more.
    const hulls = voyage(0.5, INTO, false, 1);
    expect(hulls.jolt).toBeGreaterThan(4 * voyage(0.5, INTO, true, 0.91).jolt);
  });

  it('in a Moderate sea she gets over the hump into the waves and across them, and flies on', { timeout: 300000 }, () => {
    for (const heading of [INTO, ACROSS]) {
      const r = voyage(1, heading, true, 0.91);
      expect(r.kn, `${heading}`).toBeGreaterThan(20);
      expect(r.clear, `${heading}`).toBeGreaterThan(0.9);
      expect(r.touches, `${heading}`).toBeLessThanOrEqual(2);
      expect(r.jolt, `${heading}`).toBeLessThan(1.2);
    }
  });
});
