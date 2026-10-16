/**
 * The paper chart on the chart table, drawn ONCE from the same terrain the chartplotter
 * uses, in the style of a printed nautical chart: buff land with a dark coastline,
 * green drying banks, blue tints over the shallows (darker = shoaler) with a depth
 * contour line at each tint edge, scattered soundings, a latitude/longitude grid inside a
 * graduated neat-line border, names with a paper halo, a compass rose and a title block,
 * then a "print" finish (paper grain, fold creases, edges darkened by handling).
 * North up, east right; the canvas covers chartBounds() exactly, so chart marks
 * (milestone 7) in world metres line up with it. Only the look changed (owner request:
 * "make it look like a real chart, keep the geometry"): the coastline is the same terrain.
 *
 * Text sizes are in "chart points" `u` (1 = 1/1280 of the chart's width, ~0.5 mm on the
 * table): sized to be read from standing height on desktop without leaning in.
 */
import { CONFIG } from '../config';
import { ISLANDS, MAX_DEPTH, PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { chartBounds, toLatLon } from './geo';

export interface PaperChart {
  canvas: HTMLCanvasElement;
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

/** Ink and tint colours (r, g, b). */
const PAPER: RGB = [244, 239, 222];
const LAND: RGB = [236, 214, 150];
const HILL: RGB = [222, 196, 128];
const COAST: RGB = [70, 56, 34];
const DRYING: RGB = [190, 204, 156];
/** Depth tints, shoal to deep: [shallower than (m), colour]; deeper than the last: paper. */
const TINTS: [number, RGB][] = [
  [2, [150, 192, 222]],
  [5, [180, 211, 232]],
  [10, [208, 226, 236]],
];
/** The depth contour drawn where the tints change (a darker blue line). */
const CONTOUR: RGB = [104, 146, 186];
const INK = '#1c2a36';
type RGB = [number, number, number];

export function drawPaperChart(widthPx = 2048): PaperChart {
  const b = chartBounds();
  const W = widthPx;
  const u = W / 1280; // one chart point, px
  const ppm = W / (b.x1 - b.x0); // pixels per metre
  const H = Math.round((b.z1 - b.z0) * ppm);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number) => (x - b.x0) * ppm;
  const pz = (z: number) => (z - b.z0) * ppm;

  // Land and water, sampled every S px, then scaled up smoothly (soft, printed edges).
  const S = 3;
  const sw = Math.ceil(W / S);
  const sh = Math.ceil(H / S);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(sw, sh);
  // Each sample's class: 0.. TINTS.length (water bands, shoal first; last = deep), -1 drying, -2 land, -3 hill.
  const band = new Int8Array(sw * sh);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const h = groundHeight(b.x0 + ((i + 0.5) * S) / ppm, b.z0 + ((j + 0.5) * S) / ppm);
      let k = 0;
      if (h > 12) k = -3;
      else if (h > 0.4) k = -2;
      else if (h > -0.3) k = -1; // the tide line: banks that dry out at low water
      else while (k < TINTS.length && -h >= TINTS[k][0]) k++;
      band[j * sw + i] = k;
    }
  }
  const at = (i: number, j: number) => band[Math.min(sh - 1, Math.max(0, j)) * sw + Math.min(sw - 1, Math.max(0, i))];
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const k = band[j * sw + i];
      const n = [at(i - 1, j), at(i + 1, j), at(i, j - 1), at(i, j + 1)];
      let col: RGB;
      if (k <= -2) col = n.some((m) => m > -2) ? COAST : k === -3 ? HILL : LAND;
      else if (k === -1) col = DRYING;
      else if (n.some((m) => m >= 0 && m > k)) col = CONTOUR; // the shoal side of each tint edge
      else col = k < TINTS.length ? TINTS[k][1] : PAPER;
      const o = (j * sw + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, sw * S, sh * S);

  // Text on a chart is set with a thin paper-coloured halo, so it reads over tints and lines.
  // Where names and the rose went (centre x, y, half width, half height), kept free of soundings.
  const taken: [number, number, number, number][] = [];
  const label = (text: string, x: number, y: number, font: string, colour: string) => {
    g.font = font;
    const w = g.measureText(text).width;
    const cx = g.textAlign === 'left' ? x + w / 2 : g.textAlign === 'right' ? x - w / 2 : x;
    taken.push([cx, y, w / 2, parseFloat(font.replace(/^\D*/, '')) * 0.6]);
    g.lineJoin = 'round';
    g.lineWidth = 3 * u;
    g.strokeStyle = 'rgba(244, 239, 222, 0.85)';
    g.strokeText(text, x, y);
    g.fillStyle = colour;
    g.fillText(text, x, y);
  };
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Latitude / longitude grid every half minute, labelled just inside the border.
  const border = 12 * u;
  const tl = toLatLon(b.x0, b.z0);
  const br = toLatLon(b.x1, b.z1);
  const midLat = ((tl.lat + br.lat) / 2) * (Math.PI / 180);
  const latZ = (lat: number) => pz((CONFIG.nav.originLat - lat) * 1852 * 60);
  const lonX = (lon: number) => px((lon - CONFIG.nav.originLon) * 1852 * 60 * Math.cos(midLat));
  const half = 0.5 / 60;
  g.strokeStyle = 'rgba(40, 60, 80, 0.45)';
  g.lineWidth = 1.2 * u;
  for (let lat = Math.ceil(br.lat / half) * half; lat < tl.lat; lat += half) {
    g.beginPath();
    g.moveTo(0, latZ(lat));
    g.lineTo(W, latZ(lat));
    g.stroke();
  }
  for (let lon = Math.ceil(tl.lon / half) * half; lon < br.lon; lon += half) {
    g.beginPath();
    g.moveTo(lonX(lon), 0);
    g.lineTo(lonX(lon), H);
    g.stroke();
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
  // Names of big islands go on the land; small ones' just south of them, clear of the coast.
  for (const [name, e] of names) {
    const big = e.r > 200;
    const y = pz(e.z / e.n) + (big ? 0 : (e.r + 45) * ppm + 18 * u);
    label(name.toUpperCase(), px(e.x / e.n), y, `bold ${(e.r > 250 ? 34 : 26) * u}px Georgia, serif`, '#3a2e1a');
  }
  // Ports: a dot, the name out over the water, on the side away from their island's middle.
  for (const p of PORTS) {
    g.fillStyle = '#7a1f1a';
    g.beginPath();
    g.arc(px(p.x), pz(p.z), 6 * u, 0, Math.PI * 2);
    g.fill();
    const home = ISLANDS.reduce((a, i) => (Math.hypot(i.x - p.x, i.z - p.z) - i.radius < Math.hypot(a.x - p.x, a.z - p.z) - a.radius ? i : a));
    const dx = p.x - home.x;
    const dz = p.z - home.z;
    const font = `italic bold ${26 * u}px Georgia, serif`;
    if (Math.abs(dx) > Math.abs(dz)) {
      g.textAlign = dx < 0 ? 'right' : 'left';
      label(p.name, px(p.x) + Math.sign(dx) * 14 * u, pz(p.z), font, '#7a1f1a');
      g.textAlign = 'center';
    } else label(p.name, px(p.x), pz(p.z) + Math.sign(dz) * 26 * u, font, '#7a1f1a');
  }

  // Compass rose, bottom left (open water there).
  const rose = Math.min(W, H) * 0.1;
  compassRose(g, W * 0.13, H * 0.79, rose, u);
  taken.push([W * 0.13, H * 0.79 - 20 * u, rose + 10 * u, rose + 30 * u]);
  // Soundings: depths in metres on a loose, jittered grid over the water (not too close
  // to land, where they'd crowd the coastline). The open sound is all the same depth (the
  // terrain's floor), so out there only every third cell gets one, as a chart thins out
  // its soundings over deep, even ground; near the islands, where the depth changes, all do.
  const step = 280;
  let cell = 0;
  for (let z = b.z0 + step / 2; z < b.z1; z += step) {
    for (let x = b.x0 + step / 2; x < b.x1; x += step, cell++) {
      const jx = x + Math.sin(x * 0.013 + z * 0.007) * 80;
      const jz = z + Math.cos(x * 0.009 - z * 0.011) * 80;
      const d = -groundHeight(jx, jz);
      if (d < 1 || -groundHeight(jx + 60, jz) < 0.5 || -groundHeight(jx - 60, jz) < 0.5) continue;
      if (d > MAX_DEPTH - 1.5 && cell % 3) continue;
      if (taken.some((r) => Math.abs(px(jx) - r[0]) < r[2] + 22 * u && Math.abs(pz(jz) - r[1]) < r[3] + 14 * u)) continue; // not under a name or the rose
      if (px(jx) < 70 * u || px(jx) > W - 70 * u || pz(jz) < 50 * u || pz(jz) > H - 60 * u) continue; // clear of the border labels
      label(String(Math.round(d)), px(jx), pz(jz), `italic ${20 * u}px Georgia, serif`, '#3c4e5c');
    }
  }

  // Title block, top right.
  const tw = 420 * u;
  const th = 112 * u;
  const tx = W - tw - border - 10 * u;
  const ty = border + 10 * u;
  g.fillStyle = 'rgba(248, 245, 232, 0.95)';
  g.fillRect(tx, ty, tw, th);
  g.strokeStyle = INK;
  g.lineWidth = 1.5 * u;
  g.strokeRect(tx, ty, tw, th);
  g.strokeRect(tx + 4 * u, ty + 4 * u, tw - 8 * u, th - 8 * u);
  g.fillStyle = INK;
  g.font = `bold ${34 * u}px Georgia, serif`;
  g.fillText('SKERRY SOUND', tx + tw / 2, ty + 34 * u);
  g.font = `${19 * u}px Georgia, serif`;
  g.fillText('Grid: half minutes of arc', tx + tw / 2, ty + 66 * u);
  g.fillText('Depths in metres', tx + tw / 2, ty + 90 * u);

  // Neat-line border, graduated in tenths of a minute (alternate black and white, as on
  // a printed chart: count them off with the dividers), grid labels just inside it.
  g.fillStyle = 'rgb(248, 245, 232)';
  g.fillRect(0, 0, W, border);
  g.fillRect(0, H - border, W, border);
  g.fillRect(0, 0, border, H);
  g.fillRect(W - border, 0, border, H);
  g.fillStyle = INK;
  const tenth = 0.1 / 60;
  for (let lat = Math.floor(br.lat / tenth) * tenth, n = Math.floor(br.lat / tenth); lat < tl.lat + tenth; lat += tenth, n++) {
    if (n % 2) continue;
    const a = latZ(lat);
    const e = latZ(lat + tenth);
    for (const x of [border * 0.35, W - border]) g.fillRect(x, e, border * 0.65, a - e);
  }
  for (let lon = Math.floor(tl.lon / tenth) * tenth, n = Math.floor(tl.lon / tenth); lon < br.lon + tenth; lon += tenth, n++) {
    if (n % 2) continue;
    const a = lonX(lon);
    const e = lonX(lon + tenth);
    for (const y of [border * 0.35, H - border]) g.fillRect(a, y, e - a, border * 0.65);
  }
  g.strokeStyle = INK;
  g.lineWidth = 2 * u;
  g.strokeRect(border, border, W - 2 * border, H - 2 * border);
  g.lineWidth = 1.5 * u;
  g.strokeRect(0.75 * u, 0.75 * u, W - 1.5 * u, H - 1.5 * u);
  const gridFont = `${20 * u}px Georgia, serif`;
  g.textAlign = 'left';
  for (let lat = Math.ceil(br.lat / half) * half; lat < tl.lat; lat += half) label(minutes(lat, 'N', 'S'), border + 6 * u, latZ(lat) - 14 * u, gridFont, '#24384a');
  g.textAlign = 'center';
  for (let lon = Math.ceil(tl.lon / half) * half; lon < br.lon; lon += half) {
    if (lonX(lon) > 70 * u && lonX(lon) < W - 70 * u) label(minutes(lon, 'E', 'W'), lonX(lon), H - border - 16 * u, gridFont, '#24384a');
  }

  printFinish(g, W, H, u);
  return { canvas: c, bounds: b };
}

/**
 * The "printed and used" pass over the finished drawing: paper grain (a small fixed-seed
 * noise tile, so every crew's chart is the same, multiplied over the sheet), two fold
 * creases (a chart is stored folded) and the edges a little darker from handling. Done
 * with canvas compositing, not pixel by pixel: reading back a 2048 px canvas costs
 * seconds on some browsers.
 */
function printFinish(g: CanvasRenderingContext2D, W: number, H: number, u: number): void {
  g.save();
  // Grain: light speckle multiplied over everything (ink and tints too, as on paper).
  const N = 256;
  const tile = document.createElement('canvas');
  tile.width = tile.height = N;
  const tg = tile.getContext('2d')!;
  const im = tg.createImageData(N, N);
  let seed = 1234567;
  for (let i = 0; i < N * N; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = 255 - ((seed >> 8) % 22); // 233..255
    im.data[i * 4] = v;
    im.data[i * 4 + 1] = v;
    im.data[i * 4 + 2] = v - 3;
    im.data[i * 4 + 3] = 255;
  }
  tg.putImageData(im, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = g.createPattern(tile, 'repeat')!;
  g.fillRect(0, 0, W, H);
  // Handling: each edge ~8 % darker, fading out over the outer 6 % of the sheet.
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgb(234, 230, 220)');
    gr.addColorStop(1, 'rgb(255, 255, 255)');
    g.fillStyle = gr;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H);
  };
  const e = Math.min(W, H) * 0.06;
  edge(0, 0, e, 0);
  edge(W, 0, W - e, 0);
  edge(0, 0, 0, e);
  edge(0, H, 0, H - e);
  // Creases down the middle each way: a soft dark line with a light ridge beside it.
  const c = 3 * u;
  const crease = (x: number, y: number, vertical: boolean) => {
    const gr = vertical ? g.createLinearGradient(x - c, 0, x + c, 0) : g.createLinearGradient(0, y - c, 0, y + c);
    gr.addColorStop(0, 'rgb(255, 255, 255)');
    gr.addColorStop(0.5, 'rgb(236, 233, 226)');
    gr.addColorStop(1, 'rgb(255, 255, 255)');
    g.fillStyle = gr;
    if (vertical) g.fillRect(x - c, 0, 2 * c, H);
    else g.fillRect(0, y - c, W, 2 * c);
  };
  crease(W / 2, 0, true);
  crease(0, H / 2, false);
  g.globalCompositeOperation = 'screen';
  g.fillStyle = 'rgba(255, 255, 255, 0.05)';
  g.fillRect(W / 2 + c, 0, 2 * c, H);
  g.fillRect(0, H / 2 + c, W, 2 * c);
  g.restore();
}

function minutes(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${d}°${m.toFixed(1)}'${v >= 0 ? pos : neg}`;
}

/** A true compass rose: degree ring (numbered every 30°), a star with its north point marked. */
function compassRose(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, u: number): void {
  const RED = '#7a1f1a';
  g.strokeStyle = RED;
  g.fillStyle = RED;
  g.lineWidth = 1.5 * u;
  for (const k of [1, 0.84]) {
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180;
    const k = d % 30 === 0 ? 0.92 : d % 10 === 0 ? 0.95 : 0.975;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    g.lineTo(cx + Math.sin(a) * r * k, cy - Math.cos(a) * r * k);
    g.stroke();
  }
  g.font = `${15 * u}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let d = 30; d < 360; d += 30) {
    const a = (d * Math.PI) / 180;
    g.save();
    g.translate(cx + Math.sin(a) * r * 0.88, cy - Math.cos(a) * r * 0.88);
    g.rotate(a);
    g.fillText(String(d).padStart(3, '0'), 0, 0);
    g.restore();
  }
  // The star: eight points, the cardinal ones long, each half dark and half light.
  for (let q = 0; q < 8; q++) {
    const a = (q * Math.PI) / 4;
    const len = r * (q % 2 ? 0.45 : 0.78);
    const w = r * 0.09;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
      g.lineTo(cx + Math.sin(a + side * Math.PI / 2) * w, cy - Math.cos(a + side * Math.PI / 2) * w);
      g.lineTo(cx, cy);
      g.closePath();
      g.fillStyle = side < 0 ? RED : '#f4efde';
      g.fill();
      g.stroke();
    }
  }
  g.fillStyle = RED;
  g.font = `bold ${30 * u}px Georgia, serif`;
  g.fillText('N', cx, cy - r - 22 * u);
}
