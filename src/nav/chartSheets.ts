/**
 * The paper charts' sheets (regions, milestone 4): an archipelago sheet showing every
 * region at small scale, and a detail sheet per region as the original chart was. All the
 * sheets share one shape (the detail sheets' aspect), padded with open water where a
 * region's footprint is squarer or taller, so one piece of paper on the chart table takes
 * any of them, and the chart tools' maths (world metres <-> table) needs only the sheet's
 * bounds. The plotter has its own view and does not use these.
 */
import type { IslandDef, RegionDef } from '../world/defs';
import { REGIONS, regionById } from '../world/regions';

export interface ChartSheet {
  id: string;
  title: string;
  /** World metres covered. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** The lat/long grid spacing (minutes of arc) and the soundings' grid (m). */
  gridMinutes: number;
  soundingStep: number;
  /** Names and symbols scaled by this (smaller on the small-scale sheet). */
  textScale: number;
  /** The islands named on it. */
  islands: readonly IslandDef[];
}

/** A margin of open water round a region's islands (m). */
const MARGIN = 700;

function islandBox(islands: readonly IslandDef[], margin: number): ChartSheet['bounds'] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const i of islands) {
    x0 = Math.min(x0, i.x - i.radius);
    x1 = Math.max(x1, i.x + i.radius);
    z0 = Math.min(z0, i.z - i.radius);
    z1 = Math.max(z1, i.z + i.radius);
  }
  return { x0: x0 - margin, x1: x1 + margin, z0: z0 - margin, z1: z1 + margin };
}

/**
 * A region's chart box: its islands with the margin, grown to take in its shallow banks
 * (ShoalDef) and its buoys with a little sea round them (the Narrows' flats and channel
 * reach well beyond its islands).
 */
function regionBox(r: RegionDef, margin: number): ChartSheet['bounds'] {
  // A coast region (real coastline) has no islands: its box, less the edge where its land
  // fades into the open sea (coast pipeline, mesh.ts edgeFade).
  const fade = 400;
  const b = r.coast ? { x0: r.bounds.x0 + fade, x1: r.bounds.x1 - fade, z0: r.bounds.z0 + fade, z1: r.bounds.z1 - fade } : islandBox(r.islands, margin);
  for (const sh of r.shoals ?? []) {
    b.x0 = Math.min(b.x0, sh.x - sh.radius - 150);
    b.x1 = Math.max(b.x1, sh.x + sh.radius + 150);
    b.z0 = Math.min(b.z0, sh.z - sh.radius - 150);
    b.z1 = Math.max(b.z1, sh.z + sh.radius + 150);
  }
  for (const m of r.marks) {
    b.x0 = Math.min(b.x0, m.x - 250);
    b.x1 = Math.max(b.x1, m.x + 250);
    b.z0 = Math.min(b.z0, m.z - 250);
    b.z1 = Math.max(b.z1, m.z + 250);
  }
  return b;
}

/** Widen or heighten the box, symmetrically, to the aspect (width / height) `a`. */
function padToAspect(b: ChartSheet['bounds'], a: number): ChartSheet['bounds'] {
  const w = b.x1 - b.x0;
  const h = b.z1 - b.z0;
  if (w / h < a) {
    const nw = h * a;
    const cx = (b.x0 + b.x1) / 2;
    return { x0: cx - nw / 2, x1: cx + nw / 2, z0: b.z0, z1: b.z1 };
  }
  const nh = w / a;
  const cz = (b.z0 + b.z1) / 2;
  return { x0: b.x0, x1: b.x1, z0: cz - nh / 2, z1: cz + nh / 2 };
}

/** The sheets' common shape: home's detail sheet as it always was. */
const HOME_BOX = islandBox(regionById('home')!.islands, MARGIN);
export const SHEET_ASPECT = (HOME_BOX.x1 - HOME_BOX.x0) / (HOME_BOX.z1 - HOME_BOX.z0);

function detailSheet(regionId: string): ChartSheet {
  const r = regionById(regionId)!;
  return {
    id: r.id,
    title: r.name.toUpperCase(),
    bounds: padToAspect(regionBox(r, MARGIN), SHEET_ASPECT),
    // A big region (a real coast at full scale) gets a coarser grid and sparser soundings.
    gridMinutes: r.coast ? 1 : 0.5,
    soundingStep: r.coast ? 450 : 280,
    textScale: 1,
    islands: r.islands,
  };
}

/** Every sheet: the archipelago first, then each region's. */
export const SHEETS: ChartSheet[] = [
  {
    id: 'archipelago',
    // Every region by name: "SKERRY SOUND, THE SOUNDS AND THE FJORD".
    title: REGIONS.map((r) => r.name.toUpperCase()).join(', ').replace(/, ([^,]*)$/, ' AND $1'),
    bounds: padToAspect(
      REGIONS.map((r) => regionBox(r, 900)).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) })),
      SHEET_ASPECT,
    ),
    gridMinutes: 2,
    soundingStep: 900,
    textScale: 0.75,
    islands: REGIONS.flatMap((r) => r.islands).filter((i) => i.radius >= 100),
  },
  ...REGIONS.map((r) => detailSheet(r.id)),
];

export function sheetById(id: string): ChartSheet {
  return SHEETS.find((s) => s.id === id) ?? SHEETS[0];
}
