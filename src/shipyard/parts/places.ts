/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): The places in and on her wheelhouse.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import type { Socket } from '../../modular/socket';
import type { BuildArgs, V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart } from './engineRoom';

/** The places inside and on the wheelhouse (vessel axes), as the landing craft's are from her cabin: the helm, the wall panels, what hangs under the roof, the floods, the cleats. */
export function placesPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart) {
  const { d } = a;
  const { F, FA, aft, bowRamp, bulwarkHeight, cf, consoleHalf, cx, engH, engMid, engTopAt, foreEndAt, front, house, hw, hx, q, rnd, roofAt, roofBack, roofFront, roofThickness, roofTopAt, roofY, sb, sill, stem, transom, wall, windowHead, zHead } = p;
  // ── Places (vessel axes), as the landing craft's are from her cabin ──
  /** Where a unit hung from the roof out to port / starboard goes: toward that side (`out` m from the centreline), no further than in view from the wheel. */
  const toPort = (out: number) => Math.round(Math.max(-out, cx - CONFIG.shipyard.helm.hungReach) * 1000) / 1000;
  const toStbd = (out: number) => Math.round(Math.min(out, cx + CONFIG.shipyard.helm.hungReach) * 1000) / 1000;
  const wl = CONFIG.shipyard.workLights;
  // The helm assist panel (design.helmAssist): with the advanced controls only.
  const helmAssist = !!d.helmAssist && !!d.controls;
  const at = {
    console: [cx, F + 0.9, cf + 0.56] as V3,
    // (Below the window sill: low windows bring it down.)
    breakerPanel: [hw - 0.185, F + Math.min(0.6, sill - 0.2), cf + 0.875 + sb(hw - 0.185)] as V3,
    // The helm assist panel: on the same wall, aft of the breaker panel.
    helmAssist: [hw - 0.185, F + Math.min(0.6, sill - 0.2), cf + 0.875 + sb(hw - 0.185) + CONFIG.modules.breakerPanel.width / 2 + CONFIG.modules.helmAssist.gap + CONFIG.modules.helmAssist.width / 2] as V3,
    rampButton: [-(hw - 0.07), F + Math.min(0.73, sill - 0.08), cf + 0.775 + sb(hw - 0.07)] as V3,
    // (On the aft wall: from the saloon's floor, if she has one.)
    batteryMaster: [hw - 0.45, FA + 0.48, aft - 0.065] as V3,
    batterySelector: [hw - 0.2, FA + 0.48, aft - 0.065] as V3,
    // (Hung out to the sides, but in view from the wheel on a wide house: CONFIG.shipyard.helm.)
    vhf: [toPort(hw - 0.3), roofY - 0.17, cf + 0.525 + sb(toPort(hw - 0.3))] as V3,
    // The advanced package's instruments (owner): the chartplotter hung out to starboard
    // ahead of the helm, turned toward it (the VHF's mirror); the NAV / WIND screen hung on
    // the centreline ahead of the helm; the FM set further aft to starboard, over your head.
    chartplotter: [toStbd(hw - 0.35), roofY - 0.17, cf + 0.5 + sb(toStbd(hw - 0.35))] as V3,
    navDisplay: [cx, roofY - 0.15, cf + 0.42] as V3,
    fm: [toStbd(hw - 0.35), roofY - 0.11, cf + 1.3 + sb(toStbd(hw - 0.35))] as V3,
    // The task board, on solid wall below the window sill (her walls are glass above it), on
    // the starboard wall, aft (its face's middle; 2 cm off the wall's inside face, clear of
    // its frames: no flicker between them).
    // The whiteboard: a pull-down board hung from the roof just forward of the aft wall
    // (owner: not low on the wall), port of the door, as wide as fits there.
    whiteboard: [(-(hw - wall) + 0.1) / 2, roofAt(aft - wall - 0.1), aft - wall - 0.1] as V3,
    dutyBoard: [hw - wall - 0.02, F + sill - CONFIG.modules.dutyBoard.height / 2 - 0.04, aft - wall - 0.5] as V3,
    // The engine's middle, on its shaft line (its weight is carried there); the engine space under its hatch.
    engineBed: [0, rnd(engTopAt(engMid) - engH / 2), rnd(engMid)] as V3,
    engineSpace: [0, 0, 0] as V3, // (set with her engine hatch, below)
    cabinLight: [0, roofAt((front + aft) / 2 + 0.15) - 0.12, (front + aft) / 2 + 0.15] as V3,
    searchlight: [0, roofTopAt(roofFront + 0.275) + 0.13, roofFront + 0.275] as V3,
    navLights: [0, roofTopAt(roofFront + 1.275), roofFront + 1.275] as V3,
    // The advanced interior's working lights (owner): the overhead switch panel over the helm
    // (its face), and the deck floods hung on the roof's outer front and aft edges, off to port
    // (owner, Oct 2026: they stood set in on the roof, over the wheelhouse, and lit it inside),
    // each aimed at the middle of its deck. The fore one on the visor's edge (half way up its
    // chamfer, set back with a faceted front's corner), the aft one on the roof's aft edge
    // (it overhangs the aft wall by the roof's `overhang`), each `out` beyond the edge.
    overhead: [cx, roofY - CONFIG.modules.overheadPanel.drop, cf + wl.overheadAft] as V3,
    floodFore: [-wl.flood.x, rnd(roofTopAt(front) - roofThickness / 2), rnd(zHead - house.visor + roofBack / 2 + sb(wl.flood.x + 0.11) - wl.flood.out)] as V3,
    floodAft: [-wl.flood.x, rnd(roofTopAt(aft) - roofThickness / 2), rnd(aft + (p.layout.roof?.overhang ?? 0) + wl.flood.out)] as V3,
  };
  // A wheelhouse offset across her (housePart `hx`): its places were laid out from its own
  // middle, so they move across with it (not her engine's).
  if (hx) for (const [k, v] of Object.entries(at)) if (k !== 'engineBed' && k !== 'engineSpace') v[0] = rnd(v[0] + hx);
  /**
   * Where each flood aims and how wide its beam is (owner, Oct 2026: "you actually get some
   * bleed into the cabin"): the game's lights cast no shadows, so the wheelhouse's walls and
   * roof don't stop a beam; it must not reach inside them. In the fore-and-aft plane, angles
   * from straight down, outboard (away from the house) positive: the inside of the wall at the
   * lamp's end (`inside`) is at most `wallAt`. Aimed at the middle of its deck when its beam
   * (the module's half-angle) then clears that by `margin`; else tilted outboard until it
   * does, but no flatter than `minBelowDeg` below the horizon (the beam narrowed then, never
   * under `minAngleDeg`). The aim point is where that line meets her deck's height there.
   */
  const floodAim = (lamp: V3, deckMid: V3, inside: [number, number][], out: 1 | -1): { target: V3; angleDeg: number } => {
    const deg = 180 / Math.PI;
    const from = (y: number, z: number) => Math.atan2((z - lamp[2]) * out, lamp[1] - y) * deg;
    const wallAt = Math.max(...inside.map(([y, z]) => from(y, z)));
    const full = CONFIG.vessels.workboat.deckLights.angleDeg;
    const toMid = from(deckMid[1], deckMid[2]);
    if (toMid - full >= wallAt + wl.flood.margin) return { target: deckMid, angleDeg: full };
    const aim = Math.min(wallAt + wl.flood.margin + full, 90 - wl.flood.minBelowDeg);
    const angleDeg = Math.round(Math.max(wl.flood.minAngleDeg, Math.min(full, aim - wallAt - wl.flood.margin)) * 10) / 10;
    const drop = lamp[1] - deckMid[1];
    const reach = drop * Math.tan(aim / deg);
    return { target: [0, deckMid[1], rnd(lamp[2] + out * reach)], angleDeg };
  };
  const along = (a: [number, number], b: [number, number], n = 8) => Array.from({ length: n + 1 }, (_, i): [number, number] => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  const zFore = (stem + front) / 2;
  const zAftDeck = (aft + transom) / 2;
  const frontIn = front + wall + sb(wl.flood.x);
  const headIn = zHead + wall + sb(wl.flood.x);
  /** The floods' lamps and aim points, each with its beam's half-angle (deg). */
  const floodLamps = {
    fore: { position: at.floodFore, ...floodAim(at.floodFore, [0, rnd(q.deckY(zFore)), rnd(zFore)], [...along([F, frontIn], [F + sill, frontIn]), ...along([F + sill, frontIn], [F + windowHead, headIn])], -1) },
    aft: { position: at.floodAft, ...floodAim(at.floodAft, [0, rnd(q.deckY(zAftDeck)), rnd(zAftDeck)], along([FA, aft - wall], [roofAt(aft - wall), aft - wall]), 1) },
  };
  const bowCleat = stem + 0.5;
  const sternCleat = transom - 0.4;
  // With a skiff, the midship cleats for her painter (owner): on the bulwark tops at the house's
  // end of the skiff's deck, as the workboat's are just aft of her wheelhouse, where the crew
  // working her alongside stand; kept inside the mooring cleats.
  const mc = CONFIG.shipyard.deckGear.midCleats;
  const midCleat = d.skiff
    ? Math.round(100 * Math.min(sternCleat - mc.fromEnds, Math.max(bowCleat + mc.fromEnds, d.skiff <= 2 ? foreEndAt - mc.fromHouse : aft + mc.fromHouse))) / 100
    : null;
  const cleat = (side: number, z: number): V3 => [side * (q.halfBeam(z) - 0.03), q.deckY(z) + bulwarkHeight, z];
  const rampBow: V3 | null = bowRamp ? [-(q.halfBeam(bowRamp.button.z) - 0.06), q.deckY(bowRamp.button.z) + bowRamp.button.y, bowRamp.button.z] : null;

  // The places the wheelhouse offers (P4b): the helm, the panels on its walls and by its door, what hangs under its roof, the lights and fittings on it.
  const wheelhouseSockets: Socket[] = [
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * consoleHalf - 0.04, 1.6, 1.0] }, label: 'Helm console, across the front of the cabin' },
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: at.breakerPanel, rotationDeg: [-40, -90, 0] }, label: 'Starboard wall, by the helm' },
    ...(helmAssist ? [{ id: 'helmAssist', type: 'wall.panel' as const, transform: { position: at.helmAssist, rotationDeg: [-40, -90, 0] as V3 }, label: 'Starboard wall, aft of the breaker panel' }] : []),
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: at.batteryMaster, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: at.batterySelector, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: at.vhf, rotationDeg: [0, 20, 0] }, label: 'Under the roof, out to port' },
    { id: 'fm', type: 'cabin.overhead', transform: { position: at.fm, rotationDeg: [0, -20, 0] }, label: 'Under the roof, out to starboard: the FM set' },
    { id: 'chartplotter', type: 'cabin.overhead', transform: { position: at.chartplotter, rotationDeg: [0, -35, 0] }, label: 'Under the roof, out to starboard ahead of the helm' },
    { id: 'navDisplay', type: 'cabin.overhead', transform: { position: at.navDisplay }, label: 'Overhead, on the centreline ahead of the helm' },
    { id: 'whiteboard', type: 'cabin.overhead', transform: { position: at.whiteboard, rotationDeg: [0, 180, 0] }, label: 'Under the roof by the aft wall, port of the door: the pull-down whiteboard' },
    { id: 'dutyBoard', type: 'wall.panel', transform: { position: at.dutyBoard, rotationDeg: [0, -90, 0] }, label: 'Starboard wall, aft' },
    { id: 'doorIn', type: 'wall.panel', transform: { position: [rnd(hx + 0.45), FA + 1.1, aft - wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [rnd(hx + 0.45), FA + 1.1, aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    ...(rampBow
      ? ([
          { id: 'rampCabin', type: 'wall.panel', transform: { position: at.rampButton, rotationDeg: [-90, -90, 0] }, label: 'Port wall, by the helm' },
          { id: 'rampBow', type: 'wall.panel', transform: { position: rampBow, rotationDeg: [-90, -90, 0] }, label: 'Port bulwark, by the bow ramp' },
        ] as Socket[])
      : []),
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'Cabin ceiling' },
    { id: 'overhead', type: 'cabin.overhead', transform: { position: at.overhead }, label: 'Under the roof, over the helm: the switch panel' },
    { id: 'floodFore', type: 'hull.light', transform: { position: at.floodFore }, label: 'Roof edge, forward: the foredeck flood' },
    { id: 'floodAft', type: 'hull.light', transform: { position: at.floodAft }, label: 'Roof edge, aft: the aft deck flood' },
    { id: 'navLights', type: 'hull.light', transform: { position: at.navLights }, label: 'Cabin roof: the navigation lights' },
    { id: 'horn', type: 'roof.mount', transform: { position: [hx, roofTopAt(roofFront + 0.775), roofFront + 0.775] }, label: 'Cabin roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [hx, roofY - 0.2, front] }, label: 'Over the front windows (nominal)' },
  ];
  return { wheelhouseSockets, at, bowCleat, cleat, floodLamps, helmAssist, midCleat, rampBow, sternCleat, wl };
}
export type PlacesPart = ReturnType<typeof placesPart>;
