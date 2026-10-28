/**
 * The first step's hull cards (owner, Oct 2026: "replace this first step of the design process
 * with something more visual ... you see the different hull types, and you see next to them
 * what they're most suitable for"). Each type on a card: her picture from the side, her name
 * and what she is, the jobs she's built for (`main`) and those she can take on lightly
 * (`light`), and three of her measured figures, so the choice is a look along the line.
 *
 * Every type can carry cargo; the roles say what she's *made* for (owner: the landing craft
 * is better at cargo than the others for her big open deck). "Exploring" isn't a game job
 * yet: it's a tag only, and checks nothing, until there's a mission for it.
 *
 * Pure: the page draws the cards (and renders the pictures) from what this gives it.
 */
import { DESIGN_HULLS } from './build';
import { TYPE_FACTS, type TypeFacts } from './typeFit';

export interface HullRoles {
  /** What she's made for. */
  main: string[];
  /** What she can take on, lightly. */
  light: string[];
}

/** By hull type, in build.ts DESIGN_HULLS order (the retired workboat has none: she isn't offered). */
export const HULL_ROLES: (HullRoles | null)[] = [
  // The landing craft: the biggest open deck for her size, a ramp to beaches with no quay.
  { main: ['Cargo'], light: ['Light towing', 'Exploring'] },
  // The gillnetter: beamy and stable, an open deck to work pots and nets over.
  { main: ['Fishing', 'Pots'], light: ['Light towing', 'Cargo'] },
  null,
  // The pilot boat (owner: "fast patrol boat would be search and rescue, fire, and maybe towing").
  { main: ['Search & rescue', 'Fire'], light: ['Light towing', 'Exploring'] },
  // The small tug: made for towing, heavy tows (owner).
  { main: ['Heavy towing'], light: ['Fire'] },
  // The stern trawler: the trawl, and the biggest payload of them all.
  { main: ['Trawling'], light: ['Cargo', 'Towing'] },
  // The fast catamaran (owner, Oct 2026): a wide, steady working platform, fast.
  { main: ['Cargo', 'Fire', 'Exploring'], light: [] },
  // The harbour tug (owner, Oct 2026): a one-off, for towing and pushing ships.
  { main: ['Heavy towing'], light: ['Fire'] },
  // The solar catamaran (owner, Oct 2026): a one-off, for long quiet passages on sun and battery.
  { main: ['Exploring'], light: ['Search & rescue'] },
  // The foiling ferry (owner, Oct 2026): a one-off, fast and quiet, flying over the chop.
  { main: ['Exploring'], light: ['Search & rescue'] },
];

export interface HullCard {
  hull: number;
  /** Her type's name ("Landing craft"). */
  title: string;
  /** What she is, from her type's name ("9 m aluminium, square landing bow with a ramp"). */
  sub: string;
  roles: HullRoles;
  /** Three figures, measured (typeFit.ts TYPE_FACTS): her best speed, her deck (as she comes, to stretched as far as she goes), her best pull. */
  figures: { label: string; value: string }[];
}

/** Her figures, from her type's measured trials: the best of her engine fits for each. */
export function hullFigures(f: TypeFacts): HullCard['figures'] {
  const top = Math.max(...f.fits.map((t) => t.topKn));
  const pull = Math.max(...f.fits.map((t) => t.bollardT));
  return [
    { label: 'Speed', value: `up to ${top.toFixed(0)} kn` },
    { label: 'Deck', value: `${f.crates}–${f.maxCrates} crates` },
    { label: 'Pull', value: `up to ${pull.toFixed(1)} t` },
  ];
}

/** The cards, in the order offered (the retired types left out). */
export function hullCards(): HullCard[] {
  const out: HullCard[] = [];
  for (const [hull, t] of DESIGN_HULLS.entries()) {
    const roles = HULL_ROLES[hull];
    const facts = TYPE_FACTS[hull];
    if (!roles || !facts || facts.retired || t.retired) continue;
    const [title, ...rest] = t.name.split(':');
    out.push({ hull, title: title.trim(), sub: rest.join(':').trim(), roles, figures: hullFigures(facts) });
  }
  return out;
}
