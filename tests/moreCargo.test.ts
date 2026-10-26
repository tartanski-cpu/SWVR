/**
 * More cargo (owner, Oct 2026: "significantly more cargo now that the boats are bigger") and
 * crane cargo ("some cargo ... can only be lifted on by the cargo crane ... close enough to
 * the side ... to pick up with the crane"): CONFIG.cargo.perPort, stackRow, crane;
 * cargo/cargo.ts stackPoint, craneStackPoint, spawnCraneCargo, takeBlocker; career pay.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { cargoBerth, craneOnly, craneStackPoint, portAtPoint, stockPorts, takeBlocker, type CargoItem } from '../src/cargo/cargo';
import { earn } from '../src/career/career';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { PORTS } from '../src/world/archipelago';

describe('more cargo, and crane cargo', () => {
  it('every port keeps 12 hand items in rows, every cargo-berth port 3 crane items along its quay edge', () => {
    const { world } = createWorld(new IdFactory(), 'workboat');
    stockPorts(world);
    const items = Object.values(world.cargo).filter((c) => c.from !== 'pots' && 'ground' in c.at);
    for (const p of PORTS) {
      const here = items.filter((c) => c.from === p.id);
      expect(here.filter((c) => !craneOnly(c))).toHaveLength(CONFIG.cargo.perPort);
      expect(here.filter((c) => craneOnly(c))).toHaveLength(cargoBerth(p) ? CONFIG.cargo.crane.perPort : 0);
    }
    // Crane cargo goes only to another port with a cargo quay.
    for (const c of items.filter(craneOnly)) expect(cargoBerth(PORTS.find((p) => p.id === c.to)!)).toBeTruthy();
    expect(CONFIG.career.contracts.kinds.cargo.counts).toEqual([4, 8, 12]);
  });

  it("each crane item is on the quay and within the workboat's crane's reach and lift, even with the crane on her far side", () => {
    const crane = CONFIG.modules.deckCrane;
    const hull = VESSEL_DEFS.workboat.hull;
    const half = Math.max(...hull.stations.map((st) => st.halfBeamDeck));
    const reach = crane.boomLength + crane.extendMax;
    for (const p of PORTS) {
      const b = cargoBerth(p);
      if (!b) continue;
      for (let i = 0; i < CONFIG.cargo.crane.perPort; i++) {
        const at = craneStackPoint(p, i)!;
        // Standing on the quay's deck, not in the water.
        expect(at[1]).toBeGreaterThan(0);
        // Her centreline lies her half-beam and the fender's clearance off the face; the item
        // `edgeIn` inside it; her crane's column `edgeInset` in from her far side.
        const far = half + CONFIG.docking.fenderClear + (half - crane.edgeInset) + CONFIG.cargo.crane.edgeIn;
        expect(far).toBeLessThanOrEqual(reach);
        const kg = Math.max(...CONFIG.cargo.crane.kinds.map((n) => CONFIG.cargo.kinds.find((k) => k.name === n)!.mass));
        expect(kg).toBeLessThanOrEqual((crane.swlKg * crane.boomLength) / far);
        // And it counts as at that port for delivery.
        expect(portAtPoint(at[0], at[2])?.id).toBe(p.id);
      }
    }
  });

  it("can't be carried by hand (a hand crate still can); pays three times a hand item's rate", () => {
    const { world } = createWorld(new IdFactory(), 'workboat');
    stockPorts(world);
    const all = Object.values(world.cargo) as CargoItem[];
    const heavy = all.find(craneOnly)!;
    const light = all.find((c) => !craneOnly(c) && c.from !== 'pots')!;
    expect(takeBlocker(heavy)).toMatch(/too heavy to carry/);
    expect(takeBlocker(light)).toBeNull();
    const [a, b] = PORTS.filter((p) => cargoBerth(p));
    const before = world.career!.money;
    earn(world, 'cargo', { port: b.id, from: a.id, what: 'Crate', text: 'x' });
    const hand = world.career!.money - before;
    earn(world, 'cargo', { port: b.id, from: a.id, what: 'Engine block', text: 'y' });
    const craneJob = world.career!.money - before - hand;
    expect(craneJob / hand).toBeCloseTo(CONFIG.cargo.crane.payFactor, 1);
  });
});

describe('more cargo on the coast maps', () => {
  for (const map of ['oban', 'tayvallich']) {
    it(`${map}: every port's 12 items on dry land (rows wrap back from the water), crane cargo on its cargo quay`, async () => {
      const { readFileSync } = await import('node:fs');
      const { vi } = await import('vitest');
      vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
      vi.resetModules();
      const regions = await import('../src/world/regions');
      const coast = await import('../src/world/coastTerrain');
      const c = regions.regionById(map)!.coast!;
      const t = c.pkg.terrain;
      if (t.chunked) throw new Error('whole-mesh map expected');
      const bin = readFileSync(`public/${t.dir}${t.file}`);
      coast.registerCoastTerrain(map, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
      const w = await import('../src/core/world');
      const ids = await import('../src/core/ids');
      const cargo = await import('../src/cargo/cargo');
      const geo = await import('../src/world/geography');
      const { PORTS: ports } = await import('../src/world/archipelago');
      const { world } = w.createWorld(new ids.IdFactory(), 'pilotBoat');
      cargo.stockPorts(world);
      const items = Object.values(world.cargo).filter((x) => x.from !== 'pots' && 'ground' in x.at);
      let wet = 0;
      for (const it of items) {
        const [x, , z] = (it.at as { ground: number[] }).ground;
        if (geo.standingHeight(x, z) <= -0.3) wet++;
      }
      // Every port stocked; at most a stray item or two on a sloping beach's edge.
      expect(items.filter((x) => !cargo.craneOnly(x)).length).toBe(ports.length * CONFIG.cargo.perPort);
      expect(wet).toBeLessThanOrEqual(2);
      for (const it of items.filter(cargo.craneOnly)) expect((it.at as { ground: number[] }).ground[1]).toBeGreaterThan(0);
    });
  }
});
