/**
 * The line-throwing gun (owner, Oct 2026): fired at a ship's bow eye, the messenger lands,
 * the hawser is hauled over, and the towline is fast at the gun's range; a miss splashes.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { LineGun, type GunInput } from '../src/tow/lineGun';
import { towFast, towReach } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';

const DT = 1 / 60;
const input = (o: Partial<GunInput> = {}): GunInput => ({ held: true, pressed: false, tip: { x: 0, y: 2, z: 0 }, dir: { x: 0, y: 0.05, z: -1 }, targets: [], waterAt: () => 0, ...o });
const until = (g: LineGun, inp: GunInput, max = 30): string | null => {
  for (let t = 0; t < max; t += DT) {
    const ev = g.step(DT, inp);
    if (ev) return ev;
  }
  return null;
};

describe('the line gun', () => {
  it('aimed at an eye in range: the line lands, they haul, and the hawser is made; then it is ready again', () => {
    const g = new LineGun();
    const eye = { key: 'v:ship', pos: { x: 1, y: 1.5, z: -40 } };
    expect(g.step(DT, input({ pressed: true, targets: [eye] }))).toBe('attached');
    expect(g.phase).toBe('hauling');
    expect(until(g, input({ targets: [eye] }), CONFIG.lineGun.haulS + 1)).toBe('made');
    expect(g.madeKey).toBe('v:ship');
    expect(g.phase).toBe('ready');
  });

  it('fired wide: the rocket flies and falls into the water, a miss, then reloads; fired near enough it still lands', () => {
    const g = new LineGun();
    const eye = { key: 'v:ship', pos: { x: 30, y: 1.5, z: -40 } }; // well off the line of fire
    expect(g.step(DT, input({ pressed: true, targets: [eye] }))).toBe('fired');
    expect(g.phase).toBe('flying');
    expect(until(g, input({ targets: [eye] }))).toBe('missed');
    expect(g.phase).toBe('reloading');
    expect(g.step(DT, input({ pressed: true, targets: [eye] }))).toBeNull(); // not yet loaded
    for (let t = 0; t < CONFIG.lineGun.reloadS + 0.1; t += DT) g.step(DT, input());
    expect(g.phase).toBe('ready');
    // A rocket passing close by the eye lands on it even if not aimed within the cone.
    const near = { key: 'v:ship', pos: { x: 2, y: 2.0, z: -20 } };
    expect(g.step(DT, input({ pressed: true, dir: { x: 0, y: 0.2, z: -1 }, targets: [near] }))).toBe('fired');
    expect(until(g, input({ targets: [near] }))).toBe('attached');
    // Hung back while hauling: wound in.
    expect(g.step(DT, input({ held: false }))).toBe('wound');
    expect(g.phase).toBe('ready');
  });

  it('out of range: no hit by aim', () => {
    const g = new LineGun();
    const far = { key: 'v:ship', pos: { x: 0, y: 1.5, z: -(CONFIG.lineGun.range + 20) } };
    expect(g.step(DT, input({ pressed: true, targets: [far] }))).toBe('fired');
  });

  it("towMake by the gun makes fast at the gun's range, where the hook could not", () => {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    world.career!.upgrades.push('towPost');
    placeVessel(v, 0, 0, -600, 0);
    const send = (control: string, ref?: string, args?: number[]) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value: 1, ref, args } as Intent], DT);
    send('towDebugNear', 'ship');
    const ship = world.vessels[world.tow!.job!.vesselId];
    // Her bow eye 40 m astern of our stern roller.
    placeVessel(ship, 0, 0, -600 + 12 + 40, 0);
    const key = `v:${ship.id}`;
    const reach = towReach(world, key);
    expect(reach).toBeGreaterThan(CONFIG.tow.attachRange);
    expect(reach).toBeLessThan(CONFIG.lineGun.range);
    send('towMake', key);
    expect(towFast(world)).toBe(false);
    send('towMake', key, [1]);
    expect(towFast(world)).toBe(true);
  });

  it('every tug from the Shipyard carries the gun on its bracket; the workboat type does not', () => {
    const tug = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 });
    expect(tug.hull.fittings?.stowage?.lineGun).toBeTruthy();
    const tugEngine = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1, engine: 3 });
    expect(tugEngine.hull.fittings?.stowage?.lineGun).toBeTruthy();
    const plain = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0 });
    expect(plain.hull.fittings?.stowage?.lineGun).toBeUndefined();
  });
});
