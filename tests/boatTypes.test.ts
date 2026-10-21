/**
 * Multi-boat M1 (docs/MULTI_BOAT.md): boats by token. A Shipyard boat is a vessel type of
 * her own, keyed by her design token (her code or her document), the same id on every page;
 * her token rides on her vessel state, so a page that gets a world with a boat it hasn't
 * got builds her from it (boats/library.ts boatType, ensureBoatTypes). Any number of them
 * in one world.
 */
import { describe, expect, it } from 'vitest';
import { boatTokenOf, boatType, boatTypeId, boatTypeOf, ensureBoatTypes, isBoatType, RECIPES } from '../src/boats/library';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { designToken, docToken, shortCode } from '../src/shipyard/designDoc';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';

const DT = 1 / 60;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('boats by token (multi-boat M1)', () => {
  const codeA = shortCode(DEFAULT_DESIGN)!;
  // A boat from a file: her document token, with link-only choices (a saloon) and a name.
  const docB = docToken({ ...DEFAULT_DESIGN, length: DEFAULT_DESIGN.length + 2, saloon: 1 }, 'Saloon boat');

  it('a token makes a vessel type of her own, the same id wherever it is made, with her token on it', () => {
    const a = boatType(codeA)!;
    expect(a).toBe(boatTypeId(codeA));
    expect(isBoatType(a)).toBe(true);
    expect(boatType(codeA)).toBe(a); // built once
    expect(boatType(` ${codeA} `)).toBe(a); // whitespace doesn't make another
    expect(RECIPES[a]).toBeTruthy();
    expect(VESSEL_DEFS[a]).toBeTruthy();
    expect(a in VESSEL_DEFS).toBe(true);
    expect(Object.keys(VESSEL_DEFS)).toContain(a);
    expect(boatTokenOf(a)).toBe(codeA);
    expect(boatTypeOf(a)!.figures.lengthM).toBeGreaterThan(5);
    expect(boatType('not a design at all')).toBeNull();
    expect(boatTokenOf('pilotBoat')).toBeNull();
  });

  it('two different Shipyard boats sail one world, each as her own type; a boat from a file too', () => {
    const a = boatType(codeA)!;
    const b = boatType(docB)!;
    expect(b).not.toBe(a);
    expect(boatTokenOf(b)).toBe(docB);
    expect(boatTypeOf(b)!.figures.lengthM).not.toBe(boatTypeOf(a)!.figures.lengthM);
    const ids = new IdFactory();
    const { world, vesselId } = createWorld(ids, a);
    world.environment.waves = [];
    expect(world.vessels[vesselId].build).toBe(codeA);
    const second = createVesselState(ids.next('vessel'), b);
    expect(second.build).toBe(docB);
    placeVessel(second, 60, 0, 0, 90);
    world.vessels[second.id] = second;
    for (let i = 0; i < 3 / DT; i++) stepWorld(world, [], DT);
    for (const v of [world.vessels[vesselId], second]) {
      expect(Number.isFinite(v.position[1])).toBe(true);
      expect(Math.abs(v.position[1])).toBeLessThan(2);
    }
    expect(world.vessels[vesselId].defId).not.toBe(second.defId);
    // A fixed type carries no token.
    expect(createVesselState(ids.next('vessel'), 'pilotBoat').build).toBeUndefined();
  });

  it('a world from elsewhere: a boat this page has not got is built from the token she carries', () => {
    const docC = docToken({ ...DEFAULT_DESIGN, searchlight: 1, fireMonitor: 1 }, 'From a file');
    const c = boatTypeId(docC);
    expect(RECIPES[c]).toBeUndefined();
    const v = { ...createVesselState('vessel-9', 'pilotBoat'), defId: c, build: docC };
    ensureBoatTypes({ vessels: { [v.id]: v } });
    expect(RECIPES[c]).toBeTruthy();
    expect(VESSEL_DEFS[c].id).toBe(c);
    expect(designToken(DEFAULT_DESIGN)).toBe(codeA);
  });

  it('a crew-mate gets the host\'s boat with her token in the welcome and every snapshot', async () => {
    const a = boatType(codeA)!;
    const ids = new IdFactory();
    const { world, vesselId } = createWorld(ids, a);
    world.environment.waves = [];
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '12345');
    const client = new ClientSession(loop.client(), 'Guest', () => 0);
    await flush();
    expect(client.status).toBe('connected');
    const theirs = client.latest!.vessels[vesselId];
    expect(theirs.defId).toBe(a);
    expect(theirs.build).toBe(codeA);
    ensureBoatTypes(client.latest!); // nothing to build: she's known here already
    expect(boatTypeId(theirs.build!)).toBe(theirs.defId);
    host.close();
  });
});
