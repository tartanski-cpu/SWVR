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
import { DESIGN_HULLS, ENGINES, LIVERIES, type DesignedBoat } from './build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, FIELDS, SCALES, type ShipDesign } from './design';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stepsOf = (k: keyof ShipDesign) => FIELDS.find((f) => f.key === k)!.steps;

// ── State ──
const fromHash = decodeDesign(decodeURIComponent(location.hash.slice(1)));
let design: ShipDesign = 'design' in fromHash ? fromHash.design : { ...DEFAULT_DESIGN };
let boat: DesignedBoat = useDesign(design);
/** The choices her gearbox was matched for (not the paint or the controls, which don't change it). */
const matchKey = (d: ShipDesign) => JSON.stringify({ ...d, gear: 0, paint: 0, controls: 0 });
let matchedFor: string | null = matchKey(design); // a loaded code (or the default) comes matched
let trial: SeaTrialResults | null = null;

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
  Side: () => ({ eye: [-1.5 * L(), 0.25 * L(), 0], at: [0, 1, 0] }),
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
}

// ── The controls ──
const controls = $('controls');
function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  controls.appendChild(h);
  return controls;
}
function choices(key: keyof ShipDesign, items: { name: string; note?: string }[]): void {
  const box = document.createElement('div');
  items.forEach((it, i) => {
    const c = document.createElement('div');
    c.className = 'choice';
    c.dataset.key = key;
    c.dataset.i = String(i);
    c.innerHTML = `<b>${it.name}</b>${it.note ? `<div style="font-size:12px;color:#567">${it.note}</div>` : ''}`;
    c.onclick = () => change({ [key]: i });
    box.appendChild(c);
  });
  controls.appendChild(box);
}
const outputs: Partial<Record<keyof ShipDesign, (v: number) => string>> = {};
function slider(key: keyof ShipDesign, label: string, show: (v: number) => string): void {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${label}</label><input type="range" min="0" max="${stepsOf(key) - 1}" step="1" data-key="${key}"><output data-key="${key}"></output>`;
  const input = row.querySelector('input')!;
  input.oninput = () => change({ [key]: Number(input.value) });
  outputs[key] = show;
  controls.appendChild(row);
}
const pct = (k: number) => `${Math.round(k * 100)} %`;

section('1. Hull');
choices('hull', DESIGN_HULLS.map((h) => ({ name: h.name.split(':')[0], note: h.name.split(':')[1]?.trim() })));
slider('length', 'Length', () => `${boat.figures.lengthM.toFixed(2)} m`);
slider('beam', 'Beam', () => `${boat.figures.beamM.toFixed(2)} m`);
slider('depth', 'Depth', (v) => pct(SCALES.scale(v)));
slider('bulwark', 'Bulwarks', (v) => `${SCALES.bulwark(v).toFixed(1)} m`);
slider('bow', 'Bow', (v) => SCALES.bow(v));
section('2. Wheelhouse');
slider('housePos', 'Position', (v) => (v === 0 ? 'right aft' : v === 15 ? 'right forward' : `${pct(SCALES.housePos(v))} fwd`));
slider('houseLength', 'Length', (v) => `${SCALES.houseLength(v).toFixed(1)} m`);
slider('houseWidth', 'Width', (v) => pct(SCALES.houseWidth(v)));
slider('headroom', 'Headroom', (v) => `${SCALES.headroom(v).toFixed(1)} m`);
{
  const row = document.createElement('label');
  row.className = 'choice';
  row.innerHTML = '<input type="checkbox" data-key="sunk"> Step down into it (its floor below the deck, for headroom)';
  const box = row.querySelector('input')!;
  box.onchange = () => change({ sunk: box.checked ? 1 : 0 });
  controls.appendChild(row);
}
section('3. Engine');
choices('engine', ENGINES.map((e) => ({ name: e.name, note: `${e.kg} kg with its gearbox. Propeller and gearbox matched to her by trial.` })));
section('4. Controls');
choices('controls', [
  { name: 'Basic', note: 'Wheel, throttle, key / heat / start, speed and depth, rpm.' },
  { name: 'Advanced', note: 'Adds lights, wipers, horn, searchlight, heading, engine monitor and the VHF.' },
]);
section('5. Paint');
{
  const box = document.createElement('div');
  box.className = 'swatches';
  LIVERIES.forEach((l, i) => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.title = l.name;
    s.dataset.key = 'paint';
    s.dataset.i = String(i);
    s.style.background = `#${(l.livery.topsides ?? 0xd9622b).toString(16).padStart(6, '0')}`;
    s.onclick = () => change({ paint: i });
    box.appendChild(s);
  });
  controls.appendChild(box);
}

/** Show the design in the controls. */
function syncControls(): void {
  document.querySelectorAll<HTMLElement>('[data-key][data-i]').forEach((el) => el.classList.toggle('on', design[el.dataset.key as keyof ShipDesign] === Number(el.dataset.i)));
  document.querySelectorAll<HTMLInputElement>('input[type=range][data-key]').forEach((el) => (el.value = String(design[el.dataset.key as keyof ShipDesign])));
  document.querySelectorAll<HTMLOutputElement>('output[data-key]').forEach((el) => {
    const k = el.dataset.key as keyof ShipDesign;
    el.textContent = outputs[k]!(design[k]);
  });
  (document.querySelector('input[data-key=sunk]') as HTMLInputElement).checked = !!design.sunk;
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
}
function showTrial(): void {
  const t = trial;
  if (!t) {
    $('trial').innerHTML = '';
    return;
  }
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
function change(patch: Partial<ShipDesign>): void {
  const before = matchKey(design);
  design = { ...design, ...patch };
  boat = useDesign(design);
  syncControls();
  drawBoat();
  showFigures();
  showCode();
  if (matchKey(design) !== before || !trial) runTrial();
}

// ── Code tools ──
$('copy').onclick = () => {
  if (matchedFor === matchKey(design)) void navigator.clipboard?.writeText(encodeDesign(design));
};
const loadCode = () => {
  const read = decodeDesign(($('load') as HTMLInputElement).value);
  if ('error' in read) {
    $('loadMsg').textContent = read.error;
    return;
  }
  $('loadMsg').textContent = '';
  design = read.design;
  matchedFor = matchKey(design);
  trial = null;
  change({});
  runTrial();
};
$('loadBtn').onclick = loadCode;
$('load').addEventListener('keydown', (e) => e.key === 'Enter' && loadCode());

// ── Start ──
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
(window as unknown as { shipyard: unknown }).shipyard = { get design() { return design; }, get boat() { return boat; }, get trial() { return trial; }, change, setView };
