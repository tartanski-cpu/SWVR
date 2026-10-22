/**
 * A coast map's features file (the coast pipeline's features stage, tools/coast features.ts;
 * the coast extras plan): the farms, landmarks, the shore, names, fog signals, wrecks,
 * cables and ferry routes in the map data, in the region's own metres (x east, z south).
 * The package names the file; the milestones that use it (C2-C7) fetch it. Nothing in it is
 * guessed: what the map doesn't hold isn't there.
 */
export type XZ = [number, number];

export interface CoastFeatures {
  farms: { name: string; kind: 'fish' | 'shellfish' | 'seaweed' | 'other'; outline: XZ[] }[];
  landmarks: { kind: 'castle' | 'tower' | 'mast' | 'chimney' | 'water_tower' | 'monument' | 'lighthouse' | 'turbine' | 'church'; name: string; x: number; z: number; height: number | null; size: number }[];
  /** Beaches by surface (sand, shingle, pebbles, rock, or plain beach), shingle, bare rock. */
  shore: { surface: string; outline: XZ[] }[];
  cliffs: XZ[][];
  farmland: { x: number; z: number; area: number }[];
  /** Rank 1 is shown farthest out (towns, the big waters), 4 only close in. */
  names: { name: string; kind: string; x: number; z: number; rank: number }[];
  fogSignals: { name: string; x: number; z: number; category: string | null; group: string | null; period: number | null }[];
  wrecks: { name: string; x: number; z: number; depth: number; category: string | null }[];
  cables: { kind: 'cable' | 'pipeline'; name: string; path: XZ[] }[];
  /** Power-line spans over the water; `clearance` (m) only where charted. */
  overhead: { name: string; path: XZ[]; clearance: number | null }[];
  ferries: { routes: { name: string; operator: string; foot: boolean; path: XZ[] }[]; terminals: { name: string; x: number; z: number }[] };
}

/** The package's `features`: the file, and how many of each it holds. */
export interface CoastFeaturesRef {
  file: string;
  counts: Record<string, unknown>;
}
