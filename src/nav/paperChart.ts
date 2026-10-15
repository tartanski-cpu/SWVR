/**
 * The paper chart on the chart table, drawn ONCE from the same terrain the chartplotter
 * uses, in a printed-chart style: buff land with a dark coastline, white deep water, blue
 * shallows, scattered soundings, a latitude/longitude grid, names, a compass rose and a
 * title block. North up, east right; the canvas covers chartBounds() exactly, so chart
 * marks (milestone 7) in world metres line up with it.
 */
import { CONFIG } from '../config';
import { ISLANDS, PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { chartBounds, toLatLon } from './geo';

export interface PaperChart {
  canvas: HTMLCanvasElement;
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

export function drawPaperChart(widthPx = 1280): PaperChart {
  const b = chartBounds();
  const W = widthPx;
  const ppm = W / (b.x1 - b.x0); // pixels per metre
  const H = Math.round((b.z1 - b.z0) * ppm);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number) => (x - b.x0) * ppm;
  const pz = (z: number) => (z - b.z0) * ppm;

  // Land and water, sampled every 2 px, then scaled up smoothly (soft, printed edges).
  const S = 2;
  const sw = Math.ceil(W / S);
  const sh = Math.ceil(H / S);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(sw, sh);
  const heights = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) heights[j * sw + i] = groundHeight(b.x0 + ((i + 0.5) * S) / ppm, b.z0 + ((j + 0.5) * S) / ppm);
  }
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const h = heights[j * sw + i];
      // Coastline: land next to water.
      const coast =
        h > 0 &&
        ((i > 0 && heights[j * sw + i - 1] <= 0) || (i < sw - 1 && heights[j * sw + i + 1] <= 0) || (j > 0 && heights[(j - 1) * sw + i] <= 0) || (j < sh - 1 && heights[(j + 1) * sw + i] <= 0));
      const col = coast ? [92, 76, 48] : h > 12 ? [214, 196, 140] : h > 0 ? [232, 216, 166] : h > -2 ? [168, 206, 222] : h > -6 ? [196, 224, 234] : h > -15 ? [226, 238, 240] : [246, 248, 244];
      const k = (j * sw + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, sw * S, sh * S);

  // Soundings: depths in metres on a loose grid over the water.
  g.fillStyle = '#4a5a66';
  g.font = 'italic 13px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = 260;
  for (let z = b.z0 + step / 2; z < b.z1; z += step) {
    for (let x = b.x0 + step / 2; x < b.x1; x += step) {
      const jx = x + Math.sin(x * 0.013 + z * 0.007) * 70;
      const jz = z + Math.cos(x * 0.009 - z * 0.011) * 70;
      const d = -groundHeight(jx, jz);
      if (d < 1) continue;
      g.fillText(String(Math.round(d)), px(jx), pz(jz));
    }
  }

  // Latitude / longitude grid every half minute, labelled at the edges.
  g.strokeStyle = 'rgba(60, 80, 100, 0.35)';
  g.lineWidth = 1;
  g.fillStyle = '#34485a';
  g.font = '12px Georgia, serif';
  const tl = toLatLon(b.x0, b.z0);
  const br = toLatLon(b.x1, b.z1);
  const half = 0.5 / 60;
  for (let lat = Math.ceil(br.lat / half) * half; lat < tl.lat; lat += half) {
    const z = (CONFIG.nav.originLat - lat) * 1852 * 60;
    g.beginPath();
    g.moveTo(0, pz(z));
    g.lineTo(W, pz(z));
    g.stroke();
    g.textAlign = 'left';
    g.fillText(minutes(lat, 'N', 'S'), 4, pz(z) - 8);
  }
  const midLat = ((tl.lat + br.lat) / 2) * (Math.PI / 180);
  for (let lon = Math.ceil(tl.lon / half) * half; lon < br.lon; lon += half) {
    const x = (lon - CONFIG.nav.originLon) * 1852 * 60 * Math.cos(midLat);
    g.beginPath();
    g.moveTo(px(x), 0);
    g.lineTo(px(x), H);
    g.stroke();
    g.textAlign = 'center';
    g.fillText(minutes(lon, 'E', 'W'), px(x), H - 10);
  }

  // Island names (one label per name), ports.
  const names = new Map<string, { x: number; z: number; n: number; r: number }>();
  for (const i of ISLANDS) {
    const e = names.get(i.name) ?? { x: 0, z: 0, n: 0, r: 0 };
    e.x += i.x;
    e.z += i.z;
    e.n += 1;
    e.r = Math.max(e.r, i.radius);
    names.set(i.name, e);
  }
  g.textAlign = 'center';
  g.fillStyle = '#3a2e1a';
  for (const [name, e] of names) {
    g.font = `bold ${e.r > 250 ? 17 : 13}px Georgia, serif`;
    g.fillText(name.toUpperCase(), px(e.x / e.n), pz(e.z / e.n));
  }
  g.font = 'italic 14px Georgia, serif';
  g.fillStyle = '#7a1f1a';
  for (const p of PORTS) {
    g.beginPath();
    g.arc(px(p.x), pz(p.z), 4, 0, Math.PI * 2);
    g.fill();
    g.fillText(p.name, px(p.x), pz(p.z) + 16);
  }

  // Compass rose, bottom left (open water there).
  compassRose(g, W * 0.12, H * 0.8, Math.min(W, H) * 0.08);
  // Title block, top right.
  g.fillStyle = 'rgba(250, 248, 238, 0.92)';
  g.fillRect(W - 300, 12, 288, 74);
  g.strokeStyle = '#34485a';
  g.strokeRect(W - 300, 12, 288, 74);
  g.fillStyle = '#1c2a36';
  g.textAlign = 'center';
  g.font = 'bold 18px Georgia, serif';
  g.fillText('SKERRY SOUND', W - 156, 32);
  g.font = '12px Georgia, serif';
  g.fillText('Grid: half minutes of arc', W - 156, 54);
  g.fillText('Depths in metres', W - 156, 72);
  // Neat line.
  g.strokeStyle = '#1c2a36';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  return { canvas: c, bounds: b };
}

function minutes(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${d}°${m.toFixed(1)}'${v >= 0 ? pos : neg}`;
}

function compassRose(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.strokeStyle = '#7a1f1a';
  g.fillStyle = '#7a1f1a';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  g.stroke();
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const k = d % 90 === 0 ? 0.7 : d % 30 === 0 ? 0.76 : 0.79;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82);
    g.lineTo(cx + Math.sin(a) * r * k, cy - Math.cos(a) * r * k);
    g.stroke();
  }
  // The star: four long points.
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r * 0.66, cy - Math.cos(a) * r * 0.66);
    g.lineTo(cx + Math.sin(a + 0.6) * r * 0.12, cy - Math.cos(a + 0.6) * r * 0.12);
    g.lineTo(cx, cy);
    g.closePath();
    g.fill();
  }
  g.font = 'bold 16px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('N', cx, cy - r - 10);
}
