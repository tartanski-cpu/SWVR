/**
 * Her sea trial as small pictures (owner, Oct 2026: "some graphs there that make it a bit
 * more visual"), above the numbers, in the right-hand column:
 *
 *   speed by lever     knots at a quarter, half, three-quarter and full lever, with the
 *                      brief's speed as a dashed line;
 *   range by lever     how far a tank takes her at each lever (fuel burn in the hover), with
 *                      the brief's range;
 *   turning circle     her track hard over from full ahead, drawn from the measured advance,
 *                      transfer and tactical diameter, her length to scale at the start;
 *   roll decay         let go from 10° heel: the measured peaks, and the damped swing they
 *                      fit (her roll period and damping);
 *   stopping           crash stop and coasting to 1 kn, in metres and in boat lengths.
 *
 * One series a chart, so no legend: each title says what's plotted. Plain SVG strings (no
 * chart library); the page puts them in and shows `data-tip` on hover.
 */
import type { SeaTrialResults } from '../vessel/seaTrials';

/**
 * The data colour (one series a chart), the ink, and the hairlines, for the dark page. The blue
 * is checked against the chart's dark surface (lightness band, chroma, 3:1 contrast).
 */
const C = { data: '#4b93e8', wash: 'rgba(75,147,232,0.16)', ink: '#e3ecf1', muted: '#93a8b5', grid: '#2b3d49', surface: '#111c24' };
const W = 150;
const H = 120;
/** Plot margins: left for the y ticks, bottom for the x labels. */
const M = { l: 26, r: 8, t: 8, b: 18 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const f1 = (x: number) => x.toFixed(1);

/** A clean top for the y axis, and its ticks (0, step, 2 step...). */
function ticks(max: number): { top: number; step: number } {
  const raw = Math.max(max, 1e-6) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

function svg(body: string, label: string, w = W, h = H): string {
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" font-family="system-ui, sans-serif" font-size="10">${body}</svg>`;
}

/** A value by lever (25-100 %): a 2 px line with dots, the brief's target dashed. */
function byLever(pts: { lever: number; v: number; tip: string }[], unit: string, target: number, label: string): string {
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const { top, step } = ticks(Math.max(target * 1.1, ...pts.map((p) => p.v)));
  const x = (lever: number) => M.l + ((lever - 0.25) / 0.75) * pw;
  const y = (v: number) => M.t + ph - (v / top) * ph;
  let b = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    b += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
    b += `<text x="${M.l - 3}" y="${y(v) + 3}" text-anchor="end" fill="${C.muted}">${+v.toFixed(2)}</text>`;
  }
  pts.forEach((p, i) => (b += `<text x="${x(p.lever)}" y="${H - 5}" text-anchor="${i === pts.length - 1 ? 'end' : i ? 'middle' : 'start'}" fill="${C.muted}">${Math.round(p.lever * 100)}%</text>`));
  if (target > 0) {
    b += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(target)}" y2="${y(target)}" stroke="${C.ink}" stroke-width="1" stroke-dasharray="3 2"/>`;
    b += `<text x="${M.l + 2}" y="${y(target) - 3}" fill="${C.ink}">brief ${+target.toFixed(1)} ${unit}</text>`;
  }
  b += `<polyline points="${pts.map((p) => `${x(p.lever)},${y(p.v)}`).join(' ')}" fill="none" stroke="${C.data}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (const p of pts) {
    b += `<circle cx="${x(p.lever)}" cy="${y(p.v)}" r="4" fill="${C.data}" stroke="${C.surface}" stroke-width="2"/>`;
    // The hover target: bigger than the dot.
    b += `<circle cx="${x(p.lever)}" cy="${y(p.v)}" r="11" fill="transparent" data-tip="${esc(p.tip)}"/>`;
  }
  // The full-lever value at the line's end.
  const last = pts[pts.length - 1];
  b += `<text x="${x(last.lever) - 6}" y="${Math.max(M.t + 8, y(last.v) - 7)}" text-anchor="end" fill="${C.ink}" font-weight="600">${f1(last.v)}</text>`;
  return svg(b, label);
}

/**
 * Her turning track, hard over from full ahead (to starboard, from the bottom of the
 * picture heading up): two curves through the measured points, at 90° (advance up,
 * transfer across) and at 180° (the tactical diameter across), with their dimension lines.
 * A schematic of the measured figures, not a recorded track.
 */
function turning(t: SeaTrialResults, lengthM: number): string {
  const A = t.advance;
  const T = t.transfer;
  const D = t.tacticalDiameter;
  // Where she is at 180°: the tactical diameter across, back down by about the steady radius.
  const R = Math.max(1, Math.min(Math.max(D - T, 1), t.steadyTurnDiameter / 2));
  const y180 = A - R;
  // Fit the track, her silhouette and the labels in the box, the same scale both ways.
  const x0 = -0.15 * D;
  const x1 = D;
  const yLo = Math.min(0, y180, -0.4 * lengthM);
  const yHi = Math.max(A, 0.5 * lengthM);
  const box = { l: 24, r: 10, t: 16, b: 24 };
  const s = Math.min((W - box.l - box.r) / (x1 - x0), (H - box.t - box.b) / (yHi - yLo));
  const px = (x: number) => box.l + (x - x0) * s;
  const py = (y: number) => H - box.b - (y - yLo) * s;
  const k = 0.55; // a quarter circle's Bézier handle
  let b = '';
  // The track: up to (T, A) heading across, then on round to (D, A - R) heading down.
  b += `<path d="M${px(0)},${py(0)} C${px(0)},${py(A * k)} ${px(T - T * k)},${py(A)} ${px(T)},${py(A)} C${px(T + (D - T) * k)},${py(A)} ${px(D)},${py(A - R * (1 - k))} ${px(D)},${py(y180)}" fill="none" stroke="${C.data}" stroke-width="2" stroke-linecap="round"/>`;
  // Her length to scale at the start, pointing up.
  b += `<path d="M${px(0)},${py(lengthM * 0.5)} L${px(0) + 3},${py(-lengthM * 0.4)} L${px(0) - 3},${py(-lengthM * 0.4)} Z" fill="${C.muted}"/>`;
  // Dimension lines: advance (up, left of her), transfer (across, at the advance), tactical diameter (across, below).
  const dim = (xa: number, ya: number, xb: number, yb: number) => `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${C.muted}" stroke-width="1"/>`;
  const xl = px(0) - 8;
  b += dim(xl, py(0), xl, py(A)) + dim(xl - 3, py(A), px(T), py(A)) + dim(xl - 3, py(0), xl + 3, py(0));
  b += `<text x="${xl - 3}" y="${(py(0) + py(A)) / 2 + 3}" text-anchor="end" fill="${C.ink}">${A.toFixed(0)}</text>`;
  b += `<text x="${(xl + px(T)) / 2}" y="${py(A) - 4}" text-anchor="middle" fill="${C.ink}">${T.toFixed(0)}</text>`;
  const yD = H - 12;
  b += dim(px(0), yD, px(D), yD) + dim(px(0), yD - 3, px(0), yD + 3) + dim(px(D), yD - 3, px(D), yD + 3);
  b += `<text x="${(px(0) + px(D)) / 2}" y="${yD - 3}" text-anchor="middle" fill="${C.ink}">${D.toFixed(0)} m</text>`;
  for (const [x, y, tip] of [
    [T, A, `At 90°: advance ${A.toFixed(0)} m, transfer ${T.toFixed(0)} m`],
    [D, y180, `At 180°: tactical diameter ${D.toFixed(0)} m (${(D / lengthM).toFixed(1)} lengths)`],
  ] as [number, number, string][]) {
    b += `<circle cx="${px(x)}" cy="${py(y)}" r="4" fill="${C.data}" stroke="${C.surface}" stroke-width="2"/><circle cx="${px(x)}" cy="${py(y)}" r="11" fill="transparent" data-tip="${esc(tip)}"/>`;
  }
  return svg(b, `Turning circle: advance ${A.toFixed(0)} m, transfer ${T.toFixed(0)} m, tactical diameter ${D.toFixed(0)} m`);
}

/** The roll decay: the damped swing fitted to her period and damping, the measured peaks as dots. */
function roll(t: SeaTrialResults): string {
  const m = t.motions;
  const peaks = m.rollPeaks;
  if (!peaks.length || !(m.rollPeriod > 0)) return '';
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const T = m.rollPeriod;
  const n = peaks.length;
  const tEnd = (n - 1 + 0.5) * (T / 2);
  const top = Math.ceil(Math.max(...peaks));
  const x = (s: number) => M.l + (s / tEnd) * pw;
  const y = (deg: number) => M.t + ph / 2 - (deg / top) * (ph / 2);
  // (Too heavily damped to measure, NaN, a catamaran's dying in one swing: the dots only, and said so.)
  const measured = Number.isFinite(m.rollDampingRatio);
  const zeta = measured ? Math.min(0.9, m.rollDampingRatio) : 0;
  const wn = (2 * Math.PI) / T;
  let b = '';
  for (const v of [-top, 0, top]) {
    b += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
    b += `<text x="${M.l - 3}" y="${y(v) + 3}" text-anchor="end" fill="${C.muted}">${v}°</text>`;
  }
  for (let s = 0; s <= tEnd + 1e-9; s += Math.max(1, Math.round(tEnd / 4))) b += `<text x="${x(s)}" y="${H - 5}" text-anchor="middle" fill="${C.muted}">${s} s</text>`;
  // θ(t) = θ0 e^(-ζ ωn t) cos(ωd t), from the first peak.
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const s = (i / 80) * tEnd;
    pts.push(`${x(s)},${y(peaks[0] * Math.exp(-zeta * wn * s) * Math.cos(wn * Math.sqrt(1 - zeta * zeta) * s))}`);
  }
  if (measured) b += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.data}" stroke-width="2" stroke-linejoin="round"/>`;
  peaks.forEach((p, i) => {
    const s = i * (T / 2);
    const deg = i % 2 ? -p : p;
    b += `<circle cx="${x(s)}" cy="${y(deg)}" r="4" fill="${C.data}" stroke="${C.surface}" stroke-width="2"/><circle cx="${x(s)}" cy="${y(deg)}" r="10" fill="transparent" data-tip="Swing ${i + 1}: ${p.toFixed(1)}° at ${s.toFixed(1)} s"/>`;
  });
  return svg(b, `Roll decay: period ${f1(T)} s, ${measured ? `damping ${(zeta * 100).toFixed(0)} % of critical` : 'heavily damped (she settles in one swing)'}`);
}

/** Stopping: crash stop and coasting, as bars in metres, with boat lengths. */
function stopping(t: SeaTrialResults, lengthM: number): string {
  const w = 300;
  const rows: [string, number, string][] = [
    ['Crash stop', t.crashStopDistance, `Full ahead to full astern: ${t.crashStopDistance.toFixed(0)} m in ${f1(t.crashStopTime)} s`],
    ['Coast to 1 kn', t.coastDistance, `Full ahead to neutral: ${t.coastDistance.toFixed(0)} m to slow to 1 kn`],
  ];
  const left = 74;
  const right = 118;
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const bw = w - left - right;
  let b = '';
  rows.forEach(([name, v, tip], i) => {
    const y = 6 + i * 22;
    const len = Math.max(4, (v / max) * bw);
    b += `<text x="0" y="${y + 11}" fill="${C.ink}">${name}</text>`;
    // A bar 14 px thick, square at the baseline, rounded at its end.
    b += `<path d="M${left},${y} h${len - 4} a4,4 0 0 1 4,4 v6 a4,4 0 0 1 -4,4 h${-(len - 4)} Z" fill="${C.data}"/>`;
    b += `<text x="${left + len + 4}" y="${y + 11}" fill="${C.ink}"><tspan font-weight="600">${v.toFixed(0)} m</tspan> · ${(v / lengthM).toFixed(1)} lengths</text>`;
    b += `<rect x="0" y="${y - 3}" width="${w}" height="20" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  return svg(b, 'Stopping distances', w, 50).replace('font-size="10"', 'font-size="11"');
}

/** The trial's charts, as HTML for the right-hand column. */
export function trialCharts(t: SeaTrialResults, lengthM: number, brief: { speedKn: number; rangeNm: number }): string {
  const st = t.speedTable;
  const card = (title: string, body: string, wide = false) => (body ? `<figure class="chart${wide ? ' wide' : ''}"><figcaption>${title}</figcaption>${body}</figure>` : '');
  return (
    card('Speed by lever (kn)', byLever(st.map((r) => ({ lever: r.lever, v: r.knots, tip: `${Math.round(r.lever * 100)} % lever: ${f1(r.knots)} kn at ${Math.round(r.rpm)} rpm` })), 'kn', brief.speedKn, 'Speed by lever')) +
    card('Range by lever (nm)', byLever(st.map((r) => ({ lever: r.lever, v: r.rangeNm, tip: `${Math.round(r.lever * 100)} % lever: ${r.rangeNm.toFixed(0)} nm, burning ${r.fuelLph.toFixed(0)} L/h` })), 'nm', brief.rangeNm, 'Range by lever')) +
    card('Turning circle, hard over', turning(t, lengthM)) +
    card('Roll decay from 10°', roll(t)) +
    card('Stopping from full ahead', stopping(t, lengthM), true)
  );
}
