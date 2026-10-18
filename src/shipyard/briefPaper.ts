/**
 * The brief as a typed document (owner, Oct 2026): at the Brief step the middle of the page
 * shows the brief being written, on what looks like the yard's official paper, rather than a
 * 3D boat (which everyone in a session wanted to turn round instead of agreeing the brief).
 * It fills in as the boxes on the left are ticked: her duties, her requirements, a rough
 * sketch of the kind of boat they add up to, and the hull type that fits them best.
 *
 * The sketch is deliberately abstract (a pencil profile, not to scale): a house forward over a
 * long working deck if she works on deck, a deep short hull if she tows, a raked bow if she's
 * fast, and a mark for each job's gear (crates, pots, a crane, an A-frame, a tow hook, a fire
 * monitor, a searchlight and ring).
 */
import { JOBS, type Brief, type JobId } from './brief';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The kind of hull the brief's sketch draws. */
export type SketchHull = 'tug' | 'fast' | 'work';

/** What the sketch shows, from the brief (kept apart from the drawing, for the tests). */
export function sketchPlan(brief: Brief): { hull: SketchHull; houseForward: boolean; marks: string[] } {
  const has = (j: JobId) => brief.jobs.includes(j);
  const hull: SketchHull = has('towing') ? 'tug' : brief.speedKn >= 20 ? 'fast' : 'work';
  // Work on deck (cargo, pots, a tow, a trawl, a crane): the house forward, the deck aft.
  const houseForward = has('cargo') || has('potting') || has('towing') || has('trawl') || brief.crane;
  const marks: string[] = [];
  if (has('cargo')) marks.push('crates');
  if (has('potting')) marks.push('pots');
  if (brief.crane || has('cargo')) marks.push('crane');
  if (has('trawl')) marks.push('aFrame');
  if (has('towing')) marks.push('towHook');
  if (has('fire')) marks.push('monitor');
  if (has('rescue')) marks.push('searchlight', 'ring');
  return { hull, houseForward, marks };
}

/** The abstract profile, as an SVG (bow to the right, as a profile is drawn). */
export function briefSketch(brief: Brief): string {
  const { hull, houseForward, marks } = sketchPlan(brief);
  const W = 600;
  const wl = 150; // the waterline
  // Her profile: stern, deck line to the bow, the stem, keel back to the stern.
  const shape = {
    work: { stern: 60, bow: 540, sternY: 98, bowY: 80, stem: 'L 522 140 Q 512 160 494 166', keel: 168 },
    tug: { stern: 100, bow: 500, sternY: 92, bowY: 78, stem: 'L 500 150 Q 496 170 470 176', keel: 178 },
    fast: { stern: 60, bow: 556, sternY: 100, bowY: 76, stem: 'L 470 162', keel: 166 },
  }[hull];
  const deckY = (x: number) => shape.sternY + ((shape.bowY - shape.sternY) * (x - shape.stern)) / (shape.bow - shape.stern);
  const out: string[] = [];
  out.push(`<path class="hull" d="M ${shape.stern} ${shape.sternY} Q ${(shape.stern + shape.bow) / 2} ${deckY((shape.stern + shape.bow) / 2) + 6} ${shape.bow} ${shape.bowY} ${shape.stem} L ${shape.stern + 26} ${shape.keel} L ${shape.stern} ${shape.sternY + 30} Z"/>`);
  if (hull === 'tug') out.push(`<path class="hull" d="M 500 84 Q 516 112 500 146"/>`); // the push fender
  out.push(`<path class="wl" d="M 30 ${wl} L ${W - 30} ${wl}"/>`);
  // The house: forward over a working deck, else amidships.
  const len = shape.bow - shape.stern;
  const h0 = houseForward ? shape.stern + 0.58 * len : shape.stern + 0.38 * len;
  const h1 = h0 + 0.2 * len;
  const hy = deckY(h0);
  const roof = hy - 46;
  out.push(`<path class="ink" d="M ${h0} ${hy} L ${h0 + 4} ${roof} L ${h1 + 6} ${roof} L ${h1 + 14} ${deckY(h1)}"/>`);
  out.push(`<path class="thin" d="M ${h0 + 10} ${roof + 8} L ${h1 + 4} ${roof + 8} L ${h1 + 9} ${roof + 22} L ${h0 + 9} ${roof + 22} Z"/>`); // her windows
  out.push(`<path class="ink" d="M ${(h0 + h1) / 2} ${roof} L ${(h0 + h1) / 2} ${roof - 22}"/>`); // the mast
  // The working deck, aft of the house (or the stern quarter, with the house amidships).
  const d0 = shape.stern + 18;
  const d1 = houseForward ? h0 - 12 : shape.stern + 0.3 * len;
  const at = (k: number) => d0 + (d1 - d0) * k;
  for (const m of marks) {
    if (m === 'crates') for (const [k, row] of [[0.35, 0], [0.5, 0], [0.42, 1]] as const) {
      const x = at(k);
      const y = deckY(x) - 14 * (row + 1);
      out.push(`<rect class="thin" x="${x}" y="${y}" width="22" height="14"/>`);
    }
    if (m === 'pots') for (const [k, row] of [[0.62, 0], [0.75, 0], [0.68, 1]] as const) {
      const x = at(k);
      const y = deckY(x) - 12 * (row + 1);
      out.push(`<path class="thin" d="M ${x} ${y + 12} L ${x} ${y + 3} Q ${x + 9} ${y - 3} ${x + 18} ${y + 3} L ${x + 18} ${y + 12} Z"/>`);
    }
    if (m === 'crane') {
      const x = houseForward ? h0 - 8 : at(0.9);
      const y = deckY(x);
      out.push(`<path class="ink" d="M ${x} ${y} L ${x} ${y - 40} L ${x - 70} ${y - 58}"/><path class="thin" d="M ${x - 70} ${y - 58} L ${x - 70} ${y - 34}"/>`);
    }
    if (m === 'aFrame') {
      const x = shape.stern + 6;
      const y = deckY(x);
      out.push(`<path class="ink" d="M ${x + 20} ${y} L ${x - 6} ${y - 52} L ${x - 14} ${y - 52}"/><path class="thin" d="M ${x - 10} ${y - 52} L ${x - 10} ${y - 20}"/>`);
    }
    if (m === 'towHook') {
      const x = houseForward ? h0 - 26 : at(0.8);
      const y = deckY(x);
      out.push(`<path class="ink" d="M ${x} ${y} L ${x} ${y - 16} Q ${x - 6} ${y - 22} ${x - 10} ${y - 16}"/><path class="dash" d="M ${x - 10} ${y - 16} Q ${(x + shape.stern) / 2 - 40} ${y - 4} 20 ${wl - 4}"/>`);
    }
    if (m === 'monitor') {
      const x = h1 - 6;
      out.push(`<path class="ink" d="M ${x} ${roof} L ${x} ${roof - 10} L ${x + 14} ${roof - 16}"/><path class="dash" d="M ${x + 16} ${roof - 18} Q ${x + 80} ${roof - 70} ${Math.min(W - 20, x + 150)} ${roof - 10}"/>`);
    }
    if (m === 'searchlight') {
      const x = h0 + 16;
      out.push(`<circle class="thin" cx="${x}" cy="${roof - 7}" r="6"/><path class="dash" d="M ${x + 6} ${roof - 7} L ${x + 120} ${roof - 36} M ${x + 6} ${roof - 7} L ${x + 120} ${roof + 10}"/>`);
    }
    if (m === 'ring') out.push(`<circle class="thin" cx="${(h0 + h1) / 2}" cy="${hy - 16}" r="7"/><circle class="thin" cx="${(h0 + h1) / 2}" cy="${hy - 16}" r="3.5"/>`);
  }
  // (No pencil-wobble filter: an SVG turbulence filter is slow to draw on a phone or headset.)
  return `<svg class="sketch" viewBox="0 0 ${W} 210" role="img" aria-label="A rough sketch of the kind of boat the brief describes">${out.join('')}</svg>`;
}

/** A reference for the brief (letters and digits from its name), as an office would number it. */
function refOf(brief: Brief): string {
  let h = 7;
  for (const c of brief.name || 'brief') h = (h * 31 + c.charCodeAt(0)) % 9000;
  return `DB-${1000 + h}`;
}

/** Money as written on a form. */
const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** The brief's document (HTML), with the best hull type for it if one's ranked. */
export function briefPaper(brief: Brief, best: { name: string; verdict: string } | null, date = new Date()): string {
  const line = (label: string, value: string) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  const none = '<span class="none">no requirement</span>';
  const want = (v: number, show: (v: number) => string) => (v > 0 ? show(v) : none);
  const has = (j: JobId) => brief.jobs.includes(j);
  const duties = JOBS.map((j) => `<li class="${has(j.id) ? 'on' : ''}"><span class="box">${has(j.id) ? '✕' : ''}</span>${esc(j.name)}<span class="what">${esc(j.what)}</span></li>`).join('');
  const reqs = [
    line('Speed, at least', want(brief.speedKn, (v) => `${v} knots`)),
    line('Range flat out, at least', want(brief.rangeNm, (v) => `${v} nautical miles`)),
    line('Price, at most', want(brief.budget, pounds)),
    line('Stability (GM), at least', want(brief.gmM, (v) => `${v.toFixed(2)} m`)),
    line('Deck crane', brief.crane ? 'required' : none),
    ...(has('cargo') ? [line('Crates on deck, at least', String(brief.crates))] : []),
    ...(has('potting') ? [line('Pots on deck, at least', String(brief.pots))] : []),
    ...(has('towing') ? [line('Bollard pull', 'enough for a barge')] : []),
  ].join('');
  const agreed = brief.hull !== null;
  const date10 = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="paper">
  <div class="letterhead"><b>WORKBOAT WORLD SHIPYARD</b><span>Naval architects &amp; boatbuilders · Calder Haven</span></div>
  <h1>Design brief</h1>
  <table class="refs">${line('Ref.', refOf(brief))}${line('Date', date10)}${line('Vessel', brief.name ? esc(brief.name) : '<span class="none">to be named</span>')}</table>
  <h2>1. Duties</h2>
  <ul class="duties">${duties}</ul>
  <h2>2. Requirements</h2>
  <table class="reqs">${reqs}</table>
  <h2>3. Arrangement <span class="none">(sketch, not to scale)</span></h2>
  ${briefSketch(brief)}
  <h2>4. Recommended type</h2>
  <p>${best ? `${esc(best.name)}${best.verdict ? ` <span class="none">(${esc(best.verdict.toLowerCase())})</span>` : ''}` : '<span class="none">tick her duties to see the types that suit</span>'}</p>
  <div class="sign"><span>For the yard</span><span>For the owner</span></div>
  <div class="stamp ${agreed ? 'agreed' : 'draft'}">${agreed ? 'Agreed' : 'Draft'}</div>
</div>`;
}
