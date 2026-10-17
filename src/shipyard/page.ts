/**
 * The Shipyard page (shipyard.html; owner, Oct 2026): design a boat and get her code.
 *
 * A designer's workflow (owner: a tool, not a sandbox), in steps along the top:
 *   Brief       what she's for, its jobs and her targets (brief.ts); a suggested boat for it
 *   Hull … Paint  one step per group of choices, each with a line of guidance
 *   Trials & handover  the brief checked against her trials, her code, the game, favourites
 * The brief is checked line by line all the way (right-hand column), with where to go when a
 * line isn't met. Designing together, variants, pins and sketches sit across all the steps:
 * sketches (snapshots drawn on) to talk a change over, pins to decide it, with equipment
 * wanted at the pin placed at the Deck gear step (pinGear.ts).
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
import { gearOf, useDesign } from '../boats/sims';
import { assembleView } from '../modular/assemble';
import type { SeaTrialResults } from '../vessel/seaTrials';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { buildVesselMesh } from '../vessel/view/hullMesh';
import { DESIGN_HULLS, ENGINES, LIVERIES, ROOF_PAINTS, type DesignedBoat } from './build';
import { ALL_FIELDS, decodeDesign, DEFAULT_DESIGN, encodeDesign, GUARDS, placeOf, placeValue, SCALES, type PlaceKey, type ShipDesign } from './design';
import { hullPlan } from '../vessel/layout';
import { UndoStack } from './undo';
import { YardLink } from './yardLink';
import { Keeper, newSessionId, sessionIdFrom, type DesignPatch, type Person, type SessionEvents } from './session';
import { cleanDoc, diffFields, fork, MAIN, mergePatch, newDoc, promote, type Variant, type YardDoc } from './variants';
import { LoopbackHost } from '../net/transport';
import { fromFrac, inkOf, MAX_SHEETS, noteId, sheetsOf, toFrac, todo, type Frac, type Ink, type Note, type Pin, type Sheet } from './notes';
import { bareHull, checkBrief, engineOptions, JOBS, jobOf, newBrief, pickEngine, type Brief, type JobId, type Tried } from './brief';
import { rankTypes } from './typeFit';
import { deckRoom, sizeForDeck, type DeckRoom } from './deckRoom';
import { trialCharts } from './trialCharts';
import type { GearKind } from '../modular/module';
import { EQUIPMENT, equipmentOf, placeGear, removeGear, type Equipment } from './pinGear';
import { SheetEditor } from './sheetEditor';
import { addFavourite, cleanName, readFavourites, removeFavourite, writeFavourites, type Favourite, type Store } from './favourites';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stepsOf = (k: keyof ShipDesign) => ALL_FIELDS.find((f) => f.key === k)!.steps;

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
// A dusk-blue backdrop to go with the dark page (shipyard.html), light enough that her dark
// paints still stand out against it.
scene.background = new THREE.Color(0x24394a);
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
/** A line of guidance for each step of choices (by its title). */
const STEP_GUIDE: Record<string, string> = {
  Hull: 'Her type and proportions. Length and beam set her size and stability; depth her freeboard; a raked bow throws spray aside and takes a head sea more softly.',
  Wheelhouse: 'Where the crew stand and what they can see. Forward gives a long working deck aft; aft, a foredeck to work over. Keep it low and light for stability.',
  Engine: 'Power for the speed in the brief. The propeller and gearbox are matched to her by trial each time; twin engines add power and handling, and cost.',
  'Deck gear': 'Pin her equipment on her: pick a piece, then click on her where it goes, and it’s placed there (on the wheelhouse roof, the foredeck or the aft deck, whichever is nearest). Its weight is designed in. Delete its pin to take it off again.',
  Controls: 'What the skipper has at the helm.',
  Paint: 'Her colours, hull and roof.',
};
const stepBody = $('stepBody');
const handoverStep = stepBody.querySelector<HTMLElement>('[data-step=handover]')!;
/** Where the choices being made go: the current step's panel (section() starts a new step). */
let controls: HTMLElement = stepBody;
function section(title: string): HTMLElement {
  const name = title.replace(/^\d+\.\s*/, '');
  const el = document.createElement('div');
  el.className = 'step';
  el.dataset.step = name.toLowerCase();
  el.dataset.title = name;
  el.innerHTML = `<h1>${name}</h1>${STEP_GUIDE[name] ? `<p class="guide">${STEP_GUIDE[name]}</p>` : ''}`;
  stepBody.insertBefore(el, handoverStep);
  controls = el;
  return el;
}
function choices(key: keyof ShipDesign, items: { name: string; note?: string }[], patch: (i: number) => Partial<ShipDesign> = () => ({})): void {
  const box = document.createElement('div');
  items.forEach((it, i) => {
    const c = document.createElement('div');
    c.className = 'choice';
    c.dataset.key = key;
    c.dataset.i = String(i);
    c.innerHTML = `<b>${it.name}</b>${it.note ? `<div style="font-size:12px;color:var(--muted)">${it.note}</div>` : ''}`;
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
    // Gear placed by hand goes back to its usual place when chosen here.
    c.onclick = () => change({ [key]: i, ...(PLACED_BY[key] ? { [PLACED_BY[key]!]: 0 } : {}) });
    box.appendChild(c);
  });
  controls.appendChild(row);
}
/** The choices whose gear can also be placed by hand (pinGear.ts), and where that's kept. */
const PLACED_BY: Partial<Record<keyof ShipDesign, PlaceKey>> = { deckCrane: 'craneAt', searchlight: 'lampAt', fireMonitor: 'monitorAt', towWinch: 'winchAt' };

section('1. Hull');
{
  // Size her for the brief's deck cargo again, after the brief or her house has changed.
  const b = document.createElement('button');
  b.id = 'sizeDeck';
  b.textContent = 'Size her for the brief’s deck cargo';
  b.title = 'Longer and beamier together, a step at a time, until the crates and pots in the brief fit on her deck';
  b.onclick = () => {
    const need = deckNeed();
    $('sizeMsg').textContent = !need.crates && !need.pots ? 'The brief asks for no deck cargo (tick Cargo runs or Lobster & crab pots in the Brief).' : sizeDeck() || 'She already has room for it.';
  };
  const m = document.createElement('div');
  m.id = 'sizeMsg';
  m.className = 'meta';
  controls.append(b, m);
}
// Picking a hull starts her in her type's usual layout (the sliders then move it all).
choices('hull', DESIGN_HULLS.map((h) => ({ name: h.name.split(':')[0], note: h.name.split(':')[1]?.trim() })), (i) => DESIGN_HULLS[i].defaults);
slider('length', 'Length', () => `${boat.figures.lengthM.toFixed(2)} m`);
slider('beam', 'Beam', () => `${boat.figures.beamM.toFixed(2)} m`);
slider('depth', 'Depth', (v) => pct(SCALES.scale(v)));
slider('bulwark', 'Bulwarks', (v) => `${SCALES.bulwark(v).toFixed(1)} m`);
slider('bow', 'Bow rake', (v) => (v === 0 ? 'plumb' : `${SCALES.bow(v)}\u00b0`));
{
  // Hull protection (owner): what keeps her sides off a quay.
  const h = document.createElement('h2');
  h.textContent = 'Hull protection';
  const p = document.createElement('p');
  p.className = 'meta';
  p.textContent = 'What keeps her sides off a quay. Fenders are the cheapest, but the crew must put them over the side coming alongside (the basket on deck) and take them in again. A rubber rubbing strake round her sheer, or tyres along her sides, are always there: the strake is firm and thin (a glancing rub, little of a hard knock); tyres are soft and grippy, and add a little weight and drag.';
  controls.append(h, p);
}
options('guard', 'Protection', [...GUARDS]);
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
options('chartTable', 'Chart table', ['None', 'Port wall, aft']);
{
  // The deckhouse (owner: pilot and rescue boats): the wheelhouse stands on it.
  const h = document.createElement('h2');
  h.textContent = 'Deckhouse';
  const p = document.createElement('p');
  p.className = 'meta';
  p.textContent = 'A lower deckhouse that the wheelhouse stands on, as on pilot and rescue boats: from the wheelhouse’s aft wall forward, the helm raised onto it with steps up to the door. Solid for now (no way in, its top not walked).';
  controls.append(h, p);
}
slider('dhLength', 'Forward of the house', (v) => (v ? `${SCALES.dhLength(v).toFixed(1)} m` : 'none'));
options('dhHeight', 'Height', [0, 1, 2, 3].map((i) => `${SCALES.dhHeight(i).toFixed(1)} m`));
options('dhWidth', 'Width', ['To her sides', '0.3 m side decks', '0.5 m', '0.7 m']);
options('dhRake', 'Front', ['Upright', 'Raked 30°', 'Raked 50°']);
section('3. Deck gear');
{
  // Pin her equipment where it's wanted (pinGear.ts): a button a piece, then click on her.
  const pal = document.createElement('div');
  pal.className = 'palette';
  for (const e of EQUIPMENT) {
    const b = document.createElement('button');
    b.textContent = e.name;
    b.dataset.gear = e.id;
    b.title = `Click, then click on her where the ${e.name.toLowerCase()} goes: it’s placed there`;
    b.onclick = () => pinGearTool(e.id);
    pal.appendChild(b);
  }
  const box = document.createElement('div');
  box.id = 'fromPins';
  const by = document.createElement('h2');
  by.textContent = 'Or set by hand';
  controls.append(pal, box, by);
}
options('deckCrane', 'Deck crane', ['None', 'Foredeck', 'Aft deck']);
options('searchlight', 'Searchlight', ['None', 'Roof', 'Foredeck pole', 'Aft deck pole']);
options('fireMonitor', 'Fire monitor', ['None', 'Roof', 'Foredeck pole', 'Aft deck pole']);
options('towWinch', 'Tow winch', ['None', 'Aft deck']);
options('sternRoller', 'Stern roller', ['None', 'In the transom']);
options('aFrame', 'Trawl A-frame', ['None', 'Over the transom (with the net and a winch)']);
options('lifeRing', 'Life ring & boat hook', ['None', 'Port', 'Starboard']);
options('sideDoor', 'Side door', ['None', 'Port wall']);
section('4. Engine');
choices('engine', ENGINES.map((e) => ({ name: e.name, note: `${e.kg} kg with its gearbox. Propeller and gearbox matched to her by trial.` })));
{
  const row = document.createElement('label');
  row.className = 'choice';
  row.innerHTML = '<input type="checkbox" data-key="twin"> Twin engines: two of these, a propeller and rudder each, worked together from one lever';
  const box = row.querySelector('input')!;
  box.onchange = () => change({ twin: box.checked ? 1 : 0 });
  controls.appendChild(row);
}
section('5. Controls');
choices('controls', [
  { name: 'Basic', note: 'Wheel, throttle, key and start, speed and depth, rpm.' },
  { name: 'Advanced', note: 'Adds lights, wipers, horn, heading, engine monitor, the VHF, an FM radio, the chartplotter, the NAV / WIND screen, the task board and the whiteboard, and the searchlight and fire monitor controls at the helm when they’re on poles.' },
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
    ['Deck cargo', deckWords(deckRoom())],
    ['Pots on deck', `${deckRoom().pots}`],
    ['Engine', f.engine],
    ['Propeller', `${f.propellerM.toFixed(2)} m`],
    ['Gearbox', matched ? `${f.gear.toFixed(2)} : 1 (matched)` : 'matching...'],
    ['Price', `£${f.price.toLocaleString('en-GB')}`],
  ]);
  $('warnings').innerHTML = boat.warnings.map((w) => `<div>${w}</div>`).join('');
  showQuick();
  if (typeof showBriefCheck === 'function' && $('briefCheck')) showBriefCheck();
}

/** "21 crates (2.1 t)", or why fewer than there's room for. */
function deckWords(r: DeckRoom): string {
  const t = `${(r.payloadKg / 1000).toFixed(1)} t payload`;
  return r.crates < r.crateRoom ? `${r.crates} crates (room for ${r.crateRoom}; ${t})` : `${r.crates} crates (${t})`;
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
    ['Deck', `${deckRoom().crates} crates`],
  ];
  if (t) {
    items.push(['Top', `${t.topSpeedKn.toFixed(1)} kn`], ['Turn', `${t.tacticalDiameter.toFixed(0)} m`], ['Stop', `${t.crashStopDistance.toFixed(0)} m`], ['Roll', `${t.motions.rollPeriod.toFixed(1)} s`]);
  }
  $('quick').innerHTML =
    items.map(([k, v], i) => `<span${i >= 4 && stale ? ' class="busy"' : ''}>${k} <b>${v}</b></span>`).join('') + (stale || !t ? '<span class="busy">trial running…</span>' : '');
}
function showTrial(): void {
  const t = trial;
  showQuick();
  showBriefCheck();
  if (!t) {
    $('trial').innerHTML = '';
    $('charts').innerHTML = '';
    return;
  }
  // Greyed while it's the last design's trial and a new one is running.
  const fresh = trialFor === matchKey(design);
  $('trial').style.opacity = fresh ? '1' : '0.45';
  $('charts').classList.toggle('stale', !fresh);
  $('charts').innerHTML = trialCharts(t, boat.figures.lengthM, brief);
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

// The charts' hover: what a dot or bar stands for, beside the pointer.
{
  const tip = document.createElement('div');
  tip.id = 'chartTip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const box = $('charts');
  box.addEventListener('pointermove', (e) => {
    const el = (e.target as Element).closest('[data-tip]');
    if (!el) return void (tip.hidden = true);
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  box.addEventListener('pointerleave', () => (tip.hidden = true));
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
const defaultName = () => brief.name || `${DESIGN_HULLS[design.hull].name.split(':')[0].trim()} ${boat.figures.lengthM.toFixed(1)} m`;
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
  $('togetherPop').classList.toggle('on', !!sessionId);
  $('togetherBtn').textContent = sessionId ? '👥 Session' : '👥 Design together';
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
  showFromPins();
  sheetEditor.refresh();
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
/** The to-do list: open pins, then done ones; and the sketches. */
function showTodo(): void {
  const list = todo(notes);
  const open = list.filter((p) => !p.done).length;
  $('todoCount').textContent = list.length ? `${open} open, ${list.length - open} done` : '';
  const box = $('todo');
  box.innerHTML = list.length ? '' : '<div class="meta">No pins yet. Press 📍 Pin on the view and click her to put one, with a note.</div>';
  list.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = `todo${p.done ? ' done' : ''}`;
    row.dataset.pin = p.id;
    row.innerHTML = `<span class="badge" style="background:${p.colour}">${i + 1}</span><div><div class="text">${equipmentOf(p.gear) ? `<span class="gear">${esc(equipmentOf(p.gear)!.name)}</span>${p.text ? ': ' : ''}` : ''}${esc(p.text || (p.gear ? '' : '(no note)'))}</div><div class="meta">${esc(p.by)}${p.done ? ` · done${p.doneBy ? ` by ${esc(p.doneBy)}` : ''}` : ''}</div></div><div class="acts"><button data-act="done">${p.done ? 'Reopen' : 'Done'}</button><button data-act="del" title="Delete">✕</button></div>`;
    row.querySelector<HTMLElement>('.text')!.onclick = () => lookAt(fracToVec(p.at));
    row.querySelector<HTMLElement>('[data-act=done]')!.onclick = () => putMyNote({ ...p, done: !p.done, ...(p.done ? { doneBy: undefined } : { doneBy: author().by }) });
    row.querySelector<HTMLElement>('[data-act=del]')!.onclick = () => {
      const eq = equipmentOf(p.gear);
      const off = holds(p, eq) ? ` Its ${eq.name.toLowerCase()} comes off too.` : '';
      if (confirm(`Delete pin ${i + 1}${p.text ? `, “${p.text}”` : eq ? ` (${eq.name})` : ''}?${off}`)) dropPin(p);
    };
    box.appendChild(row);
  });
  showSketches();
}
/** Turn the view to look at a point on her, from where you are. */
function lookAt(p: THREE.Vector3): void {
  const back = camera.position.clone().sub(orbit.target).setLength(Math.max(4, 0.45 * L()));
  orbit.target.copy(p);
  camera.position.copy(p).add(back);
  orbit.update();
}
// The tools on the view: 📍 Pin (click her, type a note) and ✏ Sketch (a snapshot of the view to draw on, in 2D).
let tool: 'pin' | null = null;
/** Equipment picked on the Deck gear palette: the next click on her pins it there. */
let presetGear: string | null = null;
const toolBtns: Record<string, HTMLButtonElement> = {};
{
  const gap = document.createElement('span');
  gap.className = 'sep';
  $('views').appendChild(gap);
  const b = document.createElement('button');
  b.textContent = '📍 Pin';
  b.className = 'tool';
  b.title = 'Put a pin on her with a note (a to-do)';
  b.onclick = () => setTool(tool === 'pin' ? null : 'pin');
  toolBtns.pin = b;
  const k = document.createElement('button');
  k.textContent = '✏ Sketch';
  k.className = 'tool';
  k.title = 'Take a snapshot of this view and draw on it';
  k.onclick = () => snapshotSheet();
  $('views').append(b, k);
}
function setTool(t: typeof tool): void {
  tool = t;
  presetGear = null;
  document.querySelectorAll<HTMLElement>('.palette button').forEach((b) => b.classList.remove('on'));
  orbit.enabled = !t;
  for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('on', k === t);
  renderer.domElement.style.cursor = t ? 'crosshair' : '';
  $('toolHint').textContent = t === 'pin' ? 'Click on her where the pin goes' : '';
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
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (!tool) return;
  const hit = hitBoat(e);
  if (tool === 'pin') {
    if (!hit) return;
    pendingPin = toFrac(hit.toArray(), hullMin, hullMax);
    // From the Deck gear palette: the equipment's chosen already, so it's pinned and placed at once.
    if (presetGear) return addPin(presetGear);
    const ed = $('pinEditor');
    const r = $('view').getBoundingClientRect();
    ed.style.left = `${Math.min(r.width - 250, Math.max(8, e.clientX - r.left - 20))}px`;
    ed.style.top = `${Math.min(r.height - 90, e.clientY - r.top + 14)}px`;
    ed.hidden = false;
    ($('pinText') as HTMLInputElement).value = '';
    ($('pinGear') as HTMLSelectElement).value = presetGear ?? '';
    ($('pinGear') as HTMLSelectElement).focus();
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
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
      row.style.setProperty('--c', '#6aa8e6');
      row.classList.add('flash');
    }
  }
});
{
  // The pin's equipment list (pinGear.ts): placed where the pin is, at once.
  const sel = $('pinGear') as HTMLSelectElement;
  const opt = (value: string, text: string) => Object.assign(document.createElement('option'), { value, textContent: text });
  sel.append(opt('', 'Just a note'));
  const gear = document.createElement('optgroup');
  gear.label = 'Equipment: placed here';
  for (const e of EQUIPMENT) gear.append(opt(e.id, e.name));
  sel.append(gear);
}
function pinGearTool(id: string): void {
  setTool('pin');
  presetGear = id;
  document.querySelectorAll<HTMLElement>('.palette button').forEach((b) => b.classList.toggle('on', b.dataset.gear === id));
  $('toolHint').textContent = `Click on her where the ${equipmentOf(id)!.name.toLowerCase()} goes`;
}
function addPin(gearPicked?: string): void {
  if (!pendingPin) return;
  const text = gearPicked ? '' : ($('pinText') as HTMLInputElement).value.replace(/\s+/g, ' ').trim().slice(0, 140);
  const gear = gearPicked ?? ($('pinGear') as HTMLSelectElement).value;
  if (!text && !gear) return void ($('pinText') as HTMLInputElement).focus();
  putMyNote({ id: noteId(link?.side?.me ?? ''), kind: 'pin', ...author(), t: Date.now(), at: pendingPin, text, done: false, ...(gear ? { gear } : {}) } satisfies Pin);
  pendingPin = null;
  setTool(null);
  // Equipment is placed as soon as it's pinned (owner: pin it, and it's placed for you).
  if (gear) placeFromPins();
}
/**
 * Put the equipment asked for on pins where the pins are (pinGear.ts), each once: a pin it's
 * done for is marked with where it went and ticked done. Gear on the grid stands on the
 * pin's 25 cm cell, or the nearest that's clear (the builder's `placed`: the design is then
 * set to the cell it took, so it stays there). A piece pinned again somewhere else moves
 * there (the earlier pin is marked as moved). Run as a pin is added, and on coming to the
 * Deck gear step (for pins from before).
 */
function placeFromPins(): void {
  const wh = VESSEL_DEFS.design.layout.wheelhouse;
  const house = wh ? { front: wh.front, aft: wh.aft, halfWidth: wh.halfWidth } : undefined;
  for (const p of todo(notes)) {
    const eq = equipmentOf(p.gear);
    if (!eq || p.placed || p.done) continue;
    const put = placeGear(eq, fromFrac(p.at, hullMin, hullMax), house, hullPlan(VESSEL_DEFS.design).transom);
    change(put.patch);
    let words = put.words;
    if (eq.key) {
      const at = boat.placed[eq.key];
      if (at === null) words = 'in its usual place: it won’t stand where the pin is (nor within a metre of it)';
      else if (at?.moved) {
        // Keep it on the cell it took (and its facing).
        const face = placeOf(eq.key, design[eq.key])?.face ?? 0;
        change({ [eq.key]: placeValue(eq.key, at.x, hullPlan(VESSEL_DEFS.design).transom - at.z, face) } as Partial<ShipDesign>);
        words += `, moved ${Math.hypot(...pinOffset(p, at)).toFixed(2)} m from the pin to stand clear`;
      }
    }
    for (const o of notes) if (o.kind === 'pin' && o.id !== p.id && equipmentOf(o.gear) === eq && o.placed && o.placed !== MOVED) putMyNote({ ...o, placed: MOVED });
    putMyNote({ ...p, placed: words, done: true, doneBy: 'the Shipyard' });
  }
  showFromPins();
}
/** How far a placed piece stands from its pin (x, z, m). */
function pinOffset(p: Pin, at: { x: number; z: number }): [number, number] {
  const [x, , z] = fromFrac(p.at, hullMin, hullMax);
  return [at.x - x, at.z - z];
}
/** A pin whose equipment was pinned again elsewhere since. */
const MOVED = 'moved';
/** Is this pin's equipment standing where it put it (not moved to a later pin)? */
const holds = (p: Pin, eq: Equipment | undefined): eq is Equipment => !!eq && !!p.placed && p.placed !== MOVED;
/** Delete a pin; if its equipment stands where it put it, that comes off too. */
function dropPin(p: Pin): void {
  const eq = equipmentOf(p.gear);
  if (holds(p, eq)) change(removeGear(eq));
  dropMyNote(p.id);
}
/** Turn a placed crane or winch a quarter turn on its spot. */
function turnGear(eq: Equipment): void {
  if (!eq.key) return;
  const at = placeOf(eq.key, design[eq.key]);
  if (at) change({ [eq.key]: placeValue(eq.key, at.x, at.fromTransom, at.face + 1) } as Partial<ShipDesign>);
  showFromPins();
}
const FACINGS: Record<string, string[]> = {
  craneAt: ['facing forward', 'facing to starboard', 'facing aft', 'facing to port'],
  winchAt: ['its wire leading aft', 'its wire leading to port', 'its wire leading forward', 'its wire leading to starboard'],
};
/** The Deck gear step's list of what pins asked for, and what became of it. */
function showFromPins(): void {
  const box = document.getElementById('fromPins');
  if (!box) return;
  const list = todo(notes).filter((p) => equipmentOf(p.gear));
  box.innerHTML = list.length ? '<div class="meta">Pinned:</div>' : '<div class="meta">Nothing pinned yet. Pick a piece above, then click on her where it goes.</div>';
  for (const p of list) {
    const eq = equipmentOf(p.gear)!;
    const n = todo(notes).indexOf(p) + 1;
    const row = document.createElement('div');
    row.className = 'item';
    const at = eq.key && holds(p, eq) ? placeOf(eq.key, design[eq.key]) : null;
    const facing = at && eq.turns ? `, ${FACINGS[eq.key!][at.face]}` : '';
    const status = p.placed === MOVED ? 'Moved to a later pin.' : p.placed ? `Placed ${esc(p.placed)}${esc(facing)}.` : 'Not placed yet.';
    row.innerHTML = `<span class="badge" style="background:${p.colour}">${n}</span><span><b>${esc(eq.name)}</b>${p.text ? ` <span class="meta">“${esc(p.text)}”</span>` : ''}<span class="meta">${status}</span></span>`;
    if (at && eq.turns) {
      const b = document.createElement('button');
      b.textContent = 'Turn ↻';
      b.title = 'A quarter turn on its spot';
      b.onclick = () => turnGear(eq);
      row.querySelector('span:last-child')!.appendChild(b);
    }
    box.appendChild(row);
  }
}
$('pinAdd').onclick = () => addPin();
$('pinText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addPin();
  if (e.key === 'Escape') setTool(null);
});
$('pinCancel').onclick = () => setTool(null);

// Leaving the page frees the session's id at once, so someone else can take over (PeerJS
// would otherwise hold it for up to a minute).
window.addEventListener('pagehide', () => link?.close());

// ── Sketches (notes.ts sheets and ink; sheetEditor.ts): flat pictures to draw on ──
const sheetEditor = new SheetEditor({
  sheet: (id) => notes.find((n): n is Sheet => n.kind === 'sheet' && n.id === id),
  ink: (id) => inkOf(notes, id),
  author: () => author(),
  addInk: (sheet, pts) => putMyNote({ id: noteId(side().me), kind: 'ink', ...author(), t: Date.now(), sheet, pts } satisfies Ink),
  dropInk: (id) => dropMyNote(id),
});
function newSheet(fields: Pick<Sheet, 'title' | 'image' | 'aspect'>): string | null {
  if (sheetsOf(notes).length >= MAX_SHEETS) {
    alert(`That’s ${MAX_SHEETS} sketches on this tab: delete one first (Sketches, on the right).`);
    return null;
  }
  const id = noteId(side().me);
  putMyNote({ id, kind: 'sheet', ...author(), t: Date.now(), ...fields });
  return id;
}
/** ✏ Sketch: a snapshot of the view as it is (pins and all), to draw on. */
function snapshotSheet(): void {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const w = Math.min(720, src.width);
  const h = Math.round((w * src.height) / src.width);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0, w, h);
  const tab = side().variant(active)?.name ?? 'Main';
  const id = newSheet({ title: `${tab}: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, image: c.toDataURL('image/jpeg', 0.72), aspect: w / h });
  if (id) sheetEditor.show(id);
}
/** The list of sketches (right-hand column): a thumbnail each; click to open. */
function showSketches(): void {
  const box = $('sketches');
  const list = sheetsOf(notes);
  box.innerHTML = list.length ? '' : '<div class="meta">Press ✏ Sketch on the view to draw on a snapshot of her, or start from a sketch in the Brief.</div>';
  for (const sh of list) {
    const row = document.createElement('div');
    row.className = 'sketch';
    const strokes = inkOf(notes, sh.id).length;
    row.innerHTML = `<img alt="" src="${sh.image}"><div><b>${esc(sh.title || 'Sketch')}</b><div class="meta">${esc(sh.by)} · ${strokes} stroke${strokes === 1 ? '' : 's'}</div></div><button title="Delete">✕</button>`;
    row.onclick = (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') {
        if (confirm(`Delete the sketch “${sh.title}” and what’s drawn on it?`)) dropMyNote(sh.id);
        return;
      }
      sheetEditor.show(sh.id);
    };
    box.appendChild(row);
  }
}

// ── The workflow: steps along the top ──
const STEP_KEY = 'swvr.yard.step';
let seen = new Set<string>();
function stepEls(): HTMLElement[] {
  return [...stepBody.querySelectorAll<HTMLElement>(':scope > .step')];
}
let stepAt = 0;
function goStep(to: number | string): void {
  const els = stepEls();
  const i = typeof to === 'number' ? to : els.findIndex((e) => e.dataset.step === to);
  if (i < 0 || i >= els.length) return;
  stepAt = i;
  seen.add(els[i].dataset.step!);
  els.forEach((e, k) => e.classList.toggle('on', k === i));
  stepBody.scrollTop = 0;
  ($('stepBack') as HTMLButtonElement).disabled = i === 0;
  const next = $('stepNext') as HTMLButtonElement;
  next.disabled = i === els.length - 1;
  next.textContent = i === els.length - 2 ? 'Trials & handover →' : 'Next →';
  try {
    sessionStorage.setItem(STEP_KEY, els[i].dataset.step!);
  } catch {
    /* fine */
  }
  if (els[i].dataset.step === 'deck gear') placeFromPins();
  showStepNav();
}
function showStepNav(): void {
  const nav = $('stepNav');
  nav.innerHTML = '';
  const verdict = briefVerdict();
  stepEls().forEach((e, i) => {
    const b = document.createElement('button');
    b.className = `${i === stepAt ? 'on' : ''} ${seen.has(e.dataset.step!) ? 'seen' : ''}`;
    const flag = e.dataset.step === 'handover' && verdict !== null ? `<span class="flag">${verdict ? '✓' : '✗'}</span>` : '';
    b.innerHTML = `<span class="n">${i + 1}</span>${e.dataset.title}${flag}`;
    b.onclick = () => goStep(i);
    nav.appendChild(b);
  });
}
$('stepBack').onclick = () => goStep(stepAt - 1);
$('stepNext').onclick = () => goStep(stepAt + 1);

// ── The brief (brief.ts): what she's for, her targets, checked all the way ──
let brief: Brief = startDoc.brief ?? newBrief();
function setBrief(patch: Partial<Brief>): void {
  side().setBrief({ ...brief, ...patch });
}
{
  const jobs = $('jobs');
  for (const j of JOBS) {
    const c = document.createElement('label');
    c.className = 'job';
    c.dataset.job = j.id;
    c.title = j.what;
    c.innerHTML = `<input type="checkbox" />${j.name}<small>${j.what}</small>`;
    c.querySelector('input')!.onchange = (e) => {
      const on = (e.target as HTMLInputElement).checked;
      setBrief({ jobs: on ? [...brief.jobs, j.id] : brief.jobs.filter((x: JobId) => x !== j.id) });
    };
    jobs.appendChild(c);
  }
  document.querySelectorAll<HTMLInputElement>('[data-brief]').forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.brief as keyof Brief;
      setBrief({ [k]: el.type === 'checkbox' ? el.checked : Math.max(0, Number(el.value) || 0) } as Partial<Brief>);
    });
  });
  $('designName').addEventListener('change', () => setBrief({ name: ($('designName') as HTMLInputElement).value }));
}
function showBrief(): void {
  showTypes();
  document.querySelectorAll<HTMLInputElement>('[data-brief]').forEach((el) => {
    const v = brief[el.dataset.brief as keyof Brief];
    if (document.activeElement === el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
  });
  document.querySelectorAll<HTMLElement>('.job').forEach((el) => {
    const on = brief.jobs.includes(el.dataset.job as JobId);
    el.classList.toggle('on', on);
    el.querySelector('input')!.checked = on;
  });
  document.querySelectorAll<HTMLElement>('[data-for-job]').forEach((el) => (el.hidden = !brief.jobs.includes(el.dataset.forJob as JobId)));
  const name = $('designName') as HTMLInputElement;
  if (document.activeElement !== name) name.value = brief.name;
  document.title = `${brief.name ? `${brief.name} · ` : ''}Workboat World Shipyard`;
  showTrial(); // its charts draw the brief's targets; it shows the brief check too
}
/** What her trial says now, if it's for the design as she is (null while a new one runs). */
function currentTrial(): SeaTrialResults | null {
  return trial && trialFor === matchKey(design) ? trial : null;
}
function measured() {
  const t = currentTrial();
  const room = deckRoom();
  return {
    topSpeedKn: t?.topSpeedKn ?? null,
    rangeNm: t?.speedTable.at(-1)?.rangeNm ?? null,
    price: boat.figures.price,
    gmM: boat.figures.gmM,
    crane: (design.deckCrane ?? 0) > 0,
    bollardT: t ? t.bollard.aheadKN / 9.81 : null,
    crates: room.crates,
    pots: room.pots,
    payloadKg: room.payloadKg,
    has: (kind: GearKind) => !!gearOf({ defId: 'design' }, kind),
  };
}
/** True if she meets every line of the brief, false if not, null while her trial runs (or there's no brief). */
function briefVerdict(): boolean | null {
  const lines = checkBrief(brief, measured());
  if (!lines.length) return null;
  if (lines.some((l) => l.ok === false)) return false;
  return lines.some((l) => l.ok === null && !l.na) ? null : true;
}
/** The brief, line by line (right-hand column), and the verdict on the last step. */
function showBriefCheck(): void {
  const all = checkBrief(brief, measured());
  // Lines for gear the Shipyard can't fit yet are shown, but not counted.
  const lines = all.filter((l) => !l.na);
  const box = $('briefCheck');
  const title = brief.name || 'Her brief';
  const met = lines.filter((l) => l.ok).length;
  const verdict = briefVerdict();
  const head = lines.length ? `${esc(title)}: ${verdict === true ? 'every line met' : verdict === false ? `${met} of ${lines.length} met` : 'checking…'}` : 'No targets yet: set them in the Brief (step 1).';
  box.innerHTML = `<div class="verdict">${esc(head)}</div>`;
  for (const l of all) {
    const row = document.createElement('div');
    row.className = `line ${l.na ? 'na' : l.ok === null ? 'wait' : l.ok ? 'ok' : 'bad'}`;
    row.innerHTML = `<span class="mark">${l.na ? '–' : l.ok === null ? '…' : l.ok ? '✓' : '✗'}</span><span>${l.label} <span class="meta">${esc(l.target)}</span></span><span class="val">${l.value ?? 'trial running'}</span>${l.fix ? `<div class="fix">${esc(l.fix.hint)}<button>Go to ${esc(l.fix.step)}</button></div>` : ''}`;
    const go = row.querySelector('button');
    if (go && l.fix) go.onclick = () => goStep(l.fix!.step);
    box.appendChild(row);
  }
  const hv = $('handoverVerdict');
  hv.className = verdict === true ? 'ok' : verdict === false ? 'bad' : 'wait';
  hv.textContent = !lines.length ? 'No brief set: she’s checked against nothing. (Step 1, Brief.)' : verdict === true ? 'She meets the brief, every line.' : verdict === false ? `Not yet: ${lines.length - met} line${lines.length - met === 1 ? '' : 's'} of the brief not met (see the right-hand column).` : 'Her sea trials are running…';
  showStepNav();
}
// Suggest: the job's hull type, then every engine fit tried on her by trial (in the
// background), and the best one fitted (brief.ts pickEngine).
const searchWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let searchRun = 0;
function trialOf(d: ShipDesign, id: number): Promise<SeaTrialResults | null> {
  return new Promise((resolve) => {
    const on = (e: MessageEvent<{ id: number; trials?: SeaTrialResults }>) => {
      if (e.data.id !== id) return;
      searchWorker.removeEventListener('message', on);
      resolve(e.data.trials ?? null);
    };
    searchWorker.addEventListener('message', on);
    searchWorker.postMessage({ id, design: d, match: true });
  });
}
/** The hull types ranked against the brief (typeFit.ts), each with what it can manage and a start button. */
function showTypes(): void {
  const box = $('types');
  box.innerHTML = '';
  const any = brief.jobs.length || brief.speedKn || brief.rangeNm || brief.budget;
  for (const [k, t] of rankTypes(brief).entries()) {
    const c = document.createElement('div');
    c.className = `type${brief.hull === t.hull ? ' on' : ''}`;
    const name = DESIGN_HULLS[t.hull].name.split(':')[0];
    const verdict = !any ? '' : t.misses ? `${t.misses} line${t.misses === 1 ? '' : 's'} short` : k === 0 ? 'Best fit' : 'Can do it';
    const suits = t.suits.length ? ` Built for ${t.suits.map((j) => jobOf(j)!.name.toLowerCase()).join(', ')}.` : '';
    c.innerHTML = `<div class="head"><b>${esc(name)}</b><span class="verdict">${verdict}</span></div><div class="what">${esc(t.facts.what)}${esc(suits)}</div><div class="lines">${t.lines.map((l) => `<span class="${l.ok ? 'ok' : 'bad'}">${l.label} ${esc(l.value)}</span>`).join('')}</div>`;
    const b = document.createElement('button');
    b.className = k === 0 && any ? 'primary' : '';
    b.textContent = brief.hull === t.hull ? 'Start again from this hull' : 'Start from this hull';
    b.onclick = () => void startFrom(t.hull);
    c.appendChild(b);
    box.appendChild(c);
  }
}
/** What the brief wants on deck (0: nothing asked). */
function deckNeed(): { crates: number; pots: number } {
  return { crates: brief.jobs.includes('cargo') ? brief.crates : 0, pots: brief.jobs.includes('potting') ? brief.pots : 0 };
}
/**
 * Size her for the brief's deck cargo (deckRoom.ts sizeForDeck): longer and beamier together
 * until it fits. Returns what was done, in words, or '' if nothing was needed.
 */
function sizeDeck(): string {
  const need = deckNeed();
  if (!need.crates && !need.pots) return '';
  const r = sizeForDeck(design, need);
  boat = useDesign(design); // put her back before changing her
  if (r.patch.length === design.length && r.patch.beam === design.beam) return '';
  change(r.patch);
  const what = [need.crates ? `${r.room.crates} crates` : '', need.pots ? `${r.room.pots} pots` : ''].filter(Boolean).join(' and ');
  return r.met ? `stretched to ${boat.figures.lengthM.toFixed(1)} x ${boat.figures.beamM.toFixed(1)} m for ${what} on deck` : `stretched as far as she goes (${boat.figures.lengthM.toFixed(1)} m) and still short: ${what} on deck`;
}
/**
 * Start from a hull type: her bare hull (no deck gear: owner, pin it on her), sized for the
 * brief's deck cargo, then every
 * engine fit tried on her by trial in the background, and the best for the brief fitted
 * (brief.ts pickEngine).
 */
async function startFrom(hull: number): Promise<void> {
  const run = ++searchRun;
  setBrief({ hull });
  change(bareHull(hull, (i) => DESIGN_HULLS[i].defaults));
  const sized = sizeDeck();
  const h = `${DESIGN_HULLS[hull].name.split(':')[0].toLowerCase()}${sized ? `, ${sized}` : ''}`;
  const msg = $('suggestMsg');
  const base = { ...design };
  const tried: Tried[] = [];
  const fits = engineOptions();
  for (const [k, fit] of fits.entries()) {
    msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}. Trying her engines on trial: ${k + 1} of ${fits.length}…`;
    const d = { ...base, ...fit };
    const t = await trialOf(d, run * 100 + k);
    if (run !== searchRun) return; // asked again
    if (t) tried.push({ fit, topSpeedKn: t.topSpeedKn, rangeNm: t.speedTable.at(-1)?.rangeNm ?? 0, price: boatFor(d).boat.figures.price, bollardT: t.bollard.aheadKN / 9.81 });
  }
  const best = pickEngine(brief, tried);
  // Only if she's still the boat the trials were for (nobody has changed her hull since).
  if (!best || diffFields(design, base).some((k) => k !== 'engine' && k !== 'twin')) {
    msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}. She was changed while her engines were tried: start again to fit one.`;
    return;
  }
  change(best.fit);
  const name = `${best.fit.twin ? 'twin ' : ''}${ENGINES[best.fit.engine ?? 0].name}`;
  msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}, ${esc(name)}: ${best.topSpeedKn.toFixed(1)} kn, ${best.rangeNm.toFixed(0)} nm, £${best.price.toLocaleString('en-GB')} (${tried.length} engine fits tried; the cheapest that does the job). Next: shape her hull and wheelhouse, then pin her equipment where you want it (Deck gear).`;
}
$('openSaved').onclick = () => goStep('handover');

// The together box opens from the header.
$('togetherBtn').onclick = () => ($('togetherPop').hidden = !$('togetherPop').hidden);

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
  onBrief: (b) => {
    brief = b ?? newBrief();
    showBrief();
    saveSessionCopy();
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
function boatFor(d: ShipDesign): { root: THREE.Group; boat: DesignedBoat; room: DeckRoom } {
  const b = useDesign(d);
  const room = deckRoom();
  const def = VESSEL_DEFS.design;
  const root = new THREE.Group();
  root.add(buildVesselMesh(def.hull, def.layout, def.exhaust?.position, def.livery));
  root.add(new BoatView('design', def, assembleView(RECIPES.design, def, LIBRARY), true).root);
  boat = useDesign(design);
  return { root, boat: b, room };
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
  sc.background = new THREE.Color(0x1c2a34);
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
  const bars = () => showBars(A, a.boat, a.room, results.a, B, b.boat, b.room, results.b);
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
function showBars(A: Variant, a: DesignedBoat, ra: DeckRoom, ta: SeaTrialResults | undefined, B: Variant, b: DesignedBoat, rb: DeckRoom, tb: SeaTrialResults | undefined): void {
  const rowsOf: [string, number | undefined, number | undefined, (x: number) => string, string][] = [
    ['Top speed', ta?.topSpeedKn, tb?.topSpeedKn, (x) => `${x.toFixed(1)} kn`, 'more is faster'],
    ['Turning circle', ta?.tacticalDiameter, tb?.tacticalDiameter, (x) => `${x.toFixed(0)} m`, 'less turns tighter'],
    ['Crash stop', ta?.crashStopDistance, tb?.crashStopDistance, (x) => `${x.toFixed(0)} m`, 'less stops shorter'],
    ['Range flat out', ta?.speedTable.at(-1)?.rangeNm, tb?.speedTable.at(-1)?.rangeNm, (x) => `${x.toFixed(0)} nm`, ''],
    ['Stability (GM)', a.figures.gmM, b.figures.gmM, (x) => `${x.toFixed(2)} m`, 'more is stiffer'],
    ['Displacement', a.figures.massT, b.figures.massT, (x) => `${x.toFixed(1)} t`, ''],
    ['Deck cargo', ra.crates, rb.crates, (x) => `${x} crates`, 'more carries more'],
    ['Bollard pull', ta && ta.bollard.aheadKN / 9.81, tb && tb.bollard.aheadKN / 9.81, (x) => `${x.toFixed(1)} t`, 'more tows harder'],
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
showBrief();
{
  let first = 0;
  try {
    const saved = sessionStorage.getItem(STEP_KEY);
    first = Math.max(0, stepEls().findIndex((e) => e.dataset.step === saved));
  } catch {
    /* fine */
  }
  goStep(first);
}
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
(window as unknown as { shipyard: unknown }).shipyard = { get design() { return design; }, get boat() { return boat; }, get trial() { return trial; }, get people() { return people; }, get brief() { return brief; }, goStep, sheetEditor, get notes() { return notes; }, putMyNote, hullFrac: () => [hullMin, hullMax], get link() { return link; }, change, setView, look, undo: () => undoRedo(false), redo: () => undoRedo(true) };
