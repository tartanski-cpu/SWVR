/**
 * The voyage plan (voyage/plan.ts): the planning table's points, names, view and progress,
 * shared through the world like everything the host decides.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createPlayerState } from '../src/player/playerState';
import { placeVessel } from '../src/vessel/vesselControl';
import { createPlan, lookSights, nextPoint, parsePlan, planAspect, pointLabel, savePlanText, sightWords, tableBerthNear, viewBounds, wholeView } from '../src/voyage/plan';
import { toolIntent } from '../src/voyage/planChart';
import { BERTHS } from '../src/world/archipelago';
import { FARMS, PORTS } from '../src/world/archipelago';
import { quaySpot, startBerthId } from '../src/world/startSpot';

function game() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'pilotBoat');
  world.environment.waves = [];
  const plan = (ref: string, ...args: number[]) => stepWorld(world, [{ playerId: localPlayerId, targetId: ENVIRONMENT_ID, control: 'plan', value: 1, ref, args } as Intent], 1 / 20);
  return { world, vesselId, localPlayerId, plan };
}

describe('the voyage plan', () => {
  it('points of each kind, named: a stop by its harbour, a look by its landmark, a waypoint plain', () => {
    const { world, plan } = game();
    const port = PORTS[0];
    plan('add:way', 100, -400);
    plan('add:stop', port.x + 40, port.z - 30);
    plan('add:look', 41, 480); // the wreck of the Margaret Ann
    const p = world.plan!.points;
    expect(p.map((o) => o.kind)).toEqual(['way', 'stop', 'look']);
    expect(p[0].name).toBe('');
    expect(p[1].name).toBe(port.name.replace(' (anchorage)', ''));
    expect(p[2].name).toBe('Margaret Ann');
    expect(pointLabel(p[1], 1)).toBe(`Stop 2: ${p[1].name}`);
    expect(pointLabel(p[0], 0)).toBe('Waypoint 1');
    // Nothing without a place, nor of a kind it doesn't know.
    plan('add:way');
    plan('add:anchor', 0, 0);
    expect(world.plan!.points).toHaveLength(3);
  });

  it('a look goes onto its landmark (none near the press, none put); it is not on the route, and is called out when a boat comes within sight', () => {
    const { world, vesselId, plan } = game();
    const wreck = lookSights().find((s) => s.name === 'Margaret Ann')!;
    // (Out of sight of it while planning: she starts a kilometre or so from it.)
    placeVessel(world.vessels[vesselId], 8000, 0, -8000, 0);
    plan('add:way', 2000, -3000);
    plan('add:look', wreck.x + 120, wreck.z - 80, 300);
    plan('add:look', 2000, -3000, 50); // open water: nothing to look at
    plan('add:stop', 4000, -3000);
    const p = world.plan!.points;
    expect(p.map((o) => o.kind)).toEqual(['way', 'look', 'stop']);
    expect([p[1].x, p[1].z]).toEqual([Math.round(wreck.x), Math.round(wreck.z)]);
    expect(toolIntent('look', 2000, -3000, 1000)).toBeNull();
    expect(toolIntent('look', wreck.x + 30, wreck.z, 1000)!.ref).toBe('add:look');
    // The route passes over it: the next after the waypoint is the stop.
    const home = world.vessels[vesselId];
    placeVessel(home, 2000, 0, -3000, 0);
    stepWorld(world, [], 1 / 20);
    expect(nextPoint(world)!.i).toBe(2);
    expect(world.plan!.note!.text).toMatch(/Next: Stop 3/);
    // Within sight of it, heading north with it to the north-west: called out, and seen once.
    placeVessel(home, wreck.x + 600, 0, wreck.z + 600, 0);
    stepWorld(world, [], 1 / 20);
    expect(p[1].seen).toBe(true);
    expect(world.plan!.note!.text).toMatch(/^Look 2: Margaret Ann in sight: on the port bow, 0\.5 nm\.$/);
    const t = world.plan!.note!.t;
    stepWorld(world, [], 1 / 20);
    expect(world.plan!.note!.t).toBe(t);
    expect(parsePlan(savePlanText(world.plan!))!.points[1].seen).toBe(true);
    // Where it is from her, as you'd say it aboard.
    const at = (deg: number) => ({ position: [0, 0, 0], orientation: [0, Math.sin((-deg * Math.PI) / 360), 0, Math.cos((-deg * Math.PI) / 360)] });
    expect(sightWords(at(0), 0, -1000)).toBe('dead ahead');
    expect(sightWords(at(0), 1000, 0)).toBe('abeam to starboard');
    expect(sightWords(at(90), 0, -1000)).toBe('abeam to port');
    expect(sightWords(at(0), -700, 700)).toBe('on the port quarter');
    expect(sightWords(at(0), 0, 1000)).toBe('astern');
  });

  it('remove the nearest within reach, undo the last, clear; at most maxPoints', () => {
    const { world, plan } = game();
    for (let i = 0; i < 4; i++) plan('add:way', i * 1000, 0);
    plan('remove', 2100, 0, 50); // too far from any
    expect(world.plan!.points).toHaveLength(4);
    plan('remove', 2100, 0, 300);
    expect(world.plan!.points.map((p) => p.x)).toEqual([0, 1000, 3000]);
    plan('undo');
    expect(world.plan!.points.map((p) => p.x)).toEqual([0, 1000]);
    plan('clear');
    expect(world.plan!.points).toHaveLength(0);
    for (let i = 0; i < CONFIG.voyage.plan.maxPoints + 5; i++) plan('add:way', i * 10, 0);
    expect(world.plan!.points).toHaveLength(CONFIG.voyage.plan.maxPoints);
  });

  it("the table's view: zoomed in on a spot, out, the whole map; never closer than minSpan, never past the map", () => {
    const { world, plan } = game();
    plan('whole');
    const whole = wholeView();
    expect(world.plan!.view).toEqual(whole);
    const b = viewBounds(whole);
    expect((b.x1 - b.x0) / (b.z1 - b.z0)).toBeCloseTo(planAspect(), 6);
    plan('zoom', whole.cx + 100, whole.cz - 100);
    expect(world.plan!.view.span).toBeCloseTo(whole.span / 2, 3);
    expect(world.plan!.view.cx).toBeCloseTo(whole.cx + 100, 3);
    for (let i = 0; i < 20; i++) plan('zoom', whole.cx, whole.cz);
    expect(world.plan!.view.span).toBe(CONFIG.voyage.plan.minSpan);
    // Zoomed in at the map's very corner: the view's centre kept on the map.
    plan('zoom', b.x0 - 5000, b.z0 - 5000);
    const v = viewBounds(world.plan!.view);
    expect(v.x0).toBeGreaterThanOrEqual(b.x0 - 1e-6);
    expect(v.z0).toBeGreaterThanOrEqual(b.z0 - 1e-6);
    for (let i = 0; i < 20; i++) plan('out');
    expect(world.plan!.view.span).toBeCloseTo(whole.span, 3);
  });

  it("a point is reached when any player's boat comes within its reach; the next comes up, with a note; the last ends it", () => {
    const { world, vesselId, plan } = game();
    plan('add:way', 2000, -3000);
    plan('add:stop', 4000, -3000);
    expect(nextPoint(world)!.i).toBe(0);
    const home = world.vessels[vesselId];
    placeVessel(home, 2000 + CONFIG.voyage.plan.reach.way + 50, 0, -3000, 0);
    stepWorld(world, [], 1 / 20);
    expect(world.plan!.next).toBe(0);
    // A crew-mate's boat gets there first: it counts.
    world.players['player-2'] = createPlayerState('player-2', 'Bosun');
    stepWorld(world, [{ playerId: 'player-2', targetId: ENVIRONMENT_ID, control: 'launchBoat', value: 1, ref: 'smallTug' } as Intent], 1 / 20);
    const tug = Object.values(world.vessels).find((v) => v.owner === 'player-2')!;
    placeVessel(tug, 2000, 0, -3000 + 40, 0);
    stepWorld(world, [], 1 / 20);
    expect(world.plan!.next).toBe(1);
    expect(world.plan!.note!.text).toMatch(/^Waypoint 1 reached\. Next: Stop 2/);
    placeVessel(tug, 4000, 0, -3000 + CONFIG.voyage.plan.reach.stop - 20, 0);
    stepWorld(world, [], 1 / 20);
    expect(nextPoint(world)).toBeNull();
    expect(world.plan!.note!.text).toMatch(/voyage done/);
    // A point taken off before the next one: the next one stays the same point.
    plan('add:way', 6000, -3000);
    plan('remove', 2000, -3000, 100);
    expect(world.plan!.next).toBe(1);
    expect(nextPoint(world)!.p.x).toBe(6000);
  });

  it('saved and read back; a malformed save is dropped; Go to the table puts you ashore at the start', () => {
    const { world, localPlayerId, plan } = game();
    plan('add:stop', PORTS[0].x, PORTS[0].z);
    plan('add:way', 500, 500);
    plan('zoom', PORTS[0].x, PORTS[0].z);
    const back = parsePlan(savePlanText(world.plan!))!;
    expect(back.points).toEqual(world.plan!.points);
    expect(back.view).toEqual(world.plan!.view);
    expect(parsePlan('not json')).toBeNull();
    expect(parsePlan(JSON.stringify({ points: [{ x: 'a' }, { x: 1, z: 2, kind: 'way', name: 'x' }], next: 9 }))!.points).toHaveLength(1);
    expect(parsePlan(JSON.stringify({ points: [{ x: 1, z: 2, kind: 'way' }], next: 9 }))!.next).toBe(1);
    expect(createPlan().points).toEqual([]);
    plan('goto');
    const p = world.players[localPlayerId];
    const q = quaySpot(null);
    expect(p.aboardVesselId).toBeNull();
    expect(p.position[0]).toBeCloseTo(q.x, 3);
    expect(p.position[2]).toBeCloseTo(q.z, 3);
  });

  it("the table stands at the harbour nearest you, holding it until another is clearly nearer; Go to the table lands you by the one nearest you", () => {
    const { world, vesselId, localPlayerId, plan } = game();
    const berth = (id: string) => BERTHS.find((b) => b.id === id)!;
    const start = berth(startBerthId());
    const home = PORTS.find((p) => p.id === start.portId)!;
    // At the start's harbour: the start's own berth.
    expect(tableBerthNear(home.x, home.z)).toBe(startBerthId());
    // At another harbour (with a cargo berth): its cargo berth, by the boat's place there.
    const port = PORTS.find((p) => BERTHS.some((b) => b.portId === p.id && b.id.endsWith('-cargo')) && p.id !== home.id && !FARMS.some((f) => f.port === p.id))!;
    expect(tableBerthNear(port.x, port.z)).toBe(`${port.id}-cargo`);
    // Held: a little nearer another harbour isn't enough to move it; well nearer is.
    const mid = (k: number): [number, number] => [home.x + (port.x - home.x) * k, home.z + (port.z - home.z) * k];
    const far = Math.hypot(port.x - home.x, port.z - home.z);
    const k = 0.5 + (CONFIG.voyage.plan.table.harbourHoldM * 0.4) / far;
    if (k < 0.95) {
      const nearest = PORTS.filter((p) => BERTHS.some((b) => b.portId === p.id) && !FARMS.some((f) => f.port === p.id)).sort((a, b) => Math.hypot(a.x - mid(k)[0], a.z - mid(k)[1]) - Math.hypot(b.x - mid(k)[0], b.z - mid(k)[1]))[0];
      if (nearest.id === port.id) expect(tableBerthNear(...mid(k), startBerthId())).toBe(startBerthId());
    }
    expect(tableBerthNear(port.x, port.z, startBerthId())).toBe(`${port.id}-cargo`);
    // Never a fish farm's feed barge.
    for (const f of FARMS) {
      const fp = PORTS.find((p) => p.id === f.port);
      if (fp) expect(berth(tableBerthNear(fp.x, fp.z)!).portId).not.toBe(fp.id);
    }
    // Go to the table, aboard your boat at that harbour: ashore by its table.
    stepWorld(world, [{ playerId: localPlayerId, targetId: vesselId, control: 'teleportToPort', value: 1, ref: port.id } as Intent], 1 / 20);
    world.players[localPlayerId].aboardVesselId = vesselId;
    plan('goto');
    const q = quaySpot(`${port.id}-cargo`);
    const p = world.players[localPlayerId];
    expect(p.aboardVesselId).toBeNull();
    expect(p.position[0]).toBeCloseTo(q.x, 3);
    expect(p.position[2]).toBeCloseTo(q.z, 3);
    // An old save's harbour is ignored (the table finds its own).
    expect(parsePlan(JSON.stringify({ points: [], harbour: port.id }))).toBeTruthy();
  });
});
