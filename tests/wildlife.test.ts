import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { dolphinPose, gullPose, podVisit, type DolphinPose, type GullPose } from '../src/wildlife/wildlife';

describe('wildlife', () => {
  it('gulls circle about the boat, at their heights, the same for everyone at a given time', () => {
    const c = CONFIG.wildlife.gulls;
    const g: GullPose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, wing: 0 };
    for (let i = 0; i < c.count; i++) {
      for (let t = 0; t < 600; t += 7.3) {
        gullPose(i, t, 1000, -500, g);
        expect(Math.hypot(g.x - 1000, g.z + 500)).toBeLessThan(c.radius[1] + c.wander * 1.5);
        expect(g.y).toBeGreaterThan(c.height[0] - 2);
        expect(g.y).toBeLessThan(c.height[1] + 2);
        expect(Math.abs(g.bank)).toBeLessThan(0.8);
      }
    }
    const a = { ...gullPose(2, 123.4, 0, 0, g) };
    expect(gullPose(2, 123.4, 0, 0, g)).toEqual(a); // a pure function of time: crew-mates agree
  });

  it('a dolphin pod comes in most time slots, stays its while, and they breathe now and then', () => {
    const c = CONFIG.wildlife.dolphins;
    let visits = 0;
    const slots = 200;
    for (let k = 0; k < slots; k++) {
      let seen = 0;
      for (let t = k * c.every; t < (k + 1) * c.every; t += 1) if (podVisit(t) !== null) seen++;
      if (seen) {
        visits++;
        expect(Math.abs(seen - c.stay)).toBeLessThanOrEqual(1);
      }
    }
    expect(visits / slots).toBeGreaterThan(c.chance - 0.15);
    expect(visits / slots).toBeLessThan(c.chance + 0.15);
    // Up about a third of the time, never far from the bow once they've arrived.
    const d: DolphinPose = { x: 0, z: 0, y: 0, pitch: 0, up: false, sinceBreath: 0 };
    let up = 0;
    let n = 0;
    for (let into = 10; into < c.stay - 10; into += 0.1) {
      dolphinPose(1, into, 1000 + into, -7, d);
      if (d.up) up++;
      n++;
      expect(d.z).toBeLessThan(0);
      expect(Math.abs(d.x)).toBeLessThan(6);
    }
    expect(up / n).toBeGreaterThan(0.2);
    expect(up / n).toBeLessThan(0.4);
  });
});
