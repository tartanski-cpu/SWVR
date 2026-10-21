/**
 * The coast extras plan, C3: what the shore is made of. A bow-ramp boat runs onto sand or
 * shingle unharmed at a beaching speed, and with her ramp down lands and is held there; rock
 * is as hard as ever; a boat without a ramp grounds as before. In the career world, with a
 * stand-in shore map laid over it (all sand, or all rock): a coast map's comes from its
 * pipeline (coastShore.ts); the rules are the same.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { beachSpots } from '../src/salvage/salvage';
import { contactAt, type ContactResult } from '../src/vessel/physics/contacts';
import { placeVessel } from '../src/vessel/vesselControl';
import { BLOCKS } from '../src/world/archipelago';
import { clearShores, registerShore, shoreAt, softShore, type ShoreLayout } from '../src/world/coastShore';
import { beached } from '../src/world/slipway';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A shore map of one kind over the whole career world (cells 50 m). */
function shoreEverywhere(value: number): void {
  const layout: ShoreLayout = { file: '', cell: 50, x0: -20000, z0: -20000, width: 800, height: 800, kinds: ['none', 'sand', 'shingle', 'rock', 'cliff'] };
  const packed: number[] = [];
  for (let left = layout.width * layout.height; left > 0; left -= 255) packed.push(Math.min(255, left), value);
  registerShore('test', Uint8Array.from(packed).buffer, layout, 0, 0);
}

/** A beach with open water off it, clear of the piers: the spot, and the way out to sea (rad, bearing). */
function aBeach(): { x: number; z: number; out: number } {
  for (const b of beachSpots()) {
    if (BLOCKS.some((k) => Math.hypot(k.x - b.x, k.z - b.z) < 150)) continue;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if ([15, 30, 45].every((d) => groundHeight(b.x + Math.sin(a) * d, b.z - Math.cos(a) * d) < -2.5)) return { x: b.x, z: b.z, out: a };
    }
  }
  throw new Error('no beach');
}

/** Drive a boat up the beach bow first at `speed` m/s (held there until she touches), her ramp up or down. */
function runAshore(defId: string, speed: number, rampDown: boolean) {
  const { world, vesselId } = createWorld(new IdFactory(), defId);
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const b = aBeach();
  // 35 m out, her bow toward the beach.
  placeVessel(v, b.x + Math.sin(b.out) * 35, 0, b.z - Math.cos(b.out) * 35, ((b.out * 180) / Math.PI + 180) % 360);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  if (rampDown) send('bowRamp', 1);
  for (let i = 0; i < 2 * 60; i++) stepWorld(world, [], DT);
  v.damage = 0;
  let touched = false;
  for (let i = 0; i < 40 * 60 && !touched; i++) {
    v.linearVelocity[0] = -Math.sin(b.out) * speed;
    v.linearVelocity[2] = Math.cos(b.out) * speed;
    stepWorld(world, [], DT);
    if (v.contact.force > 0 || v.slip) touched = true;
  }
  for (let i = 0; i < 10 * 60; i++) stepWorld(world, [], DT);
  return { world, v, touched };
}

afterEach(() => clearShores());

describe('what the shore is made of (C3)', () => {
  it("Oban's shore map: sand on Ganavan's mapped beach, soft; the rest of the shore classed only where the map says", () => {
    const layout = JSON.parse(readFileSync(join(root, 'src/world/regions/oban.coast.json'), 'utf8')).shore as ShoreLayout;
    const b = readFileSync(join(root, 'public/regions/oban', layout.file));
    registerShore('oban', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, layout, 0, 0);
    // Count what it holds: sand and rock both there, most of the shore band unclassed (foreshore).
    const kinds: Record<string, number> = {};
    for (let z = layout.z0; z < layout.z0 + layout.height * layout.cell; z += layout.cell)
      for (let x = layout.x0; x < layout.x0 + layout.width * layout.cell; x += layout.cell) {
        const k = shoreAt(x + 1, z + 1);
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
    expect(kinds.sand).toBeGreaterThan(500);
    expect(kinds.rock).toBeGreaterThan(100);
    expect(kinds.cliff).toBeGreaterThan(50);
    expect(shoreAt(1e6, 1e6)).toBe('none');
  });

  it('a ground contact says whether it is soft; a pier never is', () => {
    shoreEverywhere(1);
    const out = { fx: 0, fy: 0, fz: 0, normal: 0, slide: 0, approach: 0 } as ContactResult;
    const b = aBeach();
    expect(softShore(b.x, b.z)).toBe(true);
    expect(contactAt(b.x, groundHeight(b.x, b.z) - 0.2, b.z, 0, -1, 0, out)).toBe(true);
    expect(out.soft).toBe(true);
    const pier = BLOCKS.find((k) => k.kind !== 'barge' && !k.farm)!;
    expect(contactAt(pier.x, pier.top - 0.2, pier.z, 0, -1, 0, out)).toBe(true);
    expect(out.soft).toBe(false);
  });

  it('the landing craft runs onto sand at 2.5 m/s unharmed; onto rock she is holed; the workboat is holed on sand', () => {
    expect(2.5).toBeLessThan(CONFIG.beaching.impactSafe);
    shoreEverywhere(1);
    const sand = runAshore('landingCraft', 2.5, false);
    expect(sand.touched).toBe(true);
    expect(sand.v.damage).toBe(0);
    shoreEverywhere(3);
    const rock = runAshore('landingCraft', 2.5, false);
    expect(rock.touched).toBe(true);
    expect(rock.v.damage).toBeGreaterThan(0);
    shoreEverywhere(1);
    const work = runAshore('workboat', 2.5, false);
    expect(work.touched).toBe(true);
    expect(work.v.damage).toBeGreaterThan(0);
  }, 120000);

  it('with her ramp down, slowly onto sand: she lands and is held; astern takes her off; on rock she never lands', () => {
    shoreEverywhere(1);
    const a = runAshore('landingCraft', 1.0, true);
    expect(beached(a.v)).toBe(true);
    expect(a.v.slip?.phase).toBe('landed');
    expect(a.v.damage).toBe(0);
    const held = [...a.v.position];
    for (let i = 0; i < 20 * 60; i++) stepWorld(a.world, [], DT);
    expect(a.v.position).toEqual(held);
    stepWorld(a.world, [{ playerId: 'p', targetId: a.v.id, control: 'lever', value: -0.5 } as Intent], DT);
    for (let i = 0; i < 5 * 60; i++) stepWorld(a.world, [], DT);
    expect(a.v.slip).toBeUndefined();
    shoreEverywhere(3);
    const r = runAshore('landingCraft', 1.0, true);
    expect(beached(r.v)).toBe(false);
  }, 120000);
});
