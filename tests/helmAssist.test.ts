/**
 * The helm assist panel (owner, Oct 2026): a box by the breaker panel with AUTO START (the
 * whole start-up) and DOCK (the menu's Dock), and the autopilot (holds the compass heading by
 * steering) with its own AUTOPILOT group on the console: AUTO, PORT 5° and STBD 5° (owner, Oct
 * 2026: "a separate control that goes on the main console ... two buttons which add 5 degrees
 * left and right"). A Shipyard choice with the advanced controls; modules/helmAssist,
 * vessel/autopilot.ts.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { RECIPES } from '../src/boats/library';
import { useDesign } from '../src/boats/sims';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { buildDesign } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../src/shipyard/designDoc';
import { compassHeading } from '../src/vessel/autopilot';
import { CONFIG } from '../src/config';
import { HELM_ASSIST } from '../src/modules/helmAssist';
import { berthPose } from '../src/vessel/physics/mooring';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;
const design = (id: string): ShipDesign => FLEET.find((f) => f.id === id)!.design;

afterAll(() => useDesign(DEFAULT_DESIGN));

function boat(defId: string, geography: 'openSea' | 'archipelago' = 'openSea') {
  const { world, vesselId } = createWorld(new IdFactory(), defId);
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.geography = geography;
  world.environment.waves = [];
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('the helm assist panel', () => {
  it('a Shipyard choice with the advanced controls: on the starboard wall aft of the breaker panel; a design with it travels as a link', () => {
    const pilot = buildDesign(design('pilotBoat'));
    expect(pilot.recipe.modules.some((m) => m.module === 'panel.helm-assist')).toBe(true);
    const at = pilot.hull.sockets.find((s) => s.id === 'helmAssist')!.transform.position;
    const breakers = pilot.hull.sockets.find((s) => s.id === 'breakerPanel')!.transform.position;
    expect(at[0]).toBeCloseTo(breakers[0], 6);
    expect(at[2]).toBeGreaterThan(breakers[2]);
    // Basic controls: no panel.
    expect(buildDesign({ ...design('pilotBoat'), controls: 0 }).recipe.modules.some((m) => m.module === 'panel.helm-assist')).toBe(false);
    // No short code holds it; her link does.
    expect(shortCode(design('pilotBoat'))).toBeNull();
    expect(readDesign(designToken(design('pilotBoat')))).toMatchObject({ design: design('pilotBoat') });
    // (The default design has a short code; the fleet's pilot boat has other link-only choices.)
    expect(shortCode({ ...DEFAULT_DESIGN, controls: 1, helmAssist: 0 })).not.toBeNull();
  });

  it('the autopilot is on the console, its own group of three (PORT 5°, AUTO lit while engaged, STBD 5°), not on the panel', () => {
    const pilot = buildDesign(design('pilotBoat'));
    const helm = pilot.recipe.modules.find((m) => m.socket === 'helm')!;
    const ap = ['apPort', 'apOn', 'apStbd'].map((id) => helm.modules!.find((m) => m.socket === id)!);
    expect(ap.map((m) => m.bind)).toEqual([{ press: 'autopilot.port' }, { press: 'autopilot.engage' }, { press: 'autopilot.starboard' }]);
    expect(ap[1].config).toMatchObject({ engrave: 'AUTO', lit: { key: 'autopilot.on' } });
    const cc = helm.config as { slots: Record<string, { position: number[] }>; groups?: { title: string; x: [number, number] }[]; faceGroups?: { title: string }[] };
    expect([...(cc.groups ?? []), ...(cc.faceGroups ?? [])].some((g) => g.title === 'AUTOPILOT')).toBe(true);
    // Side by side, port to starboard.
    const xs = ap.map((m) => cc.slots[m.socket].position[0]);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    // The panel by the breakers keeps AUTO START and DOCK only.
    expect(Object.keys(HELM_ASSIST.ports)).toEqual(['start', 'dock']);
    // Without the helm assist, no autopilot buttons.
    const none = buildDesign({ ...design('pilotBoat'), helmAssist: 0 }).recipe.modules.find((m) => m.socket === 'helm')!;
    expect(none.modules!.some((m) => m.socket.startsWith('ap'))).toBe(false);
  });

  it('every fleet boat with the advanced controls has it; the beginner boat does not', () => {
    for (const f of FLEET) expect(RECIPES[f.id].modules.some((m) => m.module === 'panel.helm-assist'), f.id).toBe(f.id !== 'starterBoat');
  });

  it('AUTO START: from cold and dark, one press and the engine runs', () => {
    const { v, send, run } = boat('pilotBoat');
    expect(v.engine.phase).toBe('off');
    send('helmAssist.autoStart', 1);
    run(6);
    expect(v.electrics!.master).toBe(1);
    expect(v.engine.phase).toBe('running');
  });

  it('AUTOPILOT: engaged while she swings, she comes back to that heading and holds it; the wheel lets it go', () => {
    const { v, send, run } = boat('fishingBoat');
    send('helmAssist.autoStart', 1);
    run(5);
    send('lever', 1);
    run(20);
    send('helm', 0.5);
    run(4);
    send('autopilot.engage', 1);
    const held = v.controls.autopilotHeading!;
    run(40);
    const err = (h: number) => Math.abs(((h - held + 540) % 360) - 180);
    expect(v.controls.autopilot).toBe(1);
    expect(err(compassHeading(v))).toBeLessThan(1.5);
    // Taking the wheel lets it go.
    send('helm', -0.2);
    run(0.1);
    expect(v.controls.autopilot).toBe(0);
    // A second press engages it again, and a third lets it go.
    send('autopilot.engage', 1);
    expect(v.controls.autopilot).toBe(1);
    send('autopilot.engage', 1);
    expect(v.controls.autopilot).toBe(0);
  });

  it('PORT 5° and STBD 5°: each press moves the heading it holds 5°, and she follows; off, they do nothing', () => {
    const { v, send, run } = boat('fishingBoat');
    send('helmAssist.autoStart', 1);
    run(5);
    send('lever', 0.6);
    run(15);
    send('autopilot.engage', 1);
    const held = v.controls.autopilotHeading!;
    const err = (h: number, to: number) => Math.abs(((h - to + 540) % 360) - 180);
    const step = CONFIG.modules.helmAssist.autopilot.stepDeg;
    send('autopilot.starboard', 1);
    send('autopilot.starboard', 1);
    expect(err(v.controls.autopilotHeading!, held + 2 * step)).toBeLessThan(1e-9);
    run(30);
    expect(err(compassHeading(v), held + 2 * step)).toBeLessThan(1.5);
    send('autopilot.port', 1);
    expect(err(v.controls.autopilotHeading!, held + step)).toBeLessThan(1e-9);
    run(30);
    expect(err(compassHeading(v), held + step)).toBeLessThan(1.5);
    // Round through north: 358° + 5° is 3°.
    v.controls.autopilotHeading = 358;
    send('autopilot.starboard', 1);
    expect(v.controls.autopilotHeading).toBeCloseTo(3, 9);
    // Let go: the buttons leave it alone.
    send('autopilot.engage', 1);
    const was = v.controls.autopilotHeading;
    send('autopilot.port', 1);
    expect(v.controls.autopilot).toBe(0);
    expect(v.controls.autopilotHeading).toBe(was);
  });

  it('AUTOPILOT needs the instruments live: with the master off it won’t engage, and lets go if it goes off', () => {
    const { v, send, run } = boat('lander');
    send('electrical.master', 0);
    send('autopilot.engage', 1);
    expect(v.controls.autopilot ?? 0).toBe(0);
    send('helmAssist.autoStart', 1);
    run(1);
    send('autopilot.engage', 1);
    expect(v.controls.autopilot).toBe(1);
    send('brk_instruments', 0);
    run(0.1);
    expect(v.controls.autopilot).toBe(0);
  });

  it('DOCK: does what the menu Dock does, at a berth in range', () => {
    const at = (control: string) => {
      const { world, v, send, run } = boat('lander', 'archipelago');
      const b = BERTHS.find((x) => x.id === 'calder-fuel')!;
      const p = berthPose(v, b);
      placeVessel(v, p.x, 0, p.z, b.headingDeg);
      run(1);
      send(control, 1);
      run(20);
      return { phase: v.mooring.phase, x: v.position[0], z: v.position[2], world };
    };
    const panel = at('helmAssist.dock');
    expect(panel.phase).toBe('moored');
    const menu = at('dock');
    expect(panel.phase).toBe(menu.phase);
    expect(panel.x).toBeCloseTo(menu.x, 6);
    expect(panel.z).toBeCloseTo(menu.z, 6);
  });
});
