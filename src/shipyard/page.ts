/**
 * The Shipyard page (shipyard.html; owner, Oct 2026): design a boat and get her code.
 *
 *   1. hull type, and sliders for her length, beam, depth and bulwarks;
 *   2. the wheelhouse: where it sits, its length, width and headroom, a step-down floor;
 *   3. the engine (her gearbox is matched to it by trial, in the background);
 *   4. the controls package, basic or advanced;
 *   5. her paint.
 * As you go: a 3D view of her (drawn by the game's own hull and module code), her figures,
 * warnings, and the game's own sea trials run on her. Her 10-character code (design.ts)
 * starts the game in her (?design=CODE); later, it's what you buy her with at the boatyard.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BoatView } from '../app/boatView';
import { LIBRARY, RECIPES } from '../boats/library';
import { useDesign } from '../boats/sims';
import { assembleView } from '../modular/assemble';
import type { SeaTrialResults } from '../vessel/seaTrials';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { buildVesselMesh } from '../vessel/view/hullMesh';
import { DESIGN_HULLS, ENGINES, LIVERIES, ROOF_PAINTS, type DesignedBoat } from './build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, FIELDS, SCALES, type ShipDesign } from './design';
import { UndoStack } from './undo';
import { YardLink } from './yardLink';
import { Keeper, newSessionId, sessionIdFrom, type DesignPatch, type Person, type SessionEvents } from './session';
import { cleanDoc, diffFields, fork, MAIN, mergePatch, newDoc, promote, type Variant, type YardDoc } from './variants';
import { LoopbackHost } from '../net/transport';
import { fromFrac, noteId, toFrac, todo, type Frac, type Mark, type Note, type Pin } from './notes';
import { addFavourite, cleanName, readFavourites, removeFavourite, writeFavourites, type Favourite, type Store } from './favourites';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stepsOf = (k: keyof ShipDesign) => FIELDS.find((f) => f.key === k)!.steps;

// ── State ──
const fromHash = decodeDesign(decodeURIComponent(location.hash.slice(1)));
/** A shared session's id (?s=...), and this browser's last copy of it (designing together, session.ts). */
let sessionId = sessionIdFrom(location.search);
/**
 * Everything this browser holds: the main design and its variants, each with its pins and
 * marks (variants.ts). On your own it lives in `solo`, a session keeper with nobody else
 * connected, so working alone and together go through the same code; in a session, in the
 * session's copy (link.side). `active` is the tab you're on.
 */
const startDoc: YardDoc = readDocCopy(sessionId ?? 'solo') ?? newDoc('design' in fromHash ? fromHash.design : { ...DEFAULT_DESIGN });
let active = MAIN;
if (!sessionId && 'design' in fromHash) {
  // Opened with a code: the variant that is that design, or else the code becomes the main design.
  const same = startDoc.variants.find((v) => !diffFields(v.design, fromHash.design).length);
  if (same) active = same.id;
  else startDoc.variants[0] = { ...startDoc.variants[0], design: fromHash.design };
}
let design: ShipDesign = { ...startDoc.variants.find((v) => v.id === active)!.design };
let boat: DesignedBoat = useDesign(design);
/** The choices her gearbox was matched for (not the paint or the controls, which don't change it). */
const matchKey = (d: ShipDesign) => JSON.stringify({ ...d, gear: 0, paint: 0, controls: 0 });
let matchedFor: string | null = matchKey(design); // a loaded code (or the default) comes matched
let trial: SeaTrialResults | null = null;
/** The choices `trial` was run for: while they differ from now, its figures are greyed (a new run is coming). */
let trialFor = '';

// ── The 3D view ──
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c8);
scene.add(new THREE.HemisphereLight(0xe8f0f8, 0x55606a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-8, 14, -6);
scene.add(sun);
const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2d6a8e, transparent: true, opacity: 0.55, depthWrite: false }));
scene.add(water);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
let boatRoot: THREE.Object3D | null = null;

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

const VIEWS: Record<string, () => { eye: [number, number, number]; at: [number, number, number] }> = {
  'Bow ¾': () => ({ eye: [-0.65 * L(), 0.45 * L(), -0.9 * L()], at: [0, 1, 0] }),
  // From starboard, so her bow is to the right, as a profile is always drawn (owner).
  Side: () => ({ eye: [1.5 * L(), 0.25 * L(), 0], at: [0, 1, 0] }),
  'Stern ¾': () => ({ eye: [0.65 * L(), 0.45 * L(), 0.9 * L()], at: [0, 1, 0] }),
  Plan: () => ({ eye: [0, 1.7 * L(), 0.01], at: [0, 0, 0] }),
  'At the helm': () => {
    const [x, y, z] = boat.hull.helm.stand;
    return { eye: [x, y + 1.65, z], at: [x, y + 1.3, z - 6] };
  },
};
const L = () => boat.figures.lengthM;
function setView(name: string): void {
  const v = VIEWS[name]();
  camera.position.set(...v.eye);
  orbit.target.set(...v.at);
  orbit.update();
}
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setView(name);
  $('views').appendChild(b);
}
const waterBtn = document.createElement('button');
waterBtn.textContent = 'Water on/off';
waterBtn.onclick = () => (water.visible = !water.visible);
$('views').appendChild(waterBtn);

/** Draw her: the game's hull mesh and her modules, as the game builds them. */
function drawBoat(): void {
  if (boatRoot) {
    scene.remove(boatRoot);
    boatRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
  const def = VESSEL_DEFS.design;
  const root = new THREE.Group();
  root.add(buildVesselMesh(def.hull, def.layout, def.exhaust?.position, def.livery));
  const modules = assembleView(RECIPES.design, def, LIBRARY);
  root.add(new BoatView('design', def, modules, true).root);
  scene.add(root);
  boatRoot = root;
  // Her extent: the frame for pins and marks (hull fractions, notes.ts).
  const box = hullBox(root);
  hullMin = box.min.toArray();
  hullMax = box.max.toArray();
  if (typeof drawNotes === 'function') drawNotes();
}
/**
 * Her hull and house's extent (the hull mesh: the first child), not the whole view: lights'
 * glows and the searchlight's beam reach far beyond her and would throw the frame out.
 */
function hullBox(root: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(root.children[0] ?? root);
}
let hullMin = [0, 0, 0];
let hullMax = [1, 1, 1];

// ── The controls ──
const controls = $('controls');
function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  controls.appendChild(h);
  return controls;
}
function choices(key: keyof ShipDesign, items: { name: string; note?: string }[], patch: (i: number) => Partial<ShipDesign> = () => ({})): void {
  const box = document.createElement('div');
  items.forEach((it, i) => {
    const c = document.createElement('div');
    c.className = 'choice';
    c.dataset.key = key;
    c.dataset.i = String(i);
    c.innerHTML = `<b>${it.name}</b>${it.note ? `<div style="font-size:12px;color:#567">${it.note}</div>` : ''}`;
    c.onclick = () => change({ [key]: i, ...patch(i) });
    box.appendChild(c);
  });
  controls.appendChild(box);
}
const outputs: Partial<Record<keyof ShipDesign, (v: number) => string>> = {};
/** Each field's label and, for a few set options, their names (the compare list shows them). */
const labels: Partial<Record<keyof ShipDesign, string>> = { hull: 'Hull', engine: 'Engine', twin: 'Engines', controls: 'Controls', paint: 'Paint', roofPaint: 'Roof colour' };
const optionNames: Partial<Record<keyof ShipDesign, string[]>> = {};
function slider(key: keyof ShipDesign, label: string, show: (v: number) => string): void {
  labels[key] ??= label;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${label}</label><input type="range" min="0" max="${stepsOf(key) - 1}" step="1" data-key="${key}"><output data-key="${key}"></output>`;
  const input = row.querySelector('input')!;
  input.oninput = () => change({ [key]: Number(input.value) });
  // While you hold it, the others see your colour on it (session.ts presence).
  input.addEventListener('pointerdown', () => link?.side?.presence({ holding: key }));
  input.addEventListener('change', () => link?.side?.presence({ holding: null }));
  outputs[key] = show;
  controls.appendChild(row);
}
const pct = (k: number) => `${Math.round(k * 100)} %`;
/** A few set options in a row, as buttons (for choices with only a handful of settings). */
function options(key: keyof ShipDesign, label: string, names: string[]): void {
  labels[key] ??= label;
  optionNames[key] = names;
  const row = document.createElement('div');
  row.className = 'row opts';
  row.innerHTML = `<label>${label}</label><div></div>`;
  const box = row.querySelector('div')!;
  names.forEach((name, i) => {
    if (!name) return; // a step no longer offered
    const c = document.createElement('span');
    c.className = 'choice';
    c.dataset.key = key;
    c.dataset.i = String(i);
    c.textContent = name;
    c.onclick = () => change({ [key]: i });
    box.appendChild(c);
  });
  controls.appendChild(row);
}

section('1. Hull');
// Picking a hull starts her in her type's usual layout (the sliders then move it all).
choices('hull', DESIGN_HULLS.map((h) => ({ name: h.name.split(':')[0], note: h.name.split(':')[1]?.trim() })), (i) => DESIGN_HULLS[i].defaults);
slider('length', 'Length', () => `${boat.figures.lengthM.toFixed(2)} m`);
slider('beam', 'Beam', () => `${boat.figures.beamM.toFixed(2)} m`);
slider('depth', 'Depth', (v) => pct(SCALES.scale(v)));
slider('bulwark', 'Bulwarks', (v) => `${SCALES.bulwark(v).toFixed(1)} m`);
slider('bow', 'Bow rake', (v) => (v === 0 ? 'plumb' : `${SCALES.bow(v)}\u00b0`));
section('2. Wheelhouse');
slider('housePos', 'Position', (v) => (v === 0 ? 'right aft' : v === 15 ? 'right forward' : `${pct(SCALES.housePos(v))} fwd`));
slider('houseLength', 'Length', (v) => `${SCALES.houseLength(v).toFixed(1)} m`);
slider('houseWidth', 'Width', (v) => pct(SCALES.houseWidth(v)));
slider('headroom', 'Headroom', (v) => `${SCALES.headroom(v).toFixed(1)} m`);
const signed = (x: number, unit: string, digits = 0) => `${x > 0 ? '+' : ''}${x.toFixed(digits)}${unit}`;
slider('floor', 'Floor height', () => {
  const f = boat.figures.floorM;
  return Math.abs(f) < 0.05 ? 'at the deck' : `${signed(f, ' m', 1)}${f < 0 ? ' (sunk)' : ''}`;
});
slider('windowRake', 'Windows', (v) => {
  const a = SCALES.windowRake(v);
  return a === 0 ? 'upright' : a > 0 ? `${a}\u00b0 reverse` : `${-a}\u00b0 raked`;
});
slider('visor', 'Roof visor', (v) => `${SCALES.visor(v).toFixed(2)} m`);
options('roofThickness', 'Roof', [0, 1, 2].map((i) => `${Math.round(SCALES.roofThickness(i) * 100)} cm`));
options('roofEdge', 'Roof edge', ['', '30\u00b0', '45\u00b0', '60\u00b0']);
section('3. Engine');
choices('engine', ENGINES.map((e) => ({ name: e.name, note: `${e.kg} kg with its gearbox. Propeller and gearbox matched to her by trial.` })));
{
  const row = document.createElement('label');
  row.className = 'choice';
  row.innerHTML = '<input type="checkbox" data-key="twin"> Twin engines: two of these, a propeller and rudder each, worked together from one lever';
  const box = row.querySelector('input')!;
  box.onchange = () => change({ twin: box.checked ? 1 : 0 });
  controls.appendChild(row);
}
section('4. Deck gear');
options('deckCrane', 'Deck crane', ['None', 'Foredeck', 'Aft deck']);
options('searchlight', 'Searchlight', ['None', 'Roof', 'Foredeck pole', 'Aft deck pole']);
options('fireMonitor', 'Fire monitor', ['None', 'Roof', 'Foredeck pole', 'Aft deck pole']);
section('5. Controls');
choices('controls', [
  { name: 'Basic', note: 'Wheel, throttle, key and start, speed and depth, rpm.' },
  { name: 'Advanced', note: 'Adds lights, wipers, horn, heading, engine monitor and the VHF, and the searchlight and fire monitor controls at the helm when they’re on poles.' },
]);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
section('6. Paint');
{
  const box = document.createElement('div');
  box.className = 'swatches';
  LIVERIES.forEach((l, i) => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.title = l.name;
    s.dataset.key = 'paint';
    s.dataset.i = String(i);
    s.style.background = hex(l.livery.topsides ?? 0xd9622b);
    s.onclick = () => change({ paint: i });
    box.appendChild(s);
  });
  controls.appendChild(box);
}
{
  // The roof's colour: the hull's own (its swatch follows the hull's paint), or one of its own.
  const row = document.createElement('div');
  row.className = 'row opts';
  row.innerHTML = '<label>Roof</label><div class="swatches"></div>';
  const box = row.querySelector('div')!;
  ROOF_PAINTS.forEach((p, i) => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.title = p.name;
    s.dataset.key = 'roofPaint';
    s.dataset.i = String(i);
    if (p.colour === null) {
      s.classList.add('likeHull');
      s.textContent = '=';
    } else s.style.background = hex(p.colour);
    s.onclick = () => change({ roofPaint: i });
    box.appendChild(s);
  });
  controls.appendChild(row);
}

/** Show the design in the controls. */
function syncControls(): void {
  const likeHull = document.querySelector<HTMLElement>('.swatch.likeHull');
  if (likeHull) likeHull.style.background = hex(LIVERIES[design.paint].livery.topsides ?? 0xd9622b);
  document.querySelectorAll<HTMLElement>('[data-key][data-i]').forEach((el) => el.classList.toggle('on', design[el.dataset.key as keyof ShipDesign] === Number(el.dataset.i)));
  document.querySelectorAll<HTMLInputElement>('input[type=range][data-key]').forEach((el) => (el.value = String(design[el.dataset.key as keyof ShipDesign])));
  document.querySelectorAll<HTMLOutputElement>('output[data-key]').forEach((el) => {
    const k = el.dataset.key as keyof ShipDesign;
    el.textContent = outputs[k]!(design[k]);
  });
  (document.querySelector('input[data-key=twin]') as HTMLInputElement).checked = !!design.twin;
}

// ── Figures, warnings, trial, code ──
function rows(el: HTMLElement, r: [string, string][]): void {
  el.innerHTML = r.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
}
function showFigures(): void {
  const f = boat.figures;
  const matched = matchedFor === matchKey(design);
  rows($('figures'), [
    ['Length overall x beam', `${f.lengthM.toFixed(2)} x ${f.beamM.toFixed(2)} m`],
    ['Displacement', `${f.massT.toFixed(2)} t`],
    ['Draught', `${f.draughtM.toFixed(2)} m`],
    ['Stability (GM)', `${f.gmM.toFixed(2)} m`],
    ['Engine', f.engine],
    ['Propeller', `${f.propellerM.toFixed(2)} m`],
    ['Gearbox', matched ? `${f.gear.toFixed(2)} : 1 (matched)` : 'matching...'],
    ['Price', `£${f.price.toLocaleString('en-GB')}`],
  ]);
  $('warnings').innerHTML = boat.warnings.map((w) => `<div>${w}</div>`).join('');
  showQuick();
}

/**
 * The line of key figures on the 3D view (always in sight, also on a phone): her
 * stability, displacement and the trial's headline numbers, greyed while a new trial runs.
 */
function showQuick(): void {
  const f = boat.figures;
  const t = trial;
  const stale = trialFor !== matchKey(design);
  const items: [string, string][] = [
    ['GM', `${f.gmM.toFixed(2)} m`],
    ['Disp.', `${f.massT.toFixed(1)} t`],
    ['Draught', `${f.draughtM.toFixed(2)} m`],
  ];
  if (t) {
    items.push(['Top', `${t.topSpeedKn.toFixed(1)} kn`], ['Turn', `${t.tacticalDiameter.toFixed(0)} m`], ['Stop', `${t.crashStopDistance.toFixed(0)} m`], ['Roll', `${t.motions.rollPeriod.toFixed(1)} s`]);
  }
  $('quick').innerHTML =
    items.map(([k, v], i) => `<span${i >= 3 && stale ? ' class="busy"' : ''}>${k} <b>${v}</b></span>`).join('') + (stale || !t ? '<span class="busy">trial running…</span>' : '');
}
function showTrial(): void {
  const t = trial;
  showQuick();
  if (!t) {
    $('trial').innerHTML = '';
    return;
  }
  // Greyed while it's the last design's trial and a new one is running.
  $('trial').style.opacity = trialFor === matchKey(design) ? '1' : '0.45';
  const top = t.speedTable[t.speedTable.length - 1];
  const three = t.speedTable[2];
  rows($('trial'), [
    ['Top speed', `${t.topSpeedKn.toFixed(1)} kn at ${Math.round(top.rpm)} rpm`],
    ['Three-quarter lever', `${three.knots.toFixed(1)} kn`],
    ['Fuel flat out', `${top.fuelLph.toFixed(0)} L/h, ${top.rangeNm.toFixed(0)} nm`],
    ['Rest to 90 % of top speed', `${t.timeTo90Pct.toFixed(1)} s`],
    ['Turning circle (tactical)', `${t.tacticalDiameter.toFixed(0)} m`],
    ['Crash stop', `${t.crashStopDistance.toFixed(0)} m in ${t.crashStopTime.toFixed(1)} s`],
    ['Bollard pull', `${(t.bollard.aheadKN / 9.81).toFixed(2)} t`],
    ['Roll period', `${t.motions.rollPeriod.toFixed(1)} s`],
  ]);
}
function showCode(): void {
  const matched = matchedFor === matchKey(design);
  const el = $('code');
  el.classList.toggle('pending', !matched);
  if (!matched) {
    el.textContent = 'matching...';
    return;
  }
  const code = encodeDesign(design);
  el.textContent = code;
  ($('play') as HTMLAnchorElement).href = `./?design=${code}`;
  history.replaceState(null, '', `#${code}`);
  markCurrent();
}

// ── Trials in the background (worker.ts) ──
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let trialId = 0;
let trialTimer = 0;
worker.onmessage = (e: MessageEvent<{ id: number; design: ShipDesign; trials?: SeaTrialResults; error?: string }>) => {
  if (e.data.id !== trialId) return; // the design changed since: a newer trial is coming
  if (e.data.error) {
    $('status').textContent = `The trial failed: ${e.data.error}`;
    return;
  }
  // Her matched gearbox (only the gear can differ from what was sent).
  design = { ...design, gear: e.data.design.gear };
  matchedFor = matchKey(design);
  boat = useDesign(design);
  trial = e.data.trials ?? null;
  trialFor = matchKey(design);
  $('status').textContent = 'Calm water, flat out, hard over, crash stop: the game’s own physics.';
  showFigures();
  showTrial();
  showCode();
};
function runTrial(): void {
  clearTimeout(trialTimer);
  const id = ++trialId;
  const match = matchedFor !== matchKey(design);
  $('status').textContent = match ? 'Matching her propeller and running her trials...' : 'Running her trials...';
  trialTimer = window.setTimeout(() => worker.postMessage({ id, design, match }), 500);
}

/** A choice changed: rebuild and redraw her, then re-run her trials. */
function change(patch: Partial<ShipDesign>, by: 'me' | Person | null = 'me'): void {
  const before = matchKey(design);
  if (by === 'me') share(patch);
  else if (by) flash(patch, by);
  design = { ...design, ...patch };
  saveSessionCopy();
  boat = useDesign(design);
  syncControls();
  drawBoat();
  showFigures();
  showCode();
  if (matchKey(design) !== before || !trial) runTrial();
  showTrial();
}

// ── Code tools ──
$('copy').onclick = () => {
  if (matchedFor === matchKey(design)) void navigator.clipboard?.writeText(encodeDesign(design));
};
/** Open a design by its code (typed in, or a favourite). False, with the reason shown, if it won't read. */
function openCode(code: string, msg: HTMLElement): boolean {
  const read = decodeDesign(code);
  if ('error' in read) {
    msg.textContent = read.error;
    return false;
  }
  msg.textContent = '';
  share(read.design);
  design = read.design;
  matchedFor = matchKey(design);
  trial = null;
  change({});
  runTrial();
  return true;
}
const loadCode = () => openCode(($('load') as HTMLInputElement).value, $('loadMsg'));
$('loadBtn').onclick = loadCode;

// ── Favourites (favourites.ts): kept in this browser, by name ──
/** The browser's storage, if it lets us have it (it can refuse: private windows, blocked sites). */
function storage(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
/** Her hull type and length: the name a favourite gets if you don't give one. */
const defaultName = () => `${DESIGN_HULLS[design.hull].name.split(':')[0].trim()} ${boat.figures.lengthM.toFixed(1)} m`;
/** A small picture of her from the bow quarter (the view put back after). */
function picture(): string {
  const keep = { eye: camera.position.clone(), at: orbit.target.clone() };
  setView('Bow ¾');
  renderer.render(scene, camera);
  const small = document.createElement('canvas');
  small.width = 192;
  small.height = 120;
  const src = renderer.domElement;
  // Cropped to the small picture's shape, from the middle.
  const k = Math.min(src.width / small.width, src.height / small.height);
  const w = small.width * k;
  const h = small.height * k;
  small.getContext('2d')?.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, small.width, small.height);
  camera.position.copy(keep.eye);
  orbit.target.copy(keep.at);
  orbit.update();
  return small.toDataURL('image/jpeg', 0.7);
}
function saveFavourite(): void {
  const msg = $('favMsg');
  if (matchedFor !== matchKey(design)) {
    msg.textContent = 'Wait a moment: her gearbox is still being matched (her code isn’t ready).';
    return;
  }
  const nameBox = $('favName') as HTMLInputElement;
  const name = cleanName(nameBox.value, defaultName());
  const f = boat.figures;
  const summary = [`${f.lengthM.toFixed(1)} m`, `${f.massT.toFixed(1)} t`, trial ? `${trial.topSpeedKn.toFixed(1)} kn` : '', f.engine].filter(Boolean).join(' · ');
  const fav: Favourite = { name, code: encodeDesign(design), savedAt: Date.now(), picture: picture(), summary };
  const list = addFavourite(readFavourites(storage()), fav);
  // If the browser's storage is full, keep the designs and drop the pictures.
  const ok = writeFavourites(storage(), list) || writeFavourites(storage(), list.map((x) => ({ ...x, picture: '' })));
  msg.textContent = ok ? `Saved as “${name}”.` : 'This browser won’t save (private window, or storage switched off). Copy her code instead.';
  if (ok) nameBox.value = '';
  showFavourites();
}
$('favSave').onclick = saveFavourite;
$('favName').addEventListener('keydown', (e) => e.key === 'Enter' && saveFavourite());
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The list, newest first; the one you're looking at now marked. */
function showFavourites(): void {
  const box = $('favs');
  const list = readFavourites(storage());
  box.innerHTML = list.length ? '' : '<div class="meta">None yet. Name her and save her to keep her here (in this browser).</div>';
  for (const f of list) {
    const card = document.createElement('div');
    card.className = 'fav';
    card.dataset.code = f.code;
    const when = new Date(f.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    card.innerHTML = `${f.picture ? `<img alt="" src="${f.picture}">` : '<div class="nopic"></div>'}<div><b title="${esc(f.name)}">${esc(f.name)}</b><div class="meta">${esc(f.summary)}</div><div class="code">${esc(f.code)} · ${when}</div><div class="acts"><button data-act="open">Open</button><button data-act="play">Try in game</button><button data-act="del">Delete</button></div></div>`;
    card.querySelector<HTMLElement>('[data-act=open]')!.onclick = () => openCode(f.code, $('favMsg'));
    card.querySelector<HTMLElement>('[data-act=play]')!.onclick = () => (location.href = `./?design=${encodeURIComponent(f.code)}`);
    card.querySelector<HTMLElement>('[data-act=del]')!.onclick = () => {
      if (!confirm(`Delete “${f.name}” from your favourites?`)) return;
      writeFavourites(storage(), removeFavourite(readFavourites(storage()), f.name, f.savedAt));
      showFavourites();
    };
    box.appendChild(card);
  }
  markCurrent();
}
/** Mark the favourite that is the design on show now (if any). */
function markCurrent(): void {
  const now = matchedFor === matchKey(design) ? encodeDesign(design) : '';
  document.querySelectorAll<HTMLElement>('.fav').forEach((el) => el.classList.toggle('current', el.dataset.code === now));
}
$('load').addEventListener('keydown', (e) => e.key === 'Enter' && loadCode());

// ── Undo (undo.ts) ──
let undo = new UndoStack();
/** A change of yours: onto your undo stack, and to the others if designing together. */
function share(patch: DesignPatch): void {
  undo.record(design, patch, Date.now());
  side().edit(patch, active);
  showUndo();
}
function showUndo(): void {
  ($('undo') as HTMLButtonElement).disabled = !undo.canUndo;
  ($('redo') as HTMLButtonElement).disabled = !undo.canRedo;
}
function undoRedo(redo: boolean): void {
  const patch = redo ? undo.redo() : undo.undo();
  if (!patch) return;
  side().edit(patch, active);
  change(patch, null);
  showUndo();
}
$('undo').onclick = () => undoRedo(false);
$('redo').onclick = () => undoRedo(true);
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'y') {
    e.preventDefault();
    undoRedo(k === 'y' || e.shiftKey);
  }
});

// ── Designing together (session.ts, yardLink.ts) ──
/** Where this browser keeps its copy of a session (a function: it's needed before this point). */
function SESSION_KEY(id: string): string {
  return `swvr.yard.session.${id}`;
}
const NAME_KEY = 'swvr.yard.name';
/** This browser's last copy of a session, or of working alone ('solo'): null if none, or unreadable. */
function readDocCopy(id: string): YardDoc | null {
  try {
    return cleanDoc(JSON.parse(storage()?.getItem(SESSION_KEY(id)) ?? 'null'));
  } catch {
    return null;
  }
}
let saveTimer = 0;
/** Keep this browser's copy of the session (so a session with nobody in it is still there). */
function saveSessionCopy(): void {
  // On your own (no session), the variants and notes are kept too, under 'solo'.
  const id = sessionId ?? 'solo';
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      storage()?.setItem(SESSION_KEY(id), JSON.stringify({ ...side().doc(), savedAt: Date.now() }));
    } catch {
      /* storage full or off: the session still works, it just isn't kept here */
    }
  }, 800);
}
function myName(): string {
  try {
    return storage()?.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
let link: YardLink | null = null;
let people: Person[] = [];
const STATE_TEXT = { connecting: 'Connecting…', keeping: 'Open: you’re keeping this session', joined: 'Joined', offline: 'Can’t connect (check your internet); your changes are kept in this browser' };
function startLink(id: string): void {
  link?.close();
  const from = side().doc();
  link = new YardLink(id, ($('myName') as HTMLInputElement).value || 'Designer', () => link?.side?.doc() ?? from, {
    ...handlers,
    onLost: () => ($('sessionState').textContent = 'The session’s keeper left: taking over…'),
    onState: (st) => ($('sessionState').textContent = STATE_TEXT[st]),
  });
  showSession();
}
function showSession(): void {
  $('together').classList.toggle('on', !!sessionId);
  if (!sessionId) return;
  ($('sessionLink') as HTMLInputElement).value = `${location.origin}${location.pathname}?s=${sessionId}`;
}
/** The people here, as coloured name chips; and their hands on the controls. */
function showPeople(): void {
  const me = link?.side?.me;
  $('people').innerHTML = people.map((p) => `<span class="chip" style="--c:${p.colour}">${esc(p.name)}${p.id === me ? ' (you)' : ''}</span>`).join('');
  document.querySelectorAll<HTMLElement>('.row.held').forEach((r) => {
    r.classList.remove('held');
    r.removeAttribute('data-who');
  });
  for (const p of people) {
    if (p.id === me || !p.holding || p.variant !== active) continue;
    const row = document.querySelector<HTMLElement>(`input[data-key="${p.holding}"]`)?.closest<HTMLElement>('.row');
    if (!row) continue;
    row.classList.add('held');
    row.dataset.who = p.name;
    row.style.setProperty('--c', p.colour);
  }
  showCursors();
}
/** Someone else changed these fields: their controls flash in that person's colour. */
function flash(patch: DesignPatch, p: Person): void {
  for (const k of Object.keys(patch)) {
    document.querySelectorAll<HTMLElement>(`[data-key="${k}"]`).forEach((el) => {
      const box = el.closest<HTMLElement>('.row') ?? el;
      box.style.setProperty('--c', p.colour);
      box.classList.remove('flash');
      void box.offsetWidth; // restart the animation
      box.classList.add('flash');
    });
  }
}
// Pointers on the boat: yours shared ten times a second; the others' drawn as a coloured dot and name.
const cursorRay = new THREE.Raycaster();
let cursorAt = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!link?.side || !boatRoot || performance.now() - cursorAt < 100) return;
  cursorAt = performance.now();
  const r = renderer.domElement.getBoundingClientRect();
  cursorRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = cursorRay.intersectObject(boatRoot, true)[0];
  link.side.presence({ cursor: hit ? [hit.point.x, hit.point.y, hit.point.z] : null });
});
renderer.domElement.addEventListener('pointerleave', () => link?.side?.presence({ cursor: null }));
const cursors = new THREE.Group();
scene.add(cursors);
function showCursors(): void {
  for (const c of [...cursors.children]) {
    cursors.remove(c);
    c.traverse((o) => {
      const m = o as THREE.Mesh & THREE.Sprite;
      m.geometry?.dispose();
      (m.material as THREE.SpriteMaterial | undefined)?.map?.dispose();
    });
  }
  const me = link?.side?.me;
  for (const p of people) {
    if (p.id === me || !p.cursor || p.variant !== active) continue;
    const g = new THREE.Group();
    g.position.set(...p.cursor);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: p.colour, depthTest: false })));
    const label = nameTag(p.name, p.colour);
    label.position.y = 0.35;
    g.add(label);
    g.renderOrder = 10;
    cursors.add(g);
  }
}
/** A name on a small coloured tag, always facing you. */
function nameTag(name: string, colour: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(0, 8, 256, 48, 12);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '600 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 240);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, toneMapped: false }));
  s.scale.set(1.2, 0.3, 1);
  return s;
}
($('myName') as HTMLInputElement).value = myName();
$('myName').addEventListener('change', () => {
  const n = ($('myName') as HTMLInputElement).value.trim();
  try {
    storage()?.setItem(NAME_KEY, n);
  } catch {
    /* not kept: fine */
  }
  link?.rename(n || 'Designer');
});
$('startSession').onclick = () => {
  if (!($('myName') as HTMLInputElement).value.trim()) {
    ($('myName') as HTMLInputElement).focus();
    $('sessionState').textContent = 'Type your name first, so the others know who you are.';
    return;
  }
  sessionId = newSessionId();
  history.pushState(null, '', `?s=${sessionId}${location.hash}`);
  saveSessionCopy();
  startLink(sessionId);
};
$('copyLink').onclick = () => void navigator.clipboard?.writeText(($('sessionLink') as HTMLInputElement).value);
$('leaveSession').onclick = () => {
  // The session's variants and notes stay with you, on your own.
  solo = soloKeeper(side().doc());
  link?.close();
  link = null;
  people = [];
  sessionId = null;
  history.pushState(null, '', `${location.pathname}${location.hash}`);
  saveSessionCopy(); // the notes stay with you, on your own
  $('sessionState').textContent = 'Left the session. Your copy of her stays here.';
  showPeople();
  showSession();
};

// ── Pins and marks (notes.ts): anyone's notes on her, and the to-do list ──
let notes: Note[] = startDoc.variants.find((v) => v.id === active)!.notes;
/** Who I am on a note: my name and colour (my session colour, or the first). */
function author(): { by: string; colour: string } {
  const me = people.find((p) => p.id === link?.side?.me);
  return { by: me?.name ?? (($('myName') as HTMLInputElement).value.trim() || 'Me'), colour: me?.colour ?? '#d9622b' };
}
/** Put or change a note: shared in a session, else just here. */
function putMyNote(n: Note): void {
  side().note(n, active);
}
function dropMyNote(id: string): void {
  side().unnote(id, active);
}
function notesChanged(): void {
  drawNotes();
  showTodo();
  saveSessionCopy();
}
const notesGroup = new THREE.Group();
scene.add(notesGroup);
const fracToVec = (f: Frac) => new THREE.Vector3(...fromFrac(f, hullMin, hullMax));
/** The pins (numbered as on the list, in their author's colour; done ones faded) and the marks. */
function drawNotes(): void {
  for (const c of [...notesGroup.children]) {
    notesGroup.remove(c);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.SpriteMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose?.();
    });
  }
  todo(notes).forEach((pin, i) => {
    const at = fracToVec(pin.at);
    const g = new THREE.Group();
    g.position.copy(at);
    const opacity = pin.done ? 0.35 : 1;
    const head = pinHead(String(i + 1), pin.colour, opacity);
    head.position.y = 0.45;
    head.userData.pin = pin.id;
    const stalk = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.33, 0)]), new THREE.LineBasicMaterial({ color: pin.colour, transparent: true, opacity, depthTest: false }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6), new THREE.MeshBasicMaterial({ color: pin.colour, transparent: true, opacity, depthTest: false }));
    for (const o of [head, stalk, dot]) o.renderOrder = 11;
    g.add(stalk, dot, head);
    notesGroup.add(g);
  });
  for (const n of notes) {
    if (n.kind !== 'mark') continue;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(n.pts.map(fracToVec)), new THREE.LineBasicMaterial({ color: n.colour, depthTest: false }));
    line.renderOrder = 11;
    notesGroup.add(line);
  }
}
/** A round pin head with its number. */
function pinHead(label: string, colour: string, opacity: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, opacity, toneMapped: false }));
  s.scale.set(0.42, 0.42, 1);
  return s;
}
/** The to-do list: open pins, then done ones; and the marks' count. */
function showTodo(): void {
  const list = todo(notes);
  const marks = notes.filter((n): n is Mark => n.kind === 'mark');
  const open = list.filter((p) => !p.done).length;
  $('todoCount').textContent = list.length ? `${open} open, ${list.length - open} done` : '';
  const box = $('todo');
  box.innerHTML = list.length ? '' : '<div class="meta">No pins yet. Press 📍 Pin on the view and click her to put one, with a note.</div>';
  list.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = `todo${p.done ? ' done' : ''}`;
    row.dataset.pin = p.id;
    row.innerHTML = `<span class="badge" style="background:${p.colour}">${i + 1}</span><div><div class="text">${esc(p.text || '(no note)')}</div><div class="meta">${esc(p.by)}${p.done ? ` · done${p.doneBy ? ` by ${esc(p.doneBy)}` : ''}` : ''}</div></div><div class="acts"><button data-act="done">${p.done ? 'Reopen' : 'Done'}</button><button data-act="del" title="Delete">✕</button></div>`;
    row.querySelector<HTMLElement>('.text')!.onclick = () => lookAt(fracToVec(p.at));
    row.querySelector<HTMLElement>('[data-act=done]')!.onclick = () => putMyNote({ ...p, done: !p.done, ...(p.done ? { doneBy: undefined } : { doneBy: author().by }) });
    row.querySelector<HTMLElement>('[data-act=del]')!.onclick = () => {
      if (confirm(`Delete pin ${i + 1}${p.text ? `, “${p.text}”` : ''}?`)) dropMyNote(p.id);
    };
    box.appendChild(row);
  });
  $('marksLine').innerHTML = marks.length ? `${marks.length} mark${marks.length > 1 ? 's' : ''} drawn on her. <button id="undoMark">Remove my last</button> <button id="clearMarks">Clear all</button>` : '';
  $('marksLine').querySelector<HTMLElement>('#undoMark')?.addEventListener('click', () => {
    const mine = marks.filter((m) => m.by === author().by).sort((a, b) => a.t - b.t).pop();
    if (mine) dropMyNote(mine.id);
  });
  $('marksLine').querySelector<HTMLElement>('#clearMarks')?.addEventListener('click', () => {
    if (confirm('Clear everyone’s marks on her? (Pins stay.)')) for (const m of marks) dropMyNote(m.id);
  });
}
/** Turn the view to look at a point on her, from where you are. */
function lookAt(p: THREE.Vector3): void {
  const back = camera.position.clone().sub(orbit.target).setLength(Math.max(4, 0.45 * L()));
  orbit.target.copy(p);
  camera.position.copy(p).add(back);
  orbit.update();
}
// The tools on the view: 📍 Pin (click her, type a note) and ✏ Mark (draw on her).
let tool: 'pin' | 'mark' | null = null;
const toolBtns: Record<string, HTMLButtonElement> = {};
for (const [t, label] of [['pin', '📍 Pin'], ['mark', '✏ Mark']] as const) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = 'tool';
  b.onclick = () => setTool(tool === t ? null : t);
  toolBtns[t] = b;
  $('views').appendChild(b);
}
function setTool(t: typeof tool): void {
  tool = t;
  orbit.enabled = !t;
  for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('on', k === t);
  renderer.domElement.style.cursor = t ? 'crosshair' : '';
  $('toolHint').textContent = t === 'pin' ? 'Click on her where the pin goes' : t === 'mark' ? 'Draw on her; press ✏ Mark again to stop' : '';
  if (t !== 'pin') ($('pinEditor') as HTMLElement).hidden = true;
}
const noteRay = new THREE.Raycaster();
function hitBoat(e: PointerEvent): THREE.Vector3 | null {
  if (!boatRoot) return null;
  const r = renderer.domElement.getBoundingClientRect();
  noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  return noteRay.intersectObject(boatRoot, true)[0]?.point ?? null;
}
let pendingPin: Frac | null = null;
let stroke: THREE.Vector3[] | null = null;
let strokeLine: THREE.Line | null = null;
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (!tool) return;
  const hit = hitBoat(e);
  if (tool === 'pin') {
    if (!hit) return;
    pendingPin = toFrac(hit.toArray(), hullMin, hullMax);
    const ed = $('pinEditor');
    const r = $('view').getBoundingClientRect();
    ed.style.left = `${Math.min(r.width - 250, Math.max(8, e.clientX - r.left - 20))}px`;
    ed.style.top = `${Math.min(r.height - 90, e.clientY - r.top + 14)}px`;
    ed.hidden = false;
    ($('pinText') as HTMLInputElement).value = '';
    ($('pinText') as HTMLInputElement).focus();
  } else if (tool === 'mark' && hit) {
    stroke = [hit];
    strokeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(stroke), new THREE.LineBasicMaterial({ color: author().colour, depthTest: false }));
    strokeLine.renderOrder = 11;
    scene.add(strokeLine);
    renderer.domElement.setPointerCapture(e.pointerId);
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!stroke || !strokeLine) return;
  const hit = hitBoat(e);
  if (!hit || hit.distanceTo(stroke[stroke.length - 1]) < 0.04 || stroke.length >= 300) return;
  stroke.push(hit);
  strokeLine.geometry.dispose();
  strokeLine.geometry = new THREE.BufferGeometry().setFromPoints(stroke);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (stroke && strokeLine) {
    scene.remove(strokeLine);
    strokeLine.geometry.dispose();
    if (stroke.length >= 2) putMyNote({ id: noteId(link?.side?.me ?? ''), kind: 'mark', ...author(), t: Date.now(), pts: stroke.map((p) => toFrac(p.toArray(), hullMin, hullMax)) });
    stroke = null;
    strokeLine = null;
    return;
  }
  // A click (not a drag) on a pin: show it on the list.
  if (!tool && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
    const r = renderer.domElement.getBoundingClientRect();
    noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const id = noteRay.intersectObject(notesGroup, true).find((h) => h.object.userData.pin)?.object.userData.pin as string | undefined;
    const row = id ? document.querySelector<HTMLElement>(`.todo[data-pin="${id}"]`) : null;
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      row.classList.remove('flash');
      void row.offsetWidth;
      row.style.setProperty('--c', '#2f5d8a');
      row.classList.add('flash');
    }
  }
});
function addPin(): void {
  if (!pendingPin) return;
  const text = ($('pinText') as HTMLInputElement).value;
  putMyNote({ id: noteId(link?.side?.me ?? ''), kind: 'pin', ...author(), t: Date.now(), at: pendingPin, text: text.replace(/\s+/g, ' ').trim().slice(0, 140), done: false } satisfies Pin);
  pendingPin = null;
  setTool(null);
}
$('pinAdd').onclick = addPin;
$('pinText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addPin();
  if (e.key === 'Escape') setTool(null);
});
$('pinCancel').onclick = () => setTool(null);

// Leaving the page frees the session's id at once, so someone else can take over (PeerJS
// would otherwise hold it for up to a minute).
window.addEventListener('pagehide', () => link?.close());

// ── Working alone or together: one set of handlers (session.ts) ──
const handlers: SessionEvents = {
  onDesign: (_d, patch, by, v) => {
    if (by && by === side().me) return; // our own: already applied
    if (v === active) change(patch, people.find((p) => p.id === by) ?? null);
    showTabs();
    saveSessionCopy();
  },
  onNotes: (n, v) => {
    if (v !== active) return saveSessionCopy();
    notes = n;
    notesChanged();
  },
  onVariants: () => {
    const v = side().variant(active);
    if (!v) return switchTo(MAIN);
    // Replaced whole (joining, a promotion): take its design and notes.
    if (diffFields(design, v.design).length) loadVariant(v);
    else if (v.notes !== notes) {
      notes = v.notes;
      notesChanged();
    }
    showTabs();
    saveSessionCopy();
  },
  onPeople: (p) => {
    people = p;
    showPeople();
    showTabs();
  },
  onLost: () => {},
};
function soloKeeper(doc: YardDoc): Keeper {
  // A keeper with nobody connected: working alone goes through the same code as together.
  return new Keeper(doc, 'Me', new LoopbackHost(), handlers);
}
let solo = soloKeeper(startDoc);
/** Where the variants live now: the session's copy, or this browser's own. */
function side(): Keeper | NonNullable<YardLink['side']> {
  return link?.side ?? solo;
}

// ── Variants (variants.ts): tabs, fork, compare, merge, promote ──
/** Show a variant: its design (her gearbox matched again here) and its notes. */
function loadVariant(v: Variant): void {
  const before = matchKey(design);
  design = { ...v.design };
  if (matchKey(design) !== before) matchedFor = null;
  notes = v.notes;
  change({}, null);
  if (matchKey(design) !== before) runTrial();
  notesChanged();
}
function switchTo(id: string): void {
  const v = side().variant(id) ?? side().variant(MAIN)!;
  active = v.id;
  undo = new UndoStack(); // undo is per tab
  showUndo();
  loadVariant(v);
  link?.side?.presence({ variant: active });
  showTabs();
  showPeople();
}
/** The tabs over the view: one per variant, with who's on it; then Fork and Compare. */
function showTabs(): void {
  const box = $('tabs');
  box.innerHTML = '';
  for (const v of side().variants) {
    const t = document.createElement('button');
    t.className = `tab${v.id === active ? ' on' : ''}`;
    const here = people.filter((p) => p.variant === v.id && p.id !== link?.side?.me);
    t.innerHTML = `${esc(v.name)}${here.map((p) => `<i style="background:${p.colour}" title="${esc(p.name)}"></i>`).join('')}${v.id !== MAIN ? '<b title="Delete this variant">×</b>' : ''}`;
    t.title = v.id === MAIN ? 'The main design' : `Forked by ${v.by || 'someone'} from ${side().variant(v.parent ?? MAIN)?.name ?? 'Main'}. Double-click to rename.`;
    t.onclick = (e) => {
      if ((e.target as HTMLElement).tagName === 'B') {
        if (confirm(`Delete the variant “${v.name}” (and its pins)?`)) side().dropVariant(v.id);
        return;
      }
      if (v.id !== active) switchTo(v.id);
    };
    t.ondblclick = () => {
      if (v.id === MAIN) return;
      const name = prompt('Rename this variant', v.name);
      if (name && name.trim()) side().putVariant({ ...v, name: name.trim() });
    };
    box.appendChild(t);
  }
  const f = document.createElement('button');
  f.className = 'tab add';
  f.textContent = '+ Fork';
  f.title = 'A copy of this tab to try something else';
  f.onclick = forkActive;
  box.appendChild(f);
  if (side().variants.length > 1) {
    const c = document.createElement('button');
    c.className = 'tab add';
    c.textContent = 'Compare';
    c.onclick = () => openCompare();
    box.appendChild(c);
  }
}
function forkActive(): void {
  const from = side().variant(active)!;
  const who = author().by;
  const name = prompt('Name the new variant', `${who}’s version`);
  if (name === null) return;
  const v = fork({ ...from, design: { ...design }, notes }, `v${noteId(side().me).replace(/[^\w]/g, '')}`, name, who, Date.now());
  side().putVariant(v);
  if (side().variant(v.id)) switchTo(v.id);
  else alert('That’s as many variants as a design can hold. Delete one first.');
}

// Compare: two variants side by side, profile and plan at the same scale, what differs, their trials.
let cmpRenderer: THREE.WebGLRenderer | null = null;
const cmpWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let cmpRun = 0;
/** Build a variant's boat on its own (the page's boat is put back after). */
function boatFor(d: ShipDesign): { root: THREE.Group; boat: DesignedBoat } {
  const b = useDesign(d);
  const def = VESSEL_DEFS.design;
  const root = new THREE.Group();
  root.add(buildVesselMesh(def.hull, def.layout, def.exhaust?.position, def.livery));
  root.add(new BoatView('design', def, assembleView(RECIPES.design, def, LIBRARY), true).root);
  boat = useDesign(design);
  return { root, boat: b };
}
/**
 * Her profile (from starboard, bow to the right) and plan, at `mpp` metres a pixel, framed
 * by `frame` (both boats' extent together) with her transom at the same place: the two
 * pictures line up, so a longer hull reaches further right.
 */
function snapshots(root: THREE.Object3D, mpp: number, frame: THREE.Box3): [string, string] {
  const W = 640;
  const H = 210;
  const stern = hullBox(root).max.z;
  // The middle of the picture along her: the transom 4 % in from the left edge.
  const midZ = stern - (0.5 - 0.04) * W * mpp;
  const midY = (frame.min.y + frame.max.y) / 2;
  const midX = (frame.min.x + frame.max.x) / 2;
  cmpRenderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  cmpRenderer.setSize(W, H);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0xeef3f5);
  sc.add(new THREE.HemisphereLight(0xe8f0f8, 0x55606a, 1.6));
  const sunC = new THREE.DirectionalLight(0xffffff, 1.4);
  sunC.position.set(8, 14, -6);
  sc.add(sunC, root);
  const cam = new THREE.OrthographicCamera((-W / 2) * mpp, (W / 2) * mpp, (H / 2) * mpp, (-H / 2) * mpp, 0.1, 200);
  const shots: string[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const [pos, up, at] of [
    [V(60, midY, midZ), V(0, 1, 0), V(0, midY, midZ)],
    [V(midX, 60, midZ), V(-1, 0, 0), V(midX, 0, midZ)],
  ]) {
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(at);
    cmpRenderer.render(sc, cam);
    shots.push(cmpRenderer.domElement.toDataURL('image/png'));
  }
  sc.remove(root);
  root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return [shots[0], shots[1]];
}
/** What a field's value reads as, for the compare list (the sliders' own wording). */
function describe(k: keyof ShipDesign, d: ShipDesign, b: DesignedBoat): string {
  const v = d[k];
  if (k === 'hull') return DESIGN_HULLS[v].name.split(':')[0];
  if (k === 'engine') return ENGINES[v].name;
  if (k === 'twin') return v ? 'Twin' : 'Single';
  if (k === 'controls') return v ? 'Advanced' : 'Basic';
  if (k === 'paint') return LIVERIES[v]?.name ?? String(v);
  if (k === 'roofPaint') return ROOF_PAINTS[v]?.name ?? String(v);
  if (optionNames[k]) return optionNames[k]![v] || String(v);
  const show = outputs[k];
  if (!show) return String(v);
  const keep = boat;
  boat = b; // the wording of some (length, beam, floor) reads her figures
  try {
    return show(v);
  } finally {
    boat = keep;
  }
}
function openCompare(a = MAIN, b = active === MAIN ? side().variants[1]?.id : active): void {
  if (!b) return;
  $('compare').hidden = false;
  const opts = side().variants.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  ($('cmpA') as HTMLSelectElement).innerHTML = opts;
  ($('cmpB') as HTMLSelectElement).innerHTML = opts;
  ($('cmpA') as HTMLSelectElement).value = a;
  ($('cmpB') as HTMLSelectElement).value = b;
  showCompare();
}
function showCompare(): void {
  const A = side().variant(($('cmpA') as HTMLSelectElement).value);
  const B = side().variant(($('cmpB') as HTMLSelectElement).value);
  if (!A || !B) return;
  const a = boatFor(A.id === active ? design : A.design);
  const b = boatFor(B.id === active ? design : B.design);
  // One scale for both: room for the longer and the taller (and the beamier, in plan).
  const frame = hullBox(a.root).union(hullBox(b.root));
  const size = frame.getSize(new THREE.Vector3());
  const mpp = Math.max((size.z * 1.1) / 640, (size.y * 1.12) / 210, (size.x * 1.15) / 210);
  const [pa, qa] = snapshots(a.root, mpp, frame);
  const [pb, qb] = snapshots(b.root, mpp, frame);
  ($('cmpPics') as HTMLElement).innerHTML = `<div class="lbl a">${esc(A.name)}</div><img src="${pa}"><div class="lbl b">${esc(B.name)}</div><img src="${pb}"><div class="lbl">Plan: ${esc(A.name)}, then ${esc(B.name)}</div><img src="${qa}"><img src="${qb}">`;
  const keys = diffFields(A.design, B.design);
  $('cmpDiff').innerHTML = keys.length
    ? `<table>${keys.map((k) => `<tr><td>${esc(labels[k] ?? k)}</td><td class="a">${esc(describe(k, A.design, a.boat))}</td><td>→</td><td class="b">${esc(describe(k, B.design, b.boat))}</td><td><label><input type="checkbox" data-k="${k}"> take</label></td></tr>`).join('')}</table>`
    : '<div class="meta">The two are the same design (their notes may differ).</div>';
  ($('cmpMerge') as HTMLButtonElement).textContent = `Copy ticked values from “${B.name}” into “${A.name}”`;
  ($('cmpMerge') as HTMLButtonElement).disabled = !keys.length;
  ($('cmpPromote') as HTMLButtonElement).hidden = B.id === MAIN;
  ($('cmpPromote') as HTMLButtonElement).textContent = `Make “${B.name}” the main design`;
  // Their sea trials (each matched by trial, in the background).
  const run = ++cmpRun;
  const results: Record<string, SeaTrialResults | undefined> = {};
  const bars = () => showBars(A, a.boat, results.a, B, b.boat, results.b);
  bars();
  cmpWorker.onmessage = (e: MessageEvent<{ id: number; trials?: SeaTrialResults }>) => {
    if (Math.floor(e.data.id / 10) !== run) return;
    results[e.data.id % 10 === 1 ? 'a' : 'b'] = e.data.trials;
    bars();
  };
  cmpWorker.postMessage({ id: run * 10 + 1, design: A.id === active ? design : A.design, match: true });
  cmpWorker.postMessage({ id: run * 10 + 2, design: B.id === active ? design : B.design, match: true });
}
/** The verdict bars: each figure for both, as bars to the larger of the two. */
function showBars(A: Variant, a: DesignedBoat, ta: SeaTrialResults | undefined, B: Variant, b: DesignedBoat, tb: SeaTrialResults | undefined): void {
  const rowsOf: [string, number | undefined, number | undefined, (x: number) => string, string][] = [
    ['Top speed', ta?.topSpeedKn, tb?.topSpeedKn, (x) => `${x.toFixed(1)} kn`, 'more is faster'],
    ['Turning circle', ta?.tacticalDiameter, tb?.tacticalDiameter, (x) => `${x.toFixed(0)} m`, 'less turns tighter'],
    ['Crash stop', ta?.crashStopDistance, tb?.crashStopDistance, (x) => `${x.toFixed(0)} m`, 'less stops shorter'],
    ['Range flat out', ta?.speedTable.at(-1)?.rangeNm, tb?.speedTable.at(-1)?.rangeNm, (x) => `${x.toFixed(0)} nm`, ''],
    ['Stability (GM)', a.figures.gmM, b.figures.gmM, (x) => `${x.toFixed(2)} m`, 'more is stiffer'],
    ['Displacement', a.figures.massT, b.figures.massT, (x) => `${x.toFixed(1)} t`, ''],
    ['Roll period', ta?.motions.rollPeriod, tb?.motions.rollPeriod, (x) => `${x.toFixed(1)} s`, 'longer is gentler'],
    ['Price', a.figures.price, b.figures.price, (x) => `£${Math.round(x).toLocaleString('en-GB')}`, ''],
  ];
  $('cmpBars').innerHTML =
    `<div class="key"><span class="a">${esc(A.name)}</span> <span class="b">${esc(B.name)}</span></div>` +
    rowsOf
      .map(([name, x, y, fmt, hint]) => {
        const max = Math.max(x ?? 0, y ?? 0) || 1;
        const bar = (v: number | undefined, c: string) => (v === undefined ? '<div class="bar wait">trial running…</div>' : `<div class="bar ${c}"><span style="width:${(100 * v) / max}%"></span><em>${fmt(v)}</em></div>`);
        return `<div class="metric"><div class="name">${name}${hint ? ` <small>${hint}</small>` : ''}</div>${bar(x, 'a')}${bar(y, 'b')}</div>`;
      })
      .join('');
}
$('cmpA').onchange = showCompare;
$('cmpB').onchange = showCompare;
$('cmpClose').onclick = () => ($('compare').hidden = true);
$('cmpMerge').onclick = () => {
  const A = side().variant(($('cmpA') as HTMLSelectElement).value);
  const B = side().variant(($('cmpB') as HTMLSelectElement).value);
  if (!A || !B) return;
  const ticked = [...document.querySelectorAll<HTMLInputElement>('#cmpDiff input:checked')].map((i) => i.dataset.k as keyof ShipDesign);
  if (!ticked.length) return alert('Tick the values to take first.');
  const patch = mergePatch(B.design, ticked);
  if (A.id === active) change(patch); // yours: on your undo, and shared
  else side().edit(patch, A.id);
  showCompare();
};
$('cmpPromote').onclick = () => {
  const B = side().variant(($('cmpB') as HTMLSelectElement).value);
  if (!B || !confirm(`Make “${B.name}” the main design? The main design as it is now is kept as a variant.`)) return;
  const swap = promote(side().variants, B.id, Date.now());
  if (!swap) return;
  for (const v of swap) side().putVariant(v);
  switchTo(MAIN);
  openCompare(MAIN, B.id);
};

// ── Start ──
showTabs();
showTodo();
drawNotes();
showUndo();
showSession();
if (sessionId) {
  if (!($('myName') as HTMLInputElement).value) ($('myName') as HTMLInputElement).value = 'Designer';
  startLink(sessionId);
}
showFavourites();
resize();
syncControls();
drawBoat();
showFigures();
showCode();
setView('Bow ¾');
runTrial();
renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
});
// For checking from a script (headless browser tests).
/** For scripted checks (headless screenshots): aim the camera from `eye` at `at`. */
function look(eye: [number, number, number], at: [number, number, number]): void {
  camera.position.set(...eye);
  orbit.target.set(...at);
  orbit.update();
}
(window as unknown as { shipyard: unknown }).shipyard = { get design() { return design; }, get boat() { return boat; }, get trial() { return trial; }, get people() { return people; }, get notes() { return notes; }, putMyNote, hullFrac: () => [hullMin, hullMax], get link() { return link; }, change, setView, look, undo: () => undoRedo(false), redo: () => undoRedo(true) };
