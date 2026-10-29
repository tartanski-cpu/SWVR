/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her recipe: machinery, controls, lights and gear as modules.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import landingCraftRecipe from '../../boats/landingCraft.json';
import type { Mount, Recipe } from '../../modular/recipe';
import { houseFlare } from '../../vessel/houseFlare';
import { cellsOf, SCREENS, type ScreenName, type TouchPage } from '../../controls/instruments';
import { dashCap, packDash, packPanel, panelKey, placeDashByHand, placeOnDash, placePanelByHand, SCREEN_NAMES, type GridPlace, type PanelGroup } from './consoleGrid';
import { DASH_SLOTS, dashCell, lowSills, PANEL_SLOTS } from '../design';
import { BASE_TORQUE, type BuildArgs, type V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';
import type { HullDefPart } from './hullDef';
import type { FurniturePart } from './furniture';
import type { HoldPart } from './hold';
import { electricOf, motorSpec } from './solar';

/**
 * An electric pod's steering (CONFIG.shipyard.electricPods): its lock, and its side as its
 * rudder's area: the strut (unless her foils' steered strut is it) and the nacelle.
 */
function electricSteering(look: { strutChord: number; podLength: number; podRadius: number }, strut: number, strutIsFoils: boolean): typeof CONFIG.modules.pods.steering & { fullLockToKn: number } {
  const area = (strutIsFoils ? 0 : strut * look.strutChord) + look.podLength * 2 * look.podRadius;
  const ep = CONFIG.shipyard.electricPods;
  return { ...CONFIG.modules.pods.steering, maxAngleDeg: ep.lockDeg, fullLockToKn: ep.fullLockToKn, legArea: Math.round(area * 100) / 100 };
}

/** Her recipe: the landing craft's as the template, with her machinery, her controls laid out on the console, her lights and her deck gear. */
export function recipePart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart & HullDefPart & FurniturePart & HoldPart) {
  const { code, d, id } = a;
  const { fendering, markings, bowStaple, towHook, aFrame, ac, anchorAt, hx, at, basketAt, bowCleat, bowFender, bowRamp, chartTableAt, consoleHalf, craneAt, cranePlaced, dip, dipZ, dp, eh, eng, engH, engL, engMid, engW, engX, fenderZs, front, gear, h, hasLamp, hasMonitor, helmAssist, house, hw, kw, lampFoot, lampOnRoof, lampRoof, layout, midCleat, monitorFoot, monitorOnRoof, monitorRoof, nozzle, obc, outboards, pdc, podPropD, podSet, pods, prop, propD, propPos, prot, pushFender, q, r2, ring, rnd, rodRack, roofBack, roofFront, roofThickness, roofTopAt, roofY, rs, rudderArea, rudderPos, sb, sdLegs, sdPropD, sdc, shaft, sideDoor, skiffAt, skiff2At, stack, sternCleat, sternRoller, tankL, transom, twin, twinX, wall, winchAt, zHead } = p;
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
  // Twin shaft engines are worked separately (owner, Oct 2026: a twin engine control, a START
  // each): a lever each on the console (control.twin-throttle, below).
  // (Twin stern drives too, each leg its own engine's: owner, Oct 2026; outboards keep one lever.)
  const splitTwin = !!twin && !pods && !outboards && (!sdLegs || sdLegs.units.length === 2);
  if (twin) engine.twin = { x: twinX, ...(splitTwin ? { split: true } : {}) };
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
  // The harbour tug's azimuth drives (owner, Oct 2026): her two engines worked separately, each
  // turning its Z-drive (modules/dieselInboard `azimuth`) in place of its shaft and rudder.
  if (p.zDriveSet && splitTwin) {
    engine.azimuth = p.zDriveSet;
    // (The drive's own bevel gears on top of her gearbox: CONFIG.modules.azimuth.driveRatio.)
    engine.engine.gearRatio = Math.round(engine.engine.gearRatio * CONFIG.modules.azimuth.driveRatio * 1000) / 1000;
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'rudder');
  }
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
        ...(splitTwin ? { split: true } : {}),
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
        propeller: { ...engine.propeller, diameter: podPropD, wake: 0.02, ...(p.electric ? { inertia: electricOf(d).motor.propInertia } : {}) },
        ...podSet,
        // (Electric pods steer wider, their whole side a rudder: CONFIG.shipyard.electricPods.)
        steering: p.electric ? electricSteering(p.base.foilPods ? CONFIG.shipyard.foilFerry.look : pdc.look, podSet.strut, !!p.base.foilPods) : pdc.steering,
        // (The foiling ferry's: a slim nacelle at the foot of each aft foil's strut.)
        look: p.base.foilPods ? CONFIG.shipyard.foilFerry.look : pdc.look,
        joystick: pdc.joystick,
        centreZ: rnd(h.lcb),
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + (p.electric ? electricOf(d).podKg : pdc.legKg),
        maintenance: engine.maintenance,
        voice: eng.voice,
        // (The foiling ferry's motors are in her pods, nothing drawn inside her; they rise with
        // her foils in SHALLOW, physics/foils.ts `retract`.)
        ...(p.base.foilPods ? (p.form.kind === 'lofted' && p.form.design.foils?.retract ? { retract: p.form.design.foils.retract } : {}) : { installed: engine.installed }),
        // The solar catamaran's electric motors, from her battery (CONFIG.shipyard.solarCat.motor; modules/pods).
        ...(p.electric ? { electric: motorSpec(d) } : {}),
        // (Electric twin pods each on its own lever: the solar catamaran's; owner, 28 Oct 2026.)
        ...(p.electric && podSet.units.length === 2 ? { split: true } : {}),
      },
    });
    // (Electric motors have no oil to check: no dipstick or oil can.)
    if (p.electric) {
      recipe.modules = recipe.modules.filter((m) => m.socket !== 'dipstick' && m.socket !== 'oilCan');
      const oily = (x: string) => x === 'control:dipstick' || x === 'control:oilCan';
      recipe.interlocks = (recipe.interlocks ?? []).filter((l) => l.limit || !l.disable?.every(oily)).map((l) => (l.disable ? { ...l, disable: l.disable.filter((x) => !oily(x)) } : l));
    }
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
  // (In the house's frame, then across to where it stands: an offset house's middle, `hx`.)
  const onFlaredRoof = ([x, y, z]: V3): V3 => (fl ? fl.at(x, y, z) : [x, y, z]).map((v, i) => (i === 0 ? r2(v + hx) : i === 1 ? v : r2(v))) as V3;
  bySocket(recipe.modules, 'navLights')!.config = {
    // The masthead light on its own pole from the roof (no signal mast on her).
    mast: { footY: roofTopAt(roofFront + 0.475) },
    lights: {
      masthead: [hx, roofTopAt(roofFront + 0.475) + 1.1, roofFront + 0.475],
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
  // Twin engines worked separately: the twin lever control in the single lever's place, and a
  // START for each (port's, then starboard's, in the ENGINE group with the key).
  if (splitTwin) {
    const lever = consoleMount.modules!.find((m) => m.socket === 'throttle')!;
    // (Azimuth drives: a lever each side of the wheel instead, below.)
    lever.module = 'control.twin-throttle';
    lever.config = {};
    const start = consoleMount.modules!.find((m) => m.socket === 'start')!;
    start.config = { ...start.config, label: 'START port engine (hold)', engrave: 'START P' };
    consoleMount.modules!.push({ socket: 'start2', module: 'control.push-button', config: { ...start.config, label: 'START starboard engine (hold)', engrave: 'START S', lit: { key: 'propulsion.state2', is: 'running' } }, bind: { press: 'ignition.start2' } });
  }
  // An electric boat's helm (owner, 28 Oct 2026: "the electric vessels don't need a start
  // button ... there should probably be a key to turn on the drive system ... a different set of
  // warning lights"): no START (the key switches her drive on: modules/pods), the key engraved
  // DRIVE, her own lamps (READY, NEUTRAL, BATT, SHORE, BILGE, HULL) and start-up card. Her
  // instruments come on with their breaker, as every boat's.
  if (p.electric) {
    consoleMount.modules = consoleMount.modules!.filter((m) => m.socket !== 'start' && m.socket !== 'start2');
    for (const m of consoleMount.modules) {
      if (m.socket === 'key') m.config = { ...m.config, engrave: 'DRIVE' };
      if (m.socket === 'lamps' || m.socket === 'card') m.config = { ...m.config, electric: true };
    }
  }
  // The ANCHOR switch (in the DECK group with the skiff crane's button: the switch panel, below).
  if (anchorAt) consoleMount.modules!.push({ socket: 'anchor', module: 'control.toggle', config: { label: 'Anchor: let go / heave in', engrave: 'ANCHOR' }, bind: { value: 'anchor.letGo' } });
  // The autopilot's buttons (with the helm assist panel; owner, Oct 2026: "a separate control that
  // goes on the main console"), its own AUTOPILOT group on the switch panel, below: AUTO holds the
  // heading she's on (lit while it does), PORT and STBD alter that heading a few degrees a press.
  if (helmAssist)
    consoleMount.modules!.push(
      { socket: 'apPort', module: 'control.push-button', config: { label: 'Autopilot: 5° to port', engrave: 'PORT 5°', mode: 'pulse', color: '#d0d0d0' }, bind: { press: 'autopilot.port' } },
      { socket: 'apOn', module: 'control.push-button', config: { label: 'AUTO: hold this heading (press again, or turn the wheel, to let go)', engrave: 'AUTO', mode: 'pulse', color: '#e0a020', lit: { key: 'autopilot.on' } }, bind: { press: 'autopilot.engage' } },
      { socket: 'apStbd', module: 'control.push-button', config: { label: 'Autopilot: 5° to starboard', engrave: 'STBD 5°', mode: 'pulse', color: '#d0d0d0' }, bind: { press: 'autopilot.starboard' } },
    );
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
  if (p.zDriveSet && splitTwin) {
    // Azimuth drives (owner, Oct 2026: "a twist and throttle ... at either side of the
    // operator ... one hand each", and "a smaller steering wheel" so they're close together):
    // a twist-and-throttle lever each side of the wheel, each on its own pedestal, the port
    // drive's to the left; TRANSIT on the starboard pedestal ahead of its lever; the port
    // pedestals' joysticks moved out to port, clear; and her wheel smaller
    // (CONFIG.modules.azimuth.console).
    const ac = CONFIG.modules.azimuth.console;
    const lever = consoleMount.modules!.find((m) => m.socket === 'throttle')!;
    Object.assign(lever, { module: 'control.azimuth-lever', config: { id: 'lever', side: 'port', name: 'PORT' }, bind: { angle: 'azimuth.demand', power: 'throttle.demand' } });
    consoleMount.modules!.push(
      { socket: 'throttle2', module: 'control.azimuth-lever', config: { id: 'lever2', side: 'stbd', name: 'STBD' }, bind: { angle: 'azimuth.demand2', power: 'throttle.demand2' } },
      { socket: 'aziTransit', module: 'control.toggle', config: { label: 'TRANSIT: the wheel steers both drives as rudders; the levers set the power (off: the levers steer)', engrave: 'TRANSIT' }, bind: { value: 'azimuth.transit' } },
      // SYNC (owner, 27 Oct 2026): on the port pedestal, ahead of its lever, TRANSIT's mirror.
      { socket: 'aziSync', module: 'control.azimuth-sync', config: { color: 0x3a9ad9 } },
    );
    const y = cc.slots.throttle.position[1];
    cc.slots.throttle.position = [-ac.leverX, y, ac.leverZ];
    cc.slots.throttle2 = { position: [ac.leverX, y, ac.leverZ] };
    cc.slots.aziTransit = { position: [ac.leverX, y, ac.transitZ] };
    cc.slots.aziSync = { position: [-ac.leverX, y, ac.transitZ] };
    const outmost = -(dashHalf - cc.pedestals.halfWidth);
    const out = (x: number) => Math.round(Math.max(outmost, x - ac.joystickShift) * 1000) / 1000;
    for (const id of ['spotJoystick', 'monJoystick']) if (cc.slots[id]) cc.slots[id].position = [out(cc.slots[id].position[0]), cc.slots[id].position[1], cc.slots[id].position[2]];
    cc.pedestals.x = [-ac.leverX, ac.leverX, ...cc.pedestals.x.filter((x: number) => x < 0 && x !== throttleAt).map(out)];
    const wheel = consoleMount.modules!.find((m) => m.socket === 'wheel');
    if (wheel) wheel.config = { ...CONFIG.modules.wheel, ...wheel.config, radius: ac.wheelRadius };
    // Her driving guide, on the port wall (places.ts `poster`; owner, Oct 2026).
    recipe.modules.push({ socket: 'poster', module: 'furniture.poster', config: { poster: 'azimuthGuide', width: CONFIG.modules.poster.width, height: CONFIG.modules.poster.height } });
  }
  if (pods) {
    // Pod drives: the black throttle, moved forward on its pedestal, and the helm joystick
    // aft of it with its JOYSTICK button between (CONFIG.shipyard.helm.podJoystick).
    const pj = CONFIG.shipyard.helm.podJoystick;
    cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], pj.throttleZ];
    cc.slots.podJoystick = { position: [throttleAt, 0.01, pj.stickZ] };
    const lever = consoleMount.modules!.find((m) => m.socket === 'throttle')!;
    lever.config = { ...lever.config, style: 'black' };
    // (Electric twin pods each on its own lever: the twin lever control in its place, a lever
    // for each motor, so one ahead and one astern turns her on the spot; owner, 28 Oct 2026.)
    if (p.electric && podSet && podSet.units.length === 2) {
      lever.module = 'control.twin-throttle';
      lever.config = {};
    }
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
  // EFFICIENCY (owner, 27 Oct 2026: "an efficiency instrument ... litres per nautical mile, so
  // that basically we can find the sweet spot"): with the advanced instruments, after the
  // engine monitor (on a touchscreen, its ECO page).
  if (d.controls) {
    cc.slots.efficiency = { position: [0, cc.slots.engineMonitor.position[1], cc.slots.engineMonitor.position[2]] };
    consoleMount.modules!.push({ socket: 'efficiency', module: 'instrument.screen', config: { screen: 'efficiency' } });
  }
  // SOLAR & BATTERY (owner, 27 Oct 2026; the solar catamaran's): with the advanced instruments
  // on an electric boat, after the efficiency screen (on a touchscreen, its SOLAR page).
  if (d.controls && p.electric && p.base.solarRoof) {
    cc.slots.solar = { position: [0, cc.slots.engineMonitor.position[1], cc.slots.engineMonitor.position[2]] };
    consoleMount.modules!.push({ socket: 'solar', module: 'instrument.screen', config: { screen: 'solar' } });
  }
  // A foiling boat's helm (owner, 28 Oct 2026: "Do 1, 3 and 4, three ride heights"; her foils
  // fly her, vessel/physics/foils.ts): FOIL / HULL and her ride height (LOW / NORM / HIGH) in
  // their own FOILS group on the switch panel, and the FOILS screen (her flight) on her dash,
  // whatever her instruments (on a touchscreen, its FOILS page).
  const foiler = p.form.kind === 'lofted' && !!p.form.design.foils;
  if (foiler) {
    cc.slots.foil = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push(
      { socket: 'foilMode', module: 'control.toggle', config: { label: 'FOIL / HULL / SHALLOW: forward, FOIL (she flies at speed); middle, HULL (kept on her hulls, foils down); aft, SHALLOW (foils raised, 1.0 m draught)', engrave: 'FOIL·HULL·SHALLOW', positions: 3, sweep: true }, bind: { value: 'foils.mode' } },
      { socket: 'foilRide', module: 'control.selector3', config: { label: 'Ride height: LOW, NORM or HIGH over the water (press to step)', engrave: 'RIDE', marks: ['LO', 'N', 'HI'] }, bind: { value: 'foils.ride' } },
      { socket: 'foil', module: 'instrument.screen', config: { screen: 'foil' } },
    );
  }
  // ANCHOR (owner, Oct 2026: "is the chain going down? Is the anchor set? Is the chain going
  // up? Is it in?"): a quarter screen beside the speed screen, on any boat with an anchor.
  if (anchorAt) {
    cc.slots.anchorScreen = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push({ socket: 'anchorScreen', module: 'instrument.screen', config: { screen: 'anchor' } });
  }
  // Old school (design.oldSchool, with the basic controls; owner, Oct 2026: "three tiers of
  // instruments"): round analogue gauges, each a quarter, in place of the screens: the compass
  // and the log, depth and the chain counter (with an anchor), revs, temperature and fuel.
  const oldSchool = !!d.oldSchool && !d.controls;
  const dials = ['dialCompass', 'dialSpeed', 'dialDepth', ...(anchorAt ? ['dialChain'] : []), 'dialRpm', 'dialTemp', 'dialFuel'];
  if (oldSchool) {
    consoleMount.modules = consoleMount.modules!.filter((m) => !['speed', 'rpm', 'anchorScreen'].includes(m.socket));
    for (const id of dials) {
      cc.slots[id] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
      consoleMount.modules!.push({ socket: id, module: 'instrument.screen', config: { screen: id } });
    }
  }
  // Touchscreens (design.touch, with the advanced controls; CS5, owner, Oct 2026: "just one
  // screen that you have tabs that you have to flip between"): one or two, in place of her
  // separate console screens, each with every page she has (the anchor's with an anchor, the
  // tow line's with a tow point); the first opens on SPEED, a second on ENGINE.
  const touch = d.controls ? Math.max(0, Math.min(2, d.touch ?? 0)) : 0;
  const touchIds = touch ? ['touch1', 'touch2'].slice(0, touch) : [];
  if (touch) {
    const pages: TouchPage[] = ['speed', ...(foiler ? (['foil'] as const) : []), 'heading', 'rpm', 'engineMonitor', 'efficiency', ...(p.electric && p.base.solarRoof ? (['solar'] as const) : []), ...(anchorAt ? (['anchor'] as const) : []), ...(sternRoller ? (['towline'] as const) : []), 'nav'];
    consoleMount.modules = consoleMount.modules!.filter((m) => !['speed', 'anchorScreen', 'heading', 'rpm', 'engineMonitor', 'efficiency', 'solar', 'towline', 'foil'].includes(m.socket));
    touchIds.forEach((id, k) => {
      cc.slots[id] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
      consoleMount.modules!.push({ socket: id, module: 'instrument.screen', config: { screen: 'touch', pages, channel: k ? 'touchPage2' : 'touchPage1', first: k ? 2 : 0 } });
    });
  }
  // The ship's clock (CS5; owner, Oct 2026: "a ship's clock would be good"): a quarter, last on
  // the dash, round with the old school gauges. (A touchscreen has the time on its tab bar.)
  const clockId = oldSchool ? 'dialClock' : 'clock';
  if (!touch) {
    cc.slots[clockId] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push({ socket: clockId, module: 'instrument.screen', config: { screen: clockId } });
  }
  // What the basic controls keep at the helm (the rest comes off with them, below).
  const BASIC_KEEP = ['wheel', 'throttle', 'throttle2', 'aziTransit', 'aziSync', 'podJoystick', 'foilMode', 'foilRide', 'foil', 'start', 'start2', 'key', 'lamps', 'card', 'navLights', 'speed', 'anchorScreen', 'rpm', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick', 'anchor', ...dials, 'clock', 'dialClock'];
  /** The switch panel's groups (CS2) from whichever switches she has (`has`). */
  const panelGroups = (has: (id: string) => boolean): PanelGroup[] => {
    const search = ['spotlight', 'firePump'].filter(has);
    return [
      { title: 'LIGHTS', color: colourOf.LIGHTS, side: 'port', members: ['navLights', 'cabinLight', 'wipers'].filter(has) },
      { title: search.length === 2 ? 'SEARCH · FIRE' : search[0] === 'firePump' ? 'FIRE' : 'SEARCH', color: colourOf.SEARCH, side: 'port', members: search },
      { title: '', color: 0, side: 'wheelPort', members: ['horn'].filter(has) },
      { title: p.electric ? 'DRIVE' : 'ENGINE', color: colourOf.ENGINE, side: 'starboard', members: ['start', 'start2', 'key'].filter(has) },
      { title: 'DECK', color: 0xd0a24c, side: 'starboard', members: [...(anchorAt ? ['anchor'] : []), ...(skiffAt ? ['skiffCrane'] : []), ...(skiff2At ? ['skiffCrane2'] : [])] }, // (the skiff crane's button is fitted after the panel's laid out)
      // FOIL / HULL and her ride height (a foiling boat's), with her drive's switches.
      { title: 'FOILS', color: 0x3a9ad9, side: 'starboard', members: ['foilMode', 'foilRide'].filter(has) },
      // (Last of the starboard side's: nearest the wheel, under the helmsman's hand.)
      { title: 'AUTOPILOT', color: 0xe0a020, side: 'starboard', members: ['apPort', 'apOn', 'apStbd'].filter(has) },
    ];
  };
  // Switches up onto the dash face (CS6; owner, Oct 2026: "the switches can go on the upright
  // part as well"): on a console too short for its flat switch panel (each side's groups at the
  // closest pitch, clear of the wheel's rim), whole groups move up onto the dash face beside
  // the screens, in CONFIG.shipyard.helm.faceSwitchOrder, until the rest fit; ENGINE takes its
  // warning lamps with it. Each is a strip of quarter cells on the dash's grid, two switches
  // to a cell. (Not with low sills: no dash face then. Not with the panel placed by hand: its
  // own rules, CS3.)
  const hcfg = CONFIG.shipyard.helm;
  const fitted = (id: string) => consoleMount.modules!.some((m) => m.socket === id) && (!!d.controls || BASIC_KEEP.includes(id));
  const groupsNow = panelGroups(fitted).filter((g) => g.members.length);
  const panelPinned = groupsNow.some((g) => d[PANEL_SLOTS[panelKey(g) as keyof typeof PANEL_SLOTS]]);
  const cellsOfGroup = (g: PanelGroup) => Math.max(g.cells ?? 0, g.members.length);
  /** The sides that don't fit on the flat panel (each side's groups at the closest pitch, `clear` of the wheel's middle; `centre`: in front of the wheel, the horn with the port side's). */
  const overflowing = (half: number, moved: string[], centre = false) =>
    (['port', 'starboard'] as const).filter((side) => groupsNow.filter((g) => (g.side === side || (centre && side === 'port' && g.side === 'wheelPort')) && !moved.includes(panelKey(g))).reduce((a, g) => a + cellsOfGroup(g), 0) * hcfg.minPitch > Math.max(0.01, half - (centre ? hcfg.centreClear : hcfg.groupClear)) + 1e-9);
  const panelFits = (half: number, moved: string[]) => overflowing(half, moved).length === 0;
  const movable = hcfg.faceSwitchOrder.filter((key) => groupsNow.some((g) => panelKey(g) === key));
  // Clear of the wheel if they fit so; else in front of it too (`inFront`; owner, Oct 2026),
  // and only then up onto the face, a group from a side that still doesn't fit at a time.
  const switchesAt = (half: number) => {
    const inFront = !lowSills(d) && !panelPinned && !panelFits(half, []);
    const moved: string[] = [];
    if (inFront)
      for (;;) {
        const over = overflowing(half, moved, true);
        const key = movable.find((k) => !moved.includes(k) && over.includes(groupsNow.find((g) => panelKey(g) === k)!.side as 'port' | 'starboard'));
        if (!over.length || !key) break;
        moved.push(key);
      }
    return { inFront, moved };
  };
  const { inFront, moved: toFace } = switchesAt(dashHalf);
  /** The face's switch strips (and ENGINE's lamps) as dash grid items: `sw:<group>`. */
  const faceItemsFor = (keys: string[]) =>
    keys.flatMap((key) => {
      const g = groupsNow.find((q) => panelKey(q) === key)!;
      const strip = { id: `sw:${key}`, cells: [Math.ceil(g.members.length / 2), 1] as [number, number] };
      return key === 'ENGINE' && fitted('lamps') ? [strip, { id: 'sw:lamps', cells: [2, 1] as [number, number] }] : [strip];
    });
  // (The warning lamps' row is wider than ENGINE's plate: on a console shorter than any before
  // CS6, `lampsUpBelow`, it would run under the wheel's rim, so it goes up on the face too.)
  const lampsUp = !lowSills(d) && !panelPinned && !toFace.includes('ENGINE') && fitted('lamps') && 2 * (dashHalf + 0.11) < hcfg.lampsUpBelow;
  const faceItems = [...faceItemsFor(toFace), ...(lampsUp ? [{ id: 'sw:lamps', cells: [2, 1] as [number, number] }] : [])];
  const screens = (touch ? touchIds : oldSchool ? [...dials, 'foil', clockId] : ['speed', 'anchorScreen', 'foil', 'heading', 'rpm', 'engineMonitor', 'efficiency', 'solar', 'towline', clockId]).filter((id) => consoleMount.modules!.some((m) => m.socket === id && m.module === 'instrument.screen') && (d.controls || oldSchool || ['speed', 'anchorScreen', 'foil', 'rpm', 'clock'].includes(id)));
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
  // (Each screen's cells read once, here, while every one is still on the console: one with no
  // room on a dash laid out by hand comes off it below, but still counts in the shortest console
  // that holds them all. Read after, a missing one crashed the builder: review 24 Oct 2026.)
  const screenCells = new Map(screens.map((id) => [id, cellsOf(SCREENS[(consoleMount.modules!.find((x) => x.socket === id)!.config as { screen: ScreenName }).screen]) as [number, number]]));
  const cellsFor = (id: string) => screenCells.get(id)!;
  const ROWS = 2;
  const items = [...screens.map((id) => ({ id, cells: cellsFor(id) })), ...faceItems];
  const grid = packDash(items, ROWS);
  const pitch = (sc.width + gap) / 2;
  const rowRoom = 2 * dashHalf - 2 * gap;
  // The dash's whole grid, for placing by hand (CS3): as many columns as it has room for.
  const whole = dashCap(rowRoom, pitch, gap, grid.cols);
  const want = Object.fromEntries(screens.map((id) => [id, dashCell(d[DASH_SLOTS[id as keyof typeof DASH_SLOTS]] ?? 0)]));
  const byHand = screens.some((id) => want[id]);
  /** Each screen at its place on the dash: the automatic row (centred, smaller together if it's long), or placed by hand on the whole grid. */
  const faceAt: Record<string, { x: number; rise: number; width: number; height: number }> = {};
  let dashScale = 1;
  // A faceted front's dash (CS6 fix; owner, Oct 2026, the pilot boat: "some of the instruments
  // are effectively clipped"): its wings are set back and turned, so a screen straddling a
  // wing's corner was half buried in the wing. Laid out facet by facet instead: the middle
  // face's columns centred over the wheel, each wing's from its corner outward along its
  // face, the columns split between them only where no screen spans; all smaller together if
  // they don't fit (facetPlan).
  const facet = house.facet ? { c: house.facet.centre, k: house.facet.depth / (hw - house.facet.centre) } : null;
  const facetCos = facet ? Math.cos(Math.atan(facet.k)) : 1;
  type FacetPlan = { a: number; b: number; k: number };
  const facetPlan = (places: GridPlace[], cols: number): FacetPlan | null => {
    if (!facet) return null;
    const splits = [0, cols, ...Array.from({ length: cols }, (_, i) => i).filter((i) => i > 0 && i % 2 === 0)].filter((i) => !places.some((q) => q.col < i && i < q.col + q.w));
    const wingRoom = (dashHalf - facet.c) / facetCos - 0.01;
    for (let k = 1; k >= 0.3; k -= 0.01) {
      const p = pitch * k;
      let best: FacetPlan | null = null;
      let bestScore = -Infinity;
      for (const a of splits)
        for (const b of splits) {
          if (b < a) continue;
          if (b > a && (b - a) * p - gap * k > 2 * facet.c - 0.02) continue;
          if (a * p > wingRoom || (cols - b) * p > wingRoom) continue;
          const score = (b - a) * 100 - Math.abs(a - (cols - b));
          if (score > bestScore) [best, bestScore] = [{ a, b, k }, score];
        }
      if (best) return best;
    }
    return null;
  };
  /** A column position (in columns, the row's left edge 0) to x on the faceted dash. */
  const facetX = (u: number, plan: FacetPlan) => {
    const p = pitch * plan.k;
    const gk = gap * plan.k;
    if (u >= plan.a && u <= plan.b) return (u - (plan.a + plan.b) / 2) * p;
    const s = (u < plan.a ? plan.a - u : u - plan.b) * p + gk / 2;
    return (u < plan.a ? -1 : 1) * (facet!.c + s * facetCos);
  };
  const fit = (places: GridPlace[], cols: number, p: number, snap: boolean, plan: FacetPlan | null = null) => {
    const k = p / pitch;
    dashScale = k;
    for (const gp of places) {
      const at = placeOnDash(gp, places, cols, ROWS, p, gap * k, (sc.height / 2) * k, snap);
      if (plan) at.x = facetX((at.x - (-cols * p + gap * k) / 2 + (gap * k) / 2) / p, plan);
      // (A switch strip on the face: its switches are placed on the leaning face below.)
      if (gp.id.startsWith('sw:')) {
        faceAt[gp.id] = at;
        continue;
      }
      const slot = cc.slots[gp.id] as { position: V3 };
      slot.position = [r3(at.x), slot.position[1], slot.position[2]];
      // A strip or a quarter always says its size (and its rise, stacked); a full screen only when smaller.
      const full = gp.w === 2 && gp.h === ROWS;
      if (k < 1 || !full || at.rise) {
        const m = consoleMount.modules!.find((q) => q.socket === gp.id)!;
        m.config = { ...m.config, width: r3(at.width), height: r3(at.height), ...(at.rise ? { rise: r3(at.rise) } : {}) };
      }
    }
  };
  let shown: GridPlace[];
  if (!byHand) {
    const plan = facetPlan(grid.places, grid.cols);
    const shrink = plan ? plan.k : Math.min(1, rowRoom / (grid.cols * pitch - gap));
    fit(grid.places, grid.cols, pitch * shrink, true, plan);
    // (On the whole grid, for the Shipyard: the row in its middle.)
    const off = Math.floor((whole.cap - grid.cols) / 2);
    shown = grid.places.map((gp) => ({ ...gp, col: gp.col + off }));
  } else {
    const put = placeDashByHand(items, ROWS, whole.cap, want);
    fit(put.places, whole.cap, whole.pitch, false);
    shown = put.places;
    const named = (id: string) => (SCREEN_NAMES[id] ?? id).toLowerCase();
    for (const id of put.moved.filter((q) => !q.startsWith('sw:'))) p.warnings.push(put.places.some((q) => q.id === id) ? `The ${named(id)} screen doesn't fit where it was placed on the dash: put where the rules would.` : `No room on the dash for the ${named(id)} screen.`);
    // (No room at all: off the console.)
    consoleMount.modules = consoleMount.modules!.filter((m) => !(m.module === 'instrument.screen' && screens.includes(m.socket) && !put.places.some((q) => q.id === m.socket)));
  }
  // Her dash's grid, for the Shipyard (CS3) and the tests: its whole size, each screen's cells on it, whether placed by hand.
  cc.dashGrid = { cap: whole.cap, rows: ROWS, pitch: r3(whole.pitch), places: shown, byHand };
  // The shortest console that holds all of it full size (CS6, for the Shipyard): in 5 cm steps,
  // the first whose dash holds its screens and the switch groups the rules move up onto its
  // face (switchesAt) at full pitch, its flat panel the rest. Shorter, and the screens are
  // drawn smaller together; the Shipyard says so.
  {
    const fullSize = (half: number) => {
      const { moved } = switchesAt(half);
      const up = !lowSills(d) && !panelPinned && !moved.includes('ENGINE') && fitted('lamps') && 2 * (half + 0.11) < hcfg.lampsUpBelow;
      const cols = packDash([...screens.map((id) => ({ id, cells: cellsFor(id) })), ...faceItemsFor(moved), ...(up ? [{ id: 'sw:lamps', cells: [2, 1] as [number, number] }] : [])], ROWS).cols;
      return (cols * pitch - gap) / 2 + gap <= half + 1e-9 && overflowing(half, moved, moved.length > 0 || !panelFits(half, [])).length === 0;
    };
    let len = 0.8;
    while (len < hcfg.maxConsole && !fullSize(len / 2 - 0.11)) len = Math.round((len + 0.05) * 100) / 100;
    cc.consoleMin = len;
    // (Only for a console shorter than any before CS6, set short or in a narrow wheelhouse: a long
    // row on a small boat was always drawn smaller together, quietly.)
    if ((d.consoleLen || 2 * (dashHalf + 0.11) < hcfg.lampsUpBelow) && dashScale < 0.98) p.warnings.push(`Her console is too short to show her instruments full size: drawn at ${Math.round(dashScale * 100)}%. A console of ${(cc.consoleMin as number).toFixed(2)} m holds them full size${d.controls && !touch ? ' (or a touchscreen needs less)' : ''}.`);
  }
  // The dash's face leans back as far as its screens do (from its foot, so the switch panel in
  // front stays as it was; never so far its top is under 2 cm deep), and the screens and gauges
  // lie flat on it (owner, Oct 2026: "I'd certainly not like the gauges or the instruments
  // floating"). Not with low sills: the dash comes off then, its screens on stalks.
  if (!lowSills(d)) {
    const dd = cc.dash as { front: number; aft: number; bottom: number; top: number };
    const dashY0 = (cc.slots.speed?.position[1] ?? 0.21) as number;
    // (Raised a little first: the lower row's foot was behind the ledge in front of the dash.)
    for (const m of consoleMount.modules!) if (m.module === 'instrument.screen' && (m.config as { mount?: string } | undefined)?.mount !== 'hung' && cc.slots[m.socket]) {
      const p = cc.slots[m.socket].position as V3;
      cc.slots[m.socket].position = [p[0], r3(p[1] + CONFIG.shipyard.helm.screenLift), p[2]];
    }
    const lean = Math.min(Math.tan((sc.tiltDeg * Math.PI) / 180), (dd.aft - dd.front - 0.02) / (dd.top - dd.bottom));
    const leanDeg = (Math.atan(lean) * 180) / Math.PI;
    cc.leanDeg = Math.round(leanDeg * 100) / 100;
    for (const m of consoleMount.modules!) {
      const conf = m.config as { mount?: string; screen?: string } | undefined;
      if (m.module !== 'instrument.screen' || conf?.mount === 'hung' || !cc.slots[m.socket]) continue;
      // (On a faceted dash's wing, turned with it: the sheared wing face leans less in the wing's own frame, by its cosine.)
      const onWing = facet && Math.abs(cc.slots[m.socket].position[0]) > facet.c + 1e-6;
      const l = onWing ? lean * facetCos : lean;
      m.config = { ...m.config, tiltDeg: r3((Math.atan(l) * 180) / Math.PI), faceBack: r3((cc.slots[m.socket].position[1] - dd.bottom) * l) };
    }
    // The switch strips on the face (CS6): each group's switches across its cells, a little below
    // the strip's middle (its coloured strip and title above them, their labels below), standing out square from the leaning face;
    // its plate and title behind them (console.standard `faceGroups`). ENGINE's lamps in a row
    // on their own strip; its start-up card stays on the flat panel, at the starboard end.
    const faceZ = (y: number) => dd.aft - (y - dd.bottom) * lean;
    const rot: V3 = [r3(90 - cc.leanDeg), 0, 0];
    const faceGroups: { title: string; color: number; x: [number, number]; y: [number, number] }[] = [];
    for (const [id, at] of Object.entries(faceAt)) {
      const key = id.slice(3);
      const yc = dashY0 + hcfg.screenLift + at.rise * Math.cos(Math.atan(lean));
      const halfH = (at.height / 2) * Math.cos(Math.atan(lean));
      if (key === 'lamps') {
        cc.slots.lamps = { position: [r3(at.x), r3(yc), r3(faceZ(yc) + 0.003)], rotationDeg: rot };
        const lampMod = consoleMount.modules!.find((m) => m.socket === 'lamps');
        // (Spread over the strip by how many lamps: an electric boat's six, a diesel's nine.)
        if (lampMod) lampMod.config = { ...lampMod.config, spacing: r3((at.width * 0.92) / (p.electric ? 6 : 9)) };
        continue;
      }
      const g = groupsNow.find((q) => panelKey(q) === key)!;
      const ys = yc - 0.008;
      g.members.forEach((mid, i) => {
        const x = at.x - at.width / 2 + ((i + 0.5) * at.width) / g.members.length;
        // (A toggle turned a quarter on the face: its plate's long side across, so it fits the strip's height; it rocks side to side.)
        const toggle = consoleMount.modules!.some((m) => m.socket === mid && m.module === 'control.toggle');
        cc.slots[mid] = { position: [r3(x), r3(ys), r3(faceZ(ys) + 0.002)], rotationDeg: toggle ? [0, 90, rot[0]] : rot }; // (socket turns apply Z, X, then Y: tipped, then swung round to face aft)
      });
      faceGroups.push({ title: g.title || 'HORN', color: g.color, x: [r3(at.x - at.width / 2 + 0.008), r3(at.x + at.width / 2 - 0.008)], y: [r3(yc - halfH + 0.004), r3(yc + halfH - 0.004)] });
    }
    if (faceGroups.length) cc.faceGroups = faceGroups;
    if (toFace.includes('ENGINE') && cc.slots.card) cc.slots.card.position = [r3(dashHalf - 0.13), cc.slots.card.position[1], cc.slots.card.position[2]];
    if (cc.wrap) cc.wrap.turn = [...(cc.wrap.turn ?? []), ...Object.keys(faceAt).flatMap((id) => (id === 'sw:lamps' ? ['lamps'] : groupsNow.find((q) => panelKey(q) === id.slice(3))?.members ?? []))];
  }
  // A faceted front: the dash wraps round with it (console.standard's `wrap`), its wings set back as the outer windows are.
  // Its controls stay square to her (owner: forward is forward); its screens turn with the wings, flush with the dash's face.
  if (house.facet)
    cc.wrap = {
      centre: house.facet.centre,
      k: Math.round((house.facet.depth / (hw - house.facet.centre)) * 1e4) / 1e4,
      // (And the warning lamps' row: on a wing it lies along it, as the plates do.)
      turn: [...consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket), 'lamps'],
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
  // (Each beam narrowed, if need be, to stop short of the wheelhouse inside: places.ts floodLamps.)
  const lamps = p.floodLamps;
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
    // hears the forecasts and the harbours), and her navigation lights and their switch (owner,
    // Oct 2026: in every tier). No cabin light, searchlight, horn, wipers, heading, engine
    // monitor or FM radio. The searchlight's and monitor's controls stay if they're worked from here.
    consoleMount.modules = consoleMount.modules!.filter((m) => BASIC_KEEP.includes(m.socket));
    // (The FM set and the advanced instruments come with the advanced controls, owner.)
    recipe.modules = recipe.modules.filter((m) => !['cabinLight', 'horn', 'wipers', 'fm', 'chartplotter', 'navDisplay', 'whiteboard', 'dutyBoard', 'overhead', 'floodFore', 'floodAft'].includes(m.socket));
  }
  // The switch panel as a row of switch cells (dynamic console sockets CS2; consoleGrid.ts
  // packPanel): LIGHTS, then SEARCH / FIRE, in from the port end; ENGINE, then DECK (the
  // ANCHOR switch, the skiff crane's button), in from the starboard end; the horn just port of
  // the wheel. Each group's members side by side in the middle of its run of cells, under its
  // coloured plate; the warning lamps and the start-up card in the middle of ENGINE's.
  {
    const hc = CONFIG.shipyard.helm;
    const has = (id: string) => consoleMount.modules!.some((m) => m.socket === id);
    // (Less the groups moved up onto the dash face.)
    // (In front of the wheel too: the horn with the port side's groups, nearest the middle.)
    const panel: PanelGroup[] = panelGroups(has)
      .filter((g) => !toFace.includes(panelKey(g)))
      .map((g) => (inFront && g.side === 'wheelPort' ? { ...g, side: 'port' as const } : g));
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    // The panel's whole row of cells, for placing by hand (CS3): as many as it has room for.
    const cap = Math.max(1, Math.floor((2 * dashHalf) / hc.switchPitch + 1e-9));
    const cellP = (2 * dashHalf) / cap;
    const cellOf = (key: string) => {
      const v = d[PANEL_SLOTS[key as keyof typeof PANEL_SLOTS]] ?? 0;
      return v ? v - 1 : null;
    };
    const want = Object.fromEntries(panel.map((g) => [panelKey(g), cellOf(panelKey(g))]));
    const byHand = panel.some((g) => g.members.length && want[panelKey(g)] !== null);
    let laid: { at: Record<string, number>; runs: { group: PanelGroup; x0: number; x1: number }[]; pitch: number };
    if (!byHand) laid = packPanel(panel, dashHalf, hc.switchPitch, hc.wheelClear, inFront ? hc.centreClear : hc.groupClear, hc.minPitch);
    else {
      // Placed by hand: each group from its cell, its members a cell apart in the middle of its run.
      const put = placePanelByHand(panel, cap, want);
      const at: Record<string, number> = {};
      const runs: { group: PanelGroup; x0: number; x1: number }[] = [];
      for (const g of panel) {
        const k = put.starts[panelKey(g)];
        if (k === undefined || !g.members.length) continue;
        const n = Math.max(g.cells ?? 0, g.members.length);
        const x0 = -dashHalf + k * cellP;
        g.members.forEach((id, i) => (at[id] = x0 + ((n - g.members.length) / 2 + i + 0.5) * cellP));
        runs.push({ group: g, x0, x1: x0 + n * cellP });
      }
      for (const key of put.moved) p.warnings.push(put.starts[key] !== undefined ? `The ${key === 'horn' ? 'horn' : key} switches don't fit where they were placed on the console: put where the rules would.` : `No room on the console for the ${key === 'horn' ? 'horn' : key} switches.`);
      // (No room at all: those switches off the console.)
      const off = panel.filter((g) => put.starts[panelKey(g)] === undefined).flatMap((g) => g.members);
      consoleMount.modules = consoleMount.modules!.filter((m) => !off.includes(m.socket));
      laid = { at, runs, pitch: cellP };
    }
    for (const [id, x] of Object.entries(laid.at)) {
      const was = cc.slots[id]?.position as V3 | undefined;
      cc.slots[id] = { position: [r3(x), was?.[1] ?? 0.01, was?.[2] ?? -0.2] };
    }
    cc.groups = laid.runs.filter((r) => r.group.title).map((r) => ({ title: r.group.title, color: r.group.color, x: [r3(r.x0 + hc.plateInset), r3(r.x1 - hc.plateInset)] }));
    const engine = laid.runs.find((r) => panelKey(r.group) === 'ENGINE');
    if (engine) {
      const mid = r3((engine.x0 + engine.x1) / 2);
      for (const id of lampsUp ? ['card'] : ['lamps', 'card']) if (cc.slots[id]) cc.slots[id].position = [mid, cc.slots[id].position[1], cc.slots[id].position[2]];
      // (The lamps' row is wider than ENGINE's plate: kept on the console, CS6.)
      // (An electric boat's row: six lamps, not nine.)
      const halfRow = ((p.electric ? 6 : 9) * CONFIG.modules.warningLamps.spacing) / 2;
      if (cc.slots.lamps && !lampsUp) cc.slots.lamps.position = [r3(Math.min(mid, Math.max(0, dashHalf - halfRow))), cc.slots.lamps.position[1], cc.slots.lamps.position[2]];
    }
    // Her switch panel, for the Shipyard (CS3) and the tests: its whole row of cells, whether
    // placed by hand, and each group's members, its run (m) and its first cell on the row.
    const runs = laid.runs.map((r) => ({ key: panelKey(r.group), title: r.group.title, color: r.group.color, members: r.group.members, n: Math.max(r.group.cells ?? 0, r.group.members.length), start: Math.max(0, Math.round((r.x0 + dashHalf) / cellP)), x: [r3(r.x0), r3(r.x1)] }));
    // (Closed up closer than a cell, the rules' groups would overlap on the row of cells, and
    // pinning them where they stand would put some back: nudged apart, in their order along it,
    // as far as the row has room.)
    const along = [...runs].sort((u, v) => u.x[0] - v.x[0]);
    for (let i = 1; i < along.length; i++) along[i].start = Math.max(along[i].start, along[i - 1].start + along[i - 1].n);
    for (let i = along.length - 1; i >= 0; i--) along[i].start = Math.max(0, Math.min(along[i].start, (i + 1 < along.length ? along[i + 1].start : cap) - along[i].n));
    cc.panelGrid = { cap, cell: r3(cellP), pitch: r3(laid.pitch), byHand, runs };
  }
  // Low windows (owner): the console's upright panel comes off, so you see down past it; its
  // screens stay where they were, each on a stalk from the desk (console.standard's `bare`).
  if (lowSills(d)) cc.bare = { screens: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket) };
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
  // A tug's tow point is her towing hook near amidships (deckGear.ts towHook), not the roller.
  // A tug towing over her bow: her staple at the stem is her tow point (deckGear.ts bowStaple).
  if (bowStaple) recipe.modules.push({ socket: 'bowStaple', module: 'deck.bow-staple', config: { height: bowStaple.height, halfGap: 0.25 } });
  if (sternRoller) recipe.modules.push({ socket: 'sternRoller', module: 'deck.stern-roller', ...(towHook ? { config: { hook: towHook } } : {}) });
  if (aFrame) recipe.modules.push({ socket: 'aFrame', module: 'deck.a-frame' }, { socket: 'trawl', module: 'fishing.trawl' });
  // The dive A-frame and its sub (design.diveFrame): where it stands on her, and its legs.
  if (p.diveFrame) recipe.modules.push({ socket: 'diveFrame', module: 'deck.dive-frame', config: { at: p.diveFrame.place, legLength: p.diveFrame.legLength } });
  // The trawl deck gear (step 2 toward a trawler), with the A-frame.
  if (p.netDrumAt) recipe.modules.push({ socket: 'netDrum', module: 'deck.net-drum' });
  if (p.trawlWinchesAt) recipe.modules.push({ socket: 'trawlWinches', module: 'deck.trawl-winches', config: { ...p.trawlWinchesAt } });
  // The line hauler at her starboard rail (longlining).
  if (p.lineHaulerAt) recipe.modules.push({ socket: 'lineHauler', module: 'deck.line-hauler' });
  if (ring) recipe.modules.push({ socket: 'lifeRing', module: 'rescue.life-ring-station', config: { stow: ring.stow, cleat: ring.cleat } }, { socket: 'boatHook', module: 'rescue.boat-hook-rack', config: { stow: ring.hook } });
  if (rodRack) recipe.modules.push({ socket: 'rodRack', module: 'deck.rod-rack', config: rodRack });
  if (sideDoor)
    recipe.modules.push(
      { socket: 'sideDoorIn', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
      { socket: 'sideDoorOut', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
    );
  if (anchorAt) recipe.modules.push({ socket: 'anchor', module: 'deck.anchor-windlass', ...(bowRamp ? { config: { aft: ac.kedgeAft } } : {}) });
  // Each ship's boat's crane (a second on a big boat: design.skiff2, owner, 28 Oct 2026), its
  // button on the dash, starboard of the wheel (beside the ANCHOR switch). (The rescue boat's
  // bigger crane, for her: design.rescueBoat.) With two, each button and crane says whose it
  // is: SKIFF CRANE and RIB CRANE (or 1 and 2, if both are the same boat).
  const boats = [skiffAt && { socket: 'tenderCrane', slot: 'skiffCrane', rescue: d.rescueBoat }, skiff2At && { socket: 'tenderCrane2', slot: 'skiffCrane2', rescue: d.rescueBoat2 }].filter((b): b is { socket: string; slot: string; rescue: number } => !!b);
  boats.forEach((b, k) => {
    const slot = cc.slots[b.slot];
    if (!slot) return;
    const [bx, , bz] = slot.position as V3;
    const same = boats.length > 1 && boats[0].rescue === boats[1].rescue;
    const word = b.rescue ? 'RIB' : 'SKIFF';
    const named = boats.length > 1 ? { consoleLabel: same ? `${word} CRANE ${k + 1}` : `${word} CRANE`, name: `${b.rescue ? 'Rescue boat' : 'Skiff'} crane${same ? ` ${k + 1}` : ''}` } : {};
    recipe.modules.push({ socket: b.socket, module: 'deck.tender-crane', config: { ...(b.rescue ? CONFIG.vessels.rib.crane : {}), consoleButton: [r2(at.console[0] + bx), r2(at.console[1] + 0.01), r2(at.console[2] + bz + sb(bx))], ...named } });
  });
  if (craneAt || winchAt || skiffAt || aFrame || p.diveFrame || p.lineHaulerAt) recipe.modules.push({ socket: 'hydraulicPump', module: 'hydraulics.pto-pump' });
  if (basketAt) recipe.modules.push({ socket: 'fenders', module: 'deck.fenders', config: { z: fenderZs, basket: basketAt } });
  if (pushFender) recipe.modules.push({ socket: 'pushFender', module: 'hull.push-fender', config: pushFender });
  if (bowFender) recipe.modules.push({ socket: 'bowFender', module: 'hull.bow-fender', config: bowFender });
  // The harbour tug's fendering: its mesh and points worked out from her lines (trim.ts, parts/fendering.ts).
  if (fendering) recipe.modules.push({ socket: 'fendering', module: 'hull.fendering', config: { positions: fendering.positions, probes: fendering.probes } });
  // The solar catamaran's solar roof (modules/solarRoof; CONFIG.shipyard.solarCat.roof): over the
  // roof and its overhang, a wing each side out to her beam (stowed flat), a rack on the foredeck.
  if (p.electric && p.base.solarRoof) {
    const sr = CONFIG.shipyard.solarCat.roof;
    const z0 = layout.overhead ? layout.overhead.z1 : p.aft;
    const top = rnd(roofTopAt((roofFront + p.aft) / 2) + 0.05);
    const rx = Math.min(hw + 0.1, Math.min(...[z0, (z0 + roofFront) / 2, roofFront].map((z) => q.halfBeam(z))) - sr.wingClear);
    // Each wing folded in over the roof's outer panels, hinged at its edge: lying on them, a panel's depth higher.
    const wing = Math.min(sr.wingWidth, rx - 0.3);
    const rackZ1 = front - sr.rack.clear;
    const rackZ0 = rackZ1 - sr.rack.length;
    // Her house's front sloped below its windows (design.kick): panels on the slope, in place of the rack.
    const kickAft = Math.max(0, -p.ahead);
    const rackX = kickAft > 0.3 ? 0 : Math.min(q.halfBeam(rackZ0), q.halfBeam(rackZ1)) - sr.rack.inset;
    const deckY = Math.max(q.deckY(rackZ0), q.deckY(rackZ1));
    // (Her house is the player's: one too small for a field of panels on its roof gets none, and says so.)
    const roomy = rx - 0.3 > sr.panel[0] / 2 && z0 - roofFront > sr.panel[1];
    if (!roomy) p.warnings.push('Her roof is too small for her solar panels: she has none, and charges only at the quay. A longer or wider wheelhouse takes them.');
    if (roomy) recipe.modules.push({
      socket: 'solarRoof',
      module: 'deck.solar-roof',
      config: {
        roof: { x0: rnd(-rx), x1: rnd(rx), z0: rnd(z0), z1: rnd(roofFront), y: top },
        wings: [-1, 1].map((s) => ({ x0: rnd(s > 0 ? rx - wing : -rx), x1: rnd(s > 0 ? rx : -rx + wing), z0: rnd(z0), z1: rnd(roofFront), y: rnd(top + 0.06) })),
        rack: rackX > 0.5 ? { x0: rnd(-rackX), x1: rnd(rackX), z0: rnd(rackZ1), z1: rnd(rackZ0), y: rnd(deckY + sr.rack.height), deckY: rnd(deckY) } : null,
        ...(kickAft > 0.3 ? { slope: { x0: rnd(-hw + 0.1), x1: rnd(hw - 0.1), z0: rnd(front), y0: rnd(house.lowerFromY), z1: rnd(front + kickAft), y1: rnd(p.floorY + p.sill) } } : {}),
        panel: sr.panel,
        gap: sr.gap,
        // Charging her battery from the sun (CONFIG.shipyard.solarCat.solar; modules/solarRoof).
        charge: { ...CONFIG.shipyard.solarCat.solar, batteryKWh: motorSpec(d).usableKWh },
      },
    });
  }
  // A service livery's markings: the skin over her topsides worked out from her lines (trim.ts, parts/markings.ts).
  if (markings) recipe.modules.push({ socket: 'markings', module: 'hull.markings', config: { ...markings } });
  // A foiling boat's hydrofoils drawn (modules/foils; they fly her through her lines' `foils`), but the strut her pod hangs from: the pod's own.
  const foils = p.form.kind === 'lofted' ? p.form.design.foils : undefined;
  if (foils) recipe.modules.push({ socket: 'foils', module: 'hull.foils', config: { panels: foils.panels, struts: foils.struts.filter((s) => !(podSet && s.podDragArea)) } });
  if (prot.side) recipe.modules.push({ socket: 'hullGuard', module: 'hull.guard', config: { kind: prot.side, aroundBow: !bowRamp } });
  // Her furniture (P5), each piece on its place.
  recipe.modules.push(...p.furnitureMounts);
  // Her fish hold, if she has one.
  if (p.holdMount) recipe.modules.push(p.holdMount);

  return { recipe };
}
export type RecipePart = ReturnType<typeof recipePart>;
