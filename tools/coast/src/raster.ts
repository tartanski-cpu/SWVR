/** Reading the fetched rasters (fetch.ts saveRaster) and sampling them at a lon/lat. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Raster {
  width: number;
  height: number;
  lon0: number;
  lat0: number;
  dlon: number;
  dlat: number;
  noData?: number | null;
  data: Float32Array;
}

export function loadRaster(dir: string, name: string): Raster {
  const meta = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  const buf = readFileSync(join(dir, `${name}.bin`));
  return { ...meta, data: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) };
}

/** Bilinear sample (pixel centres); NaN where no data. */
export function bilinear(r: Raster, lon: number, lat: number): number {
  const fx = (lon - r.lon0) / r.dlon - 0.5;
  const fy = (r.lat0 - lat) / r.dlat - 0.5;
  const x0 = Math.max(0, Math.min(r.width - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(r.height - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const v = (x: number, y: number) => {
    const d = r.data[y * r.width + x];
    return r.noData != null && d === r.noData ? NaN : d;
  };
  const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
  const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
  return a * (1 - ty) + b * ty;
}

/** Nearest pixel (classes). */
export function nearest(r: Raster, lon: number, lat: number): number {
  const x = Math.max(0, Math.min(r.width - 1, Math.floor((lon - r.lon0) / r.dlon)));
  const y = Math.max(0, Math.min(r.height - 1, Math.floor((r.lat0 - lat) / r.dlat)));
  return r.data[y * r.width + x];
}
