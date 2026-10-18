/**
 * A web worker that builds a region's land off the game's frame (regions, milestone 2): the
 * terrain triangles and the trees' places, from the same level data and height function as
 * the game (plain arrays, no Three.js; terrainMesh.ts). The game thread asks by region id
 * and gets transferable arrays back, so loading a region never stalls a frame.
 */
import { regionById } from '../regions';
import { buildTerrainArrays, treeSpots } from './terrainMesh';

export interface TerrainRequest {
  id: number;
  regionId: string;
}
export interface TerrainResult {
  id: number;
  regionId: string;
  position: Float32Array;
  color: Float32Array;
  trees: Float32Array;
  /** Build time in the worker (ms), for the debug overlay. */
  ms: number;
  error?: string;
}

self.onmessage = (e: MessageEvent<TerrainRequest>) => {
  const { id, regionId } = e.data;
  const t0 = performance.now();
  try {
    const region = regionById(regionId);
    if (!region) throw new Error(`no region '${regionId}'`);
    const { position, color } = buildTerrainArrays(region);
    const trees = treeSpots(region);
    const msg: TerrainResult = { id, regionId, position, color, trees, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, [position.buffer, color.buffer, trees.buffer]);
  } catch (err) {
    const msg: TerrainResult = { id, regionId, position: new Float32Array(), color: new Float32Array(), trees: new Float32Array(), ms: 0, error: String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
