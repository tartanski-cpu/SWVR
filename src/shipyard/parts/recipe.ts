/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her recipe: machinery, controls, lights and gear as modules.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import landingCraftRecipe from '../../boats/landingCraft.json';
import type { Mount, Recipe } from '../../modular/recipe';
import { houseFlare } from '../../vessel/houseFlare';
import { cellsOf, SCREENS, type ScreenName } from '../../controls/instruments';
import { packDash, packPanel, placeOnDash, type PanelGroup } from './consoleGrid';
import { BASE_TORQUE, type BuildArgs, type V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';
import type { HullDefPart } from './hullDef';
import type { FurniturePart } from './furniture';

/** Her recipe: the landing craft's as the template, with her machinery, her controls laid out on the console, her lights and her deck gear. */
export function recipePart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart & HullDefPart & FurniturePart) {
  const { code, d, id } = a;
  const { aFrame, ac, aft, anchorAt, at, basketAt, bowCleat, bowRamp, chartTableAt, consoleHalf, craneAt, cranePlaced, dip, dipZ, dp, eh, eng, engH, engL, engMid, engW, engX, fenderZs, front, gear, h, hasLamp, hasMonitor, helmAssist, house, hw, kw, lampFoot, lampOnRoof, lampRoof, layout, midCleat, monitorFoot, monitorOnRoof, monitorRoof, nozzle, obc, outboards, pdc, podPropD, podSet, pods, prop, propD, propPos, prot, pushFender, q, r2, ring, rnd, rodRack, roofBack, roofFront, roofThickness, roofTopAt, roofY, rs, rudderArea, rudderPos, sb, sdLegs, sdPropD, sdc, shaft, sideDoor, skiffAt, stack, stem, sternCleat, sternRoller, tankL, transom, twin, twinX, wall, winchAt, zHead } = p;
  // ── Recipe: the landing craft's, with her machinery, controls and places ──
  const recipe = structuredClone(landingCraftRecipe) as unknown as Recipe;
  recipe.id = `vessel.${id}`;
  recipe.name = `Shipyard design ${code}`;
  recipe.hull = `hull.${id}`;
  const k = kw / 150;
  // (A slower-revving engine, ENGINES ratedRpm, `rs` above: every rpm of the 1800 rpm curve
  // scaled by rs, its torque by k / rs (the same power at fewer revs is more torque). Its
  // friction follows the torque; its flywheel is heavier in the same proportion.)
  const kq = k / rs;
  const bySocket = (list: Mount[], id: string) => list.find((m) => m.socket === id);
  const engine = bySocket(recipe.modules, 'engine')!.config as Record<string, any>;
  Object.assign(engine.engine, {
    powerKw: kw,
    torqueCurve: BASE_TORQUE.map(([r, t]) => [Math.round(r * rs), Math.round(t * kq)]),
    frictionTorque: Math.round(40 * kq ** 0.6),
    inertia: Math.round(1.6 * kq * 10) / 10,
    starterTorque: Math.round(280 * Math.sqrt(kq)),
    // (Its own idle if it has one: the tug diesel's 450 rpm. Scaled from the 1800 rpm
    // engine's it was 360, so slow its six fired 18 times a second, heard as one thumping
    // cylinder, owner: "still sounds like a single cylinder"; 450 is usual for its kind.)
    idleRpm: 'idleRpm' in eng ? eng.idleRpm : Math.round(engine.engine.idleRpm * rs),
    ratedRpm: eng.ratedRpm,
    droopRpm: Math.round(engine.engine.droopRpm * rs),
    starterMaxRpm: Math.round(engine.engine.starterMaxRpm * rs),
    rackRiseRate: eng.rackRise,
    gearRatio: gear,
  });
  engine.engine.fuel = { ...engine.engine.fuel, tankL: tankL, startL: Math.round(tankL * 0.7) };
  engine.engine.thermal = { ...engine.engine.thermal, heatCapacity: Math.round(60 * k), exchangerKwPerK: Math.round(1.7 * k * 100) / 100 };
  Object.assign(engine.propeller, { diameter: propD, kt0: prop.kt0, j0: prop.j0, kq0: prop.kq0, jq0: prop.jq0, wake: prop.wake, thrustDeduction: prop.thrustDeduction, position: propPos });
  engine.sampleAt = rudderPos;
  engine.voice = eng.voice;
  engine.massKg = eng.kg;
  if (twin) engine.twin = { x: twinX };
  Object.assign(engine.maintenance, {
    engine: { ...engine.maintenance.engine, x: engX, z: rnd(engMid), length: engL, width: engW, height: engH },
    dipstick: [dip[0], dip[2]],
    filler: [engX, rnd(dipZ)],
    oilCan: [rnd(eh.x1 - 0.08), rnd(eh.z1 - 0.15)],
  });
  // Drawn as built (vessel/view/engineModels.ts): the Shipyard's model of her engine type, on her shaft line.
  engine.installed = { model: d.engine, size: [engL, engW, engH], xs: twin ? [-shaft.x, shaft.x] : [0], flangeY: rnd(shaft.flangeY), flangeZ: rnd(shaft.flangeZ), angleDeg: shaft.angleDeg };
  const rudder = bySocket(recipe.modules, 'rudder')!.config as Record<string, any>;
  Object.assign(rudder.rudder, { area: rudderArea, position: rudderPos });
  rudder.propeller = { wake: prop.wake, diameter: propD };
  rudder.nozzle = nozzle;
  engine.nozzle = nozzle;
  if (sdLegs) {
    // Her stern drives in place of the shaft and rudder: the outboards' module (the legs swing
    // to steer) with her inboard engine package, drawn inside against the transom.
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({
      socket: 'sternDrive',
      module: 'propulsion.outboard',
      config: {
        engine: engine.engine,
        propeller: { ...engine.propeller, diameter: sdPropD },
        units: sdLegs.units,
        mount: sdLegs.mount,
        steering: obc.steering,
        look: sdLegs.look,
        // (The inboard's electrics and oil, as its module has them: CONFIG.modules.dieselInboard.)
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + sdc.legKg,
        maintenance: engine.maintenance,
        voice: eng.voice,
        sterndrive: true,
        installed: engine.installed,
      },
    });
  }
  if (podSet) {
    // Her pod drives in place of the shafts and rudders, their engines drawn inside over them.
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({
      socket: 'pods',
      module: 'propulsion.pods',
      config: {
        engine: engine.engine,
        propeller: { ...engine.propeller, diameter: podPropD, wake: 0.02 },
        ...podSet,
        steering: pdc.steering,
        look: pdc.look,
        joystick: pdc.joystick,
        centreZ: rnd(h.lcb),
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + pdc.legKg,
        maintenance: engine.maintenance,
        voice: eng.voice,
        installed: engine.installed,
      },
    });
  }
  if (outboards) {
    // Her outboards in place of the inboard and its rudder; her upkeep (the oil checks) at the hatch as before.
    const maintenance = engine.maintenance;
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({ socket: 'outboards', module: 'propulsion.outboard', config: { ...outboards, maintenance } });
  }
  bySocket(recipe.modules, 'fuelTank')!.config = { tankL, startL: Math.round(tankL * 0.7) };
  for (const m of recipe.modules) {
    if (m.module === 'deck.cleat') (m.config as Record<string, any>).stations = { bow: bowCleat, stern: sternCleat, midship: midCleat ?? 0 };
  }
  // The skiff's painter's cleats (amidships, each side), with the skiff (if she's aboard).
  if (midCleat !== null && skiffAt)
    recipe.modules.push(
      { socket: 'cleatMidPort', module: 'deck.cleat', config: { end: 'midship', side: -1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
      { socket: 'cleatMidStbd', module: 'deck.cleat', config: { end: 'midship', side: 1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
    );
  // The searchlight on the roof or its pole (or none), and the fire monitor.
  if (lampFoot) bySocket(recipe.modules, 'searchlight')!.config = { position: [lampFoot[0], r2(lampFoot[1] + dp.lampHeight), lampFoot[2]], pole: { deckY: lampFoot[1] } };
  else if (hasLamp) bySocket(recipe.modules, 'searchlight')!.config = { position: lampRoof };
  else recipe.modules = recipe.modules.filter((m) => m.socket !== 'searchlight');
  if (monitorFoot) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: [monitorFoot[0], r2(monitorFoot[1] + dp.nozzleHeight), monitorFoot[2]], pole: { deckY: monitorFoot[1] } } });
  else if (hasMonitor) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: monitorRoof } }); // its gauge: on the console, below
  const fl = houseFlare(layout.wheelhouse!);
  const onFlaredRoof = ([x, y, z]: V3): V3 => (fl ? fl.at(x, y, z) : [x, y, z]).map((v, i) => (i === 1 ? v : r2(v))) as V3;
  bySocket(recipe.modules, 'navLights')!.config = {
    // The masthead light on its own pole from the roof (no signal mast on her).
    mast: { footY: roofTopAt(roofFront + 0.475) },
    lights: {
      masthead: [0, roofTopAt(roofFront + 0.475) + 1.1, roofFront + 0.475],
      // The sidelights on the house sides, above the windows, just aft of the header.
      // The sidelights on the roof's edges (the windows run up to it), just aft of the front glass.
      // (On the chamfered side at mid-thickness, just proud of it.)
      // (A faceted front's roof is cut back at its corners: they go back with it.)
      // (Raked out all round, the roof's edge is further out: they go with it, houseFlare.ts.)
      port: onFlaredRoof([-(hw + 0.15 - roofBack / 2 + 0.03), roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      starboard: onFlaredRoof([hw + 0.15 - roofBack / 2 + 0.03, roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      stern: [0, q.deckY(transom) + 0.6, transom - 0.05],
    },
  };
  // The console, laid out across her cabin: the landing craft's dash, widened or narrowed.
  const consoleMount = bySocket(recipe.modules, 'helm')!;
  const cc = consoleMount.config as Record<string, any>;
  // The helm's searchlight and monitor controls: always for a unit on the roof (the only
  // place to work it from); for one on a pole (which has its own) with the advanced controls.
  const lampAtHelm = lampOnRoof || (!!lampFoot && !!d.controls);
  const monitorAtHelm = monitorOnRoof || (!!monitorFoot && !!d.controls);
  // The panel's group colours (the reference console's), for the switch panel below (CS2).
  const colourOf = Object.fromEntries((cc.groups as { title: string; color: number }[]).map((gp) => [gp.title, gp.color]));
  if (!lampAtHelm) consoleMount.modules = consoleMount.modules!.filter((m) => m.socket !== 'spotlight' && m.socket !== 'spotJoystick');
  if (monitorAtHelm) {
    // FIRE PUMP beside SPOT (or in its place), the monitor's joystick aft on the same pedestal
    // as the searchlight's, and its FIRE gauge between them.
    const [px] = cc.pedestals.x.filter((x: number) => x < 0);
    cc.slots.monJoystick = { position: [px, 0.01, 0.23] };
    if (lampAtHelm) cc.slots.spotJoystick.position = [px, 0.01, -0.01];
    consoleMount.modules!.push(
      { socket: 'firePump', module: 'control.toggle', config: { label: 'FIRE PUMP (needs the engine running)', engrave: 'FIRE PUMP' }, bind: { value: 'firePump.on' } },
      { socket: 'monJoystick', module: 'control.joystick', config: { label: 'Fire monitor joystick', engrave: 'MONITOR', knob: '#d8301a', panRateDeg: 40 }, bind: { pan: 'monitor.pan', tilt: 'monitor.tilt' } },
    );
  }
  // The ANCHOR switch (in the DECK group with the skiff crane's button: the switch panel, below).
  if (anchorAt) consoleMount.modules!.push({ socket: 'anchor', module: 'control.toggle', config: { label: 'Anchor: let go / heave in', engrave: 'ANCHOR' }, bind: { value: 'anchor.letGo' } });
  // The dash along the console (cut short on a wide wheelhouse: consoleHalf), what's on it spread or closed up with it.
  const dashHalf = consoleHalf - 0.11;
  const sx = dashHalf / cc.dash.halfWidth;
  cc.dash.halfWidth = Math.round(dashHalf * 1000) / 1000;
  // The throttle (and its pedestal) beside the wheel, no further out than on the reference console
  // (owner: on a wide console, spread with it, it was out of reach in VR); closer on a narrow one.
  const throttleX = cc.slots.throttle.position[0] as number;
  const throttleAt = Math.round(throttleX * Math.min(1, sx) * 1000) / 1000;
  cc.pedestals.x = cc.pedestals.x.map((x: number) => (x === throttleX ? throttleAt : Math.round(x * sx * 1000) / 1000));
  for (const slot of Object.values(cc.slots) as { position: V3 }[]) slot.position = [Math.round(slot.position[0] * sx * 1000) / 1000, slot.position[1], slot.position[2]];
  cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], cc.slots.throttle.position[2]];
  if (pods) {
    // Pod drives: the black throttle, moved forward on its pedestal, and the helm joystick
    // aft of it with its JOYSTICK button between (CONFIG.shipyard.helm.podJoystick).
    const pj = CONFIG.shipyard.helm.podJoystick;
    cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], pj.throttleZ];
    cc.slots.podJoystick = { position: [throttleAt, 0.01, pj.stickZ] };
    const lever = consoleMount.modules!.find((m) => m.socket === 'throttle')!;
    lever.config = { ...lever.config, style: 'black' };
    consoleMount.modules!.push({ socket: 'podJoystick', module: 'control.helm-joystick', config: { button: pj.button } });
  }
  // Its screens in one row centred over the wheel, in their order, whichever she has (the basic
  // controls' two side by side), never spread with the dash; closer on a narrow one.
  // TOW LINE (owner, Oct 2026): with the advanced instruments, on a boat that can tow (her
  // stern roller is her tow point): last in the row, starboard of the engine monitor.
  if (sternRoller && d.controls) {
    cc.slots.towline = { position: [0, cc.slots.engineMonitor.position[1], cc.slots.engineMonitor.position[2]] };
    consoleMount.modules!.push({ socket: 'towline', module: 'instrument.screen', config: { screen: 'towline' } });
  }
  // ANCHOR (owner, Oct 2026: "is the chain going down? Is the anchor set? Is the chain going
  // up? Is it in?"): a quarter screen beside the speed screen, on any boat with an anchor.
  if (anchorAt) {
    cc.slots.anchorScreen = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push({ socket: 'anchorScreen', module: 'instrument.screen', config: { screen: 'anchor' } });
  }
  const screens = ['speed', 'anchorScreen', 'heading', 'rpm', 'engineMonitor', 'towline'].filter((id) => consoleMount.modules!.some((m) => m.socket === id && m.module === 'instrument.screen') && (d.controls || ['speed', 'anchorScreen', 'rpm'].includes(id)));
  // The dash as a grid of quarter cells (consoleGrid.ts; dynamic console sockets CS1): each
  // screen its own size (a full screen, a strip or a quarter: instruments.ts `cells`), placed
  // by its rules in this order, the half-height ones stacked two high in one screen's place
  // (owner, Oct 2026: "use the space above as well"), the row centred over the wheel. If the
  // row is longer than the dash (a small wheelhouse: owner, Oct 2026, the smallest landing
  // craft's overlapped), all of it smaller together until it fits. (Spacing them closer
  // without shrinking them overlapped them.)
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const sc = CONFIG.modules.screen.dash;
  const gap = CONFIG.shipyard.helm.screenGap;
  const cellsFor = (id: string) => cellsOf(SCREENS[(consoleMount.modules!.find((x) => x.socket === id)!.config as { screen: ScreenName }).screen]) as [number, number];
  const ROWS = 2;
  const grid = packDash(screens.map((id) => ({ id, cells: cellsFor(id) })), ROWS);
  const pitch = (sc.width + gap) / 2;
  const rowRoom = 2 * dashHalf - 2 * gap;
  const shrink = Math.min(1, rowRoom / (grid.cols * pitch - gap));
  // Her dash's grid, for the Shipyard (CS3: placing by hand) and the tests: its size and each screen's cells.
  cc.dashGrid = { cols: grid.cols, rows: ROWS, pitch: r3(pitch * shrink), places: grid.places };
  for (const gp of grid.places) {
    const at = placeOnDash(gp, grid.places, grid.cols, ROWS, pitch * shrink, gap * shrink, (sc.height / 2) * shrink);
    const slot = cc.slots[gp.id] as { position: V3 };
    slot.position = [r3(at.x), slot.position[1], slot.position[2]];
    // A strip or a quarter always says its size (and its rise, stacked); a full screen only when shrunk.
    const full = gp.w === 2 && gp.h === ROWS;
    if (shrink < 1 || !full || at.rise) {
      const m = consoleMount.modules!.find((q) => q.socket === gp.id)!;
      m.config = { ...m.config, width: r3(at.width), height: r3(at.height), ...(at.rise ? { rise: r3(at.rise) } : {}) };
    }
  }
  // A faceted front: the dash wraps round with it (console.standard's `wrap`), its wings set back as the outer windows are.
  // Its controls stay square to her (owner: forward is forward); its screens turn with the wings, flush with the dash's face.
  if (house.facet)
    cc.wrap = {
      centre: house.facet.centre,
      k: Math.round((house.facet.depth / (hw - house.facet.centre)) * 1e4) / 1e4,
      turn: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket),
      // The throttle stays beside the wheel where it is on a flat console (owner: set back with the wing it was out of reach in VR).
      fixed: ['throttle', 'podJoystick'],
    };
  // The advanced instruments (taken off again below for the basic controls), and the chart table.
  recipe.modules.push(
    { socket: 'chartplotter', module: 'nav.chartplotter' },
    { socket: 'navDisplay', module: 'instrument.screen', config: { screen: 'nav', mount: 'hung' } },
    // (As wide as fits port of the door, up to its own width.)
    { socket: 'whiteboard', module: 'furniture.whiteboard', config: { roller: { ...CONFIG.modules.whiteboard.roller, width: Math.round(Math.min(CONFIG.modules.whiteboard.roller.width, hw - wall - 0.1 - 0.2) * 100) / 100 } } },
    { socket: 'dutyBoard', module: 'furniture.duty-board' },
  );
  // The working lights (the workboat's, as modules): the floods aimed at the middle of the
  // foredeck and of the aft deck, and the overhead panel with their two switches (no FM set
  // in it: hers hangs on its own, out to starboard; no rail lights for now, owner).
  const zFore = (stem + front) / 2;
  const zAftDeck = (aft + transom) / 2;
  const lamps = {
    fore: { position: at.floodFore, target: [0, r2(q.deckY(zFore)), r2(zFore)] as V3 },
    aft: { position: at.floodAft, target: [0, r2(q.deckY(zAftDeck)), r2(zAftDeck)] as V3 },
  };
  const ohp = CONFIG.modules.overheadPanel;
  recipe.modules.push(
    { socket: 'floodFore', module: 'light.flood', config: { end: 'fore', lamps }, bind: { on: 'lights.deckFore' } },
    { socket: 'floodAft', module: 'light.flood', config: { end: 'aft', lamps }, bind: { on: 'lights.deckAft' } },
    {
      socket: 'overhead',
      module: 'panel.overhead',
      config: {
        width: 0.32,
        slots: { deckFore: { x: -0.06, hang: true }, deckAft: { x: 0.06, hang: true } },
        legends: [
          { text: 'FOREDECK', x: -0.06 },
          { text: 'AFT DECK', x: 0.06 },
        ],
        legend: ohp.legend,
      },
      modules: [
        { socket: 'deckFore', module: 'control.toggle', config: { label: 'Foredeck floodlight' }, bind: { value: 'lights.deckFore' } },
        { socket: 'deckAft', module: 'control.toggle', config: { label: 'Aft deck floodlight' }, bind: { value: 'lights.deckAft' } },
      ],
    },
  );
  if (chartTableAt) recipe.modules.push({ socket: 'chartTable', module: 'furniture.chart-table' });
  if (helmAssist) recipe.modules.push({ socket: 'helmAssist', module: 'panel.helm-assist' });
  if (stack) recipe.modules.push({ socket: 'exhaustStack', module: 'fitting.exhaust-stack', config: stack });
  if (!d.controls) {
    // Basic: wheel, throttle, starting (key, START, the lamps and the card), speed with
    // depth, rpm, the ANCHOR screen, and the VHF (owner, Oct 2026: every boat answers calls,
    // hears the forecasts and the harbours). No lights, searchlight, horn, wipers, heading,
    // engine monitor or FM radio. The searchlight's and monitor's controls stay if they're worked from here.
    const keep = ['wheel', 'throttle', 'podJoystick', 'start', 'key', 'lamps', 'card', 'speed', 'anchorScreen', 'rpm', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick', 'anchor'];
    consoleMount.modules = consoleMount.modules!.filter((m) => keep.includes(m.socket));
    // (The FM set and the advanced instruments come with the advanced controls, owner.)
    recipe.modules = recipe.modules.filter((m) => !['cabinLight', 'horn', 'wipers', 'fm', 'navLights', 'chartplotter', 'navDisplay', 'whiteboard', 'dutyBoard', 'overhead', 'floodFore', 'floodAft'].includes(m.socket));
  }
  // The switch panel as a row of switch cells (dynamic console sockets CS2; consoleGrid.ts
  // packPanel): LIGHTS, then SEARCH / FIRE, in from the port end; ENGINE, then DECK (the
  // ANCHOR switch, the skiff crane's button), in from the starboard end; the horn just port of
  // the wheel. Each group's members side by side in the middle of its run of cells, under its
  // coloured plate; the warning lamps and the start-up card in the middle of ENGINE's.
  {
    const hc = CONFIG.shipyard.helm;
    const has = (id: string) => consoleMount.modules!.some((m) => m.socket === id);
    const search = ['spotlight', 'firePump'].filter(has);
    const panel: PanelGroup[] = [
      { title: 'LIGHTS', color: colourOf.LIGHTS, side: 'port', members: ['navLights', 'cabinLight', 'wipers'].filter(has) },
      { title: search.length === 2 ? 'SEARCH · FIRE' : search[0] === 'firePump' ? 'FIRE' : 'SEARCH', color: colourOf.SEARCH, side: 'port', members: search },
      { title: '', color: 0, side: 'wheelPort', members: ['horn'].filter(has) },
      { title: 'ENGINE', color: colourOf.ENGINE, side: 'starboard', members: ['start', 'key'].filter(has) },
      { title: 'DECK', color: 0x8a6d2a, side: 'starboard', members: [...(anchorAt ? ['anchor'] : []), ...(skiffAt ? ['skiffCrane'] : [])] },
    ];
    const laid = packPanel(panel, dashHalf, hc.switchPitch, hc.wheelClear, hc.groupClear, hc.minPitch);
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    for (const [id, x] of Object.entries(laid.at)) {
      const was = cc.slots[id]?.position as V3 | undefined;
      cc.slots[id] = { position: [r3(x), was?.[1] ?? 0.01, was?.[2] ?? -0.2] };
    }
    cc.groups = laid.runs.filter((r) => r.group.title).map((r) => ({ title: r.group.title, color: r.group.color, x: [r3(r.x0 + hc.plateInset), r3(r.x1 - hc.plateInset)] }));
    const engine = laid.runs.find((r) => r.group.title === 'ENGINE');
    if (engine) {
      const mid = r3((engine.x0 + engine.x1) / 2);
      for (const id of ['lamps', 'card']) if (cc.slots[id]) cc.slots[id].position = [mid, cc.slots[id].position[1], cc.slots[id].position[2]];
    }
    // Her switch panel, for the Shipyard (CS3) and the tests: its pitch and each group's cells.
    cc.panelGrid = { pitch: r3(laid.pitch), runs: laid.runs.map((r) => ({ title: r.group.title, members: r.group.members, x: [r3(r.x0), r3(r.x1)] })) };
  }
  // Low windows (owner): the console's upright panel comes off, so you see down past it; its
  // screens stay where they were, each on a stalk from the desk (console.standard's `bare`).
  if (d.sills) cc.bare = { screens: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket) };
  if (hasMonitor && !monitorFoot) {
    // The roof monitor's FIRE gauge on the console, between the two joysticks.
    const [mx, , mz] = cc.slots.monJoystick.position as V3;
    const mon = bySocket(recipe.modules, 'fireMonitor')!;
    mon.config = { ...mon.config, gauge: { ...CONFIG.vessels.workboat.fireMonitor.gauge, position: [r2(at.console[0] + mx), r2(at.console[1] + 0.012), r2(at.console[2] + mz - 0.125 + sb(mx))] } };
  }
  if (!bowRamp) recipe.modules = recipe.modules.filter((m) => m.socket !== 'rampCabin' && m.socket !== 'rampBow');
  if (craneAt) {
    // Its control post goes inboard of it by itself (the module's seat), whichever way it faces.
    recipe.modules.push({ socket: 'deckCrane', module: 'deck.crane', ...(cranePlaced ? { config: { side: 'socket' } } : {}) });
  }
  // The working deck gear (version 10), and a hydraulic pump for whatever needs one.
  if (winchAt) recipe.modules.push({ socket: 'towWinch', module: 'deck.tow-winch' });
  if (sternRoller) recipe.modules.push({ socket: 'sternRoller', module: 'deck.stern-roller' });
  if (aFrame) recipe.modules.push({ socket: 'aFrame', module: 'deck.a-frame' }, { socket: 'trawl', module: 'fishing.trawl' });
  if (ring) recipe.modules.push({ socket: 'lifeRing', module: 'rescue.life-ring-station', config: { stow: ring.stow, cleat: ring.cleat } }, { socket: 'boatHook', module: 'rescue.boat-hook-rack', config: { stow: ring.hook } });
  if (rodRack) recipe.modules.push({ socket: 'rodRack', module: 'deck.rod-rack', config: rodRack });
  if (sideDoor)
    recipe.modules.push(
      { socket: 'sideDoorIn', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
      { socket: 'sideDoorOut', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
    );
  if (anchorAt) recipe.modules.push({ socket: 'anchor', module: 'deck.anchor-windlass', ...(bowRamp ? { config: { aft: ac.kedgeAft } } : {}) });
  if (skiffAt) {
    // Its SKIFF CRANE button on the dash, starboard of the wheel (beside the ANCHOR switch).
    const [bx, , bz] = cc.slots.skiffCrane.position as V3;
    recipe.modules.push({ socket: 'tenderCrane', module: 'deck.tender-crane', config: { consoleButton: [r2(at.console[0] + bx), r2(at.console[1] + 0.01), r2(at.console[2] + bz + sb(bx))] } });
  }
  if (craneAt || winchAt || skiffAt) recipe.modules.push({ socket: 'hydraulicPump', module: 'hydraulics.pto-pump' });
  if (basketAt) recipe.modules.push({ socket: 'fenders', module: 'deck.fenders', config: { z: fenderZs, basket: basketAt } });
  if (pushFender) recipe.modules.push({ socket: 'pushFender', module: 'hull.push-fender', config: pushFender });
  if (prot.side) recipe.modules.push({ socket: 'hullGuard', module: 'hull.guard', config: { kind: prot.side, aroundBow: !bowRamp } });
  // Her furniture (P5), each piece on its place.
  recipe.modules.push(...p.furnitureMounts);

  return { recipe };
}
export type RecipePart = ReturnType<typeof recipePart>;
