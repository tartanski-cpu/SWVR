/**
 * Go to every harbour on a real coast map (review, Oct 2026: on Tayvallich, Go to Ashfield
 * pier did nothing: the anchor-spot search threw and the tick never placed her). Each Go now
 * lands her made fast: moored at a berth, or lying to her anchor.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WholeCoastTerrain } from '../src/world/coastRegion';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let m: {
  regions: typeof import('../src/world/regions');
  arch: typeof import('../src/world/archipelago');
  coast: typeof import('../src/world/coastTerrain');
  world: typeof import('../src/core/world');
  sim: typeof import('../src/core/simulation');
  ids: typeof import('../src/core/ids');
};

beforeAll(async () => {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=tayvallich', href: 'https://localhost/voyage.html?map=tayvallich' });
  vi.resetModules();
  m = {
    regions: await import('../src/world/regions'),
    arch: await import('../src/world/archipelago'),
    coast: await import('../src/world/coastTerrain'),
    world: await import('../src/core/world'),
    sim: await import('../src/core/simulation'),
    ids: await import('../src/core/ids'),
  };
  const c = m.regions.regionById('tayvallich')!.coast!;
  const t = c.pkg.terrain as WholeCoastTerrain;
  const bin = readFileSync(join(root, 'public', t.dir, t.file));
  m.coast.registerCoastTerrain('tayvallich', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
});

describe('Voyage Go on the Tayvallich map', () => {
  it('every harbour: she arrives made fast (Ashfield included), and the tick carries on', () => {
    const ports = m.arch.PORTS;
    expect(ports.some((p) => /ashfield/i.test(p.id))).toBe(true);
    for (const port of ports) {
      const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), undefined, { voyage: true });
      const v = world.vessels[vesselId];
      const from = [v.position[0], v.position[2]];
      expect(() => m.sim.stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'teleportToPort', value: 1, ref: port.id }], 1 / 60)).not.toThrow();
      const moved = Math.hypot(v.position[0] - from[0], v.position[2] - from[1]) > 1 || v.mooring.berthId?.startsWith(port.id);
      expect(moved, port.id).toBeTruthy();
      expect(v.mooring.phase === 'moored' || v.anchor.phase === 'set', port.id).toBe(true);
    }
  });

  it('SOS on the Voyage map (no boatyard): she is brought upright into the nearest harbour, made fast (review, Oct 2026)', async () => {
    const { sosCondition } = await import('../src/rescue/sos');
    const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), undefined, { voyage: true });
    const v = world.vessels[vesselId];
    v.orientation = [1, 0, 0, 0]; // upside down
    expect(sosCondition(v)).toBe('capsized');
    m.sim.stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'sos', value: 1 }], 1 / 60);
    expect(sosCondition(v)).toBe('upright');
    expect(v.mooring.phase).toBe('moored');
    expect(world.rescue?.radio?.text).toMatch(/brought you into Tayvallich|brought you into/);
  });
});
