/**
 * A new career starts in the fleet's beginner boat (owner, Oct 2026), as basic as she comes,
 * and buys her equipment at the yard: each add-on is a change to her Shipyard design
 * (CONFIG.career.upgrades `design`), and she's rebuilt with it (boats/sims.ts useStarterKit).
 * What doesn't fit her (the trawl: her house is right aft; the skiff, owner: never on her)
 * the yard says so. At a port with only an anchorage you swim the goods ashore: the goods'
 * labels and the job offers say so.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../src/boats/library';
import { gearOf, useStarterKit } from '../src/boats/sims';
import { buyBlocker, contractText, equipmentWithout, KIT_BOATS, type Contract } from '../src/career/career';
import { cargoLabel, type CargoItem } from '../src/cargo/cargo';
import { anchorageOnly, PORTS } from '../src/world/archipelago';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';

const DT = 1 / 60;
const modules = () => RECIPES.starterBoat.modules.map((m) => m.module);

afterEach(() => useStarterKit(equipmentWithout([])));

describe('a new career in the beginner boat', () => {
  it('is the game’s start boat, and a boat the career kits out; she tows from day one (her stern roller)', () => {
    expect(CONFIG.career.boat).toBe('starterBoat');
    expect(KIT_BOATS).toContain('starterBoat');
    useStarterKit(equipmentWithout([]));
    expect(gearOf({ defId: 'starterBoat' }, 'towPoint')).toBeTruthy();
  });

  it('a new career’s: no searchlight or fire monitor; bought, fitted. Never a skiff or the trawl', () => {
    useStarterKit(equipmentWithout([]));
    for (const m of ['deck.searchlight', 'deck.fire-monitor']) expect(modules()).not.toContain(m);
    useStarterKit(equipmentWithout(['searchlight', 'fireMonitor', 'skiff', 'trawlGear']));
    for (const m of ['deck.searchlight', 'deck.fire-monitor']) expect(modules()).toContain(m);
    for (const m of ['deck.tender-crane', 'deck.a-frame']) expect(modules()).not.toContain(m);
  });

  it('fenders and a life ring (owner): none to start; bought, fitted, and the fender basket and ring station come with them', () => {
    useStarterKit(equipmentWithout([]));
    for (const m of ['deck.fenders', 'hull.guard', 'rescue.life-ring-station']) expect(modules()).not.toContain(m);
    useStarterKit(equipmentWithout(['fenders', 'lifeRing']));
    for (const m of ['deck.fenders', 'rescue.life-ring-station', 'rescue.boat-hook-rack']) expect(modules()).toContain(m);
    expect(modules()).not.toContain('hull.guard'); // fenders only, no rubbing strake
  });

  it('the yard sells her the searchlight and fire monitor; not the skiff or the trawl gear', () => {
    useStarterKit(equipmentWithout([]));
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
    const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
    send('teleportToPort', 'calder', vesselId);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    send('careerDebugCash');
    for (const id of ['searchlight', 'fireMonitor', 'fenders', 'lifeRing']) expect(buyBlocker(world, id), id).toBeNull();
    for (const id of ['skiff', 'trawlGear']) expect(buyBlocker(world, id), id).toBe('Not on this boat');
  });

  it('goods and jobs for a port with only an anchorage say how they get ashore', () => {
    const bay = PORTS.find((p) => anchorageOnly(p.id))!;
    const quay = PORTS.find((p) => p.cargo.berth)!;
    expect(contractText({ kind: 'cargo', count: 2, port: bay.id } as Contract)).toContain(CONFIG.cargo.anchorageNote);
    expect(contractText({ kind: 'cargo', count: 2, port: quay.id } as Contract)).not.toContain(CONFIG.cargo.anchorageNote);
    expect(cargoLabel({ id: 'c1', kind: 0, mass: 20, to: bay.id, at: { ground: [0, 0, 0], yaw: 0 } } as unknown as CargoItem)).toContain('swim it ashore');
  });
});
