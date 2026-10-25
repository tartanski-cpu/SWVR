/**
 * The Deck gear step's menu (owner, Oct 2026: the list "is not in any kind of order"; group
 * it, rescue equipment, fishing equipment..., with "a little graphical icon" for each; and
 * some of it, the anchor, can't really be placed). Each piece of equipment (pinGear.ts) is in
 * a group by the work it's for, with a line on what it does and a small drawing. How it goes
 * on her depends on what it is:
 *
 *   place   it stands where you put it (a pin: click on her): the crane, searchlight, fire
 *           monitor and tow winch on the grid, the life ring on a side of the house, the
 *           skiff on a deck and its crane to a side;
 *   fit     it has one place on any boat, so it's simply fitted or not: the anchor at her
 *           bow roller (a kedge at the stern on a ramp-bow boat), the stern roller and the
 *           trawl A-frame at the transom, the side door in the wheelhouse's port wall.
 *
 * The drawings are simple line icons, drawn for the game (24 px, in the text's colour).
 */
import type { Equipment } from './pinGear';

/** A group of the menu: its heading, and its equipment (ids, pinGear.ts EQUIPMENT) in order. */
export interface GearGroup {
  name: string;
  items: string[];
}

export const GEAR_GROUPS: GearGroup[] = [
  { name: 'Rescue and firefighting', items: ['skiff', 'lifeRing', 'searchlight', 'fireMonitor'] },
  { name: 'Towing', items: ['towWinch', 'sternRoller'] },
  { name: 'Fishing', items: ['aFrame', 'netDrum', 'trawlWinches', 'rodRack'] },
  { name: 'Cargo', items: ['deckCrane'] },
  { name: 'Her fittings', items: ['anchor', 'sideDoor'] },
];

/** What each piece is for, in a line. */
export const GEAR_ABOUT: Record<string, string> = {
  skiff: 'A 3.25 m rubber dinghy with an electric outboard, in a cradle on deck, with its own crane to launch and recover her: for reaching people in the water and running goods to the beach (three crates). Needs about 3.7 m of clear deck.',
  lifeRing: 'Thrown on its line to someone in the water; the boat hook beside it to bring them alongside.',
  rodRack: 'Four handheld rods standing in a rack on a wall of the wheelhouse, a bucket beside them: cast over the side, play what bites, sell the bucket in port.',
  searchlight: 'A steerable lamp for searching at night.',
  fireMonitor: 'A water cannon for fighting fires on other boats and on the quay.',
  towWinch: 'A powered drum for the tow line, led aft over the stern roller (fit that too: it is her tow point): tows things far heavier than she is.',
  sternRoller: 'A roller in the transom for the tow line or a net to run over.',
  aFrame: 'An A-frame over the transom with a trawl net and its winch.',
  netDrum: 'The net wound on a big hydraulic drum forward of the A-frame: it comes off as you shoot and winds back on as you haul. Needs the A-frame.',
  trawlWinches: 'A pair of winches at the deck edges for the trawl warps, leading aft to the A-frame\'s blocks: she needs no tow winch to trawl. Needs the A-frame.',
  deckCrane: 'A small crane for lifting cargo on and off her deck.',
  anchor: 'An anchor and its windlass, to hold her in one place. Every boat should have one.',
  sideDoor: 'A sliding door in the wheelhouse’s port wall, out to the side deck.',
  berth: 'A bunk with its cushion, against a wall: in the wheelhouse, the saloon or the cabin below.',
  settee: 'A seat with a cushioned back against a wall.',
  galley: 'A counter with a sink and a two-burner stove.',
  seat: 'A seat on a pedestal, standing free, facing forward: beside the helm, or for a passenger.',
  locker: 'A cupboard to the ceiling, for oilskins and gear.',
  head: 'A small compartment with a toilet, and a door you open and shut.',
  bunk: 'Two berths one over the other, for the crew: a lee rail on the upper one, rungs up to it. Needs headroom to sit up in the top bunk.',
  mess: 'A table against a wall with a bench at each end: where the crew eat. Put it by the galley.',
  shower: 'A shower stall with a curtain, to the ceiling.',
  tv: 'A flat-screen TV on a wall bracket. In the game, on a desktop, click it to show one of your browser tabs on it (a video, a map): everyone aboard sees it.',
};

/** How it goes on her (above). */
export function gearKind(eq: Equipment): 'place' | 'fit' {
  return eq.how === 'grid' || eq.how === 'side' || eq.how === 'skiff' || eq.how === 'rack' ? 'place' : 'fit';
}

const svg = (body: string) => `<svg class="gearIcon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Each piece's icon (SVG markup). */
export const GEAR_ICONS: Record<string, string> = {
  // Furniture (P5; the Furniture step, page.ts): each seen from the side, as a plain line drawing.
  berth: svg('<path d="M3 17V10M3 13h18v4M21 13v4M5 13v-2.5h5V13"/>'),
  settee: svg('<path d="M4 18v-6h16v6M4 12V7h16v5M6 15h12"/>'),
  galley: svg('<path d="M3 10h18M4 10v10h16V10M12 10v10M6 8.5h4M15 7.5a1.5 1.5 0 0 0 3 0"/>'),
  seat: svg('<path d="M8 4v7h8M7 11h10M12 11v7M8 20h8"/>'),
  locker: svg('<path d="M6 3h12v18H6zM12 3v18M10 12h0.5M13.5 12h0.5"/>'),
  head: svg('<path d="M5 3h14v18H5zM8 21V12h6v9M12.5 16.5h0.5"/>'),
  // Two berths stacked between end boards.
  bunk: svg('<path d="M4 3v18M20 3v18M4 17h16M4 9h16M6 15.5h5M6 7.5h5"/>'),
  // A table between two benches with backs.
  mess: svg('<path d="M8 11h8M12 11v8M3 6v13M3 15h4v4M21 6v13M21 15h-4v4"/>'),
  // The stall, its rose and the curtain.
  shower: svg('<path d="M5 3v18M19 3v18M5 21h14M9 5h4v2M11 7v1M9.5 10l-.5 1.5M12 10v1.5M14.5 10l.5 1.5M5 4h8"/>'),
  // The screen on its bracket, a play mark on it.
  tv: svg('<rect x="3" y="5" width="18" height="11" rx="1"/><path d="M10.5 8.5v4l3.5-2zM12 16v3M8 20h8"/>'),
  // The ring, its shank and stock, the curved arms with their flukes.
  anchor: svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V20.5M8.5 9.5h7M5 13.5c0 4 3 7 7 7s7-3 7-7M3.5 15l1.5-1.5 1.5 1.5M17.5 15l1.5-1.5 1.5 1.5"/>'),
  // The ring and its four bands of tape.
  lifeRing: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.8"/><path d="M12 4v4.2M12 15.8V20M4 12h4.2M15.8 12H20"/>'),
  // A rod with its reel, the line down to a float.
  rodRack: svg('<path d="M4 20L19 4M7 17l1.5 1.5M19 4c0 4-1 7-3 9.5M16 13.5v4"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="16" cy="19" r="1.4"/>'),
  // The lamp on its yoke, and its beam.
  searchlight: svg('<rect x="3" y="8" width="7" height="6" rx="1"/><path d="M10 7.5l3-2v11l-3-2M16 7l5-2.5M16 11h5M16 15l5 2.5M6.5 14v4.5M3.5 20.5h6"/>'),
  // The nozzle on its post, throwing an arc of water.
  fireMonitor: svg('<path d="M6 21v-8M3 21h6M6 13l5-4.5M11 8.5l2.5-1M14 6.5c3-2.5 5.5-2 7 0M15 9.5c2.2-1 4-.5 5.5 1.2M15.5 12.5c1.5-.3 2.8.2 3.8 1.3"/>'),
  // A small boat, and the davit over her with its fall.
  skiff: svg('<path d="M3 15.5h18l-3 4.5H6.5zM7 15.5l1-3h7.5M19 15.5V4.5h-6M13 4.5v4.5"/>'),
  // Its column, the jib, the hook on its wire.
  deckCrane: svg('<path d="M7 21V6.5M4 21h6M7 6.5l13 3.5M7 6.5L5 5.5M18 9.5v6M16.5 15.5h3M18 15.5v1.5a1.2 1.2 0 1 1-1.5 1.2"/>'),
  // The drum between its flanges, the wire leading off it.
  towWinch: svg('<rect x="6.5" y="8" width="9" height="8" rx="1"/><path d="M5 6v12M17 6v12M15.5 12H22M3 20.5h16"/>'),
  // The roller in a notch of the transom, the line running over it.
  sternRoller: svg('<circle cx="12" cy="13" r="2.6"/><path d="M3 19.5h18M4.5 19.5V9h4.5v4.5M19.5 19.5V9H15v4.5M12 10.4V3.5M12 3.5l-1.8 1.8M12 3.5l1.8 1.8"/>'),
  // The A-frame, its block, the net hanging under it.
  // The drum seen end on, the net on it, and its stand.
  netDrum: svg('<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="4.5"/><circle cx="12" cy="10" r="1.5"/><path d="M8 17l-2 4h12l-2-4M19 10h3"/>'),
  // Two winch drums at the deck edges, their warps leading aft to a block.
  trawlWinches: svg('<circle cx="5" cy="15" r="2.5"/><circle cx="19" cy="15" r="2.5"/><path d="M5 12.5L11 4M19 12.5L13 4M10 4h4M2.5 20h5M16.5 20h5"/>'),
  aFrame: svg('<path d="M5 21L12 3l7 18M8.2 13h7.6M12 3v7M9.5 10h5l-1 8.5h-3zM10 13h4M10.4 15.8h3.2M11 10l-.5 8.5M13 10l.5 8.5"/>'),
  // A door with its window and handle.
  sideDoor: svg('<rect x="6.5" y="3" width="11" height="18" rx="1"/><rect x="8.5" y="5" width="7" height="5" rx=".5"/><path d="M14.5 13.5h1.2"/>'),
};
