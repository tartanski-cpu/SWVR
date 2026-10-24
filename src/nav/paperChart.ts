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
import { CURRENTS, FARMS, LIGHTS, MARKS, MAX_DEPTH, PLACES, PORTS, SKYLINE, WIND_FARMS, WRECKS, type MarkKind } from '../world/archipelago';
import { slackTimes } from '../world/currents';
import { LIGHT_CHARACTERS } from '../world/navMarks';
import { groundHeight } from '../world/terrain';
import { toLatLon } from './geo';
import { sheetById, type ChartSheet } from './chartSheets';

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

export function drawPaperChart(widthPx = 2048, sheet: ChartSheet = sheetById('home')): PaperChart {
  const b = sheet.bounds;
  const W = widthPx;
  const u = (W / 1280) * sheet.textScale; // one chart point, px (smaller type on the small-scale sheet)
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
  const half = sheet.gridMinutes / 60;
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
  for (const i of sheet.islands) {
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
    if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) continue;
    g.fillStyle = '#7a1f1a';
    g.beginPath();
    g.arc(px(p.x), pz(p.z), 6 * u, 0, Math.PI * 2);
    g.fill();
    // (No islands on the sheet, a coast region's: the name goes to the east.)
    const home = sheet.islands.reduce((a, i) => (Math.hypot(i.x - p.x, i.z - p.z) - i.radius < Math.hypot(a.x - p.x, a.z - p.z) - a.radius ? i : a), sheet.islands[0] ?? { x: p.x - 1, z: p.z, radius: 0 });
    const dx = p.x - home.x;
    const dz = p.z - home.z;
    const font = `italic bold ${26 * u}px Georgia, serif`;
    if (Math.abs(dx) > Math.abs(dz)) {
      g.textAlign = dx < 0 ? 'right' : 'left';
      label(p.name, px(p.x) + Math.sign(dx) * 14 * u, pz(p.z), font, '#7a1f1a');
      g.textAlign = 'center';
    } else label(p.name, px(p.x), pz(p.z) + Math.sign(dz) * 26 * u, font, '#7a1f1a');
  }

  // Place names (a coast map's, the coast extras plan C4), as a chart letters them: the sea's
  // own (bays, sounds, straits) in sloping blue capitals and lower case, islands in bold
  // capitals, towns and villages upright; all ranks on a detail sheet, the first two on the
  // overview. Most prominent first; one that would overprint another name is left out.
  const PLACE_FONT = (kind: string, rank: number) => {
    const size = (rank <= 1 ? 22 : rank === 2 ? 18 : 15) * u;
    return kind === 'island' || kind === 'islet' || kind === 'archipelago' ? `bold ${size}px Georgia, serif` : kind === 'bay' || kind === 'strait' || kind === 'sea' ? `italic ${size}px Georgia, serif` : `${size}px Georgia, serif`;
  };
  // (The compass rose's place, bottom left, drawn later: kept clear of the names too.)
  const roseBox: [number, number, number, number] = [W * 0.13, H * 0.79 - 20 * u, Math.min(W, H) * 0.1 + 10 * u, Math.min(W, H) * 0.1 + 30 * u];
  for (const pl of [...PLACES].sort((a, b) => a.rank - b.rank)) {
    if (pl.x < b.x0 || pl.x > b.x1 || pl.z < b.z0 || pl.z > b.z1) continue;
    if (sheet.textScale < 1 && pl.rank > 2) continue;
    const isle = pl.kind === 'island' || pl.kind === 'islet' || pl.kind === 'archipelago';
    const water = pl.kind === 'bay' || pl.kind === 'strait' || pl.kind === 'sea';
    const text = isle ? pl.name.toUpperCase() : pl.name;
    const font = PLACE_FONT(pl.kind, pl.rank);
    g.font = font;
    const hw = g.measureText(text).width / 2;
    const hh = parseFloat(font.replace(/^\D*/, '')) * 0.6;
    const x = px(pl.x);
    const y = pz(pl.z);
    if ([...taken, roseBox].some(([cx, cy, w, h]) => Math.abs(cx - x) < w + hw && Math.abs(cy - y) < h + hh)) continue;
    label(text, x, y, font, water ? '#2a4a7a' : '#3a2e1a');
  }

  // Wrecks: the dangerous-wreck symbol (a hull line crossed by three short strokes) in a
  // dotted danger line, with the name.
  for (const w of WRECKS) {
    const x = px(w.x);
    const y = pz(w.z);
    g.strokeStyle = INK;
    g.lineWidth = 2 * u;
    g.setLineDash([3 * u, 4 * u]);
    g.beginPath();
    g.arc(x, y, 13 * u, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(x - 9 * u, y);
    g.lineTo(x + 9 * u, y);
    for (const dx of [-5, 0, 5]) {
      g.moveTo(x + dx * u, y - 4 * u);
      g.lineTo(x + dx * u, y + 4 * u);
    }
    g.stroke();
    label(`Wk ${w.name}`, x - 40 * u, y + 24 * u, `italic ${15 * u}px Georgia, serif`, INK);
  }
  // Fish farms (a coast map's, C2): the lease's outline in a magenta pecked line, as a chart
  // draws a marine farm, with what it is; its corner marks are the region's lights.
  for (const f of FARMS) {
    if (!f.corners || f.corners.length < 4) continue;
    const [a, bb, c, d] = f.corners;
    g.strokeStyle = '#9a1f78';
    g.lineWidth = 1.5 * u;
    g.setLineDash([5 * u, 4 * u]);
    g.beginPath();
    for (const [i, [x, z]] of [a, bb, d, c, a].entries()) (i ? g.lineTo : g.moveTo).call(g, px(x), pz(z));
    g.stroke();
    g.setLineDash([]);
    const mx = (a[0] + bb[0] + c[0] + d[0]) / 4;
    const mz = (a[1] + bb[1] + c[1] + d[1]) / 4;
    label(`${f.name} (lit Fl Y 5s)`, px(mx), pz(mz), `italic ${13 * u}px Georgia, serif`, '#9a1f78');
  }
  // Landmarks a chart prints for the navigator (a coast map's skyline, C2): the position
  // circle with its dot and the chart's abbreviation (Cas, Tr, Mast, Chy, Mon, Ch); a wind
  // turbine its three-bladed sign, a group of them named once as a wind farm.
  const ABBR: Record<string, string> = { castle: 'Cas', tower: 'Tr', mast: 'Mast', chimney: 'Chy', water_tower: 'Tr', monument: 'Mon', church: 'Ch' };
  const farmLabelled: { x: number; z: number }[] = [];
  for (const s of SKYLINE) {
    if (s.x < b.x0 || s.x > b.x1 || s.z < b.z0 || s.z > b.z1) continue;
    const x = px(s.x);
    const y = pz(s.z);
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.lineWidth = 1.6 * u;
    if (s.kind === 'turbine') {
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 7 * u, y + Math.sin(a) * 7 * u);
      }
      g.stroke();
      if (!farmLabelled.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 2500)) {
        farmLabelled.push({ x: s.x, z: s.z });
        const n = SKYLINE.filter((o) => o.kind === 'turbine' && Math.hypot(o.x - s.x, o.z - s.z) < 2500).length;
        label(n > 2 ? 'Wind farm' : 'Wind turbine', x, y + 22 * u, `italic ${13 * u}px Georgia, serif`, INK);
      }
      continue;
    }
    g.beginPath();
    g.arc(x, y, 5 * u, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x, y, 1.6 * u, 0, Math.PI * 2);
    g.fill();
    // Churches and the smaller towers on the detail sheets only (they'd crowd the overview).
    if (sheet.textScale < 1 && (s.kind === 'church' || s.kind === 'monument')) continue;
    label(s.name && s.kind === 'castle' ? s.name.replace(/ Castle$/, ' Cas') : ABBR[s.kind] ?? '', x + 10 * u, y - 8 * u, `italic ${12 * u}px Georgia, serif`, INK);
  }
  // Offshore wind farms (world/windFarm.ts): each turbine its three-bladed sign and its number,
  // the farm named once, its platforms' light (Fl Y 5s, as an offshore structure's marking).
  for (const f of WIND_FARMS) {
    f.turbines.forEach((t, i) => {
      const x = px(t.x);
      const y = pz(t.z);
      g.strokeStyle = INK;
      g.lineWidth = 1.6 * u;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 7 * u, y + Math.sin(a) * 7 * u);
      }
      g.stroke();
      label(`${i + 1}`, x + 11 * u, y - 7 * u, `italic ${12 * u}px Georgia, serif`, INK);
    });
    const mx = f.turbines.reduce((a, t) => a + t.x, 0) / f.turbines.length;
    const mz = f.turbines.reduce((a, t) => a + t.z, 0) / f.turbines.length;
    label(f.name, px(mx), pz(mz) + 26 * u, `italic ${13 * u}px Georgia, serif`, INK);
  }
  // Buoys: a small pillar (can, cone) in the mark's colours with its topmark, the light's
  // magenta flare and its character (as charted).
  for (const m of MARKS) drawMark(g, m.kind, px(m.x), pz(m.z), u * 0.6, (text, tx, ty) => label(text, tx, ty, `italic ${13 * u}px Georgia, serif`, '#9a1f78'));

  // Lights (regions brief: a lighthouse is identified at night from the chart): the
  // position dot with a magenta flare and the light's character as charted (Fl W 6s: a
  // white flash every 6 s; F R: fixed red). Lighthouses on every sheet; the smaller pier,
  // quay and channel lights on the detail sheets only (they'd crowd the archipelago sheet).
  for (const l of LIGHTS) {
    if (l.x < b.x0 || l.x > b.x1 || l.z < b.z0 || l.z > b.z1) continue;
    if (l.tower !== 'lighthouse' && sheet.textScale < 1) continue;
    const x = px(l.x);
    const y = pz(l.z);
    const big = l.tower === 'lighthouse';
    g.fillStyle = 'rgba(190, 40, 150, 0.55)';
    g.beginPath();
    g.ellipse(x + 10 * u, y - 10 * u, (big ? 13 : 8) * u, (big ? 5 : 3.5) * u, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(x, y, (big ? 4 : 2.5) * u, 0, Math.PI * 2);
    g.fill();
    // A small light beside a port's name or a buoy goes unlabelled (the harbour is named, and
    // its labels would pile up); one of a pair labels on the side away from the other.
    if (!big && (PORTS.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 120) || MARKS.some((m) => Math.hypot(m.x - l.x, m.z - l.z) < 120))) continue;
    // (A fish farm's corner lights: the farm's own label says so, not four of them.)
    if (l.color === 'yellow' && FARMS.some((f) => f.corners?.some(([x, z]) => Math.hypot(x - l.x, z - l.z) < 1))) continue;
    const mate = LIGHTS.find((o) => o !== l && Math.hypot(o.x - l.x, o.z - l.z) < 250);
    const left = !!mate && mate.x > l.x;
    const colour = l.color === 'white' ? 'W' : l.color === 'red' ? 'R' : l.color === 'yellow' ? 'Y' : 'G';
    const ch = l.period > 0 ? `Fl ${colour} ${l.period}s` : `F ${colour}`;
    g.textAlign = left ? 'right' : 'left';
    label(ch, x + (left ? -10 : big ? 24 : 16) * u, y - 2 * u, `italic ${(big ? 15 : 12) * u}px Georgia, serif`, '#9a1f78');
    g.textAlign = 'center';
  }

  // Tidal races (regions): the zone's outline turned to its set, a double-headed arrow
  // (it runs both ways), and the note a chart prints: the peak rate, the cycle, the slack times.
  for (const z of CURRENTS) {
    if (z.x < b.x0 || z.x > b.x1 || z.z < b.z0 || z.z > b.z1) continue;
    const x = px(z.x);
    const y = pz(z.z);
    const hl = (z.length / 2) * ppm;
    const hw = (z.width / 2) * ppm;
    g.save();
    g.translate(x, y);
    g.rotate((z.setDeg * Math.PI) / 180);
    g.strokeStyle = '#9a1f78';
    g.lineWidth = 1.5 * u;
    g.setLineDash([6 * u, 5 * u]);
    g.strokeRect(-hw, -hl, 2 * hw, 2 * hl);
    g.setLineDash([]);
    g.lineWidth = 2 * u;
    g.beginPath();
    g.moveTo(0, -hl * 0.7);
    g.lineTo(0, hl * 0.7);
    for (const d of [-1, 1]) {
      g.moveTo(-5 * u, d * hl * 0.7 - d * 8 * u);
      g.lineTo(0, d * hl * 0.7);
      g.lineTo(5 * u, d * hl * 0.7 - d * 8 * u);
    }
    // Overfalls: three wavy strokes across the middle.
    for (const row of [-1, 0, 1]) {
      g.moveTo(-hw * 0.6, row * 7 * u);
      for (let i = 1; i <= 6; i++) g.lineTo(-hw * 0.6 + (i * hw * 1.2) / 6, row * 7 * u + (i % 2 ? -3 : 3) * u);
    }
    g.stroke();
    g.restore();
    if (sheet.textScale < 1) {
      // The small-scale sheet: the name and the rate; the slack times are on the detail sheet.
      label(`${z.name} ${z.peakKn} kn`, x, y - hl - 10 * u, `italic bold ${15 * u}px Georgia, serif`, '#9a1f78');
      continue;
    }
    const slacks = slackTimes(z).map((t) => `${String(Math.floor(t)).padStart(2, '0')}${String(Math.round((t % 1) * 60)).padStart(2, '0')}`);
    label(z.name, x, y - hl - 26 * u, `italic bold ${16 * u}px Georgia, serif`, '#9a1f78');
    label(`Race ${z.peakKn} kn at peak, ${z.periodH} h cycle`, x, y - hl - 10 * u, `italic ${13 * u}px Georgia, serif`, '#9a1f78');
    label(`slack ${slacks.join(' ')}`, x, y + hl + 16 * u, `italic ${13 * u}px Georgia, serif`, '#9a1f78');
  }

  // Compass rose, bottom left (open water there).
  const rose = Math.min(W, H) * 0.1;
  compassRose(g, W * 0.13, H * 0.79, rose, u);
  taken.push([W * 0.13, H * 0.79 - 20 * u, rose + 10 * u, rose + 30 * u]);
  // Soundings: depths in metres on a loose, jittered grid over the water (not too close
  // to land, where they'd crowd the coastline). The open sound is all the same depth (the
  // terrain's floor), so out there only every third cell gets one, as a chart thins out
  // its soundings over deep, even ground; near the islands, where the depth changes, all do.
  const step = sheet.soundingStep;
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
  const tw = Math.max(420, sheet.title.length * 20 + 40) * u;
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
  g.fillText(sheet.title, tx + tw / 2, ty + 34 * u);
  g.font = `${19 * u}px Georgia, serif`;
  g.fillText(sheet.gridMinutes === 0.5 ? 'Grid: half minutes of arc' : `Grid: ${sheet.gridMinutes} minutes of arc`, tx + tw / 2, ty + 66 * u);
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

/** A buoy's chart symbol at (x, y) px: body in its colours, topmark, magenta flare, and the light's character. */
function drawMark(g: CanvasRenderingContext2D, kind: MarkKind, x: number, y: number, u: number, text: (t: string, x: number, y: number) => void): void {
  const Y = '#d8b018';
  const B = INK;
  const R = '#b8281c';
  const G = '#1f7a36';
  const [top, bottom] = kind === 'N' ? [B, Y] : kind === 'S' ? [Y, B] : kind === 'E' ? [B, B] : kind === 'W' ? [Y, Y] : kind === 'isolated' ? [B, B] : kind === 'port' ? [R, R] : [G, G];
  const band = kind === 'E' ? Y : kind === 'W' ? B : kind === 'isolated' ? R : null;
  // The body: a short slanted pillar on the position circle.
  g.save();
  g.translate(x, y);
  g.lineWidth = 1.2 * u;
  g.strokeStyle = INK;
  g.beginPath();
  g.arc(0, 0, 3 * u, 0, Math.PI * 2);
  g.stroke();
  g.rotate(0.35);
  const w = 8 * u;
  const h = 22 * u;
  g.fillStyle = bottom;
  g.fillRect(-w / 2, -h, w, h / 2);
  g.fillStyle = top;
  g.fillRect(-w / 2, -h, w, h / 2 - (band ? h / 6 : 0));
  if (band) {
    g.fillStyle = band;
    g.fillRect(-w / 2, -h / 2 - h / 6, w, h / 3);
  }
  g.fillStyle = bottom;
  g.fillRect(-w / 2, -h / 2 + (band ? h / 6 : 0), w, h / 2 - (band ? h / 6 : 0));
  g.strokeRect(-w / 2, -h, w, h);
  // Topmark: two cones (pointing as the mark's), two balls, a can or a cone.
  g.fillStyle = kind === 'port' ? R : kind === 'stbd' ? G : B;
  const cone = (cy: number, up: boolean) => {
    g.beginPath();
    g.moveTo(-5 * u, cy + (up ? 4 : -4) * u);
    g.lineTo(5 * u, cy + (up ? 4 : -4) * u);
    g.lineTo(0, cy + (up ? -4 : 4) * u);
    g.fill();
  };
  const t0 = -h - 6 * u;
  if (kind === 'N') (cone(t0, true), cone(t0 - 9 * u, true));
  else if (kind === 'S') (cone(t0, false), cone(t0 - 9 * u, false));
  else if (kind === 'E') (cone(t0, false), cone(t0 - 9 * u, true));
  else if (kind === 'W') (cone(t0, true), cone(t0 - 9 * u, false));
  else if (kind === 'stbd') cone(t0, true);
  else if (kind === 'port') g.fillRect(-4 * u, t0 - 4 * u, 8 * u, 8 * u);
  else for (const cy of [t0, t0 - 9 * u]) (g.beginPath(), g.arc(0, cy, 3.5 * u, 0, Math.PI * 2), g.fill());
  g.restore();
  // The light: a magenta flare off the top, and its character beside it.
  g.fillStyle = 'rgba(190, 40, 150, 0.55)';
  g.beginPath();
  g.ellipse(x + 14 * u, y - 18 * u, 9 * u, 4 * u, -0.6, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'left';
  const ch = LIGHT_CHARACTERS[kind];
  text(`${ch.label}`, x + 22 * u, y - 4 * u);
  g.textAlign = 'center';
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
