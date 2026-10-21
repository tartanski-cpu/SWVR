/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): The places in and on her wheelhouse.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import type { BuildArgs, V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart } from './engineRoom';

/** The places inside and on the wheelhouse (vessel axes), as the landing craft's are from her cabin: the helm, the wall panels, what hangs under the roof, the floods, the cleats. */
export function placesPart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart) {
  const { d } = a;
  const { F, FA, aft, bowRamp, bulwarkHeight, cf, cx, engH, engMid, engTopAt, foreEndAt, front, hw, q, rnd, roofAt, roofFront, roofTopAt, roofY, sb, sill, stem, transom, wall } = p;
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
    // (its face), and the deck floods on the roof's front and aft edges, off to port (the
    // fore one set back with a faceted front's corner), each aimed at the middle of its deck.
    overhead: [cx, roofY - CONFIG.modules.overheadPanel.drop, cf + wl.overheadAft] as V3,
    floodFore: [-wl.flood.x, roofTopAt(roofFront) + 0.07, roofFront + wl.flood.inset + sb(wl.flood.x + 0.11)] as V3,
    floodAft: [-wl.flood.x, roofTopAt(aft) + 0.07, aft - wl.flood.inset] as V3,
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

  return { at, bowCleat, cleat, helmAssist, midCleat, rampBow, sternCleat, wl };
}
export type PlacesPart = ReturnType<typeof placesPart>;
