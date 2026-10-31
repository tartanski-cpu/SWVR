/**
 * The Shipyard page (shipyard.html; owner, Oct 2026): design a boat and get her code.
 *
 * A designer's workflow (owner: a tool, not a sandbox), in steps along the top:
 *   Brief       what she's for, its jobs and her targets (brief.ts); a suggested boat for it
 *   Hull … Paint  one step per group of choices, each with a line of guidance
 *   Trials & handover  the brief checked against her trials, her code, the game, favourites
 * The brief is checked line by line all the way (right-hand column), with where to go when a
 * line isn't met. Designing together, variants, pins and sketches sit across all the steps:
 * sketches (snapshots drawn on) to talk a change over, pins (notes on a spot) to decide it.
 * Gear and furniture are placed by pointing at her (placing.ts).
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
import { createVesselState } from '../vessel/vesselState';
import { CONFIG } from '../config';
import { LIBRARY, RECIPES } from '../boats/library';
import { gearOf, tenderCranesOf, useDesign } from '../boats/sims';
import { assembleView } from '../modular/assemble';
import type { SeaTrialResults } from '../vessel/seaTrials';
import { VESSEL_DEFS, wetOutlet } from '../vessel/vesselDef';
import { isPlaneSheet, PLANES, PlaneInk, planeAt, planeFacing, planeSheet, toPlane, type PlaneName } from './planeSketch';
import { buildMachinery } from './enginePreview';
import { LiveTrial, stabilityOf, type LiveSample, type LiveTest } from './liveTrial';
import { StabilityView } from './stabilityView';
import { flatVertexColorMaterial, mergeParts } from '../render/geometryUtils';
import { HydroDebugView } from '../debug/hydroDebugView';
import { hullCards } from './hullCards';
import { cellOf, ghostSize, previewPlace, whereIs, type Preview, type Target } from './placing';
import { alongAxis, HANDLES, nearestStep, type HandleDef, type V3 as HV3 } from './handles';
import { buildVesselMesh, buildVesselMeshParts } from '../vessel/view/hullMesh';
import { tubeParts } from '../modules/tubes';
import { hullQueries } from '../modular/hull';
import { MARKING_NAMES, SERVICE_LIVERIES } from './parts/markings';
import { electricOf } from './parts/solar';
import { buildDesign, withFixed, gearFixed, DESIGN_HULLS, ENGINES, LIVERIES, FRAME_COLOURS, HOUSE_PAINTS, TUBE_PAINTS, ROOF_PAINTS, ROOF_TOPS, type DesignedBoat } from './build';
import { docFileName, docFileText, docToken, designToken, readDesign, shortCode } from './designDoc';
import { OUTBOARD_SIZES, TUBE_COLOURS, ALL_FIELDS, NO_FURNITURE, FINISHES, CONSOLE_AUTO, CONSOLE_SIDES, consoleLengthM, DASH_SLOTS, dashValue, PANEL_SLOTS, STACK_STYLES, STACK_MOUNTS, STACK_CASINGS, STACK_POS_STEPS, batteryKWh, kickDeg, DEFAULT_DESIGN, GUARDS, MATERIALS, OUTBOARDS, RAILS, MEASURES, SILLS, type MeasureKey, SHAFT_ONLY_ENGINES, SINGLE_ONLY_ENGINES, SKIFFS, outboardCount, placeOf, placeValue, SCALES, FURNITURE_SLOTS, type FurnitureKey, type PlaceKey, type ShipDesign } from './design';
import { hullPlan } from '../vessel/layout';
import { UndoStack } from './undo';
import { YardLink } from './yardLink';
import { Keeper, newSessionId, sessionIdFrom, type DesignPatch, type Person, type SessionEvents } from './session';
import { cleanDoc, diffFields, fork, MAIN, mergePatch, newDoc, promote, type Variant, type YardDoc } from './variants';
import { LoopbackHost, randomRoomCode } from '../net/transport';
import { fromFrac, inkOf, MAX_POINTS, noteId, sheetsOf, toFrac, todo, type Frac, type Ink, type Note, type Pin, type Sheet } from './notes';
import { bareHull, checkBrief, engineOptions, JOBS, newBrief, pickEngine, type Brief, type Check, type JobId, type Tried } from './brief';
import { rankTypes } from './typeFit';
import { deckRoom, sizeForDeck, type DeckRoom } from './deckRoom';
import { trialCharts } from './trialCharts';
import type { GearKind } from '../modular/module';
import { aboutHeading, CONTROL_ICONS, ENGINE_ICONS, floorIcon, HOUSE_ICONS, HULL_ICONS, liningIcon, pickTiles, toggleTiles, type Tile } from './tiles';
import { GEAR_ABOUT, GEAR_GROUPS, GEAR_ICONS, gearKind } from './gearMenu';
import { EQUIPMENT, equipmentOf, fitted, placeGear, removeGear, type Equipment } from './pinGear';
import { FURNITURE_MENU, nextSlot, placedOf, removeFurniture, slotOf, turnSeat } from './furnishing';
import { furnitureName, furnitureSocketId } from './parts/furniture';
import { SheetEditor } from './sheetEditor';
import { holdSlots, type FishHoldConfig } from '../modules/fishHold';
import { keepLeftWork, readProjects, removeProject, saveAs, writeProjects, type Project } from './projects';
import { addFavourite, cleanName, readFavourites, removeFavourite, writeFavourites, type Favourite, type Store } from './favourites';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stepsOf = (k: keyof ShipDesign) => ALL_FIELDS.find((f) => f.key === k)!.steps;

// ── State ──
// Opened with her code or her document in the address (#CODE, #doc.…: designDoc.ts): her design.
const fromHash = location.hash.length > 1 ? readDesign(decodeURIComponent(location.hash.slice(1))) : { error: '' };
/** A shared session's id (?s=...), and this browser's last copy of it (designing together, session.ts). */
let sessionId = sessionIdFrom(location.search);
/**
 * Everything this browser holds: the main design and its variants, each with its pins and
 * marks (variants.ts). On your own it lives in `solo`, a session keeper with nobody else
 * connected, so working alone and together go through the same code; in a session, in the
 * session's copy (link.side). `active` is the tab you're on.
 */
/** The project this work was last saved or opened as (this browser), to mark it in the list and save into. */
const PROJECT_KEY = 'swvr.yard.project';
/**
 * Has this tab a project open? (Owner, Oct 2026: the Shipyard opens with no project, not the
 * last design, and asks for a new one or a saved one.) Kept in the tab's own storage, so
 * reloading the page keeps your work open, while coming back to the Shipyard starts afresh.
 */
const OPEN_KEY = 'swvr.yard.open';
/** Opened afresh, on your own: the work left on the table is kept as a project, and the page starts empty. */
const freshVisit = !sessionId && !tabHasProject();
if (freshVisit) keepWorkLeftOnTable();
/** The start screen shows (new project, or open one), unless she came in a link or code: that opens as a new project. */
const showStart = freshVisit && !('design' in fromHash);
if (freshVisit && !showStart) markProjectOpen();
const startDoc: YardDoc = readDocCopy(sessionId ?? 'solo') ?? newDoc('design' in fromHash ? fromHash.design : { ...DEFAULT_DESIGN });
let active = MAIN;
if (!sessionId && 'design' in fromHash) {
  // Opened with a code: the variant that is that design, or else the code becomes the main design.
  const same = startDoc.variants.find((v) => !diffFields(v.design, fromHash.design).length);
  if (same) active = same.id;
  else startDoc.variants[0] = { ...startDoc.variants[0], design: fromHash.design };
}
// A link's design is read: taken off the address, so a reload keeps this project, not the link.
if ('design' in fromHash) history.replaceState(null, '', `${location.pathname}${location.search}`);
let design: ShipDesign = { ...startDoc.variants.find((v) => v.id === active)!.design };
let boat: DesignedBoat = useDesign(design);
/** The choices her gearbox was matched for (not the paint, its markings or the controls, which don't change it). */
const matchKey = (d: ShipDesign) => JSON.stringify({ ...d, gear: 0, paint: 0, markings: 0, controls: 0 });
/**
 * Does a loaded design come with its gearing matched? An inboard's code does (the yard
 * matched it before it was issued). Outboards' lower units are matched from the same step
 * only since Oct 2026: a code from before carries the inboard's step, far too low for them
 * (she lugged and ran hot, owner), so those are matched again on loading.
 */
const comesMatched = (d: ShipDesign) => outboardCount(d) === 0;
let matchedFor: string | null = comesMatched(design) ? matchKey(design) : null;
/**
 * Is her gearbox matched for what she is now? Always, on a one-off whose gearbox is fixed with
 * her type (the harbour tug, owner: "a fixed engine configuration and a fixed propulsion, so
 * there shouldn't be any resolving of the gearbox"): her code or link is ready at once.
 */
const matched = (): boolean => gearFixed(design) || matchedFor === matchKey(design);
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
/** The section tool's cut (sectionTool, below): which plane, where along her each sits (world m), which side is kept. */
type SectionKind = 'waterline' | 'buttock' | 'station';
const cut: { kind: SectionKind | null; at: Record<SectionKind, number | null>; flip: boolean } = { kind: null, at: { waterline: null, buttock: null, station: null }, flip: false };
const sectionPlane = new THREE.Plane();
// (Her materials cut by the section plane: off unless asked for, so turned on for the page.)
renderer.localClippingEnabled = true;

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h);
  if (typeof planeInk !== 'undefined') planeInk.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

const VIEWS: Record<string, () => { eye: [number, number, number]; at: [number, number, number] }> = {
  'Bow ¾': () => ({ eye: [-0.65 * L(), 0.45 * L(), -0.9 * L()], at: [0, 1, 0] }),
  // From starboard, so her bow is to the right, as a profile is always drawn (owner).
  // Level with what it looks at, so it's a true elevation (owner: it looked down a little).
  Starboard: () => ({ eye: [2.3 * L(), 1, 0], at: [0, 1, 0] }),
  // (Owner: port and starboard, straight side on, in place of one side view.)
  Port: () => ({ eye: [-2.3 * L(), 1, 0], at: [0, 1, 0] }),
  'Stern ¾': () => ({ eye: [0.65 * L(), 0.45 * L(), 0.9 * L()], at: [0, 1, 0] }),
  // From above, bow to the right as a plan is drawn (owner: it fits the wide view better):
  // the eye a hair to starboard of overhead turns her so (port at the top).
  // High enough that her length fits across the view, whatever its shape.
  Plan: () => ({ eye: [0.01, Math.max(0.9, 1.55 / camera.aspect) * L(), 0], at: [0, 0, 0] }),
  // Square on from ahead and astern (owner: the front and back views were missing; they're
  // also two of the four views you can sketch on, planeSketch.ts).
  Bow: () => ({ eye: [0, 1, -2.3 * L()], at: [0, 1, 0] }),
  Stern: () => ({ eye: [0, 1, 2.3 * L()], at: [0, 1, 0] }),
  'At the helm': () => {
    const [x, y, z] = boat.hull.helm.stand;
    return { eye: [x, y + 1.65, z], at: [x, y + 1.3, z - 6] };
  },
};
const L = () => boat.figures.lengthM;
function setView(name: string): void {
  // From the helm the flat view would look in through the house's back: perspective there.
  if (name === 'At the helm' && flat) flatBtn.click();
  // Sketching is only on the four square-on views: another view puts the pen down.
  if (tool === 'sketch' && !SKETCH_VIEWS.includes(name)) {
    beforeSketch = null;
    setTool(null);
  }
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
// The flat view (owner: "a no perspective toggle"): an orthographic camera drawn instead,
// kept looking the way the perspective one does (which the mouse still turns and zooms), and
// as wide as it sees at the point it orbits, so switching keeps the boat the same size there.
const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);
let flat = false;
/** The camera to draw and pick with: the perspective one, or the flat one matched to it. */
function viewCam(): THREE.Camera {
  if (!flat) return camera;
  const back = camera.position.clone().sub(orbit.target);
  const h = back.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  flatCam.left = -h * camera.aspect;
  flatCam.right = h * camera.aspect;
  flatCam.top = h;
  flatCam.bottom = -h;
  // Stood well back along the same line, so nothing of her is behind it (its size doesn't change with distance).
  flatCam.position.copy(orbit.target).add(back.setLength(back.length() + 100));
  flatCam.quaternion.copy(camera.quaternion);
  flatCam.updateProjectionMatrix();
  flatCam.updateMatrixWorld();
  return flatCam;
}
const flatBtn = document.createElement('button');
flatBtn.textContent = 'Flat view';
flatBtn.className = 'tool';
flatBtn.title = 'No perspective: parallel lines stay parallel, as on a drawing (scroll to zoom)';
flatBtn.onclick = () => {
  flat = !flat;
  flatBtn.classList.toggle('on', flat);
};
$('views').appendChild(flatBtn);
const waterBtn = document.createElement('button');
waterBtn.textContent = 'Water on/off';
waterBtn.onclick = () => (water.visible = !water.visible);
$('views').appendChild(waterBtn);
// The hull and the wheelhouse see-through or solid (owner, Oct 2026: an option to turn each
// see-through, whatever the step). Each step opens with its own view (focusStep); a click
// flips that part until the step changes.
const seeThrough: { hull: boolean | null; house: boolean | null; step: string } = { hull: null, house: null, step: '' };
const seeBtns = (['hull', 'house'] as const).map((part) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.title = `Show her ${part === 'hull' ? 'hull' : 'wheelhouse'} see-through or solid (each step starts with its own)`;
  b.onclick = () => {
    seeThrough[part] = !b.classList.contains('on');
    focusStep();
  };
  $('views').appendChild(b);
  return b;
});

/** Draw her: the game's hull mesh and her modules, as the game builds them. */
function drawBoat(): void {
  // She's changed: a live trial of her as she was stops.
  stopLive();
  if (boatRoot) {
    scene.remove(boatRoot);
    boatRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
  const def = VESSEL_DEFS.design;
  const root = new THREE.Group();
  // Hull and house apart, so a step can show one on its own (focus, below).
  const parts = buildVesselMeshParts(def.hull, def.layout, wetOutlet(def), def.livery);
  root.add(parts.hull);
  if (parts.house) root.add(parts.house);
  // Her hull protection (strake, tyres, push fender, the fender basket) apart from the rest
  // of her modules: it belongs with the hull (owner: shown at the Hull step). The game bakes
  // it in with the rest.
  const recipe = RECIPES.design;
  const isGuard = (m: { module: string }) => PROTECTION.has(m.module);
  const modules = assembleView({ ...recipe, modules: recipe.modules.filter((m) => !isGuard(m)) }, def, LIBRARY);
  const modulesRoot = new BoatView('design', def, modules, true).root;
  showDisplays(modules, def);
  root.add(modulesRoot);
  // (Without her interlocks: they're between the controls of the rest.)
  const guard = guardView({ ...recipe, modules: recipe.modules.filter(isGuard), interlocks: [] }, def);
  root.add(guard);
  addSkiff(root);
  const machinery = addMachinery(root);
  scene.add(root);
  boatRoot = root;
  shown = { hull: parts.hull, house: parts.house, modules: modulesRoot, guard, skiff: root.children.find((c) => c.name === 'skiff') ?? null, machinery };
  focusStep();
  // A different engine (or one more) at the Engine step: look at it afresh.
  const fit = `${design.engine}:${design.twin}`;
  if (shownStep === 'engine' && fit !== framedFit) frameMachinery();
  framedFit = fit;
  // Her extent: the frame for pins and marks (hull fractions, notes.ts).
  const box = hullBox(root);
  hullMin = box.min.toArray();
  hullMax = box.max.toArray();
  if (typeof drawNotes === 'function') drawNotes();
  if (typeof drawInk === 'function') drawInk();
  // A section cut stays through her changes (kept within her new extent).
  if (cut.kind) {
    setSection(cut.kind);
    applyCuts();
  }
}
/**
 * The skiff in her cradle, if she carries one (the crane's tenderCrane gear): in the game
 * she's a boat of her own the crane holds (app); here just her hull, where she stows.
 */
/**
 * Her screens and gauges drawn once, as at the berth (owner, Oct 2026: picking the analogue
 * gauges, "you don't get a preview of them"; the Shipyard never ran the instruments, so every
 * display stood blank): a fresh boat of her design with the battery master and every breaker
 * on, the engine stopped, the time noon.
 */
function showDisplays(view: ReturnType<typeof assembleView>, def: typeof VESSEL_DEFS.design): void {
  const s = createVesselState('shipyard-preview', 'design');
  if (s.electrics) {
    s.electrics.master = 1;
    for (const k of Object.keys(s.electrics.breakers) as (keyof typeof s.electrics.breakers)[]) s.electrics.breakers[k] = 1;
  }
  view.update(s, 1, { inView: true, def, env: null });
}

function addSkiff(root: THREE.Group): void {
  // (Each crane's: a big boat may carry two, design.skiff2.)
  const cranes = tenderCranesOf({ defId: 'design' });
  if (!cranes.length) return;
  const group = new THREE.Group();
  group.name = 'skiff';
  for (const crane of cranes) group.add(skiffMesh(crane));
  root.add(group);
}
/** The boat a crane carries in her cradle. */
function skiffMesh(crane: ReturnType<typeof tenderCranesOf>[number]): THREE.Object3D {
  // The boat her crane carries (the dinghy, or the rescue boat), and her tubes (modules/tubes),
  // as the game draws them; the rescue boat's console too (her modules' fixed parts).
  const id = crane.tenderDefId;
  const sk = VESSEL_DEFS[id];
  const mesh = buildVesselMesh(sk.hull, sk.layout, wetOutlet(sk), sk.livery);
  const tubes = RECIPES[id].modules.find((m) => m.module === 'hull.tubes');
  if (tubes) mesh.add(new THREE.Mesh(mergeParts(tubeParts(hullQueries(sk), { ...CONFIG.modules.tubes.dinghy, ...(tubes.config as object) })), flatVertexColorMaterial()));
  if (id !== 'skiff') {
    const built = assembleView(RECIPES[id], sk, LIBRARY);
    for (const m of built.modules) mesh.add(m.root);
    if (built.staticParts.length) mesh.add(new THREE.Mesh(mergeParts(built.staticParts), flatVertexColorMaterial()));
  }
  mesh.position.set(...crane.stow);
  return mesh;
}
/** The modules that protect her hull (build.ts: hull protection, the push fender, the fender basket). */
const PROTECTION = new Set(['hull.guard', 'hull.push-fender', 'deck.fenders']);
/** Her protection modules on their own: their parts and any fixed geometry, as the game draws them. */
function guardView(recipe: typeof RECIPES.design, def: (typeof VESSEL_DEFS)['design']): THREE.Group {
  const g = new THREE.Group();
  g.name = 'guard';
  if (!recipe.modules.length) return g;
  const built = assembleView(recipe, def, LIBRARY);
  for (const m of built.modules) g.add(m.root);
  if (built.staticParts.length) g.add(new THREE.Mesh(mergeParts(built.staticParts), flatVertexColorMaterial()));
  for (const m of built.shared) g.add(m);
  return g;
}
/**
 * Her engines, shafts, propellers and rudders (enginePreview.ts), for the Engine step only:
 * where her design puts them, the propeller at the diameter it's given. (The game doesn't
 * draw them.) With a label on the engine and on the propeller.
 */
function addMachinery(root: THREE.Group): THREE.Group | null {
  const bed = boat.hull.sockets.find((s) => s.id === 'engine')?.transform?.position;
  const cfg = (id: string) => boat.recipe.modules.find((m) => m.socket === id)?.config as Record<string, any> | undefined;
  const engine = cfg('engine');
  const prop = engine?.propeller?.position as [number, number, number] | undefined;
  const rudder = cfg('rudder')?.rudder?.position as [number, number, number] | undefined;
  // A stern drive: its engines only (the legs are its module's, shown at Engine too).
  const sd = !!cfg('sternDrive') || !!cfg('pods');
  // (Azimuth drives have no rudder: the Z-drives are drawn from her propellers' place.)
  if (!bed || (!sd && (!prop || (!rudder && !engine?.azimuth)))) return null;
  // (The foiling ferry's pods, a motor in each nacelle at the foot of its strut: DesignHull.foilPods.)
  const pod = DESIGN_HULLS[design.hull].foilPods ? (cfg('pods') as { units: number[]; mount: { y: number; z: number }; strut: number } | undefined) : undefined;
  // (Pod drives are always twin.)
  const twin = (!!design.twin || !!cfg('pods')) && !SINGLE_ONLY_ENGINES.includes(design.engine);
  const propD = boat.figures.propellerM;
  const fit = pod ? { ...boat.shaft, x: Math.max(...pod.units), flangeY: pod.mount.y - pod.strut, flangeZ: pod.mount.z + ENGINES[design.engine].size[0] / 2, angleDeg: 0, fits: true, topY: pod.mount.y } : boat.shaft;
  const g = buildMachinery({ engine: design.engine, twin, form: VESSEL_DEFS.design.hull, shaft: fit, twinX: engine?.twin?.x ?? 0, propD, propZ: prop?.[2] ?? 0, rudderZ: rudder?.[2] ?? 0, sterndrive: sd, nozzle: !!engine?.nozzle, zDrive: !!DESIGN_HULLS[design.hull].zDrives });
  g.name = 'machinery';
  const name = ENGINES[design.engine].name.split(' (')[0];
  const tag = nameTag(pod ? `2 × ${name}, one in each pod` : fit.fits ? (twin ? `2 × ${name}` : name) : `Too tall by ${Math.round(fit.shortM * 100)} cm`, fit.fits ? '#2f6aa8' : '#b23a2c');
  tag.position.set(0, fit.topY + 0.45, fit.flangeZ - ENGINES[design.engine].size[0] / 2);
  const lowest = Math.min(...g.children.filter((c) => c.name === 'propeller').map((c) => c.position.y));
  const ptag = nameTag(`Propeller ⌀ ${propD.toFixed(2)} m${engine?.nozzle ? ' in a Kort nozzle' : ''}${twin ? ' (two)' : ''}`, '#8a5a1c');
  ptag.position.set(0, lowest - propD / 2 - 0.35, prop?.[2] ?? 0);
  // (A stern drive's propellers are on its legs: no tag down there.)
  g.add(...(sd ? [tag] : [tag, ptag]));
  // The solar catamaran's battery (owner, Oct 2026: "I'd like the batteries to show up so you
  // can kind of see how big the battery packs are"): a pack low in each hull amidships, as long
  // as her kWh make it (CONFIG.shipyard.solarCat.pack), where her weights put it.
  const solar = boat.figures.solar;
  const cell = boat.weights.items.find((it) => it.name.startsWith('Battery ('));
  if (solar && cell) {
    const pk = electricOf(design).pack;
    const half = (VESSEL_DEFS.design.hull.catamaran?.spacing ?? 0) / 2;
    const xs = half ? [-half, half] : [0];
    const len = (solar.batteryKWh * pk.litresPerKWh) / 1000 / (pk.height * pk.width * xs.length);
    const mat = new THREE.MeshStandardMaterial({ color: 0x35c46a, emissive: 0x0e4a24, metalness: 0.2, roughness: 0.6 });
    for (const x of xs) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(pk.width, pk.height, len), mat);
      pack.position.set(x, cell.y, cell.z);
      pack.name = 'battery';
      g.add(pack);
    }
    const btag = nameTag(`Battery ${solar.batteryKWh} kWh${xs.length > 1 ? `: ${xs.length} packs, ${len.toFixed(1)} m long` : ''}`, '#1f8a4c');
    btag.position.set(0, cell.y + 0.6, cell.z);
    g.add(btag);
  }
  root.add(g);
  return g;
}
/**
 * Her hull and house's extent (the hull mesh: the first child), not the whole view: lights'
 * glows and the searchlight's beam reach far beyond her and would throw the frame out.
 */
function hullBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(root.children[0] ?? root);
  const house = root.children.find((c) => c.name === 'house');
  return house ? box.union(new THREE.Box3().setFromObject(house)) : box;
}

// ── Each step's view (owner, Oct 2026): the part being worked on, the rest out of the way ──
/** Her parts as drawn: hull, house, the modules (equipment, controls, lights), the skiff. */
let shown: { hull: THREE.Mesh; house: THREE.Mesh | null; modules: THREE.Object3D; guard: THREE.Object3D; skiff: THREE.Object3D | null; machinery: THREE.Object3D | null } | null = null;
/** A ghost: faint glass with her edges drawn, enough to see where her sides and deck are. */
const ghostFill = new THREE.MeshBasicMaterial({ color: 0x9cc3dc, transparent: true, opacity: 0.08, depthWrite: false });
const ghostEdge = new THREE.LineBasicMaterial({ color: 0xa9cfe6, transparent: true, opacity: 0.35, depthWrite: false });
/** Show a mesh solid (as built), ghosted, or not at all. */
function look3(m: THREE.Mesh | null, how: 'solid' | 'ghost' | 'off'): void {
  if (!m) return;
  m.userData.solid ??= m.material;
  m.visible = how !== 'off';
  m.material = how === 'ghost' ? ghostFill : (m.userData.solid as THREE.Material);
  let edges = m.children.find((c) => c.name === 'edges');
  if (how === 'ghost' && !edges) {
    edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), ghostEdge);
    edges.name = 'edges';
    m.add(edges);
  }
  if (edges) edges.visible = how === 'ghost';
}
/**
 * The step on show decides what's drawn: the hull alone at Hull; the house over a ghost of
 * the hull at Wheelhouse (with what's inside the house: console, seats); the engines inside a
 * ghost of her at Engine; everything for the rest.
 */
// ── Live sea trials (liveTrial.ts): her model moved by the game's physics, at the Trials step ──
let live: LiveTrial | null = null;
/** The inclining weight, on her deck while that test runs. */
let liveWeight: THREE.Mesh | null = null;
/** The drop: the game's physics debug overlay (buoyancy by station, her CG) on her while it runs. */
let liveHydro: HydroDebugView | null = null;
/** The roll and the inclining: her G, B, Z and M, GZ and GM, on her (stabilityView.ts). */
let liveStab: StabilityView | null = null;
/** The roll's righting levers as she swings: heel (deg, either way) and GZ (m), for its GZ curve. */
let liveCurve: [number, number][] = [];
// The buttons say what each test does (from the config).
document.querySelector<HTMLElement>('[data-live=drop]')!.textContent = `Drop her from ${CONFIG.shipyard.live.dropM} m`;
document.querySelector<HTMLElement>('[data-live=roll]')!.textContent = `Roll from ${CONFIG.shipyard.live.rollDeg}°`;
function startLive(test: LiveTest): void {
  stopLive();
  live = new LiveTrial(test);
  document.querySelectorAll<HTMLElement>('[data-live]').forEach((b) => b.classList.toggle('on', b.dataset.live === test));
  if (test === 'incline' && boatRoot) {
    // The test weight: concrete blocks (~2.4 t/m³) on her aft deck, where you see them from
    // astern, moved across as the test goes (only its moment matters, not where along her).
    const side = Math.cbrt(live.weightKg / 2400);
    const plan = hullPlan(VESSEL_DEFS.design);
    const z = plan.transom + (plan.stem - plan.transom) * 0.12;
    liveWeight = new THREE.Mesh(new THREE.BoxGeometry(side, side, side), new THREE.MeshStandardMaterial({ color: 0xd8b02a, roughness: 0.8 }));
    liveWeight.userData.at = [plan.deckY(z) + side / 2, z];
    boatRoot.add(liveWeight);
  }
  // A view that shows what the test is about: from her quarter, room above for the drop; from
  // astern, square on, for the heel (a little above for the inclining weight on deck).
  if (flat) flatBtn.click();
  const L = boat.figures.lengthM;
  if (test === 'drop') look([1.5 * L, 0.55 * L, 1.1 * L], [0, 1.6, 0]);
  else if (test === 'incline') look([0, 0.45 * L, 1.7 * L], [0, 0.6, 0]); // over the weight on deck
  else setView('Stern');
  // The drop shows the physics' buoyancy by station; the roll and the inclining her stability
  // (owner, 27 Oct 2026: they "should show the GZ and GM"), each with its key under the chart.
  liveCurve = [];
  $('liveKeyDrop').hidden = test !== 'drop';
  $('liveKeyStab').hidden = test === 'drop';
  if (boatRoot && test === 'drop') {
    liveHydro = new HydroDebugView(VESSEL_DEFS.design, true);
    boatRoot.add(liveHydro.root);
  } else if (boatRoot) {
    const ys = VESSEL_DEFS.design.hull.stations.flatMap((s) => s.polygon.map((p) => p[1]));
    liveStab = new StabilityView(Math.min(0.9, Math.max(0.3, L / 30)), Math.min(...ys), Math.max(...ys) + 1.5);
    boatRoot.add(liveStab.root);
  }
  $('liveResult').textContent = '';
}
function stopLive(): void {
  live = null;
  liveWeight?.removeFromParent();
  liveWeight = null;
  liveHydro?.root.removeFromParent();
  liveHydro = null;
  liveStab?.root.removeFromParent();
  liveStab?.dispose();
  liveStab = null;
  document.querySelectorAll<HTMLElement>('[data-live]').forEach((b) => b.classList.remove('on'));
  if (boatRoot) {
    boatRoot.position.set(0, 0, 0);
    boatRoot.quaternion.identity();
  }
}
/** Advance the test, move her model to where the physics has her, and show the readings. */
function stepLive(dt: number): void {
  if (!live || !boatRoot) return;
  live.advance(dt);
  const v = live.v;
  boatRoot.position.set(v.position[0], v.position[1] - live.restY, v.position[2]);
  boatRoot.quaternion.fromArray(v.orientation);
  if (liveWeight) {
    const [y, z] = liveWeight.userData.at as [number, number];
    liveWeight.position.set(live.shift * live.shiftM, y, z);
  }
  const hydro = live.debug.get(v.id);
  liveHydro?.update(hydro);
  const s = live.samples[live.samples.length - 1];
  const done = live.done ? ' · done' : '';
  if (live.test === 'drop') {
    // Immersed: what the water holds up (as the game's debug readout), against her weight.
    const immersed = ((hydro?.submergedVolume ?? 0) * CONFIG.ocean.density) / 1000;
    $('liveNow').textContent = `${s.t.toFixed(1)} s · heel ${s.heelDeg.toFixed(1)}° · trim ${s.trimDeg.toFixed(1)}° · heave ${s.heaveM >= 0 ? '+' : ''}${s.heaveM.toFixed(2)} m · immersed ${immersed.toFixed(1)} t of ${(VESSEL_DEFS.design.mass / 1000).toFixed(1)} t${done}`;
  } else {
    // Her righting lever now, from the physics' buoyancy (liveTrial.ts stabilityOf).
    const st = hydro ? stabilityOf(hydro, VESSEL_DEFS.design.cg, s.heelDeg) : null;
    liveStab?.update(st);
    if (st && live.test === 'roll' && !live.done) liveCurve.push([Math.abs(s.heelDeg), st.gzM]);
    const gz = st ? `GZ ${st.gzM.toFixed(3)} m` : 'GZ --';
    // (GM: her figure from her lines and weights; the inclining finds its own, below.)
    $('liveNow').textContent = `${s.t.toFixed(1)} s · heel ${s.heelDeg.toFixed(1)}° · ${gz} · GM ${boat.figures.gmM.toFixed(2)} m (her figure)${done}`;
  }
  $('liveResult').textContent = live.result() ?? '';
  if (live.test === 'roll') drawGzCurve();
  else drawLiveChart(live);
  if (live.done) document.querySelectorAll<HTMLElement>('[data-live]').forEach((b) => b.classList.remove('on'));
}
/** The test so far against time: heel (roll, inclining) or heave (drop), the whole run to scale. */
function drawLiveChart(t: LiveTrial): void {
  const c = $('liveChart') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const heave = t.test === 'drop';
  const val = (s: LiveSample) => (heave ? s.heaveM : s.heelDeg);
  const span = Math.max(heave ? 1 : 2, ...t.samples.map((s) => Math.abs(val(s)))) * 1.1;
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - 12);
  const x = (time: number) => 30 + (time / t.duration) * (W - 40);
  g.strokeStyle = '#3b5262';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(30, H / 2);
  g.lineTo(W - 10, H / 2);
  g.stroke();
  g.fillStyle = '#93a8b5';
  g.font = '11px system-ui, sans-serif';
  g.fillText(heave ? `${span.toFixed(1)} m` : `${span.toFixed(1)}°`, 2, 14);
  g.fillText(heave ? 'heave' : 'heel', 2, H / 2 + 4);
  g.fillText(`${t.duration} s`, W - 34, H - 4);
  g.strokeStyle = '#6aa8e6';
  g.lineWidth = 2;
  g.beginPath();
  t.samples.forEach((s, i) => (i ? g.lineTo(x(s.t), y(val(s))) : g.moveTo(x(s.t), y(val(s)))));
  g.stroke();
}
/**
 * The roll's GZ curve: her righting lever against her heel (either way), as she swings back
 * from 45° (green: the physics' own GZ each moment), with the line of her GM from her figures,
 * GZ = GM sin φ (amber, dashed), that the curve follows at small heels.
 */
function drawGzCurve(): void {
  const c = $('liveChart') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const maxHeel = Math.ceil(Math.max(CONFIG.shipyard.live.rollDeg, ...liveCurve.map((p) => p[0])) / 10) * 10;
  const top = Math.max(0.05, ...liveCurve.map((p) => p[1])) * 1.25;
  const low = Math.min(0, ...liveCurve.map((p) => p[1]));
  const x = (deg: number) => 40 + (deg / maxHeel) * (W - 50);
  const y = (gz: number) => H - 16 - ((gz - low) / (top - low)) * (H - 28);
  g.strokeStyle = '#3b5262';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(40, y(0));
  g.lineTo(W - 10, y(0));
  g.moveTo(40, 8);
  g.lineTo(40, H - 16);
  g.stroke();
  g.fillStyle = '#93a8b5';
  g.font = '11px system-ui, sans-serif';
  g.fillText(`${top.toFixed(2)} m`, 2, 14);
  g.fillText('GZ', 2, y(0) - 4);
  for (let d = 10; d <= maxHeel; d += 10) g.fillText(`${d}°`, x(d) - 8, H - 3);
  // Her GM's line: GZ = GM sin φ.
  const gm = boat.figures.gmM;
  g.strokeStyle = '#d89a18';
  g.setLineDash([5, 4]);
  g.beginPath();
  for (let d = 0; d <= maxHeel; d += 1) {
    const v = gm * Math.sin((d * Math.PI) / 180);
    if (v > top) break;
    if (d) g.lineTo(x(d), y(v));
    else g.moveTo(x(d), y(v));
  }
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#d89a18';
  g.fillText(`GM ${gm.toFixed(2)} m`, W - 80, 14);
  // Her GZ as she swings.
  g.strokeStyle = '#3fbf6a';
  g.lineWidth = 2;
  g.beginPath();
  liveCurve.forEach(([d, v], i) => (i ? g.lineTo(x(d), y(v)) : g.moveTo(x(d), y(v))));
  g.stroke();
  if (liveCurve.length) {
    const best = liveCurve.reduce((a, b) => (b[1] > a[1] ? b : a));
    g.fillStyle = '#3fbf6a';
    g.fillText(`max GZ ${best[1].toFixed(2)} m at ${best[0].toFixed(0)}°`, x(best[0]) + 4, Math.max(24, y(best[1]) - 4));
  }
}
document.querySelectorAll<HTMLElement>('[data-live]').forEach((b) => (b.onclick = () => startLive(b.dataset.live as LiveTest)));
$('liveStop').onclick = () => stopLive();

/** The step last shown (to look at her machinery only on arriving at Engine), and the engine fit last looked at. */
let shownStep = '';
let framedFit = '';
/** Look at her engines and propellers: from her starboard quarter, a little above. */
function frameMachinery(): void {
  // (Her outboards, if that's her machinery.)
  const m = shown?.machinery ?? shown?.modules.getObjectByName('outboards');
  if (!m) return;
  // Where everything is first: the engines sit nested in their holders (placed and tilted on
  // the shaft line), whose positions aren't worked out until the scene is drawn. Measured
  // before that, a stern drive's engines (all there is of its machinery) were taken to be at
  // her origin, and the view zoomed into the middle of her (owner, Oct 2026).
  boatRoot?.updateMatrixWorld(true);
  const box = new THREE.Box3();
  // (And a stern drive's legs or her pod drives under her, with their engines.)
  for (const part of new Set([m, shown?.modules.getObjectByName('outboards'), shown?.modules.getObjectByName('pods')]))
    part?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
    });
  if (box.isEmpty()) return;
  const at = box.getCenter(new THREE.Vector3());
  const r = Math.max(4, box.getSize(new THREE.Vector3()).length() * 1.4);
  if (flat) flatBtn.click();
  look([at.x + 0.75 * r, at.y + 0.55 * r, at.z + 0.6 * r], at.toArray());
}
/**
 * The Controls step's view: her console from behind the wheel, looking down on it, framed in
 * the top of the view (the console editor's panel covers the bottom).
 */
function frameConsole(): void {
  const wh = boat.hull.layout.wheelhouse;
  if (!wh || !boatRoot) return;
  boatRoot.updateMatrixWorld(true);
  const cf = wh.front + (wh.consoleBack ?? 0) + wh.wall;
  const cx = wh.consoleSpan ? (wh.consoleSpan.x0 + wh.consoleSpan.x1) / 2 : 0;
  const half = wh.consoleSpan ? (wh.consoleSpan.x1 - wh.consoleSpan.x0) / 2 : 1;
  // From inside the wheelhouse (under its roof, forward of its aft wall): standing eye height,
  // as far back as there's room for (the view's 45 degrees takes in a long console from there),
  // aimed a little below and aft of the console so it stands in the upper part of the view.
  const back = Math.max(cf + 0.9, Math.min(cf + 1.4 + 0.3 * half, wh.aft - wh.wall - 0.15));
  const eye = boatRoot.localToWorld(new THREE.Vector3(cx, Math.min(wh.floorY + 1.8, wh.roofY - 0.25), back));
  const at = boatRoot.localToWorld(new THREE.Vector3(cx, wh.floorY + 0.55, cf + 0.2));
  if (flat) flatBtn.click();
  // (A wider lens than the usual 45 degrees: inside a wheelhouse there's no room to stand back.)
  camera.fov = CONSOLE_FOV;
  camera.updateProjectionMatrix();
  look(eye.toArray(), at.toArray());
}
/** The Controls step's lens (deg), and the page's usual one. */
const CONSOLE_FOV = 68;
const USUAL_FOV = 45;
function focusStep(): void {
  const step = stepEls()[stepAt]?.dataset.step ?? '';
  // The first step shows the hull types on cards, not a boat.
  $('view').classList.toggle('paperMode', step === 'brief');
  $('hullGallery').hidden = step !== 'brief';
  if (step === 'brief') showHullCards();
  showHandles();
  if (!shown) return;
  const { hull, house, modules, guard, skiff, machinery } = shown;
  if (machinery) machinery.visible = step === 'engine';
  // The live trials: at the Trials step only (leaving it stops one).
  $('livePanel').hidden = step !== 'handover';
  if ($('livePanel').hidden && live) stopLive();
  // Her propellers are under water: see them through it.
  (water.material as THREE.MeshLambertMaterial).opacity = step === 'engine' ? 0.18 : 0.55;
  // Each step's own view, unless a see-through button has flipped it since the step opened.
  if (seeThrough.step !== step) Object.assign(seeThrough, { hull: null, house: null, step });
  const hullGhost = seeThrough.hull ?? (step === 'wheelhouse' || step === 'engine');
  const houseGhost = seeThrough.house ?? step === 'engine';
  look3(hull, hullGhost ? 'ghost' : 'solid');
  // Her protection goes with the hull: shown with it solid, not over a ghost of it.
  guard.visible = !hullGhost;
  look3(house, step === 'hull' ? 'off' : houseGhost ? 'ghost' : 'solid');
  const [hullBtn, houseBtn] = seeBtns;
  hullBtn.textContent = `Hull: ${hullGhost ? 'see-through' : 'solid'}`;
  hullBtn.classList.toggle('on', hullGhost);
  houseBtn.textContent = `Wheelhouse: ${houseGhost ? 'see-through' : 'solid'}`;
  houseBtn.classList.toggle('on', houseGhost);
  // (Not drawn at the Hull step: nothing to see through.)
  houseBtn.disabled = step === 'hull' || !house;
  if (skiff) skiff.visible = !['hull', 'wheelhouse', 'engine'].includes(step);
  // The modules: none at Hull or Engine; at Wheelhouse only those inside the house.
  // (Inside its walls: a little narrower than its outside, so fenders on her sides stay out.)
  const inHouse = house ? new THREE.Box3().setFromObject(house).expandByVector(new THREE.Vector3(-0.15, 0.05, 0.05)) : null;
  const c = new THREE.Vector3();
  for (const m of modules.children) {
    // (Her outboards, stern drive legs, pods and a tug's exhaust stacks are her machinery: shown at Engine, as her inboard is.)
    if (step === 'engine') m.visible = !!m.getObjectByName('outboards') || !!m.getObjectByName('pods') || !!m.getObjectByName('exhaustStack');
    // (A tug's stacks go up through the wheelhouse: shown with it.)
    else if (step === 'wheelhouse' && m.getObjectByName('exhaustStack')) m.visible = true;
    else if (step === 'hull') m.visible = false;
    else if (step === 'wheelhouse') m.visible = !!inHouse && inHouse.containsPoint(new THREE.Box3().setFromObject(m).getCenter(c));
    else m.visible = true;
  }
}
let hullMin = [0, 0, 0];
let hullMax = [1, 1, 1];

// ── The controls ──
/** A line of guidance for each step of choices (by its title). */
/**
 * Each step's line under its title; the rest of what it says (`STEP_MORE`) behind its ⓘ button
 * (owner, Oct 2026: "too much text ... an information button").
 */
const STEP_GUIDE: Record<string, string> = {
  Hull: 'Her type and proportions.',
  Wheelhouse: 'Where the crew stand and what they can see.',
  Engine: 'Power for the speed in the brief.',
  Furniture: 'What’s inside her houses. <b>Add</b> a piece, then click where it goes.',
  'Deck gear': 'Her equipment, by the work it’s for. <b>Place</b> it, then click on her where it goes.',
  Controls: 'What the skipper has at the helm.',
  Paint: 'Her colours, hull and roof.',
};
const STEP_MORE: Record<string, string> = {
  Hull: 'Length and beam set her size and stability; depth her freeboard; a raked bow throws spray aside and takes a head sea more softly.',
  Wheelhouse: 'Forward gives a long working deck aft; aft, a foredeck to work over. Keep it low and light for stability.',
  Engine: 'The propeller and gearbox are matched to her by trial each time; twin engines add power and handling, and cost.',
  Furniture: 'Berths, settees, a galley, seats, lockers and a head. The view looks down on her cut just over the floor by the section tool (✂ Section to move the cut or turn it off); for the cabin below, click forward of the wheelhouse: it’s put against the nearest wall there, clear of the helm and the doorways. Add as many as fit, up to four of each (one head). Its weight and price are designed in.',
  'Deck gear': 'It’s put where you click (on the wheelhouse roof, the foredeck or the aft deck, whichever is nearest). Gear with only one place on any boat (the anchor, the stern roller, the A-frame, the side door) is simply <b>Fit</b>ted. Its weight is designed in. <b>Fish hold</b>: an insulated hold in her hull under the open deck (where there’s most room, clear of the engine and the houses), its hatch on deck; the catch goes down into it in boxes, and the yellow button on the hatch lifts one out.',
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
  el.innerHTML = `<h1>${name}</h1>${STEP_GUIDE[name] ? `<p class="guide">${STEP_GUIDE[name]}</p>` : ''}<p class="oneOffNote meta" hidden></p>`;
  const guide = el.querySelector<HTMLElement>('.guide');
  if (guide && STEP_MORE[name]) aboutHeading(guide, STEP_MORE[name], true);
  stepBody.insertBefore(el, handoverStep);
  controls = el;
  return el;
}
const outputs: Partial<Record<keyof ShipDesign, (v: number) => string>> = {};
/** Each field's label and, for a few set options, their names (the compare list shows them). */
const labels: Partial<Record<keyof ShipDesign, string>> = { hull: 'Hull', engine: 'Engine', twin: 'Engines', outboards: 'Outboards', sternDrive: 'Stern drive', pods: 'Pod drives', nozzle: 'Kort nozzle', material: 'Built of', controls: 'Controls', paint: 'Paint', roofPaint: 'Roof colour', houseColour: 'Wheelhouse colour' };
const optionNames: Partial<Record<keyof ShipDesign, string[]>> = {};
function slider(key: keyof ShipDesign, label: string, show: (v: number) => string): HTMLElement {
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
  return row;
}
const pct = (k: number) => `${Math.round(k * 100)} %`;
/**
 * A measured choice's slider (design.ts MEASURES: the wheelhouse's, in real units, moving `by`
 * at a time). `off` (the saloon, the deckhouse): the slider's first notch, at that value, is
 * none (0). `min`: a slider starting above the measure's own (the deckhouse's side decks: 0 is
 * "to her sides", its own button). Its row, to show only where it applies (data-when).
 */
function measure(key: MeasureKey, label: string, show: (v: number) => string, o: { off?: number; min?: number } = {}): HTMLElement {
  labels[key] ??= label;
  const mz = MEASURES[key];
  const lo = o.off ?? o.min ?? mz.min;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${label}</label><input type="range" min="${lo}" max="${mz.max}" step="${mz.by}" data-key="${key}"><output data-key="${key}"></output>`;
  const input = row.querySelector('input')!;
  input.oninput = () => {
    const v = Number(input.value);
    change({ [key]: o.off !== undefined && v <= o.off + 1e-9 ? 0 : Math.round(v * 1e6) / 1e6 });
  };
  input.addEventListener('pointerdown', () => link?.side?.presence({ holding: key }));
  input.addEventListener('change', () => link?.side?.presence({ holding: null }));
  outputs[key] = show;
  controls.appendChild(row);
  return row;
}
/** A few set values of a measured choice as buttons (the saloon's floor: whole steps down). Its row. */
function valueOptions(key: MeasureKey, label: string, items: [number, string][]): HTMLElement {
  labels[key] ??= label;
  const row = document.createElement('div');
  row.className = 'row opts';
  row.innerHTML = `<label>${label}</label><div></div>`;
  const box = row.querySelector('div')!;
  for (const [v, name] of items) {
    const c = document.createElement('span');
    c.className = 'choice';
    c.dataset.key = key;
    c.dataset.i = String(v);
    c.textContent = name;
    c.onclick = () => change({ [key]: v });
    box.appendChild(c);
  }
  // (Named in the compare list as its button is.)
  outputs[key] ??= (v) => items.find(([x]) => Math.abs(x - v) < 1e-6)?.[1] ?? String(v);
  controls.appendChild(row);
  return row;
}
/** A group's heading within a step (the Wheelhouse's: Size and place, Windows...), and a line on it. */
function group(title: string, note = ''): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  controls.appendChild(h);
  // (Its note behind an ⓘ on the heading: tiles.ts.)
  if (note) aboutHeading(h, note);
  return h;
}
/** A gear or furniture card's line on what it is: behind an ⓘ by its name, and its tooltip (owner, Oct 2026: less text). */
function cardAbout(card: HTMLElement): void {
  const about = card.querySelector<HTMLElement>('.gearText .meta');
  const name = card.querySelector<HTMLElement>('.gearText b');
  if (!about || !name || !about.textContent) return;
  card.title = about.textContent;
  about.remove();
  aboutHeading(name, about.textContent);
}
/**
 * A choice of a few as picture tiles (tiles.ts; owner, Oct 2026), each a drawing, a name and
 * a line, its description behind ⓘ; for the compare list, its label and the tiles' names.
 * Returns its wrapper (for `data-when`). Chosen hand-placed gear goes back to its usual place.
 */
function optionTiles(key: keyof ShipDesign, label: string, tiles: Tile[]): HTMLElement {
  labels[key] ??= label;
  optionNames[key] = tiles.map((t) => (t.sub ? `${t.name} (${t.sub})` : t.name));
  const wrap = document.createElement('div');
  pickTiles(wrap, key, tiles, (i) => change({ [key]: i, ...(PLACED_BY[key] ? { [PLACED_BY[key]!]: 0 } : {}) }), label);
  controls.appendChild(wrap);
  return wrap;
}
/** The Furniture step's interiors row brought up to her type (set up with the row). */
let interiorsRow: () => void = () => {};
/** The deckhouse's width buttons and when each is the one chosen (they set two fields: dhWidth, dhNarrow). */
const dhKinds: [HTMLElement, (d: ShipDesign) => boolean][] = [];
/** The deckhouse's Width slider shown from the design (it sets two fields: set up with the slider). */
let syncDhWidth: () => void = () => {};

/** When a row shown only where it applies (data-when / data-unless) is: a field set, or the deckhouse with side decks. */
const rowApplies = (cond: string): boolean =>
  cond === 'openBoat' ? !!DESIGN_HULLS[design.hull]?.open : cond === 'interiors' ? !!DESIGN_HULLS[design.hull]?.interiors?.length : cond === 'solarBattery' ? !!(ENGINES[design.engine] as { electric?: boolean } | undefined)?.electric : cond === 'dhSideDecks' ? !!design.dhLength && !design.dhNarrow && design.dhWidth > 0 : cond === 'cabinBelow' ? !!design.dhLength || (!!DESIGN_HULLS[design.hull]?.raisedForedeck && !!design.fcLength) : cond === 'dhTopChoice' ? !!design.dhLength && !(!design.dhNarrow && design.dhWidth < 0.025) : cond === 'bowFenderChoice' ? !DESIGN_HULLS[design.hull]?.pushBow : cond === 'tugStacks' ? !!DESIGN_HULLS[design.hull]?.exhaustStacks && !design.outboards : cond === 'stackMountChoice' ? !!DESIGN_HULLS[design.hull]?.exhaustStacks && !design.outboards && !!design.dhLength : cond === 'stacksOnDeckhouse' ? !!DESIGN_HULLS[design.hull]?.exhaustStacks && !design.outboards && !!design.dhLength && !!design.stackMount : cond === 'offsetHouse' ? !!DESIGN_HULLS[design.hull]?.offsetHouse : cond === 'raisedForedeck' ? !!DESIGN_HULLS[design.hull]?.raisedForedeck : cond === 'foredeckHeight' ? !!DESIGN_HULLS[design.hull]?.raisedForedeck && !!design.fcLength : !!design[cond as keyof ShipDesign];
/** A few set options in a row, as buttons (for choices with only a handful of settings). */
function options(key: keyof ShipDesign, label: string, names: string[]): HTMLElement {
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
  return row;
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
// Her type, as pictures (each from the side; tiles.ts): its name, and its size on the line under.
{
  const looks = [HULL_ICONS.lander, HULL_ICONS.gillnetter, HULL_ICONS.workboat, HULL_ICONS.pilot, HULL_ICONS.tug, HULL_ICONS.trawler, HULL_ICONS.catamaran];
  const box = pickTiles(
    controls,
    'hull',
    DESIGN_HULLS.map((h, i) => {
      const [name, rest = ''] = h.name.split(':');
      return { icon: looks[i] ?? HULL_ICONS.workboat, name: name.replace('Small tug', 'Tug'), sub: rest.trim().split(',')[0], info: h.name + '.' };
    }),
    (i) => change({ hull: i, ...DESIGN_HULLS[i].defaults }),
  );
  // (Four across: the retired workboat type shows only on a design already on her.)
  box.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
}
slider('length', 'Length', () => `${boat.figures.lengthM.toFixed(2)} m`);
slider('beam', 'Beam', () => `${boat.figures.beamM.toFixed(2)} m`);
slider('depth', 'Depth', (v) => pct(SCALES.scale(v)));
slider('bulwark', 'Bulwarks', (v) => `${SCALES.bulwark(v).toFixed(1)} m`);
slider('bow', 'Bow rake', (v) => (DESIGN_HULLS[design.hull].pushBow ? 'push bow' : DESIGN_HULLS[design.hull].landingBow ? 'landing bow' : v === 0 ? 'plumb' : `${SCALES.bow(v)}\u00b0`));
// More sheer (owner, Oct 2026): her deck line sweeping up to the bow.
slider('sheer', 'Sheer', (v) => (v ? `+${SCALES.sheer(v).toFixed(2)} m at the bow` : 'as drawn'));
// A raised foredeck (owner, Oct 2026; the fishing boat only, for now): her deck stepped up forward of a break, steps up to it.
slider('fcLength', 'Raised foredeck', (v) => (v ? `${SCALES.fcLength(v).toFixed(1)} m from the bow` : 'none')).dataset.when = 'raisedForedeck';
slider('fcHeight', 'Its height', (v) => `${SCALES.fcHeight(v).toFixed(2)} m up`).dataset.when = 'foredeckHeight';
// Hull protection (owner): what keeps her sides off a quay.
group('Hull protection', 'What keeps her sides off a quay. Fenders are the cheapest, but the crew must put them over the side coming alongside (the basket on deck) and take them in again. A rubber rubbing strake round her sheer, or tyres along her sides, are always there: the strake is firm, good for a rub or a moderate knock; tyres are soft and grippy, the best at a hard knock and for pushing, and add a little weight and drag.');
optionTiles('guard', 'Protection', [
  { icon: HULL_ICONS.guardNone, name: GUARDS[0], info: 'No protection: her plating takes the knocks.' },
  { icon: HULL_ICONS.guardFenders, name: GUARDS[1], sub: 'the cheapest', info: 'Fenders: the cheapest, but the crew must put them over the side coming alongside (the basket on deck) and take them in again.' },
  { icon: HULL_ICONS.guardStrake, name: 'Strake', sub: 'firm', info: 'A rubber rubbing strake round her sheer: always there, firm, good for a rub or a moderate knock.' },
  { icon: HULL_ICONS.guardTyres, name: GUARDS[3], sub: 'soft, grippy', info: 'Tyres along her sides: always there, soft and grippy, the best at a hard knock and for pushing; a little weight and drag.' },
  { icon: HULL_ICONS.guardBoth, name: 'Strake + fenders', info: 'The rubbing strake, and fenders for coming alongside.' },
]);
// A bow fender (owner, Oct 2026: crew transfer to wind farms): to push on a turbine's boat landing. Not on a push bow (its knees do it).
optionTiles('bowFender', 'Bow fender', [
  { icon: HULL_ICONS.noBowFender, name: 'None', info: 'No bow fender: her stem takes it.' },
  { icon: HULL_ICONS.bowFender, name: 'Bow fender', sub: 'crew transfer', info: 'A thick block of rubber on her bow, its front upright: push her against a wind turbine’s boat landing and hold her there with the throttle while the technicians step across. It grips, so she doesn’t slide. The catamaran comes with one.' },
]).dataset.when = 'bowFenderChoice';
optionTiles('rails', 'Rails', [
  { icon: HULL_ICONS.rails, name: RAILS[0], info: 'Handrails on posts over her bulwarks.' },
  { icon: HULL_ICONS.noRails, name: RAILS[1], info: 'No handrails: her bulwarks only.' },
]);
// What she's built of (owner, Oct 2026): a choice on the workboat hull; the others are their type's own.
{
  const h = document.createElement('h2');
  h.textContent = 'Built of';
  const p = document.createElement('p');
  p.className = 'meta';
  p.id = 'materialNote';
  controls.append(h, p);
  const al = CONFIG.shipyard.materials.aluminium;
  const fe = CONFIG.shipyard.materials.steel;
  pickTiles(
    controls,
    'material',
    [
      { icon: HULL_ICONS.aluminium, name: MATERIALS[0], sub: `light · £${al.pricePerKg}/kg`, info: `Light: about ${al.shellKgPerM2} kg a square metre of hull, so she floats higher and goes faster for her power. £${al.pricePerKg} a kilo built.` },
      { icon: HULL_ICONS.steel, name: MATERIALS[1], sub: `tough · £${fe.pricePerKg}/kg`, info: `Tough and cheaper to build (£${fe.pricePerKg} a kilo), but about ${fe.shellKgPerM2} kg a square metre: she sits deeper and is slower for her power.` },
    ],
    (i) => change({ material: i }),
  );
}
section('2. Wheelhouse');
// Owner, Oct 2026: designs travel as documents now, so the wheelhouse's measurements are real
// values on fine sliders (design.ts MEASURES), not a few steps squeezed into a typed code; in
// groups, each row shown only where it applies.
{
  const m = (v: number, digits = 2) => `${v.toFixed(digits)} m`;
  const signed = (x: number, unit: string, digits = 0) => `${x > 0 ? '+' : ''}${x.toFixed(digits)}${unit}`;
  const houseW = () => (boat.hull.layout.wheelhouse ? 2 * boat.hull.layout.wheelhouse.halfWidth : 0);

  group('Size and place');
  measure('housePos', 'Position', (v) => (v <= 0.001 ? 'right aft' : v >= 0.999 ? 'right fwd' : `${pct(v)} fwd`));
  measure('houseLength', 'Length', (v) => m(v));
  // (Its share of the room between her side decks sets it; shown as what that comes to.)
  measure('houseWidth', 'Width', (v) => (v >= 0.995 ? `${m(houseW())}, full` : m(houseW())));
  // Offset across her (owner, Oct 2026: the landing craft's narrow wheelhouse to port or
  // starboard): shows where it went (as far as her deck allows).
  slider('houseX', 'Offset', () => {
    const x = boat.hull.layout.wheelhouse?.x ?? 0;
    return Math.abs(x) < 0.005 ? 'centreline' : `${Math.abs(x).toFixed(2)} m ${x < 0 ? 'to port' : 'to stbd'}`;
  }).dataset.when = 'offsetHouse';
  measure('headroom', 'Headroom', (v) => m(v));
  measure('floor', 'Floor height', () => {
    const f = boat.figures.floorM;
    // With a deckhouse, from its top (the house stands on it, or sunk into it).
    const g = boat.figures.floorOnDeckhouseM;
    if (g !== undefined) return Math.abs(g) < 0.025 ? 'on the deckhouse' : `${g < 0 ? '−' : '+'}${Math.abs(g).toFixed(2)} m`;
    return Math.abs(f) < 0.025 ? 'at the deck' : `${signed(f, ' m', 2)}${f < 0 ? ' (sunk)' : ''}`;
  });

  // A saloon aft of it (parametric boats P2b): the house runs on aft, its floor level or steps
  // down, its own roof as high or lower.
  group('Saloon aft');
  measure('saloon', 'Length', (v) => (v ? m(v, 1) : 'none'), { off: 1.1 });
  valueOptions('saloonFloor', 'Floor down', [0, 1, 2, 3].map((i) => [SCALES.saloonFloor(i), i ? `${i} step${i > 1 ? 's' : ''}` : 'level'] as [number, string])).dataset.when = 'saloon';
  measure('saloonRoof', 'Roof', (v) => (v ? `${m(v)} lower` : 'as wheelhouse')).dataset.when = 'saloon';

  group('Windows');
  optionTiles('facets', 'Front', [
    { icon: HOUSE_ICONS.flat, name: 'Flat across', info: 'Her front windows flat across her.' },
    { icon: HOUSE_ICONS.facets, name: 'Three facets', info: 'Three facets, as on a tug: the middle square across her, the outer two angled back to the sides, the dash wrapping round behind them.' },
  ]);
  optionTiles('aftFacets', 'Aft', [
    { icon: HOUSE_ICONS.aftFlat, name: 'Flat across', info: 'Her aft windows flat across her.' },
    { icon: HOUSE_ICONS.aftFacets, name: 'Three facets', info: 'Her aft windows in three facets, as the front’s can be: the middle square across her with the door in it, the outer two angled forward to the sides. With the windows raked out all round, they lean out with the rest. Not with a cockpit overhead. Travels as a link or file, not a code.' },
  ]);
  measure('windowRake', 'Front rake', (a) => (Math.abs(a) < 0.5 ? 'upright' : a > 0 ? `${a.toFixed(0)}° reverse` : `${(-a).toFixed(0)}° back`)).dataset.unless = 'flare';
  // The front below the windows sloped back from its foot (owner, Oct 2026: the solar catamaran's "kicked out").
  slider('kick', 'Below the windows', (i) => (i ? `sloped ${kickDeg(i)}°` : 'upright'));
  // (Raked out all round, the front leans out with them: its own rake stands aside.)
  optionTiles('flare', 'Sides & aft', [
    { icon: HOUSE_ICONS.upright, name: 'Upright', info: 'Her side and aft windows upright.' },
    { icon: HOUSE_ICONS.rakedOut, name: 'Raked out', info: 'Raked out all round, like a tug’s or supply vessel’s bridge: the front leans out with them, the aft door swings open on hinges, and there’s no side door.' },
  ]);
  optionTiles('sills', 'Sills', [
    { icon: HOUSE_ICONS.sillStd, name: SILLS[0], info: 'The window sills at the standard height, one height all round.' },
    { icon: HOUSE_ICONS.sillLow, name: 'Low', sub: 'below the console', info: 'Low sills, below the console: its upright panel comes off and its screens stand on stalks, so you can see down over the bow.' },
    { icon: HOUSE_ICONS.sillHigh, name: 'High', sub: 'level with the dash', info: 'High sills, 1.3 m up, level with the top of the dash: chest height, as on a heavy-weather trawler or tug, more wall and less glass. Standing at the helm you still see out over them. Travels as a link or file, not a code.' },
  ]);

  // (Its colours are on the Paint step; no visor choice: the roof overhangs the windows by a set length, owner.)
  group('Roof');
  measure('roofThickness', 'Thickness', (v) => `${Math.round(v * 100)} cm`);
  measure('roofEdge', 'Edge', (v) => `${v.toFixed(0)}° back`);
  // The cockpit overhead (P2b): the aft roof carried on aft over the working deck, on a wing each side.
  slider('overhead', 'Overhead aft', (v) => (v ? `${SCALES.overhead(v).toFixed(2)} m` : 'none'));

  group('Inside');
  // The helm console (owner): no longer than CONFIG.shipyard.helm.maxConsole, so on a wide
  // wheelhouse there's room beside it, and against the port or starboard wall if chosen.
  // (Only with a flat front: a faceted front's console wraps round its middle pane, so it stays there.)
  optionTiles('consoleSide', 'Console', [
    { icon: HOUSE_ICONS.consoleMid, name: CONSOLE_SIDES[0], info: 'The helm console in the middle of the wheelhouse.' },
    { icon: HOUSE_ICONS.consolePort, name: CONSOLE_SIDES[1], info: 'The helm console against the port wall.' },
    { icon: HOUSE_ICONS.consoleStbd, name: CONSOLE_SIDES[2], info: 'The helm console against the starboard wall.' },
  ]).dataset.unless = 'facets';
  // Its length (CS6): full, or shorter for a narrow wheelhouse (switches move up onto the dash face as needed).
  slider('consoleLen', 'Console length', (v) => (consoleLengthM(v) ? `${consoleLengthM(v)!.toFixed(2)} m` : 'Full width'));
  {
    const note = document.createElement('div');
    note.id = 'consoleMinNote';
    note.className = 'meta';
    note.style.cssText = 'font-size:12px;color:var(--muted);margin:-4px 0 6px';
    controls.appendChild(note);
  }
  optionTiles('chartTable', 'Chart table', [
    { icon: HOUSE_ICONS.noTable, name: 'None', info: 'No chart table.' },
    { icon: HOUSE_ICONS.table, name: 'Port wall', sub: 'aft', info: 'A chart table against the port wall, aft.' },
  ]);
  // The finish inside, walls and ceiling, and the floor (owner, Oct 2026; CONFIG.interiors, CONFIG.cabinFloors).
  optionTiles('interior', 'Lining', CONFIG.interiors.map((f) => ({ icon: liningIcon(f), name: f.name.split(',')[0], ...(f.name.includes(',') ? { sub: f.name.split(',')[1].trim() } : {}), info: `${f.name}: the wheelhouse’s walls and ceiling inside.` })));
  optionTiles('cabinFloor', 'Floor', CONFIG.cabinFloors.map((f) => ({ icon: floorIcon(f), name: f.name, info: `${f.name}: the floor inside.` })));

  // The deckhouse (owner: pilot and rescue boats): the wheelhouse stands on it.
  group('Deckhouse', 'A lower deckhouse that the wheelhouse stands on, as on pilot and rescue boats: from the wheelhouse’s aft wall forward (or run on aft of it, Aft: a deck behind the wheelhouse its aft door opens onto, with a ladder down to the working deck), the helm raised onto it with steps up to the door. Its floor height (above) is then from the deckhouse’s top: lower it to sink the cabin into the deckhouse. Its top can be walked, a deck round the wheelhouse with a rail and a ladder up from the main deck; inside, it can be the trunk of a cabin below, its floor sunk into her hull, with steps down from the wheelhouse and a V-berth forward.');
  measure('dhLength', 'Forward', (v) => (v ? m(v, 1) : 'none'), { off: 0.4 });
  measure('dhHeight', 'Height', (v) => m(v)).dataset.when = 'dhLength';
  // Run on aft of the wheelhouse (owner, Oct 2026: the stern trawler's deck behind the bridge): its top walked, a ladder down its aft face.
  labels.dhAft = 'Deckhouse aft';
  slider('dhAft', 'Aft', (v) => (v ? `${SCALES.dhAft(v).toFixed(1)} m aft of the wheelhouse` : 'flush with it')).dataset.when = 'dhLength';
  {
    // Its width (owner, Oct 2026: "having this slider might help with the width of it"): one
    // slider, from only as wide as the wheelhouse (forward of it: her side decks clear, for a
    // side door), through set in from her sides leaving side decks (narrowing in 5 cm steps),
    // to out to her sides: a raised deck, her bulwarks risen along it, its top always walked.
    // It sets dhNarrow and dhWidth (the side decks' width, m), as the code has them.
    const STEP = 0.05;
    const N = Math.round(0.8 / STEP); // the widest side decks (MEASURES.dhWidth)
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.when = 'dhLength';
    row.innerHTML = `<label>Width</label><input type="range" min="0" max="${N + 1}" step="1"><output></output>`;
    const input = row.querySelector('input')!;
    const out = row.querySelector('output')!;
    const toSlider = (d: ShipDesign) => (d.dhNarrow ? 0 : N + 1 - Math.round(Math.min(0.8, d.dhWidth) / STEP));
    input.oninput = () => {
      const v = Number(input.value);
      change(v === 0 ? { dhNarrow: 1 } : { dhNarrow: 0, dhWidth: Math.round((N + 1 - v) * STEP * 100) / 100 });
    };
    syncDhWidth = () => {
      input.value = String(toSlider(design));
      out.textContent = design.dhNarrow ? 'as the wheelhouse' : design.dhWidth < 0.025 ? 'her full width' : `side decks ${design.dhWidth.toFixed(2)} m`;
    };
    labels.dhNarrow = 'Deckhouse width';
    optionNames.dhNarrow = ['Set by Width', 'As the wheelhouse'];
    labels.dhWidth = 'Deckhouse side decks';
    controls.appendChild(row);
  }
  measure('dhRake', 'Front', (v) => (v < 0.5 ? 'upright' : `raked ${v.toFixed(0)}°`)).dataset.when = 'dhLength';
  // Its top walked (P2b): a rail round it and a ladder up from the deck.
  optionTiles('dhWalk', 'Top', [
    { icon: HOUSE_ICONS.notWalked, name: 'Not walked', info: 'The deckhouse’s top not walked.' },
    { icon: HOUSE_ICONS.walked, name: 'Walked', sub: 'rail, ladder', info: 'Its top walked: a rail round it and a ladder up to it from the main deck, so you can walk round the raised wheelhouse.' },
  ]).dataset.when = 'dhTopChoice'; // (out to her sides it's always walked)
  // A cabin below it (P2c): the deck cut away, the sole sunk into her, a companionway down from the wheelhouse.
  optionTiles('foreCabin', 'Inside', [
    { icon: HOUSE_ICONS.solid, name: 'Solid', info: 'Nothing inside the deckhouse (or under the raised foredeck).' },
    { icon: HOUSE_ICONS.cabin, name: 'Cabin below', info: 'A cabin below: its floor sunk into her hull so you can stand up, steps down from the wheelhouse floor beside the helm, and a V-berth in the bow. Needs the engine aft.' },
  ]).dataset.when = 'cabinBelow'; // (under a deckhouse, or a raised foredeck)
}
section('3. Deck gear');
{
  // Her equipment by the work it's for (gearMenu.ts), each a card: what it is, whether she
  // has it and where, and Place (point at her, click where it goes: placing.ts) or Fit, Move,
  // Turn, Take off.
  const menu = document.createElement('div');
  menu.id = 'gearMenu';
  // A fish hold under her deck (parts/hold.ts): where it goes is worked out for her.
  // The ship's boat her skiff crane carries (design.rescueBoat): the dinghy, or the rescue boat.
  optionTiles('rescueBoat', "Ship's boat (with the skiff crane)", [
    { icon: HOUSE_ICONS.dinghy, name: 'Dinghy', info: 'The 3.25 m rubber dinghy with an electric outboard and a tiller: fits most boats (about 3.7 m of clear deck).' },
    { icon: HOUSE_ICONS.ribBoat, name: 'Rescue boat', info: 'A 6 m fast rescue boat (a RIB): orange tubes, a centre console with a wheel, one 150 hp outboard, about 28 knots. On a bigger crane: she needs about 6.8 m by 4.4 m of clear deck, so a big boat (the stern trawler, the small tug at her longest, the big landing craft). Travels as a link or file.' },
  ]);
  // The second ship's boat (design.rescueBoat2), once she's placed.
  optionTiles('rescueBoat2', "Second ship's boat", [
    { icon: HOUSE_ICONS.dinghy, name: 'Dinghy', info: 'The 3.25 m rubber dinghy on her own crane, her own SKIFF CRANE button on the dash.' },
    { icon: HOUSE_ICONS.ribBoat, name: 'Rescue boat', info: 'The 6 m fast rescue boat on her own bigger crane, her own RIB CRANE button on the dash (about 6.8 m by 4.4 m of clear deck).' },
  ]).dataset.when = 'skiff2';
  optionTiles('fishHold', 'Fish hold', [
    { icon: HOUSE_ICONS.noHold, name: 'None', info: 'No fish hold.' },
    { icon: HOUSE_ICONS.hold, name: 'Under the deck', info: 'An insulated hold in her hull under the open deck (where there’s most room, clear of the engine and the houses), its hatch on deck; the catch goes down into it in boxes, and the yellow button on the hatch lifts one out.' },
  ]);
  controls.append(menu);
}
section('4. Furniture');
// Her type's interiors to start from (DesignHull.interiors; the foiling ferry's: owner, 28 Oct
// 2026, "1 as ferry and 1 as explorer vessel"): every piece taken off, then the interior's put in.
{
  const row = document.createElement('div');
  row.className = 'row opts';
  row.dataset.when = 'interiors';
  row.innerHTML = '<label>Start from</label><div></div>';
  controls.appendChild(row);
  const box = row.querySelector('div')!;
  const show = (): void => {
    const list = DESIGN_HULLS[design.hull]?.interiors ?? [];
    if (box.dataset.hull === String(design.hull)) return;
    box.dataset.hull = String(design.hull);
    box.replaceChildren(
      ...list.map((it) => {
        const c = document.createElement('span');
        c.className = 'choice';
        c.textContent = it.name;
        c.title = it.info;
        c.onclick = () => change({ ...NO_FURNITURE, ...it.pins });
        return c;
      }),
    );
  };
  interiorsRow = show;
}
{
  // Her furniture (furnishing.ts): a card a piece, Add as many as fit; under it, each one on her.
  const menu = document.createElement('div');
  menu.id = 'furnMenu';
  controls.append(menu);
}
section('5. Engine');
// As pictures (owner, Oct 2026: "too much text ... more pictorial"; tiles.ts): each choice a
// drawing, its name and one line, the full description behind its ⓘ button.
{
  const looks = [ENGINE_ICONS.six, ENGINE_ICONS.v8, ENGINE_ICONS.v8big, ENGINE_ICONS.tug, ENGINE_ICONS.medium, ENGINE_ICONS.v8big];
  const kinds = ['diesel six', 'turbo V8', 'turbo V8', 'tug diesel', 'big six', 'tug V16', 'electric', 'electric pod'];
  pickTiles(
    controls,
    'engine',
    ENGINES.map((e, i) => ({ icon: looks[i] ?? ENGINE_ICONS.six, name: `${e.kw} kW`, sub: `${kinds[i] ?? ''} · ${e.kg} kg`, info: `${e.name}. ${'about' in e ? `${e.about} ` : ''}${e.kg} kg with its gearbox. Propeller and gearbox matched to her by trial.` })),
    (i) => change({ engine: i, ...(SINGLE_ONLY_ENGINES.includes(i) ? { twin: 0 } : {}) }),
  );
}
// The solar catamaran's one choice (owner, 26 Oct 2026): her battery, 20 to 200 kWh (its weight and range in her figures).
{
  group('Battery', 'Her lithium battery, low in her hulls amidships: about 6 to 7 kg a kWh. More is more range on her motors, and more weight: she sits lower, with less room under her wet deck. Her figures give her range at her cruise.').dataset.when = 'solarBattery';
  slider('battery', 'Battery', (v) => `${batteryKWh(v)} kWh`).dataset.when = 'solarBattery';
}
toggleTiles(
  controls,
  [
    { key: 'twin', icon: ENGINE_ICONS.twin, name: 'Twin', sub: 'two engines', info: 'Twin engines: two of these, a propeller and rudder each, worked together from one lever.' },
    // Stern drives (owner, Oct 2026): the engine right at the back, a leg through the transom that steers.
    { key: 'sternDrive', icon: ENGINE_ICONS.sternDrive, name: 'Stern drive', sub: 'a leg that steers', info: 'Stern drive: the engine against the transom, driving a leg through it that swings to steer (no shaft or rudder; a leg each for twins). Frees her deck and balances her, with a smaller propeller.' },
    // Pod drives (owner, Oct 2026): two steerable pods under a planing hull, propellers forward, and a helm joystick.
    { key: 'pods', icon: ENGINE_ICONS.pods, name: 'Pod drives', sub: 'planing hulls', info: 'Pod drives (planing hulls): two pods under her bottom that swing to steer, their propellers at the front pulling, an engine each. A black throttle, and a helm joystick: press JOYSTICK, then lean it to crab sideways or creep, twist it to turn on the spot.' },
    // A Kort nozzle (owner, Oct 2026): a duct round a shaft-driven propeller, a tug's.
    { key: 'nozzle', icon: ENGINE_ICONS.nozzle, name: 'Kort nozzle', sub: '+30 % pull', info: "Kort nozzle: a duct round the propeller (a tug's). About 30 % more pull at a standstill for the same power, and a rudder that answers at low speed and astern; slower free-running, and poorer going astern." },
  ],
  (key, on) => change({ [key]: on }),
  'Drive',
);
// A tug's exhaust stacks (owner, Oct 2026; the stern trawler's too): one per engine up through the wheelhouse's aft corners, raked or straight.
{
  labels.stackStyle ??= 'Exhaust stacks';
  optionNames.stackStyle = [...STACK_STYLES];
  const wrap = document.createElement('div');
  wrap.dataset.when = 'tugStacks';
  pickTiles(
    wrap,
    'stackStyle',
    [
      { icon: ENGINE_ICONS.stackRaked, name: 'Raked', info: 'Her exhaust stacks raked aft, one per engine up through the wheelhouse’s aft corners.' },
      { icon: ENGINE_ICONS.stackStraight, name: 'Straight', info: 'Her exhaust stacks straight up, one per engine up through the wheelhouse’s aft corners.' },
    ],
    (i) => change({ stackStyle: i }),
    'Exhaust stacks',
  );
  controls.appendChild(wrap);
  // Where they stand (owner, Oct 2026): up through the wheelhouse, or on the deckhouse in casings of their own, moved along it.
  labels.stackMount ??= 'Stacks stand';
  optionNames.stackMount = [...STACK_MOUNTS];
  const mount = document.createElement('div');
  mount.dataset.when = 'stackMountChoice';
  pickTiles(
    mount,
    'stackMount',
    [
      { icon: ENGINE_ICONS.stackRaked, name: 'Through the wheelhouse', info: 'Up through the wheelhouse’s aft corners, boxed in where they pass through it.' },
      { icon: ENGINE_ICONS.stackCasing, name: 'On the deckhouse', info: 'Standing on the deckhouse, each in a casing of its own out near its sides, clear of the wheelhouse: you choose where along it, and a round or a square casing.' },
    ],
    (i) => change({ stackMount: i }),
    'Stacks stand',
  );
  controls.appendChild(mount);
  slider('stackPos', 'Along the deckhouse', (v) => (v === 0 ? 'at its aft end' : v === STACK_POS_STEPS - 1 ? 'at its front' : `${Math.round((v / (STACK_POS_STEPS - 1)) * 100)} % forward`)).dataset.when = 'stacksOnDeckhouse';
  labels.stackCasing ??= 'Stack casings';
  optionNames.stackCasing = [...STACK_CASINGS];
  const casing = document.createElement('div');
  casing.dataset.when = 'stacksOnDeckhouse';
  pickTiles(
    casing,
    'stackCasing',
    [
      { icon: ENGINE_ICONS.casingRound, name: 'Round', info: 'Each stack in a round casing.' },
      { icon: ENGINE_ICONS.casingSquare, name: 'Square', info: 'Each stack in a square casing, a box round it.' },
    ],
    (i) => change({ stackCasing: i }),
    'Casings',
  );
  controls.appendChild(casing);
}
// Or outboards (owner, Oct 2026): 2, 3 or 4 petrol V8s on a bracket off the transom, in place of the inboard above.
{
  const o = CONFIG.modules.outboard;
  optionNames.outboards = [...OUTBOARDS]; // (the compare list names them)
  const each = `${o.engine.powerKw} kW (${Math.round(o.engine.powerKw * 1.341)} hp) petrol V8s, ${o.massKg} kg each, on a bracket off the transom in place of the engine above. They steer by swinging with the wheel: no rudder. Worked together from one lever and key. Their lower units' gearing is matched to her by trial, like a gearbox.`;
  pickTiles(
    controls,
    'outboards',
    [
      { icon: ENGINE_ICONS.inboard, name: 'None', sub: 'the inboard', info: 'No outboards: the inboard engine chosen above, on its shaft (or stern drive, or pods).' },
      { icon: ENGINE_ICONS.ob2, name: 'Two', sub: `${2 * o.engine.powerKw} kW`, info: `Two outboards: ${each}` },
      { icon: ENGINE_ICONS.ob3, name: 'Three', sub: `${3 * o.engine.powerKw} kW`, info: `Three outboards: ${each}` },
      { icon: ENGINE_ICONS.ob4, name: 'Four', sub: `${4 * o.engine.powerKw} kW`, info: `Four outboards: ${each}` },
    ],
    // (Two or more: no single outboard, the RIB's.)
    (i) => change({ outboards: i, ...(i ? { oneOutboard: 0 } : {}) }),
    'Or outboards',
  );
  // The RIB's (owner, 31 Oct 2026: "from one engine ... up to four"): a single outboard, and
  // which outboards: the 150 hp (the crane RIB's) or the 300 kW V8.
  const one = options('oneOutboard', 'Single outboard', ['No', 'One outboard']);
  one.dataset.when = 'openBoat';
  one.querySelectorAll<HTMLElement>('.choice').forEach((el) => (el.onclick = () => change({ oneOutboard: Number(el.dataset.i), ...(Number(el.dataset.i) ? { outboards: 0 } : {}) })));
  options('outboardSize', 'Outboard size', [...OUTBOARD_SIZES]).dataset.when = 'openBoat';
}
section('6. Controls');
{
  // Three tiers of instruments (owner, Oct 2026: "old school (analogue), basic electronic, and
  // then advanced"): two design fields, the controls package and old school (with the basic).
  const tiers: { name: string; note: string; patch: Partial<ShipDesign> }[] = [
    { name: 'Old school (analogue)', note: 'Wheel, throttle, key and start, navigation lights, the VHF radio, and round analogue gauges: a magnetic compass, the log, depth, the anchor chain counter, revs, temperature and fuel. The cheapest. (A link or file, not a code.)', patch: { controls: 0, oldSchool: 1 } },
    { name: 'Basic electronic', note: 'Wheel, throttle, key and start, navigation lights, speed and depth, the anchor, rpm and the time on small screens, and the VHF radio.', patch: { controls: 0, oldSchool: 0 } },
    { name: 'Advanced', note: 'Adds the cabin light, wipers, horn, heading, engine monitor, an FM radio, the chartplotter, the NAV / WIND screen, the task board and the whiteboard, an overhead switch panel for the foredeck and aft deck floodlights, and the searchlight and fire monitor controls at the helm when they’re on poles.', patch: { controls: 1, oldSchool: 0 } },
  ];
  // As pictures (tiles.ts): marked by `data-tier` (two design fields make a tier), not its key.
  const looks = [CONTROL_ICONS.analogue, CONTROL_ICONS.basic, CONTROL_ICONS.advanced];
  const subs = ['gauges · cheapest', 'small screens', 'the lot'];
  const box = pickTiles(controls, 'tier', tiers.map((t, i) => ({ icon: looks[i], name: t.name.replace(' (analogue)', ''), sub: subs[i], info: t.note })), (i) => change(tiers[i].patch), 'Instruments');
  box.querySelectorAll<HTMLElement>('.tile').forEach((el) => {
    el.dataset.tier = el.dataset.i;
    delete el.dataset.key;
    delete el.dataset.i;
  });
  // With the advanced package: her screens, or touchscreens with tabs (CS5; owner, Oct 2026:
  // "a much more narrow wheelhouse with a more narrow console and just one screen").
  const screens = document.createElement('div');
  screens.className = 'touchOnly';
  pickTiles(
    screens,
    'touch',
    [
      { icon: CONTROL_ICONS.separate, name: 'Separate', sub: 'a screen each', info: 'A screen for each, side by side over the wheel.' },
      { icon: CONTROL_ICONS.oneTouch, name: 'One touch', sub: 'tabs', info: 'Everything on one touchscreen: press its tabs (speed, heading, engine, systems, anchor, tow line, wind) to flip between pages; the whole crew sees the page you pick. Room for a short console in a narrow wheelhouse. (A link or file, not a code.)' },
      { icon: CONTROL_ICONS.twoTouch, name: 'Two touch', sub: 'side by side', info: 'Two touchscreens side by side, each with every page: say speed on one, the engine on the other. (A link or file, not a code.)' },
    ],
    (i) => change({ touch: i }),
    'Screens',
  );
  controls.appendChild(screens);
}
// The helm assist panel (owner, Oct 2026): with the advanced controls (the instruments) only.
optionTiles('helmAssist', 'Helm assist', [
  { icon: CONTROL_ICONS.noAssist, name: 'None', info: 'No helm assist panel.' },
  { icon: CONTROL_ICONS.assist, name: 'Assist', sub: 'autopilot, dock', info: 'An autopilot on the console (AUTO holds her heading; PORT 5° and STBD 5° alter it), and a helm assist panel by the breakers: docking help and an automatic engine start.' },
]).dataset.when = 'controls';
// Her console laid out by hand (dynamic console sockets CS3): in a panel under the view (showConsoleEditor).
group('Console layout', 'Under the view, her console from the helm: drag a screen or a switch group to where you want it. Your first move pins everything where it stands; Automatic puts it all back to the rules. Placed by hand, she travels as a link or file, not a code.');
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
section('7. Paint');
/**
 * The Paint step (owner, Oct 2026: "a revamp of the painting page ... organized nicely"): her
 * hull, her wheelhouse and its roof, each under its heading, each choice a row of colour
 * swatches with the one chosen named under its label. A swatch marked '=' follows another part's
 * colour (`PAINT_LIKE`), and shows it.
 */
const PAINT_LIKE: Record<string, (d: ShipDesign) => number> = {
  hull: (d) => LIVERIES[d.paint].livery.topsides ?? 0xd9622b,
  house: (d) => LIVERIES[d.paint].livery.house ?? 0xe6e6df,
  roof: (d) => ROOF_PAINTS[d.roofPaint].colour ?? PAINT_LIKE.hull(d),
};
/** A row of colour swatches for a paint choice; `like` names what a null colour follows. */
function paintRow(key: keyof ShipDesign, label: string, paints: { name: string; colour: number | null }[], like = ''): HTMLElement {
  labels[key] ??= label;
  optionNames[key] = paints.map((p) => p.name);
  const row = document.createElement('div');
  row.className = 'row opts paint';
  row.innerHTML = `<label>${label}<output data-paint="${key}"></output></label><div class="swatches"></div>`;
  const box = row.querySelector('div')!;
  paints.forEach((p, i) => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.title = p.name;
    s.dataset.key = key;
    s.dataset.i = String(i);
    if (p.colour === null) {
      s.dataset.like = like;
      s.textContent = '=';
    } else s.style.background = hex(p.colour);
    s.onclick = () => change({ [key]: i });
    box.appendChild(s);
  });
  controls.appendChild(row);
  return row;
}
group('Service livery', 'A service’s livery (owner, Oct 2026): police, fire, rescue or coastguard. It paints her in its colours (yours to change after) and puts its markings on her topsides: its bands and its name along each side forward. A monohull’s only. Marked, she travels as a link or file, not a code.');
// Choosing one sets her colours for it too (SERVICE_LIVERIES); None takes the markings off, and leaves her colours.
{
  const box = options('markings', 'Livery', [...MARKING_NAMES]).querySelector('div')!;
  box.querySelectorAll<HTMLElement>('.choice').forEach((el) => {
    const i = Number(el.dataset.i);
    el.onclick = () => change({ markings: i, ...(i ? SERVICE_LIVERIES[i - 1].colours : {}) });
  });
}
group('Hull', 'Her topsides, above the waterline. Below it she has her antifouling, and her deck its own grey or green to go with her paint. Her finish: as new (clean paint), worked, or well used (grime along her waterline, rust running down from her deck edge, faded paint).');
paintRow('paint', 'Topsides', LIVERIES.map((l) => ({ name: l.name, colour: l.livery.topsides ?? 0xd9622b })));
// Her finish (owner, Oct 2026: "pre-configure a boat to look used or new"): as new, worked or well used (shown in that order).
{
  const box = options('finish', 'Finish', [...FINISHES]).querySelector('div')!;
  box.append(...[...box.children].reverse());
}
// (An open boat, the RIB's: her tubes and her console in place of the wheelhouse's walls,
// frames and roof; owner, 31 Oct 2026: "the rubber ring could be one colour, the hull could be
// another colour, and the console could be another colour".)
group('Tubes and console', 'Her tubes’ colour, and her console’s: her topsides’ (=), or its own.').dataset.when = 'openBoat';
paintRow('tubeColour', 'Tubes', TUBE_COLOURS.map((name, i) => ({ name, colour: TUBE_PAINTS[i] }))).dataset.when = 'openBoat';
paintRow('houseColour', 'Console', HOUSE_PAINTS, 'hull').dataset.when = 'openBoat';
group('Wheelhouse', 'Its walls outside: her paint’s own wheelhouse colour (=), or one of their own.').dataset.unless = 'openBoat';
paintRow('houseColour', 'Walls', HOUSE_PAINTS, 'house').dataset.unless = 'openBoat';
// Its window frames, mullions and posts (owner, Oct 2026): black or white.
paintRow('frames', 'Window frames', FRAME_COLOURS);
group('Roof', 'The roof’s colour: her topsides’ (=), or its own; an orange roof is common on workboats. Its top can have a panel in a second colour, set in from the edges so the roof’s colour shows as a band round it.');
paintRow('roofPaint', 'Colour', ROOF_PAINTS, 'hull');
// The roof's top (owner: the eyebrow): one colour, or a panel in a second colour set in from its edges.
paintRow('roofTop', 'Top panel', ROOF_TOPS, 'roof');

/** Show the design in the controls (and, on a one-off, her fixed choices' controls hidden). */
function syncControls(): void {
  showControls();
  lockOneOff();
}
/**
 * A one-off (DesignHull.fixed: the harbour tug; owner, Oct 2026: "the wheelhouse, I think the
 * funnel stacks, the deck house, all that kind of stuff should be predefined and fixed"): each
 * control of a fixed choice hidden (its row, or its grid of tiles), a heading left with nothing
 * under it hidden too, and a line at the top of each step saying she's a one-off.
 */
function lockOneOff(): void {
  const fixed = DESIGN_HULLS[design.hull]?.fixed ?? {};
  const isFixed = (k: string | undefined) => !!k && k in fixed;
  document.querySelectorAll<HTMLElement>('.oneOffHidden').forEach((el) => el.classList.remove('oneOffHidden'));
  const box = (el: HTMLElement): HTMLElement[] => {
    const row = el.closest<HTMLElement>('.row');
    if (row) return [row];
    const tiles = el.closest<HTMLElement>('.tiles');
    if (!tiles) return [el.closest<HTMLElement>('.tile') ?? el];
    // A grid of tiles: hidden when every tile in it is a fixed choice's, with its heading and its ⓘ box.
    const all = [...tiles.querySelectorAll<HTMLElement>('[data-key]')].every((t) => isFixed(t.dataset.key));
    if (!all) return [el.closest<HTMLElement>('.tile') ?? el];
    const head = tiles.previousElementSibling as HTMLElement | null;
    return [tiles, ...(head?.classList.contains('tilesHead') ? [head] : []), ...(tiles.nextElementSibling?.classList.contains('tileInfo') ? [tiles.nextElementSibling as HTMLElement] : [])];
  };
  document.querySelectorAll<HTMLElement>('#stepBody [data-key]').forEach((el) => {
    if (isFixed(el.dataset.key)) for (const b of box(el)) b.classList.add('oneOffHidden');
  });
  // A box whose every child is hidden (a grid's wrapper round its heading, tiles and ⓘ box), hidden too.
  const gone = (el: Element) => el.classList.contains('oneOffHidden') || (el as HTMLElement).hidden || el.classList.contains('tileInfo') || el.classList.contains('tilesHead');
  for (let changed = true; changed; ) {
    changed = false;
    document.querySelectorAll<HTMLElement>('#stepBody .oneOffHidden').forEach((el) => {
      const up = el.parentElement;
      if (!up || up.classList.contains('step') || up.id === 'stepBody' || up.classList.contains('oneOffHidden')) return;
      if ([...up.children].every(gone)) {
        up.classList.add('oneOffHidden');
        changed = true;
      }
    });
  }
  // A heading with nothing left under it before the next.
  document.querySelectorAll<HTMLElement>('#stepBody .step h2').forEach((h) => {
    let el = h.nextElementSibling as HTMLElement | null;
    let any = false;
    for (; el && el.tagName !== 'H2'; el = el.nextElementSibling as HTMLElement | null) if (!el.classList.contains('oneOffHidden') && el.style.display !== 'none' && !el.classList.contains('tileInfo')) any = true;
    h.classList.toggle('oneOffHidden', !any && Object.keys(fixed).length > 0);
  });
  // (Each one-off says what's fixed and what's yours: DesignHull.oneOffNote.)
  document.querySelectorAll<HTMLElement>('.oneOffNote').forEach((n) => {
    n.hidden = !Object.keys(fixed).length;
    n.textContent = DESIGN_HULLS[design.hull]?.oneOffNote ?? '';
  });
  // An engine only some types take (ENGINES `only`: the harbour tug's): its tile on those only.
  document.querySelectorAll<HTMLElement>('[data-key=engine][data-i]').forEach((el) => {
    const only = (ENGINES[Number(el.dataset.i)] as { only?: readonly number[] }).only;
    el.classList.toggle('oneOffHidden', !!only && !only.includes(design.hull));
  });
  // (Sizing her for the deck cargo changes her length and beam: not a one-off's.)
  document.getElementById('sizeDeck')?.classList.toggle('oneOffHidden', 'length' in fixed);
}
function showControls(): void {
  syncDhWidth();
  interiorsRow();
  // The Paint step's '=' swatches show the colour they follow; each row names the one chosen.
  document.querySelectorAll<HTMLElement>('.swatch[data-like]').forEach((el) => (el.style.background = hex(PAINT_LIKE[el.dataset.like!](design))));
  document.querySelectorAll<HTMLElement>('output[data-paint]').forEach((el) => (el.textContent = optionNames[el.dataset.paint as keyof ShipDesign]?.[design[el.dataset.paint as keyof ShipDesign] as number] ?? ''));
  document.querySelectorAll<HTMLElement>('[data-key][data-i]').forEach((el) => el.classList.toggle('on', design[el.dataset.key as keyof ShipDesign] === Number(el.dataset.i)));
  // A retired hull type (build.ts DESIGN_HULLS `retired`: the workboat) shows only on a design already on her.
  document.querySelectorAll<HTMLElement>('[data-key=hull][data-i]').forEach((el) => (el.style.display = DESIGN_HULLS[Number(el.dataset.i)].retired && design.hull !== Number(el.dataset.i) ? 'none' : ''));
  document.querySelectorAll<HTMLInputElement>('input[type=range][data-key]').forEach((el) => (el.value = String(design[el.dataset.key as keyof ShipDesign])));
  // Rows that apply only sometimes (the saloon's floor and roof with a saloon; the front's rake
  // unless the windows are raked out all round, when it leans with them).
  document.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => (el.style.display = rowApplies(el.dataset.when!) ? '' : 'none'));
  // (An open boat, the RIB's: the Wheelhouse step is her console's.)
  const whHead = document.querySelector<HTMLElement>('[data-step=wheelhouse] h1');
  if (whHead) whHead.textContent = rowApplies('openBoat') ? 'Console' : 'Wheelhouse';
  document.querySelectorAll<HTMLElement>('[data-unless]').forEach((el) => (el.style.display = rowApplies(el.dataset.unless!) ? 'none' : ''));
  for (const [el, on] of dhKinds) el.classList.toggle('on', on(design));
  // The instruments' tier: old school, basic electronic, advanced.
  const tier = design.controls ? 2 : design.oldSchool ? 0 : 1;
  document.querySelectorAll<HTMLElement>('[data-tier]').forEach((el) => el.classList.toggle('on', Number(el.dataset.tier) === tier));
  document.querySelectorAll<HTMLElement>('.touchOnly').forEach((el) => (el.style.display = design.controls ? '' : 'none'));
  document.querySelectorAll<HTMLOutputElement>('output[data-key]').forEach((el) => {
    const k = el.dataset.key as keyof ShipDesign;
    el.textContent = outputs[k]!(design[k]);
  });
  const twinBox = document.querySelector('input[data-key=twin]') as HTMLInputElement;
  // Pod drives come in pairs: twin, and the box can't be unticked.
  const podsOn = !!design.pods && !design.outboards && DESIGN_HULLS[design.hull].regime === 'planing' && !SHAFT_ONLY_ENGINES.includes(design.engine);
  twinBox.checked = !!design.twin || podsOn;
  // An engine that goes in singly can't be twinned; with outboards there's no inboard to twin.
  twinBox.disabled = SINGLE_ONLY_ENGINES.includes(design.engine) || !!design.outboards || podsOn;
  // A hull type built of its own material: the choice stands aside, and says why.
  const ownMaterial = DESIGN_HULLS[design.hull].material;
  document.querySelectorAll<HTMLElement>('[data-key="material"]').forEach((el) => {
    el.classList.toggle('aside', !!ownMaterial);
    if (ownMaterial) el.classList.toggle('on', MATERIALS[Number(el.dataset.i)].toLowerCase() === ownMaterial);
  });
  $('materialNote').textContent = ownMaterial
    ? `The ${DESIGN_HULLS[design.hull].name.split(':')[0].toLowerCase()} is built of ${ownMaterial}, as her type is.`
    : 'Her hull and houses: what she weighs, how deep she floats, how fast she goes and what she costs follow from it.';
  const sdBox = document.querySelector('input[data-key=sternDrive]') as HTMLInputElement;
  sdBox.checked = !!design.sternDrive;
  // The tug diesel goes on a shaft; with outboards there's no inboard.
  sdBox.disabled = SHAFT_ONLY_ENGINES.includes(design.engine) || !!design.outboards || podsOn;
  // Pod drives: on a planing hull, not the tug diesel, not with outboards.
  const podBox = document.querySelector('input[data-key=pods]') as HTMLInputElement;
  podBox.checked = !!design.pods;
  podBox.disabled = DESIGN_HULLS[design.hull].regime !== 'planing' || SHAFT_ONLY_ENGINES.includes(design.engine) || !!design.outboards;
  // A nozzle goes round a shaft-driven propeller: not with a stern drive or outboards.
  const nzBox = document.querySelector('input[data-key=nozzle]') as HTMLInputElement;
  nzBox.checked = !!design.nozzle;
  nzBox.disabled = !!design.outboards || podsOn || (!!design.sternDrive && !sdBox.disabled);
  // With outboards the engine packages stand aside (shown, not chosen).
  document.querySelectorAll<HTMLElement>('[data-key="engine"]').forEach((el) => el.classList.toggle('aside', !!design.outboards));
  // A tug's push bow and a landing craft's landing bow are their own: no bow rake to choose.
  (document.querySelector('input[type=range][data-key=bow]') as HTMLInputElement).disabled = !!(DESIGN_HULLS[design.hull].pushBow || DESIGN_HULLS[design.hull].landingBow);
  // Raked out all round sets the front's rake too (it leans out with the sides).
  (document.querySelector('input[type=range][data-key=windowRake]') as HTMLInputElement).disabled = !!design.flare;
  // The deckhouse as wide as the house: its width's other buttons aren't the one chosen.
  if (design.dhNarrow) document.querySelectorAll<HTMLElement>('[data-key="dhWidth"]').forEach((el) => el.classList.remove('on'));
  showOnHer();
  showConsoleEditor();
}

// ── The console laid out by hand (dynamic console sockets CS3; owner, Oct 2026: "so we can
// eventually place the instruments where we want") ──
// Her console seen from the helm, flat: the dash's grid of quarter cells with its screens, the
// switch panel's row of cells with its groups, the wheel drawn across the middle. Drag a screen
// or a group to free cells (or click it, then click where it goes): the first move pins
// everything where it stands, so the rest stay put; Automatic puts it all back to the rules.
// What's placed goes in the design (DASH_SLOTS, PANEL_SLOTS); the builder keeps it if it fits.
type DashGrid = { cap: number; rows: number; pitch: number; byHand: boolean; places: { id: string; col: number; row: number; w: number; h: number }[] };
type PanelGrid = { cap: number; cell: number; byHand: boolean; runs: { key: string; title: string; color: number; members: string[]; n: number; start: number; x: [number, number] }[] };
let consolePick: { kind: 'dash' | 'panel'; id: string } | null = null;
function showConsoleEditor(): void {
  const box = document.getElementById('consoleEditor');
  if (!box) return;
  const helm = boat.recipe.modules.find((m) => m.socket === 'helm');
  const cc = helm?.config as { dashGrid?: DashGrid; panelGrid?: PanelGrid } | undefined;
  const dg = cc?.dashGrid;
  const pg = cc?.panelGrid;
  // Under the Console length slider: the shortest console that holds her instruments full size (CS6).
  const note = document.getElementById('consoleMinNote');
  const min = (cc as { consoleMin?: number } | undefined)?.consoleMin;
  if (note) note.textContent = min ? `Shortest that holds her instruments full size: ${min.toFixed(2)} m${design.controls && !design.touch ? ' (a touchscreen needs less)' : ''}. Shorter, they're drawn smaller; switches move up onto the dash as needed.` : '';
  if (!dg || !pg) {
    box.innerHTML = '<p class="meta">This boat\u2019s console isn\u2019t laid out on a grid.</p>';
    return;
  }
  // Scale: units a metre. The dash's grid and the panel's row, each centred on the wheel.
  const U = 300;
  const cellW = dg.pitch * U;
  const cellH = 0.11 * U;
  const dashW = dg.cap * cellW;
  const panelW = pg.cap * pg.cell * U;
  const W = Math.max(dashW, panelW) + 20;
  const mid = W / 2;
  const dashX = mid - dashW / 2;
  const dashY = 10;
  const panelX = mid - panelW / 2;
  const panelY = dashY + dg.rows * cellH + 26;
  const panelH = 34;
  const H = panelY + panelH + 14;
  const names: Record<string, string> = { speed: 'SPEED', anchorScreen: 'ANCHOR', heading: 'HEADING', rpm: 'ENGINE', engineMonitor: 'MONITOR', efficiency: 'ECO', solar: 'SOLAR', towline: 'TOW LINE', dialCompass: 'COMPASS', dialSpeed: 'LOG', dialDepth: 'DEPTH', dialChain: 'CHAIN', dialRpm: 'REVS', dialTemp: 'TEMP', dialFuel: 'FUEL', clock: 'CLOCK', dialClock: 'CLOCK', touch1: 'TOUCH', touch2: 'TOUCH 2' };
  const picked = (kind: string, id: string) => consolePick?.kind === kind && consolePick.id === id;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="consoleSvg">`;
  // The dash's cells, then its screens.
  for (let c = 0; c < dg.cap; c++) for (let r = 0; r < dg.rows; r++) svg += `<rect class="cell" data-kind="dash" data-col="${c}" data-row="${r}" x="${dashX + c * cellW + 1}" y="${dashY + r * cellH + 1}" width="${cellW - 2}" height="${cellH - 2}"/>`;
  for (const p of dg.places) svg += `<g class="item${picked('dash', p.id) ? ' picked' : ''}" data-kind="dash" data-id="${p.id}"><rect x="${dashX + p.col * cellW + 2}" y="${dashY + p.row * cellH + 2}" width="${p.w * cellW - 4}" height="${p.h * cellH - 4}" rx="3"/><text x="${dashX + (p.col + p.w / 2) * cellW}" y="${dashY + (p.row + p.h / 2) * cellH + 4}">${names[p.id] ?? (p.id === 'sw:lamps' ? 'LAMPS' : p.id.startsWith('sw:') ? p.id.slice(3) : p.id)}</text></g>`;
  // The panel's cells, then its groups.
  const pc = pg.cell * U;
  for (let k = 0; k < pg.cap; k++) svg += `<rect class="cell" data-kind="panel" data-cell="${k}" x="${panelX + k * pc + 1}" y="${panelY}" width="${pc - 2}" height="${panelH}"/>`;
  for (const r of pg.runs) {
    // Where it really is (m from the middle): closed up by the rules, a run is narrower than its
    // cells, and two runs can share a cell (CS4 fix: drawn by their cells, DECK and ENGINE overlapped).
    const x = mid + r.x[0] * U + 2;
    const w = (r.x[1] - r.x[0]) * U - 4;
    svg += `<g class="item${picked('panel', r.key) ? ' picked' : ''}" data-kind="panel" data-id="${r.key}"><rect x="${x}" y="${panelY + 2}" width="${w}" height="${panelH - 4}" rx="3"/><rect class="stripe" x="${x}" y="${panelY + 2}" width="${w}" height="5" fill="${r.title ? hex(r.color) : '#888'}"/><text x="${x + w / 2}" y="${panelY + panelH / 2 + 6}">${esc(r.title || 'HORN')}</text></g>`;
  }
  // The wheel, over the panel at the console's middle.
  svg += `<circle class="wheel" cx="${mid}" cy="${panelY + panelH / 2}" r="${0.22 * U}"/>`;
  svg += '</svg>';
  box.innerHTML = `${svg}<div class="tools"><span class="meta">${dg.byHand || pg.byHand ? 'Placed by hand.' : 'Laid out by the rules.'}</span><button id="consoleAuto"${dg.byHand || pg.byHand ? '' : ' disabled'}>Automatic</button></div>`;
  ($('consoleAuto') as HTMLButtonElement).onclick = () => {
    consolePick = null;
    change({ ...CONSOLE_AUTO });
  };
  const el = box.querySelector('svg')!;
  /** The design change that moves one item, pinning all the others where they stand. */
  const moveTo = (kind: 'dash' | 'panel', id: string, cell: { col: number; row: number } | number): void => {
    const patch: Partial<ShipDesign> = {};
    // (Only the grid moved on is pinned (CS6): pinning the switch panel too would keep its
    // groups off the dash face. The switch strips on the face move with the rules.)
    for (const p of kind === 'dash' || dg.byHand ? dg.places.filter((q) => !q.id.startsWith('sw:')) : []) {
      const to = kind === 'dash' && p.id === id ? (cell as { col: number; row: number }) : p;
      // Free for it? (its cells on the grid, none of another's)
      if (kind === 'dash' && p.id === id) {
        if (to.col < 0 || to.row < 0 || to.col + p.w > dg.cap || to.row + p.h > dg.rows) return;
        const hit = dg.places.some((q) => q.id !== id && to.col < q.col + q.w && q.col < to.col + p.w && to.row < q.row + q.h && q.row < to.row + p.h);
        if (hit) return;
      }
      patch[DASH_SLOTS[p.id as keyof typeof DASH_SLOTS]] = dashValue(to.col, to.row);
    }
    for (const r of kind === 'panel' || pg.byHand ? pg.runs : []) {
      const k = kind === 'panel' && r.key === id ? (cell as number) : r.start;
      if (kind === 'panel' && r.key === id) {
        if (k < 0 || k + r.n > pg.cap) return;
        if (pg.runs.some((q) => q.key !== id && k < q.start + q.n && q.start < k + r.n)) return;
      }
      patch[PANEL_SLOTS[r.key as keyof typeof PANEL_SLOTS]] = k + 1;
    }
    consolePick = null;
    change(patch);
  };
  // Where a pointer is on the grids: a dash cell (its column and row) or a panel cell.
  const pt = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return { x, y };
  };
  let drag: { kind: 'dash' | 'panel'; id: string; x0: number; y0: number; moved: boolean } | null = null;
  el.onpointerdown = (e) => {
    const g = (e.target as Element).closest('.item') as SVGGElement | null;
    if (!g || g.dataset.id?.startsWith('sw:')) return; // (a switch strip on the face: placed by the rules)
    const { x, y } = pt(e);
    drag = { kind: g.dataset.kind as 'dash' | 'panel', id: g.dataset.id!, x0: x, y0: y, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  el.onpointermove = (e) => {
    if (!drag) return;
    const { x, y } = pt(e);
    if (Math.hypot(x - drag.x0, y - drag.y0) > 6) drag.moved = true;
    const g = el.querySelector<SVGGElement>(`.item[data-kind="${drag.kind}"][data-id="${drag.id}"]`);
    if (g && drag.moved) g.setAttribute('transform', `translate(${x - drag.x0} ${drag.kind === 'dash' ? y - drag.y0 : 0})`);
  };
  el.onpointerup = (e) => {
    const { x, y } = pt(e);
    if (drag && drag.moved) {
      // Dropped: where its corner lands, snapped to the cells.
      const d0 = drag;
      drag = null;
      if (d0.kind === 'dash') {
        const p = dg.places.find((q) => q.id === d0.id)!;
        moveTo('dash', d0.id, { col: Math.round(p.col + (x - d0.x0) / cellW), row: Math.round(p.row + (y - d0.y0) / cellH) });
      } else {
        const r = pg.runs.find((q) => q.key === d0.id)!;
        moveTo('panel', d0.id, Math.round(r.start + (x - d0.x0) / pc));
      }
      showConsoleEditor();
      return;
    }
    if (drag) {
      // A click on an item: picked (or put down again).
      consolePick = picked(drag.kind, drag.id) ? null : { kind: drag.kind, id: drag.id };
      drag = null;
      showConsoleEditor();
      return;
    }
    // A click on a free cell with one picked: there.
    const cellEl = (e.target as Element).closest('.cell') as SVGRectElement | null;
    if (consolePick && cellEl && cellEl.dataset.kind === consolePick.kind) {
      if (consolePick.kind === 'dash') moveTo('dash', consolePick.id, { col: Number(cellEl.dataset.col), row: Number(cellEl.dataset.row) });
      else moveTo('panel', consolePick.id, Number(cellEl.dataset.cell));
      showConsoleEditor();
    }
  };
}

// ── Figures, warnings, trial, code ──
function rows(el: HTMLElement, r: [string, string][]): void {
  el.innerHTML = r.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
}
/**
 * The groups on the right that fold (owner, Oct 2026: the right-hand side "a little bit too
 * constrained"): each open or shut as you left it, kept in this browser. Its default if never
 * touched: `open`.
 */
const FOLDS_KEY = 'swvr.shipyard.folds';
const folds: Record<string, boolean> = (() => {
  try {
    return JSON.parse(storage()?.getItem(FOLDS_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
})();
function isOpen(name: string, open: boolean): boolean {
  return folds[name] ?? open;
}
/** Keep a fold's open or shut when it's toggled (once for the page: the toggle event doesn't bubble). */
document.addEventListener(
  'toggle',
  (e) => {
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.fold) return;
    folds[el.dataset.fold] = el.open;
    try {
      storage()?.setItem(FOLDS_KEY, JSON.stringify(folds));
    } catch {
      /* not kept: it still folds */
    }
  },
  true,
);
document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((el) => (el.open = isOpen(el.dataset.fold!, el.open)));
/** A group of figures that folds: its name, a summary shown on its title (seen shut too), its rows ('sub' rows indented). */
function figureGroup(key: string, title: string, sum: string, r: ([string, string] | [string, string, 'sub'])[], open = true, inner = ''): string {
  const body = r.map(([a, b, sub]) => `<tr${sub ? ' class="sub"' : ''}><td>${a}</td><td>${b}</td></tr>`).join('');
  return `<details class="fold" data-fold="${key}"${isOpen(key, open) ? ' open' : ''}><summary>${title}<span class="sum">${sum}</span></summary><table class="figs">${body}</table>${inner}</details>`;
}
const pounds = (x: number) => `£${Math.round(x).toLocaleString('en-GB')}`;
/** Her roll period, or why there isn't one (a stiff, well-damped hull stops rolling before a second swing can be timed: the solar catamaran). */
function rollWords(period: number | null): string {
  return period !== null && Number.isFinite(period) ? `${period.toFixed(1)} s` : 'none to time (stops at once)';
}
/** The solar catamaran's battery at full power on both motors (h; undefined: not her). */
function batteryHoursFlatOut(): number | undefined {
  const s = boat.figures.solar;
  // (Two motors, one in each pod: the solar catamaran's and the foiling ferry's.)
  return s ? (s.batteryKWh * electricOf(design).usableShare) / (2 * ENGINES[design.engine].kw) : undefined;
}
/** ...and how far that takes her at her top speed (nm). */
function batteryRangeFlatOut(topKn: number): number | undefined {
  const h = batteryHoursFlatOut();
  return h === undefined ? undefined : h * topKn;
}
function showFigures(): void {
  const f = boat.figures;
  const isMatched = matched();
  const room = deckRoom();
  const t = currentTrial();
  const balance = Math.abs(boat.weights.balanceM) < 0.05 ? 'over her centre of buoyancy' : `${Math.abs(boat.weights.balanceM).toFixed(2)} m ${boat.weights.balanceM > 0 ? 'aft' : 'forward'} of her centre of buoyancy`;
  const weights = boat.weights.items.map((it): [string, string, 'sub'] => [it.name, `${(it.kg / 1000).toFixed(2)} t`, 'sub']);
  $('figures').innerHTML = [
    figureGroup('size', 'Size &amp; form', `${f.lengthM.toFixed(2)} × ${f.beamM.toFixed(2)} m`, [
      ['Length × beam', `${f.lengthM.toFixed(2)} × ${f.beamM.toFixed(2)} m`],
      ['Built of', f.material === 'steel' ? 'Steel' : f.material === 'aluminium' ? 'Aluminium' : f.material === 'composite' ? 'Carbon and glass composite' : f.material === 'GRP' ? 'GRP (glass-reinforced plastic)' : 'Foam and plywood'],
      ['Displacement', `${f.massT.toFixed(2)} t`],
      ['Draught', `${f.draughtM.toFixed(2)} m`],
      ['Freeboard', `${f.freeboardM.toFixed(2)} m amidships`],
    ]),
    // Where her weights put her centre of gravity, against her centre of buoyancy (her tanks and ballast trim the rest).
    figureGroup('stability', 'Stability &amp; balance', `GM ${f.gmM.toFixed(2)} m`, [
      ['Stability (GM)', `${f.gmM.toFixed(2)} m`],
      ['Balance (LCG)', balance],
      ['Roll period', t ? rollWords(t.motions.rollPeriod) : 'trial running…'],
    ]),
    figureGroup('deck', 'Deck', `${room.crates} crates`, [
      ['Deck cargo', deckWords(room)],
      ['Pots on deck', `${room.pots}`],
      // (Her fish hold, if she has one: as many fish boxes as stack in it.)
      ...(holdBoxes() ? [['Fish hold', `${holdBoxes()} fish boxes`] as [string, string]] : []),
    ]),
    // The solar catamaran's battery (parts/solar.ts): her range at an easy cruise, and her wet deck's height.
    ...(f.solar
      ? [
          figureGroup('battery', 'Battery &amp; range', `${f.solar.rangeNm} nm`, [
            ['Battery', `${f.solar.batteryKWh} kWh`],
            ['Cruise', `${f.solar.cruiseKn.toFixed(1)} kn on ${f.solar.cruiseKw} kW`],
            ['Range on battery', `${f.solar.rangeNm} nm, ${f.solar.hours.toFixed(1)} h${DESIGN_HULLS[design.hull].solarRoof ? ' (no sun)' : ''}`],
            ['Under her wet deck', `${f.solar.wetDeckM.toFixed(2)} m`],
            // (A foiling boat's: where she lifts onto them, and how deep they reach on her hulls.)
            ...(f.foilsDraughtM !== undefined
              ? ([
                  ['On her foils', `from about ${Math.round(((VESSEL_DEFS.design.foils?.takeoff ?? 0) / 0.5144) * 0.9)} kn`],
                  ['Foils under water', `${f.foilsDraughtM.toFixed(1)} m on her hulls: keep to deep water`],
                ] as [string, string][])
              : []),
          ]),
        ]
      : []),
    figureGroup('machinery', 'Machinery', f.engine.split(',')[0], [
      ['Engine', f.engine],
      ['Propeller', `${f.propellerM.toFixed(2)} m`],
      ['Gearbox', isMatched ? `${f.gear.toFixed(2)} : 1 (${gearFixed(design) ? 'fixed with her drives' : 'matched'})` : 'matching...'],
    ], false),
    // Her weights, part by part (build.ts): she floats where they add up to.
    figureGroup('cost', 'Price &amp; weight', pounds(f.price), [
      ['Price', pounds(f.price)],
      ['Weight', `${f.massT.toFixed(2)} t, as below`],
      ...weights,
    ], false),
  ].join('');
  // A design on a retired hull type (build.ts DESIGN_HULLS `retired`) still builds; it says so.
  const retired = DESIGN_HULLS[design.hull].retired ? [`The ${DESIGN_HULLS[design.hull].name.split(':')[0].toLowerCase()} hull type is retired: start her again from another type (Brief).`] : [];
  const warnings = [...retired, ...boat.warnings];
  $('warnings').innerHTML = warnings.map((w) => `<div>${w}</div>`).join('');
  $('warnCount').textContent = String(warnings.length);
  $('attention').hidden = !warnings.length;
  showKeys();
  if (typeof showBriefCheck === 'function' && $('briefCheck')) showBriefCheck();
}

/** "21 crates (2.1 t)", or why fewer than there's room for. */
/** How many fish boxes her fish hold takes (0: none). */
function holdBoxes(): number {
  const m = boat.recipe.modules.find((x) => x.module === 'hold.fish');
  return m ? holdSlots(m.config as unknown as FishHoldConfig).length : 0;
}
function deckWords(r: DeckRoom): string {
  const t = `${(r.payloadKg / 1000).toFixed(1)} t payload`;
  return r.crates < r.crateRoom ? `${r.crates} crates (room for ${r.crateRoom}; ${t})` : `${r.crates} crates (${t})`;
}
/**
 * Her key figures across the top, big, each against the brief's target (owner, Oct 2026: "I
 * want to see the price and the speed ... or the main design criteria to be kind of more
 * obvious"): price, top speed, range, stability, what she carries on deck (and her bollard
 * pull when she's to tow), then how much of the brief she meets. A tick or cross with each
 * target (never colour alone); the trial's figures greyed while a new trial runs.
 */
function showKeys(): void {
  const f = boat.figures;
  const t = trial;
  const fresh = !!t && trialFor === matchKey(design);
  const all = checkBrief(brief, measured());
  const line = (test: (l: Check) => boolean) => all.find((l) => !l.na && test(l));
  const room = deckRoom();
  const pots = brief.jobs.includes('potting') && brief.pots > 0 && !(brief.jobs.includes('cargo') && brief.crates > 0);
  const tiles: { k: string; v: string; busy?: boolean; l?: Check; none?: string }[] = [
    { k: 'Price', v: pounds(f.price), l: line((l) => l.label === 'Price'), none: 'no limit set' },
    { k: 'Top speed', v: t ? `${t.topSpeedKn.toFixed(1)} kn` : '…', busy: !fresh, l: line((l) => l.label === 'Top speed') },
    { k: 'Range flat out', v: t ? `${(batteryRangeFlatOut(t.topSpeedKn) ?? t.speedTable.at(-1)?.rangeNm ?? 0).toFixed(0)} nm` : '…', busy: !fresh, l: line((l) => l.label === 'Range flat out') },
    { k: 'Stability (GM)', v: `${f.gmM.toFixed(2)} m`, l: line((l) => l.label === 'Stability (GM)') },
    pots ? { k: 'Pots on deck', v: `${room.pots}`, l: line((l) => l.label.endsWith('pots on deck')) } : { k: 'Deck cargo', v: `${room.crates} crates`, l: line((l) => l.label.endsWith('crates on deck')) },
  ];
  if (brief.jobs.includes('towing')) tiles.push({ k: 'Bollard pull', v: t ? `${(t.bollard.aheadKN / 9.81).toFixed(1)} t` : '…', busy: !fresh, l: line((l) => l.label.endsWith('bollard pull')) });
  const state = (l?: Check) => (!l ? 'none' : l.ok === null ? 'wait' : l.ok ? 'ok' : 'bad');
  const mark = (l: Check) => (l.ok === null ? '…' : l.ok ? '✓' : '✗');
  let html = tiles
    .map((x) => `<div class="key ${state(x.l)}${x.busy ? ' busy' : ''}"><div class="k">${x.k}</div><div class="v">${x.v}</div><div class="t">${x.l ? `<span class="mark">${mark(x.l)}</span>brief ${esc(x.l.target)}` : (x.none ?? 'no target set')}</div></div>`)
    .join('');
  const counted = all.filter((l) => !l.na);
  const met = counted.filter((l) => l.ok).length;
  const verdict = briefVerdict();
  const vState = verdict === true ? 'ok' : verdict === false ? 'bad' : counted.length ? 'wait' : 'none';
  const vText = !counted.length ? 'No brief yet' : verdict === null ? 'Checking…' : `${met} of ${counted.length} met`;
  html += `<div class="key verdict ${vState}" id="keyVerdict" title="The brief, line by line"><div class="k">The brief</div><div class="v">${vText}</div><div class="t">${verdict === false ? `<span class="mark">✗</span>${counted.length - met} short: see them` : verdict === true ? '<span class="mark">✓</span>every line met' : 'set it at step 1'}</div></div>`;
  $('keys').innerHTML = html;
  $('keyVerdict').onclick = () => {
    if (document.body.classList.contains('vsBig')) showPanel('results', true);
    $('briefCheck').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}
function showTrial(): void {
  const t = trial;
  showKeys();
  showBriefCheck();
  if (!t) {
    $('trial').innerHTML = '';
    $('charts').innerHTML = '';
    $('trialSum').textContent = '';
    return;
  }
  // Greyed while it's the last design's trial and a new one is running.
  const fresh = trialFor === matchKey(design);
  $('trial').style.opacity = fresh ? '1' : '0.45';
  $('charts').classList.toggle('stale', !fresh);
  $('charts').innerHTML = trialCharts(t, boat.figures.lengthM, brief);
  const top = t.speedTable[t.speedTable.length - 1];
  const three = t.speedTable[2];
  $('trialSum').textContent = `${t.topSpeedKn.toFixed(1)} kn`;
  rows($('trial'), [
    ['Top speed', `${t.topSpeedKn.toFixed(1)} kn at ${Math.round(top.rpm)} rpm`],
    ['Three-quarter lever', `${three.knots.toFixed(1)} kn`],
    // (The solar catamaran: her battery, not fuel.)
    boat.figures.solar ? ['Battery flat out', `${batteryHoursFlatOut()!.toFixed(1)} h, ${batteryRangeFlatOut(t.topSpeedKn)!.toFixed(0)} nm`] : ['Fuel flat out', `${top.fuelLph.toFixed(0)} L/h, ${top.rangeNm.toFixed(0)} nm`],
    ['Rest to 90 % of top speed', `${t.timeTo90Pct.toFixed(1)} s`],
    ['Turning circle (tactical)', `${t.tacticalDiameter.toFixed(0)} m`],
    ['Crash stop', `${t.crashStopDistance.toFixed(0)} m in ${t.crashStopTime.toFixed(1)} s`],
    ['Bollard pull', `${(t.bollard.aheadKN / 9.81).toFixed(2)} t`],
    ['Roll period', rollWords(t.motions.rollPeriod)],
  ]);
}

// ── The view's size (owner, Oct 2026: the 3D view "much smaller, as long as you've got an
// option to kind of make it bigger and push the other panels out of the way") ──
type ViewSize = 'design' | 'balanced' | 'big';
const VIEW_SIZE_KEY = 'swvr.shipyard.viewSize';
function setViewSize(size: ViewSize): void {
  const b = document.body;
  b.classList.toggle('vsBalanced', size === 'balanced');
  b.classList.toggle('vsBig', size === 'big');
  b.classList.remove('showSide', 'showResults');
  document.querySelectorAll<HTMLElement>('#viewSize [data-size]').forEach((el) => el.classList.toggle('on', el.dataset.size === size));
  placePanels();
  try {
    storage()?.setItem(VIEW_SIZE_KEY, size);
  } catch {
    /* not kept: this visit only */
  }
}
/** Big view: the panels slide in under the key figures, over the view. */
function placePanels(): void {
  document.body.style.setProperty('--panelTop', `${Math.round($('view').getBoundingClientRect().top + window.scrollY)}px`);
}
/** Big view: show or hide the step (left) or the brief and figures (right); `on` to show it whatever it was. */
function showPanel(which: 'side' | 'results', on?: boolean): void {
  const c = which === 'side' ? 'showSide' : 'showResults';
  document.body.classList.toggle(c, on ?? !document.body.classList.contains(c));
}
document.querySelectorAll<HTMLElement>('#viewSize [data-size]').forEach((el) => (el.onclick = () => setViewSize(el.dataset.size as ViewSize)));
$('sideTab').onclick = () => showPanel('side');
$('resultsTab').onclick = () => showPanel('results');
window.addEventListener('resize', placePanels);
{
  let size: string | null = null;
  try {
    size = storage()?.getItem(VIEW_SIZE_KEY) ?? null;
  } catch {
    /* none kept */
  }
  setViewSize(size === 'balanced' || size === 'big' ? size : 'design');
}
function showCode(): void {
  // Not into the game while she'd capsize (CONFIG.shipyard.minGM; her warnings say so).
  const capsizes = !floatsUpright();
  const btn = $('play').querySelector('button')!;
  btn.disabled = capsizes;
  btn.title = capsizes ? `She would capsize (GM ${boat.figures.gmM.toFixed(2)} m): give her more beam or less depth first.` : '';
  ($('playTogether') as HTMLButtonElement).disabled = capsizes;
  const isMatched = matched();
  const el = $('code');
  el.classList.toggle('pending', !isMatched);
  if (!isMatched) {
    el.textContent = 'matching...';
    return;
  }
  // Her short code to type into VR (none if no code can hold her: her link then); the address and the game take her token.
  const code = shortCode(design);
  const token = designToken(design);
  el.textContent = code ?? 'No short code: share her by link or file';
  ($('play') as HTMLAnchorElement).href = `./career.html?design=${token}`;
  // (Her code isn't kept in the address any more: the project keeps her, and a reload would
  // read the address as a link to a new boat. Share her by link, code or file.)
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
worker.onmessage = (e: MessageEvent<{ id: number; design: ShipDesign; trials?: SeaTrialResults; error?: string; matched?: boolean }>) => {
  if (e.data.id !== trialId) return; // the design changed since: a newer trial is coming
  if (e.data.error) {
    $('status').textContent = `The trial failed: ${e.data.error}`;
    return;
  }
  // Her matched gearbox (only the gear can differ from what was sent).
  design = { ...design, gear: e.data.design.gear };
  matchedFor = matchKey(design);
  boat = useDesign(design);
  // Matched, the trials still to come: her code's ready (she can be saved) meanwhile.
  if (e.data.matched) {
    $('status').textContent = 'Gearbox matched: running her trials...';
    showFigures();
    showCode();
    return;
  }
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
  const match = !matched();
  $('status').textContent = match ? 'Matching her propeller and running her trials...' : 'Running her trials...';
  trialTimer = window.setTimeout(() => worker.postMessage({ id, design, match }), 500);
}

/** A choice changed: rebuild and redraw her, then re-run her trials. */
function change(patch: Partial<ShipDesign>, by: 'me' | Person | null = 'me'): void {
  const before = matchKey(design);
  // A new hull type may be a very different size (the 9 m landing craft to the 25 m harbour tug): look at all of her again.
  const newType = patch.hull !== undefined && patch.hull !== design.hull;
  if (by === 'me') share(patch);
  else if (by) flash(patch, by);
  // (A one-off type's fixed choices stay hers: DesignHull.fixed.)
  design = withFixed({ ...design, ...patch });
  saveSessionCopy();
  boat = useDesign(design);
  syncControls();
  drawBoat();
  if (newType) setView('Bow ¾');
  showFigures();
  showCode();
  if (matchKey(design) !== before || !trial) runTrial();
  showTrial();
  showHandles();
}

// ── Code tools ──
/** The game's address for her; `t` (the time) makes the browser fetch the latest game, not a copy it kept. */
function gameUrl(code: string, extra = ''): string {
  return `./career.html?design=${code}${extra}&t=${Date.now()}`;
}
/** Does she float upright (GM over CONFIG.shipyard.minGM)? Only then is she let into the game. */
function floatsUpright(): boolean {
  return boat.figures.gmM >= CONFIG.shipyard.minGM;
}
$('play').onclick = (e) => {
  e.preventDefault();
  if (matched() && floatsUpright()) location.assign(gameUrl(designToken(design)));
};
// "Try her together" (owner, Oct 2026): in a session, one press takes everyone into the game in
// her, in one multiplayer game. The presser hosts it in a new room; the others join it
// (session.ts sends them the room; the game waits for the host, App.ts).
$('playTogether').onclick = () => {
  if (!matched() || !link?.side || !floatsUpright()) return;
  const code = designToken(design);
  const room = randomRoomCode();
  link.side.go({ design: code, room });
  $('sessionState').textContent = 'Taking everyone into the game…';
  setTimeout(() => location.assign(gameUrl(code, `&host=${room}`)), CONFIG.net.togetherLeadS * 1000);
};
/** The together button: only in a session with someone else in it. */
function showTogether(): void {
  $('playTogether').hidden = !(link?.side && people.length > 1);
}
$('copy').onclick = () => {
  const code = shortCode(design);
  if (matched() && code) void navigator.clipboard?.writeText(code);
};
// Sharing her as a document (parametric boats P1; designDoc.ts): a link to the Shipyard with
// her in it (paste it in a message), or a file (send it, keep it, open it here again).
/** Her name as shared: the brief's, else what she'd be called. */
const shareName = () => (brief.name ?? '').trim() || defaultName();
$('shareLink').onclick = () => {
  if (!matched()) return;
  const url = `${location.origin}${location.pathname}#${docToken(design, shareName())}`;
  void navigator.clipboard?.writeText(url);
  $('shareMsg').textContent = 'Link copied: paste it in a message. It opens the Shipyard on her.';
};
$('saveFile').onclick = () => {
  if (!matched()) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([docFileText(design, shareName())], { type: 'application/json' }));
  a.download = docFileName(shareName());
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('shareMsg').textContent = `Saved as ${a.download}.`;
};
$('openFile').onclick = () => ($('fileIn') as HTMLInputElement).click();
($('fileIn') as HTMLInputElement).onchange = async () => {
  const input = $('fileIn') as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) openCode(await file.text(), $('shareMsg'));
};
/** Open a design by its code, link or file (typed in, pasted, a favourite). False, with the reason shown, if it won't read. */
function openCode(code: string, msg: HTMLElement): boolean {
  const read = readDesign(code);
  if ('error' in read) {
    msg.textContent = read.error;
    return false;
  }
  // What the reader had to do (a field from a newer Shipyard left out, a value brought onto its scale).
  msg.textContent = read.warnings.length ? `Opened, but: ${read.warnings.join('; ')}.` : '';
  if (read.name) setBrief({ name: read.name });
  share(read.design);
  design = read.design;
  matchedFor = comesMatched(design) ? matchKey(design) : null;
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
  renderer.render(scene, viewCam());
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
  if (!matched()) {
    msg.textContent = 'Wait a moment: her gearbox is still being matched (her code isn’t ready).';
    return;
  }
  const nameBox = $('favName') as HTMLInputElement;
  const name = cleanName(nameBox.value, defaultName());
  const f = boat.figures;
  const summary = [`${f.lengthM.toFixed(1)} m`, `${f.massT.toFixed(1)} t`, trial ? `${trial.topSpeedKn.toFixed(1)} kn` : '', f.engine].filter(Boolean).join(' · ');
  const fav: Favourite = { name, code: designToken(design), savedAt: Date.now(), picture: picture(), summary };
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
    card.innerHTML = `${f.picture ? `<img alt="" src="${f.picture}">` : '<div class="nopic"></div>'}<div><b title="${esc(f.name)}">${esc(f.name)}</b><div class="meta">${esc(f.summary)}</div><div class="code">${esc(groupFavCode(f.code))} · ${when}</div><div class="acts"><button data-act="open">Open</button><button data-act="play">Try in game</button><button data-act="del">Delete</button></div></div>`;
    card.querySelector<HTMLElement>('[data-act=open]')!.onclick = () => openCode(f.code, $('favMsg'));
    card.querySelector<HTMLElement>('[data-act=play]')!.onclick = () => (location.href = `./career.html?design=${encodeURIComponent(f.code)}`);
    card.querySelector<HTMLElement>('[data-act=del]')!.onclick = () => {
      if (!confirm(`Delete “${f.name}” from your favourites?`)) return;
      writeFavourites(storage(), removeFavourite(readFavourites(storage()), f.name, f.savedAt));
      showFavourites();
    };
    box.appendChild(card);
  }
  markCurrent();
}
/** A favourite's code as shown (one saved from a link has no code). */
const groupFavCode = (token: string) => (token.startsWith('doc.') ? 'from a link' : token);
/** Mark the favourite that is the design on show now (if any). */
function markCurrent(): void {
  const now = matched() ? designToken(design) : '';
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
    // On your own with a saved project open, the project saves itself too (a scratch boat isn't kept).
    if (!sessionId && tabHasProject() && currentProject()) autosaveProject();
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
  showTogether();
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
  cursorRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewCam());
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
  drawInk();
  showTodo();
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
      if (confirm(`Delete pin ${i + 1}${p.text ? `, “${p.text}”` : eq ? ` (${eq.name})` : ''}?`)) dropMyNote(p.id);
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
let tool: 'pin' | 'sketch' | null = null;
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
  k.title = 'Draw on her side, plan, bow or stern view: everyone in the session draws on the same sheet';
  k.onclick = () => (tool === 'sketch' ? closeSketch() : openSketch());
  toolBtns.sketch = k;
  const undoInk = document.createElement('button');
  undoInk.textContent = '↶ Stroke';
  undoInk.className = 'tool sketchOnly';
  undoInk.title = 'Take back your last stroke on this view';
  undoInk.onclick = () => {
    const p = facingPlane();
    const mine = p ? inkOf(notes, planeSheet(p)).filter((n) => n.by === author().by) : [];
    if (mine.length) dropMyNote(mine[mine.length - 1].id);
  };
  const clearInk = document.createElement('button');
  clearInk.textContent = '✕ Clear view';
  clearInk.className = 'tool sketchOnly';
  clearInk.title = 'Rub out everything drawn on this view (everyone’s)';
  clearInk.onclick = () => {
    const p = facingPlane();
    const all = p ? inkOf(notes, planeSheet(p)) : [];
    if (all.length && confirm(`Rub out all ${all.length} strokes on the ${PLANES[p!].title.toLowerCase()} view, everyone’s?`)) for (const n of all) dropMyNote(n.id);
  };
  $('views').append(b, k, undoInk, clearInk);
}
function setTool(t: typeof tool): void {
  tool = t;
  if (t && placing) stopPlacing();
  showHandles();
  // Sketching: the view stays square on (no turning it; the wheel still zooms) and flat.
  orbit.enabled = t !== 'pin';
  orbit.enableRotate = orbit.enablePan = !t;

  $('view').classList.toggle('sketching', t === 'sketch');
  for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('on', k === t);
  renderer.domElement.style.cursor = t ? 'crosshair' : '';
  $('toolHint').textContent = t === 'pin' ? 'Click on her where the pin goes' : t === 'sketch' ? 'Draw on the sheet: everyone with it open sees it as you draw. Port, Starboard, Plan, Bow or Stern for another view’s sketch; ✏ Sketch again to close' : '';
  drawInk();
  if (t !== 'pin') ($('pinEditor') as HTMLElement).hidden = true;
  if (!t && shownStep === 'furniture') $('toolHint').textContent = FURNITURE_HINT;
}
// ── Placing by pointing (placing.ts; owner, Oct 2026: "an easy way to place and move equipment") ──
/**
 * The piece being placed: what, its turn (R), each 25 cm cell's answer (kept until the design
 * changes), and the answer under the pointer now. Moving one already on her is the same.
 */
let placing: { target: Target; face?: number; cache: Map<string, Preview>; shown: Preview | null; moving: boolean; design: ShipDesign } | null = null;
/** The piece of her gear or furniture under the pointer (not placing): a click picks it up. */
let hovered: Target | null = null;
// The see-through copy that follows the pointer: green where it stands, red where it won't.
const GHOST_OK = 0x46c27a;
const GHOST_NO = 0xe0524a;
const ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.38, depthWrite: false });
const ghostLine = new THREE.LineBasicMaterial({ color: GHOST_OK });
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), ghostLine));
ghost.visible = false;
ghost.renderOrder = 10;
scene.add(ghost);
const targetName = (t: Target) => (t.kind === 'gear' ? t.eq.name.toLowerCase() : furnitureName(slotOf(t.key).kind, slotOf(t.key).i));
const turnsOf = (t: Target) => t.kind === 'gear' && !!t.eq.turns;
/** Her wheelhouse, as the placing rules want it. */
function houseBox() {
  const wh = VESSEL_DEFS.design.layout.wheelhouse;
  return wh ? { front: wh.front, aft: wh.aft, halfWidth: wh.halfWidth, x: wh.x } : undefined;
}
/** Pick a piece up: from the menu (Place, Move, Add) or by clicking it on her. */
function startPlacing(target: Target): void {
  if (tool) setTool(null);
  const moving = target.kind === 'gear' ? fitted(target.eq, design) : !!design[target.key];
  const at = target.kind === 'gear' && target.eq.key ? placeOf(target.eq.key, design[target.eq.key]) : null;
  placing = { target, face: at?.face, cache: new Map(), shown: null, moving, design };
  showHandles();
  hovered = null;
  renderer.domElement.style.cursor = 'crosshair';
  $('toolHint').textContent = `${moving ? 'Moving' : 'Placing'} the ${targetName(target)}: point at her and click where it goes (green: it stands there; red: it won't, and why).${turnsOf(target) ? ' R turns it.' : ''}${moving ? ' Delete takes it off.' : ''} Esc stops.`;
  showOnHer();
}
function stopPlacing(): void {
  placing = null;
  showHandles();
  ghost.visible = false;
  $('placeTip').hidden = true;
  renderer.domElement.style.cursor = '';
  $('toolHint').textContent = shownStep === 'furniture' ? FURNITURE_HINT : '';
  showOnHer();
}
/** Put it down where the pointer is, if it stands there (a red spot won't take it). */
function placeHere(): void {
  const pv = placing?.shown;
  if (!placing || !pv) return;
  if (!pv.ok) {
    const tip = $('placeTip');
    tip.classList.remove('shake');
    void tip.offsetWidth;
    tip.classList.add('shake');
    return;
  }
  change(pv.patch);
  stopPlacing();
}
let placeHit: THREE.Vector3 | null = null;
let placeAt = { x: 0, y: 0 };
let placeFrame = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  placeAt = { x: e.clientX, y: e.clientY };
  if (!placing) return hoverPiece(e);
  placeHit = hitBoat(e);
  if (!placeFrame) placeFrame = requestAnimationFrame(updatePlacing);
});
renderer.domElement.addEventListener('pointerleave', () => {
  ghost.visible = false;
  $('placeTip').hidden = true;
});
/** The copy under the pointer: tried there (once a cell), drawn green or red, its words beside the pointer. */
function updatePlacing(): void {
  placeFrame = 0;
  const tip = $('placeTip');
  if (!placing || !placeHit) {
    ghost.visible = false;
    tip.hidden = true;
    return;
  }
  // (The design changed under it, someone else's change in a session: ask afresh.)
  if (placing.design !== design) {
    placing.cache.clear();
    placing.design = design;
  }
  const p: [number, number, number] = [placeHit.x, placeHit.y, placeHit.z];
  const key = `${cellOf(p)}:${placing.face ?? '-'}`;
  let pv = placing.cache.get(key);
  if (!pv) {
    pv = previewPlace(design, placing.target, p, houseBox(), hullPlan(VESSEL_DEFS.design).transom, (d) => buildDesign(d), placing.face);
    placing.cache.set(key, pv);
  }
  placing.shown = pv;
  const t = placing.target;
  const [w, h, l] = ghostSize(t, t.kind === 'gear' && (t.eq.id === 'searchlight' || t.eq.id === 'fireMonitor') && pv.patch[t.eq.field] === 1);
  ghost.scale.set(w, h, l);
  ghost.position.set(pv.at[0], pv.at[1] + h / 2, pv.at[2]);
  ghost.rotation.set(0, (pv.yawDeg * Math.PI) / 180, 0);
  ghostMat.color.setHex(pv.ok ? GHOST_OK : GHOST_NO);
  ghostLine.color.setHex(pv.ok ? GHOST_OK : GHOST_NO);
  ghost.visible = true;
  tip.className = pv.ok ? 'ok' : 'no';
  tip.textContent = pv.ok ? `Click to put the ${targetName(t)} here${pv.words ? ` (${pv.words})` : ''}` : `Not here: ${pv.words}`;
  showTip(tip);
}
/** The words beside the pointer, kept inside the view. */
function showTip(tip: HTMLElement): void {
  const r = $('view').getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = `${Math.min(r.width - tip.offsetWidth - 8, Math.max(8, placeAt.x - r.left + 16))}px`;
  tip.style.top = `${Math.min(r.height - tip.offsetHeight - 8, Math.max(8, placeAt.y - r.top + 18))}px`;
}
/** The pieces on her now, where each stands: what a click on her can pick up (at Deck gear and Furniture). */
function piecesOnHer(): { target: Target; at: [number, number, number]; reach: number }[] {
  const out: { target: Target; at: [number, number, number]; reach: number }[] = [];
  if (shownStep === 'deck gear')
    for (const eq of EQUIPMENT) {
      if (gearKind(eq) !== 'place' || !fitted(eq, design)) continue;
      const t: Target = { kind: 'gear', eq };
      const w = whereIs(boat, t);
      if (w) out.push({ target: t, at: w.at, reach: Math.max(0.6, Math.max(...ghostSize(t)) / 2) });
    }
  if (shownStep === 'furniture')
    for (const { kind } of FURNITURE_MENU)
      for (const key of placedOf(kind, design)) {
        const t: Target = { kind: 'furniture', key };
        const w = whereIs(boat, t);
        if (w) out.push({ target: t, at: w.at, reach: Math.max(0.5, Math.max(...ghostSize(t)) / 2) });
      }
  return out;
}
/** Not placing: over a piece on her, say a click picks it up. */
function hoverPiece(e: PointerEvent): void {
  const tip = $('placeTip');
  const was = hovered;
  hovered = null;
  if (!tool && (shownStep === 'deck gear' || shownStep === 'furniture')) {
    const hit = hitBoat(e);
    if (hit) {
      let best = Infinity;
      for (const p of piecesOnHer()) {
        const d = Math.hypot(p.at[0] - hit.x, p.at[2] - hit.z);
        if (d < p.reach && d < best) {
          best = d;
          hovered = p.target;
        }
      }
    }
  }
  if (hovered) {
    renderer.domElement.style.cursor = 'grab';
    tip.className = 'ok';
    tip.textContent = `The ${targetName(hovered)}: click to move it · Delete takes it off`;
    showTip(tip);
  } else if (was) {
    renderer.domElement.style.cursor = tool ? 'crosshair' : '';
    tip.hidden = true;
  }
}
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
  if (placing) {
    if (e.key === 'Escape') stopPlacing();
    else if ((e.key === 'r' || e.key === 'R') && turnsOf(placing.target)) {
      placing.face = ((placing.face ?? 0) + 1) % 4;
      updatePlacing();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && placing.moving) {
      const t = placing.target;
      stopPlacing();
      change(t.kind === 'gear' ? removeGear(t.eq) : removeFurniture(t.key, design));
    } else return;
    e.preventDefault();
  } else if (hovered && (e.key === 'Delete' || e.key === 'Backspace')) {
    const t = hovered;
    hovered = null;
    $('placeTip').hidden = true;
    change(t.kind === 'gear' ? removeGear(t.eq) : removeFurniture(t.key, design));
    e.preventDefault();
  }
});
// ── Handles on the view (handles.ts; owner, Oct 2026: drag her shape on the 3D view, not sliders) ──
/** A handle shown at this step: its definition, its mesh, where it sits now. */
interface ShownHandle {
  def: HandleDef;
  mesh: THREE.Mesh;
  at: HV3;
}
/** A handle's own colour (CONFIG.shipyard.handles), and lightened when pointed at or held. */
const handleColour = (def: HandleDef) => new THREE.Color(CONFIG.shipyard.handles.colours[def.key] ?? CONFIG.shipyard.handles.fallback);
const WHITE = new THREE.Color(0xffffff);
const handleGroup = new THREE.Group();
scene.add(handleGroup);
const handleGeo = new THREE.SphereGeometry(1, 20, 14);
let shownHandles: ShownHandle[] = [];
let hotHandle: ShownHandle | null = null;
/** A handle being dragged: its steps' points (worked out as it goes), and the line it's dragged along. */
let dragging: { h: ShownHandle; anchors: (HV3 | undefined)[]; origin: HV3 } | null = null;
// The dimension it shows while dragged (a line from where it's measured to the handle).
const dimLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
dimLine.renderOrder = 11;
dimLine.visible = false;
scene.add(dimLine);
/** Each handle's points, step by step, for the design as it is but for the handle's own choice (worked out once). */
const handleAnchors = new Map<string, (HV3 | undefined)[]>();
function anchorsFor(def: HandleDef): (HV3 | undefined)[] {
  // (Not her gearbox, matched by trial after a change: it doesn't move her shape.)
  const rest: Partial<ShipDesign> = { ...design };
  delete rest[def.key];
  delete rest.gear;
  const k = `${def.key}|${JSON.stringify(rest)}`;
  let a = handleAnchors.get(k);
  if (!a) {
    a = new Array<HV3 | undefined>(stepsOf(def.key)).fill(undefined);
    a[design[def.key]] = def.anchor(boat);
    if (handleAnchors.size > 30) handleAnchors.delete(handleAnchors.keys().next().value!);
    handleAnchors.set(k, a);
  }
  return a;
}
let anchorWork = 0;
/** Work out the rest of a handle's steps, one at a time (each builds her: about 40 ms), nearest first. */
function workOutAnchors(def: HandleDef): void {
  const a = anchorsFor(def);
  const cur = design[def.key];
  const base = { ...design };
  const order = a.map((_, i) => i).sort((p, q) => Math.abs(p - cur) - Math.abs(q - cur));
  window.clearTimeout(anchorWork);
  const next = () => {
    const i = order.find((j) => !a[j]);
    if (i === undefined) return;
    try {
      a[i] = def.anchor(buildDesign({ ...base, [def.key]: i }));
    } catch {
      a[i] = a[cur];
    }
    anchorWork = window.setTimeout(next, 0);
  };
  next();
}
/** The handles for the step shown: on her, unless placing, a tool, or a live trial is on. */
function showHandles(): void {
  for (const h of shownHandles) handleGroup.remove(h.mesh);
  shownHandles = [];
  // Each handle's colour as a dot beside its slider (cleared, then set for those shown).
  for (const row of document.querySelectorAll<HTMLElement>('.row.handled')) row.classList.remove('handled');
  if (placing || tool || live) return;
  for (const def of HANDLES) {
    // (Not on a one-off's fixed choices: DesignHull.fixed.)
    if (def.step !== shownStep || (def.applies && !def.applies(design)) || def.key in (DESIGN_HULLS[design.hull]?.fixed ?? {})) continue;
    const mesh = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ color: handleColour(def), depthTest: false, transparent: true, opacity: 0.95 }));
    mesh.renderOrder = 12;
    const at = def.anchor(boat);
    mesh.position.set(...at);
    handleGroup.add(mesh);
    shownHandles.push({ def, mesh, at });
    const row = document.querySelector(`input[data-key="${def.key}"]`)?.closest<HTMLElement>('.row');
    if (row) {
      row.classList.add('handled');
      row.style.setProperty('--handle', `#${handleColour(def).getHexString()}`);
    }
  }
}
/** Each frame: the handles a steady size on the screen, and only where they can be dragged (not end-on to the view). */
function updateHandles(): void {
  const cam = viewCam();
  const look = new THREE.Vector3();
  cam.getWorldDirection(look);
  for (const h of shownHandles) {
    const size = flat ? (flatCam.top - flatCam.bottom) * 0.011 : cam.position.distanceTo(h.mesh.position) * 0.011;
    const hot = h === hotHandle || h === dragging?.h;
    h.mesh.scale.setScalar(size * (hot ? 1.35 : 1));
    (h.mesh.material as THREE.MeshBasicMaterial).color.copy(handleColour(h.def)).lerp(WHITE, hot ? CONFIG.shipyard.handles.hotLift : 0);
    h.mesh.visible = Math.abs(look.dot(new THREE.Vector3(...h.def.axis))) < 0.95;
  }
}
/** The pointer's ray, in boat axes. */
function pointerRay(e: PointerEvent): THREE.Ray {
  const r = renderer.domElement.getBoundingClientRect();
  noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewCam());
  return noteRay.ray;
}
/** Light a handle's slider row too (and back). */
function lightRow(key: keyof ShipDesign | undefined, on: boolean): void {
  if (key) document.querySelector(`input[data-key="${key}"]`)?.closest('.row')?.classList.toggle('hot', on);
}
function setHot(h: ShownHandle | null): void {
  if (h === hotHandle) return;
  lightRow(hotHandle?.def.key, false);
  hotHandle = h;
  lightRow(h?.def.key, true);
  renderer.domElement.style.cursor = h ? 'grab' : '';
  if (h) workOutAnchors(h.def);
}
/** What a handle says beside the pointer: its value (and the dimension while dragged; at a limit, that it goes no further). */
function handleTip(h: ShownHandle, atLimit = false): void {
  const tip = $('placeTip');
  const value = outputs[h.def.key]?.(design[h.def.key]) ?? String(design[h.def.key]);
  tip.className = atLimit ? 'no' : 'ok';
  tip.textContent = dragging ? `${h.def.dimension?.name ?? h.def.label} ${value}${atLimit ? ': as far as it goes' : ''}` : `${h.def.label} ${value} · drag to change`;
  showTip(tip);
}
// Grabbing a handle (before the view's own turning sees the press).
$('view').addEventListener(
  'pointerdown',
  (e) => {
    if (!hotHandle || e.button !== 0) return;
    e.stopPropagation();
    downAt = null;
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
    workOutAnchors(hotHandle.def);
    dragging = { h: hotHandle, anchors: anchorsFor(hotHandle.def), origin: [...hotHandle.at] };
    link?.side?.presence({ holding: hotHandle.def.key });
    handleTip(hotHandle);
  },
  true,
);
renderer.domElement.addEventListener('pointermove', (e) => {
  placeAt = { x: e.clientX, y: e.clientY };
  if (dragging) {
    const { h, anchors, origin } = dragging;
    const ray = pointerRay(e);
    const t = alongAxis(origin, h.def.axis, ray.origin.toArray(), ray.direction.toArray());
    if (t === null) return;
    const ns = nearestStep(anchors, origin, h.def.axis, t);
    if (!ns) return;
    if (ns.step !== design[h.def.key]) change({ [h.def.key]: ns.step } as Partial<ShipDesign>);
    const now = shownHandles.find((x) => x.def === h.def);
    if (now) dragging.h = now;
    const dim = h.def.dimension;
    if (dim && now) {
      dimLine.geometry.setFromPoints([new THREE.Vector3(...dim.from(boat)), new THREE.Vector3(...now.at)]);
      (dimLine.material as THREE.LineBasicMaterial).color.copy(handleColour(h.def));
      dimLine.visible = true;
    }
    handleTip(dragging.h, ns.atLimit);
    return;
  }
  if (placing || tool) return;
  const ray = pointerRay(e);
  const hit = noteRay.intersectObjects(shownHandles.filter((h) => h.mesh.visible).map((h) => h.mesh), false)[0];
  void ray;
  const h = hit ? shownHandles.find((x) => x.mesh === hit.object) ?? null : null;
  setHot(h);
  if (h) handleTip(h);
  else if (!hovered) $('placeTip').hidden = true;
});
window.addEventListener('pointerup', () => {
  if (!dragging) return;
  const key = dragging.h.def.key;
  dragging = null;
  orbit.enabled = !tool || tool !== 'pin';
  dimLine.visible = false;
  $('placeTip').hidden = true;
  renderer.domElement.style.cursor = hotHandle ? 'grab' : '';
  link?.side?.presence({ holding: null });
  lightRow(key, true);
});
/** What the view shows at the Furniture step, when nothing is being placed. */
const FURNITURE_HINT = 'Seen from above, cut just over the floor (✂ Section to move the cut): Add a piece, then click where it goes';
/**
 * The Furniture step's view (P5; owner: the roof is in the way): her seen from straight above,
 * flat, cut by the section tool at a waterline just over the wheelhouse floor
 * (CONFIG.shipyard.furniture.planCut), so the floor, the console, the companionway and the
 * furniture already there show and take the click (owner, Oct 2026: "We could just use the
 * section cut. But ... when you go to the furniture page, it should try to cut at the roof
 * level by default"). It's the section tool's own cut, so its panel can slide it, flip it or
 * turn it off while the step is open; leaving the step puts the cut and the view back as they
 * were.
 */
let beforeFurniture: { eye: THREE.Vector3; at: THREE.Vector3; flat: boolean; kind: SectionKind | null; cutAt: Record<SectionKind, number | null>; flip: boolean } | null = null;
function furnitureView(on: boolean): void {
  if (!boatRoot || on === !!beforeFurniture) return;
  if (on) {
    beforeFurniture = { eye: camera.position.clone(), at: orbit.target.clone(), flat, kind: cut.kind, cutAt: { ...cut.at }, flip: cut.flip };
    const floor = boat.hull.layout.wheelhouse?.floorY ?? 1;
    cut.at.waterline = boatRoot.localToWorld(new THREE.Vector3(0, floor + CONFIG.shipyard.furniture.planCut, 0)).y;
    cut.flip = false;
    sectionTool('waterline');
    lookAtCut();
    // Closer in: over her houses (and a deckhouse forward of them), filling most of the view.
    const wh = boat.hull.layout.wheelhouse;
    if (wh) {
      const dh = boat.hull.layout.deckhouse;
      const z0 = Math.min(wh.front, dh?.z0 ?? wh.front);
      const at = boatRoot.localToWorld(new THREE.Vector3(0, floor, (z0 + wh.aft) / 2));
      const span = (wh.aft - z0) * 1.35;
      orbit.target.copy(at);
      camera.position.set(at.x + 0.01, at.y + Math.max(0.9, 1.55 / camera.aspect) * span, at.z);
      orbit.update();
    }
  } else {
    const was = beforeFurniture!;
    beforeFurniture = null;
    Object.assign(cut.at, was.cutAt);
    cut.flip = was.flip;
    sectionTool(was.kind);
    camera.position.copy(was.eye);
    orbit.target.copy(was.at);
    orbit.update();
    if (flat !== was.flat) flatBtn.click();
  }
}
const noteRay = new THREE.Raycaster();
function hitBoat(e: PointerEvent): THREE.Vector3 | null {
  if (!boatRoot) return null;
  const r = renderer.domElement.getBoundingClientRect();
  noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewCam());
  // (Cut by the section tool: what's cut off isn't there to click.)
  const planes = cutPlanes();
  return noteRay.intersectObject(boatRoot, true).find((h) => planes.every((pl) => pl.distanceToPoint(h.point) >= -0.01))?.point ?? null;
}
/** The planes she's cut by now: the section tool's (the Furniture step's too). */
function cutPlanes(): THREE.Plane[] {
  return cut.kind ? [sectionPlane] : [];
}
/**
 * Cut her drawing by those planes (three.js clips what's on the far side of each). Cut, her
 * materials are drawn from both sides, so what's left shows its inside (her plating from within)
 * rather than letting you see through it. Only needed when a plane comes or goes, or she's
 * redrawn: moving a plane moves the cut without it.
 */
function applyCuts(): void {
  if (!boatRoot) return;
  const planes = cutPlanes();
  const mats = new Set<THREE.Material>([ghostFill, ghostEdge]);
  boatRoot.traverse((o) => {
    const m = o as THREE.Mesh;
    for (const mat of [m.material, m.userData.solid].flat()) if (mat) mats.add(mat as THREE.Material);
  });
  for (const mat of mats) {
    mat.userData.side ??= mat.side;
    mat.clippingPlanes = planes.length ? planes : null;
    mat.side = planes.length ? THREE.DoubleSide : (mat.userData.side as THREE.Side);
    mat.needsUpdate = true;
  }
}

// ── The section tool (owner: "a section cutting tool so you can cut the ship through as you want") ──
// Her drawing cut by one of the three planes of her lines plan: a waterline (level), a buttock
// (upright, fore and aft) or a station (upright, athwartships), slid along her with a slider.
// Flip keeps the other side; Look at the cut turns the view square on to the cut face.
const SECTION_LOOK: Record<SectionKind, [string, string]> = { waterline: ['Plan', 'Plan'], buttock: ['Starboard', 'Port'], station: ['Bow', 'Stern'] };
/** Her extent along a section's axis (world m), and where it starts. */
function sectionRange(kind: SectionKind): { min: number; max: number; start: number } {
  const i = kind === 'waterline' ? 1 : kind === 'buttock' ? 0 : 2;
  const plan = hullPlan(VESSEL_DEFS.design);
  const start = kind === 'waterline' ? 0 : kind === 'buttock' ? 0 : plan.transom + (plan.stem - plan.transom) * CONFIG.shipyard.section.stationAt;
  return { min: hullMin[i], max: hullMax[i], start };
}
/** Where the plane is, in a naval architect's words. */
function sectionWords(kind: SectionKind, v: number): string {
  const m = (x: number) => `${Math.abs(x).toFixed(2)} m`;
  if (kind === 'waterline') return Math.abs(v) < 0.005 ? 'Waterline: the design waterline' : `Waterline: ${m(v)} ${v > 0 ? 'above' : 'below'} the design waterline`;
  if (kind === 'buttock') return Math.abs(v) < 0.005 ? 'Buttock: the centreline' : `Buttock: ${m(v)} to ${v > 0 ? 'starboard' : 'port'}`;
  const f = hullPlan(VESSEL_DEFS.design).transom - v;
  return `Station: ${m(f)} ${f >= 0 ? 'forward of' : 'aft of'} the transom`;
}
/** Put the plane where cut.at says (kept inside her), the slider and words to match. */
function setSection(kind: SectionKind): void {
  const r = sectionRange(kind);
  const v = THREE.MathUtils.clamp(cut.at[kind] ?? r.start, r.min, r.max);
  cut.at[kind] = v;
  // The side kept: below the waterline, to port of the buttock, aft of the station (bow is -z), or flipped.
  const n = kind === 'waterline' ? new THREE.Vector3(0, -1, 0) : kind === 'buttock' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, 1);
  if (cut.flip) n.negate();
  const at = new THREE.Vector3();
  at.setComponent(kind === 'waterline' ? 1 : kind === 'buttock' ? 0 : 2, v);
  sectionPlane.setFromNormalAndCoplanarPoint(n, at);
  const slider = $('secAt') as HTMLInputElement;
  Object.assign(slider, { min: String(r.min), max: String(r.max), step: String(CONFIG.shipyard.section.step) });
  slider.value = String(v);
  $('secLabel').textContent = sectionWords(kind, v);
}
function sectionTool(kind: SectionKind | null): void {
  const was = cut.kind;
  cut.kind = kind;
  sectionBtn.classList.toggle('on', !!kind);
  $('sectionPanel').hidden = !kind;
  $('sectionPanel').querySelectorAll<HTMLElement>('[data-cut]').forEach((b) => b.classList.toggle('on', b.dataset.cut === kind));
  if (kind) setSection(kind);
  if (!was !== !kind) applyCuts();
}
/** Square on to the cut face, flat, as a section is drawn. */
function lookAtCut(): void {
  if (!cut.kind) return;
  setView(SECTION_LOOK[cut.kind][cut.flip ? 1 : 0]);
  // Aimed at the cut; a station, filling the view with her section (she's far narrower than long).
  const v = cut.at[cut.kind]!;
  const mid = new THREE.Vector3().fromArray(hullMin).add(new THREE.Vector3().fromArray(hullMax)).multiplyScalar(0.5);
  const back = camera.position.clone().sub(orbit.target);
  const at = cut.kind === 'waterline' ? new THREE.Vector3(0, v, mid.z) : cut.kind === 'buttock' ? new THREE.Vector3(v, mid.y, mid.z) : new THREE.Vector3(0, mid.y, v);
  if (cut.kind === 'station') back.setLength(Math.max(hullMax[0] - hullMin[0], hullMax[1] - hullMin[1]) * 0.8 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  orbit.target.copy(at);
  camera.position.copy(at).add(back);
  orbit.update();
  if (!flat) flatBtn.click();
}
const sectionBtn = document.createElement('button');
sectionBtn.textContent = '✂ Section';
sectionBtn.className = 'tool';
sectionBtn.title = 'Cut her through: a waterline, a buttock or a station, anywhere along her';
sectionBtn.onclick = () => {
  if (cut.kind) return sectionTool(null);
  sectionTool('station');
  lookAtCut();
};
$('views').appendChild(sectionBtn);
$('sectionPanel').querySelectorAll<HTMLElement>('[data-cut]').forEach((b) => {
  b.onclick = () => {
    sectionTool(b.dataset.cut as SectionKind);
    lookAtCut();
  };
});
($('secAt') as HTMLInputElement).oninput = (e) => {
  if (!cut.kind) return;
  cut.at[cut.kind] = Number((e.target as HTMLInputElement).value);
  setSection(cut.kind);
};
$('secFlip').onclick = () => {
  cut.flip = !cut.flip;
  if (cut.kind) setSection(cut.kind);
  lookAtCut();
};
$('secLook').onclick = lookAtCut;
$('secOff').onclick = () => sectionTool(null);
let pendingPin: Frac | null = null;
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (tool === 'sketch') return startStroke(e);
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
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const click = !!downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5;
  // Placing by pointing: a click (not a drag to turn the view) puts it down, if it stands there.
  if (placing && click) return placeHere();
  // A click on a piece of her gear or furniture: pick it up to move it.
  if (!tool && click && hovered) return startPlacing(hovered);
  // A click (not a drag) on a pin: show it on the list.
  if (!tool && click) {
    const r = renderer.domElement.getBoundingClientRect();
    noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewCam());
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
/** A pin with a note (pins are notes only now: equipment is placed by pointing, placing.ts). */
function addPin(): void {
  if (!pendingPin) return;
  const text = ($('pinText') as HTMLInputElement).value.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!text) return void ($('pinText') as HTMLInputElement).focus();
  putMyNote({ id: noteId(link?.side?.me ?? ''), kind: 'pin', ...author(), t: Date.now(), at: pendingPin, text, done: false } satisfies Pin);
  pendingPin = null;
  setTool(null);
}
/** Turn a placed crane or winch a quarter turn on its spot. */
function turnGear(eq: Equipment): void {
  if (!eq.key) return;
  const at = placeOf(eq.key, design[eq.key]);
  if (at) change({ [eq.key]: placeValue(eq.key, at.x, at.fromTransom, at.face + 1) } as Partial<ShipDesign>);
  showOnHer();
}
const FACINGS: Record<string, string[]> = {
  craneAt: ['facing forward', 'facing to starboard', 'facing aft', 'facing to port'],
  winchAt: ['its wire leading aft', 'its wire leading to port', 'its wire leading forward', 'its wire leading to starboard'],
};
/** Where each piece stands when it's in its usual place (by its design choice). */
const USUAL: Record<string, string[]> = {
  deckCrane: ['', 'on the foredeck', 'on the aft deck'],
  searchlight: ['', 'on the wheelhouse roof', 'on a foredeck pole', 'on an aft deck pole'],
  fireMonitor: ['', 'on the wheelhouse roof', 'on a foredeck pole', 'on an aft deck pole'],
  towWinch: ['', 'on the aft deck'],
  sternRoller: ['', 'in the transom'],
  aFrame: ['', 'over the transom, with the net and a winch'],
  lifeRing: ['', 'port side of the wheelhouse', 'starboard side of the wheelhouse'],
  sideDoor: ['', "in the wheelhouse's port wall"],
  rodRack: ['', "on the wheelhouse's aft wall, port of the door", "on the wheelhouse's aft wall, starboard of the door", "on the wheelhouse's port wall", "on the wheelhouse's starboard wall"],
  skiff: SKIFFS.map((s) => s.toLowerCase()),
  skiff2: SKIFFS.map((s) => s.toLowerCase()),
};
/** Take a piece off her. */
function takeOff(eq: Equipment): void {
  // (The first ship's boat off with a second aboard: the second becomes the first, where she is.)
  if (eq.id === 'skiff' && design.skiff2) return change({ skiff: design.skiff2, rescueBoat: design.rescueBoat2, skiff2: 0, rescueBoat2: 0 });
  change(removeGear(eq));
}
/** Where a fitted piece is, in words (its usual place, where it was pinned; left off for want of room). */
function whereOnHer(eq: Equipment): string {
  const v = design[eq.field] ?? 0;
  const at = eq.key ? boat.placed[eq.key] : undefined;
  // Fitted but left off for want of room (the builder says so in her warnings).
  const short = eq.id === 'anchor' ? 'anchor' : eq.id === 'sideDoor' ? 'side door' : '';
  // (A ship's boat's: her cradle's warning, the second's saying so.)
  const mine = (w: string) => (eq.how === 'skiff' ? /cradle/.test(w) && /second ship/.test(w) === (eq.id === 'skiff2') : !!short && w.toLowerCase().includes(short));
  const leftOff = boat.warnings.some((w) => mine(w) && /left off/i.test(w)) ? ' (no room: left off, see the warnings)' : '';
  const ramp = DESIGN_HULLS[design.hull].ramp;
  if (eq.id === 'anchor') return (ramp ? 'a kedge at the stern (her bow is the ramp)' : 'at the bow roller') + leftOff;
  if (eq.key && design[eq.key] && at) return `${USUAL[eq.id]?.[v] ?? ''}, where you put it: ${at.x === 0 ? 'on the centreline' : `${Math.abs(at.x).toFixed(2)} m to ${at.x < 0 ? 'port' : 'starboard'}`}`;
  return (USUAL[eq.id]?.[v] ?? '') + leftOff;
}
/** Groups the player has closed (kept while the page is open). */
const closedGroups = new Set<string>();
/** The Deck gear step's menu: her equipment by group, each a card with its state and actions. */
function showOnHer(): void {
  showFurniture();
  const menu = document.getElementById('gearMenu');
  if (!menu) return;
  menu.innerHTML = '';
  for (const g of GEAR_GROUPS) {
    // (Not a one-off's fixed gear, the harbour tug's bow winch, stern roller and the rest: DesignHull.fixed.)
    const fixed = DESIGN_HULLS[design.hull]?.fixed ?? {};
    // (The second ship's boat only once she's aboard: she's placed from the first's card.)
    const items = g.items.map((id) => equipmentOf(id)!).filter((eq) => eq && !(eq.field in fixed) && (eq.id !== 'skiff2' || fitted(eq, design)));
    if (!items.length) continue;
    const on = items.filter((eq) => fitted(eq, design)).length;
    const det = document.createElement('details');
    det.className = 'gearGroup';
    det.open = !closedGroups.has(g.name);
    det.ontoggle = () => (det.open ? closedGroups.delete(g.name) : closedGroups.add(g.name));
    det.innerHTML = `<summary><span>${esc(g.name)}</span><span class="meta">${on ? `${on} of ${items.length} fitted` : 'none fitted'}</span></summary>`;
    for (const eq of items) {
      const has = fitted(eq, design);
      const kind = gearKind(eq);
      const card = document.createElement('div');
      card.className = `gearCard${has ? ' fitted' : ''}`;
      card.innerHTML = `${GEAR_ICONS[eq.id] ?? ''}<div class="gearText"><b>${esc(eq.name)}</b><span class="meta">${esc(GEAR_ABOUT[eq.id] ?? '')}</span><span class="gearState">${has ? `✓ On her: ${esc(whereOnHer(eq))}` : 'Not fitted'}</span></div><div class="gearActs"></div>`;
      cardAbout(card);
      const acts = card.querySelector('.gearActs')!;
      const button = (text: string, title: string, go: () => void, primary = false) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.title = title;
        if (primary) b.className = 'primary';
        b.onclick = go;
        acts.appendChild(b);
        return b;
      };
      if (kind === 'place') {
        const b = button(has ? 'Move' : 'Place', `Then point at her: a green copy where it stands, red where it won't; click where it goes. (Or click it on her to move it.)`, () => startPlacing({ kind: 'gear', eq }), !has);
        b.dataset.place = eq.id;
        if (placing?.target.kind === 'gear' && placing.target.eq === eq) b.classList.add('on');
        const at = has && eq.key && eq.turns ? placeOf(eq.key, design[eq.key]) : null;
        if (at) button('Turn ↻', `A quarter turn on its spot (now ${FACINGS[eq.key!][at.face]})`, () => turnGear(eq));
      } else if (!has) button('Fit', `Fit it: it goes ${USUAL[eq.id]?.[1] ?? 'in its place'}${eq.id === 'anchor' ? ' (or a kedge at the stern on a ramp-bow boat)' : ''}`, () => change(placeGear(eq, [0, 0, 0], undefined, 0).patch), true);
      // A second ship's boat on her own crane (owner, 28 Oct 2026: "a button which says place
      // another, obviously for bigger vessels"), the other boat to start with.
      const another = equipmentOf('skiff2');
      if (eq.id === 'skiff' && has && another && !fitted(another, design) && boat.figures.lengthM >= CONFIG.shipyard.secondBoatMinLength)
        button('Place another', `A second ship's boat on her own crane (the ${design.rescueBoat ? 'dinghy' : 'rescue boat'} to start with; pick which below): point at her, and click on the deck where she goes`, () => {
          change({ rescueBoat2: design.rescueBoat ? 0 : 1 });
          startPlacing({ kind: 'gear', eq: another });
        });
      if (has) button('Take off', 'Take it off her (and its pin, if it has one)', () => takeOff(eq));
      det.appendChild(card);
    }
    menu.appendChild(det);
  }
}
/**
 * Click on her where a piece of furniture goes (its field `key`: a new one's, or one on her to
 * move it), on the Furniture step's view from above (furnitureView).
 */
function furnitureTool(key: FurnitureKey): void {
  startPlacing({ kind: 'furniture', key });
}
/** Where a piece of furniture is, in words (its place's label), or that it didn't fit. */
function furnitureWhere(key: FurnitureKey): string {
  const { kind, i } = slotOf(key);
  const placed = boat.placed[key];
  if (placed === null) return 'no room where you put it: left off (see Needs attention)';
  const label = boat.hull.sockets.find((s) => s.id === furnitureSocketId(kind, i))?.label ?? '';
  return `${label.split(':')[0].toLowerCase()}${placed?.moved ? ' (moved along the wall to fit)' : ''}`;
}
/** The Furniture step: a card a piece (Add another while she has room for one), each one on her under it (Move, Take off). */
function showFurniture(): void {
  const menu = document.getElementById('furnMenu');
  if (!menu) return;
  menu.innerHTML = '';
  for (const { kind, name } of FURNITURE_MENU) {
    const on = placedOf(kind, design);
    const next = nextSlot(kind, design);
    const card = document.createElement('div');
    card.className = `gearCard furnCard${on.length ? ' fitted' : ''}`;
    card.innerHTML = `${GEAR_ICONS[kind] ?? ''}<div class="gearText"><b>${esc(name)}</b><span class="meta">${esc(GEAR_ABOUT[kind] ?? '')}</span><span class="gearState">${on.length ? `✓ ${on.length} on her` : 'None on her'}</span></div><div class="gearActs"></div><div class="furnList"></div>`;
    cardAbout(card);
    const button = (box: Element, text: string, title: string, go: () => void, primary = false) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = title;
      if (primary) b.className = 'primary';
      b.onclick = go;
      box.appendChild(b);
      return b;
    };
    const acts = card.querySelector('.gearActs')!;
    const add = button(acts, on.length ? 'Add another' : 'Add', `Then click on her where it goes`, () => next && furnitureTool(next), true);
    if (!next) {
      add.disabled = true;
      add.title = kind === 'head' ? 'One head a boat' : `${FURNITURE_SLOTS[kind].length} is the most of a piece`;
    }
    if (placing?.target.kind === 'furniture' && placing.target.key === next) add.classList.add('on');
    const list = card.querySelector('.furnList')!;
    for (const key of on) {
      const { i } = slotOf(key);
      const row = document.createElement('div');
      row.className = 'furnItem';
      row.innerHTML = `<span><b>${esc(furnitureName(kind, i)[0].toUpperCase() + furnitureName(kind, i).slice(1))}</b> <span class="meta">${esc(furnitureWhere(key))}</span></span><span class="gearActs"></span>`;
      const ra = row.querySelector('.gearActs')!;
      const mv = button(ra, 'Move', 'Then click on her where it goes instead', () => furnitureTool(key));
      if (placing?.target.kind === 'furniture' && placing.target.key === key) mv.classList.add('on');
      // A seat turns (owner, Oct 2026: "those seats to be rotatable"): 45 degrees clockwise a press.
      if (kind === 'seat') button(ra, 'Turn', 'Turn it 45° clockwise (seen from above)', () => change(turnSeat(key, design)));
      button(ra, 'Take off', 'Take it off her (the ones after it move up a number)', () => change(removeFurniture(key, design)));
      list.appendChild(row);
    }
    menu.appendChild(card);
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

// ── Sketching on her views (planeSketch.ts): one sheet of glass per square-on view ──
const SKETCH_VIEWS = ['Port', 'Starboard', 'Plan', 'Bow', 'Stern'];
/** Where the view was before a sketch was opened: closing it goes back there. */
let beforeSketch: { eye: THREE.Vector3; at: THREE.Vector3; flat: boolean } | null = null;
/** Open a view's sketch (the one being looked at, else starboard): the view square on and flat, the pen on. */
function openSketch(p: PlaneName | null = facingPlane()): void {
  if (tool !== 'sketch') beforeSketch = { eye: camera.position.clone(), at: orbit.target.clone(), flat };
  setTool('sketch');
  setView(PLANES[p ?? 'side'].title);
  if (!flat) flatBtn.click();
  drawInk();
}
/** Close the sketch: back to the view as it was before it was opened. */
function closeSketch(): void {
  const back = beforeSketch;
  beforeSketch = null;
  setTool(null);
  if (!back) return;
  if (flat !== back.flat) flatBtn.click();
  look(back.eye.toArray(), back.at.toArray());
}
const planeInk = new PlaneInk();
scene.add(planeInk.group);
/** The view plane being looked at square on, if any (the ink shows only there). */
function facingPlane(): PlaneName | null {
  return planeFacing(orbit.target.clone().sub(camera.position));
}
/** The stroke being drawn here (shared as it grows). */
let stroke: Ink | null = null;
let strokeSent = 0;
let inkFacing: PlaneName | null = null;
/** Draw the strokes for the view being looked at (and the one being drawn). */
function drawInk(): void {
  inkFacing = facingPlane();
  const inks = notes.filter((n): n is Ink => n.kind === 'ink' && isPlaneSheet(n.sheet));
  // Only while a sketch is open (owner): the plain 3D view never shows them.
  planeInk.draw(stroke && !inks.some((n) => n.id === stroke!.id) ? [...inks, stroke] : inks, tool === 'sketch' ? inkFacing : null, tool === 'sketch', hullMin, hullMax);
  showSketches(); // which one's open
}
/** Where the pointer meets the view's sheet of glass (boat axes), if it does. */
function onGlass(e: PointerEvent, p: PlaneName): THREE.Vector3 | null {
  const r = renderer.domElement.getBoundingClientRect();
  noteRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewCam());
  const n = new THREE.Vector3();
  n.setComponent(PLANES[p].normal, 1);
  return noteRay.ray.intersectPlane(new THREE.Plane(n, -planeAt(p, hullMin, hullMax)), new THREE.Vector3());
}
function startStroke(e: PointerEvent): void {
  const p = facingPlane();
  const at = p && onGlass(e, p);
  if (!p || !at) return;
  renderer.domElement.setPointerCapture(e.pointerId);
  stroke = { id: noteId(side().me), kind: 'ink', ...author(), t: Date.now(), sheet: planeSheet(p), pts: [toPlane(p, at.toArray(), hullMin, hullMax)] };
  strokeSent = performance.now();
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const p = facingPlane();
  const at = p && planeSheet(p) === stroke.sheet ? onGlass(e, p) : null;
  if (!p || !at) return;
  const uv = toPlane(p, at.toArray(), hullMin, hullMax);
  const last = stroke.pts[stroke.pts.length - 1];
  if (Math.hypot(uv[0] - last[0], uv[1] - last[1]) < 0.004 || stroke.pts.length >= MAX_POINTS) return;
  stroke = { ...stroke, pts: [...stroke.pts, uv] };
  // Shared as it's drawn (owner: sketch together in real time): the same note, sent again.
  if (stroke.pts.length >= 2 && performance.now() - strokeSent > CONFIG.shipyard.sketchShareMs) {
    strokeSent = performance.now();
    putMyNote(stroke);
  } else drawInk();
});
const endStroke = () => {
  if (!stroke) return;
  const done = stroke;
  stroke = null;
  if (done.pts.length >= 2) putMyNote(done);
  else drawInk();
};
renderer.domElement.addEventListener('pointerup', endStroke);
renderer.domElement.addEventListener('pointercancel', endStroke);

// ── Sketches (notes.ts sheets and ink; sheetEditor.ts): flat pictures to draw on ──
const sheetEditor = new SheetEditor({
  sheet: (id) => notes.find((n): n is Sheet => n.kind === 'sheet' && n.id === id),
  ink: (id) => inkOf(notes, id),
  author: () => author(),
  addInk: (sheet, pts) => putMyNote({ id: noteId(side().me), kind: 'ink', ...author(), t: Date.now(), sheet, pts } satisfies Ink),
  dropInk: (id) => dropMyNote(id),
});
/** The list of sketches (right-hand column): a thumbnail each; click to open. */
function showSketches(): void {
  const box = $('sketches');
  const list = sheetsOf(notes);
  const planes = (Object.keys(PLANES) as PlaneName[]).map((p) => [p, inkOf(notes, planeSheet(p))] as const).filter(([, n]) => n.length);
  box.innerHTML = list.length || planes.length ? '' : '<div class="meta">Press ✏ Sketch on the view to draw on her port, starboard, plan, bow or stern view.</div>';
  // Her views' sketches: click to open one (the view goes to it), ✏ Sketch to close it.
  for (const [p, ink] of planes) {
    const row = document.createElement('div');
    row.className = 'sketch plane';
    const who = [...new Set(ink.map((n) => n.by))].join(', ');
    const open = tool === 'sketch' && facingPlane() === p;
    row.innerHTML = `<div class="planeIcon">✏</div><div><b>${PLANES[p].title} view${open ? ' (open)' : ''}</b><div class="meta">${esc(who)} · ${ink.length} stroke${ink.length === 1 ? '' : 's'}</div></div>`;
    row.onclick = () => (open ? closeSketch() : openSketch(p));
    box.appendChild(row);
  }
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
/**
 * Go to a step of the design flow. In a session everyone moves together (owner: the steps
 * didn't keep in step): `share` sends it to the others; a step that came from someone else
 * isn't sent back.
 */
function goStep(to: number | string, share = true): void {
  const els = stepEls();
  const i = typeof to === 'number' ? to : els.findIndex((e) => e.dataset.step === to);
  if (i < 0 || i >= els.length) return;
  if (share) {
    side().setStep(els[i].dataset.step!);
    $('flowWho').textContent = '';
  }
  stepAt = i;
  seen.add(els[i].dataset.step!);
  els.forEach((e, k) => e.classList.toggle('on', k === i));
  stepBody.scrollTop = 0;
  ($('stepBack') as HTMLButtonElement).disabled = i === 0;
  const next = $('stepNext') as HTMLButtonElement;
  next.disabled = i === els.length - 1;
  next.textContent = i < els.length - 1 ? `Next: ${els[i + 1].dataset.title} →` : 'Next →';
  try {
    sessionStorage.setItem(STEP_KEY, els[i].dataset.step!);
  } catch {
    /* fine */
  }
  showStepNav();
  focusStep();
  // Arriving at Engine: look at her machinery.
  if (els[i].dataset.step === 'engine' && shownStep !== 'engine') frameMachinery();
  // Arriving at Controls: her console from behind the wheel, laid out in a panel under the view (showConsoleEditor).
  $('consolePanel').hidden = els[i].dataset.step !== 'controls';
  if (els[i].dataset.step === 'controls' && shownStep !== 'controls') frameConsole();
  // Arriving at Paint: all of her, hull, house and roof, from her bow quarter.
  if (els[i].dataset.step === 'paint' && shownStep !== 'paint') setView('Bow ¾');
  if (els[i].dataset.step !== 'controls' && camera.fov !== USUAL_FOV) {
    camera.fov = USUAL_FOV;
    camera.updateProjectionMatrix();
  }
  shownStep = els[i].dataset.step!;
  // The Furniture step: her from above, cut just over the floor, while it's open (furnitureView).
  if (tool && shownStep !== 'furniture') setTool(null);
  furnitureView(shownStep === 'furniture');
  if (shownStep === 'furniture' && !tool) $('toolHint').textContent = FURNITURE_HINT;
  else if (!tool && $('toolHint').textContent === FURNITURE_HINT) $('toolHint').textContent = '';
}
function showStepNav(): void {
  const nav = $('stepNav');
  nav.innerHTML = '';
  const verdict = briefVerdict();
  stepEls().forEach((e, i) => {
    const b = document.createElement('button');
    b.className = `${i === stepAt ? 'on' : ''} ${seen.has(e.dataset.step!) ? 'seen' : ''}`;
    const flag = e.dataset.step === 'handover' && verdict !== null ? `<span class="flag">${verdict ? '✓' : '✗'}</span>` : '';
    // (An open boat, the RIB's, has a console where the others have a wheelhouse.)
    const title = e.dataset.step === 'wheelhouse' && DESIGN_HULLS[design.hull]?.open ? 'Console' : e.dataset.title;
    b.innerHTML = `<span class="n">${i + 1}</span>${title}${flag}`;
    b.onclick = () => goStep(i);
    if (i > 0) {
      const a = document.createElement('span');
      a.className = 'arrow';
      a.textContent = '›';
      nav.appendChild(a);
    }
    nav.appendChild(b);
  });
}
$('stepBack').onclick = () => goStep(stepAt - 1);
$('stepNext').onclick = () => goStep(stepAt + 1);

// ── The brief (brief.ts): what she's for, her targets, checked all the way ──
let brief: Brief = startDoc.brief ?? newBrief();
// Opened from a link with her name in it (and no session of its own): her name.
if (!sessionId && 'design' in fromHash && fromHash.name) brief = { ...brief, name: fromHash.name };
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
  showHullCards();
}
/** Each hull type's picture from the side (rendered once, as the gallery first shows). */
const hullPics = new Map<number, string>();
let hullPicsStarted = false;
/**
 * The first step: the hull types on cards (hullCards.ts; owner, Oct 2026: "you see the
 * different hull types and what they're suitable for, instead of this design brief
 * document"), each with what it's made for, three measured figures and, if a brief is set,
 * whether it can meet it (typeFit.ts).
 */
function showHullCards(): void {
  const grid = $('hullGrid');
  grid.innerHTML = '';
  const any = brief.jobs.length || brief.speedKn || brief.rangeNm || brief.budget;
  const ranked = rankTypes(brief);
  for (const c of hullCards()) {
    const k = ranked.findIndex((t) => t.hull === c.hull);
    const t = ranked[k];
    const verdict = !any || !t ? '' : t.misses ? `${t.misses} target${t.misses === 1 ? '' : 's'} short` : k === 0 ? 'Best for the brief' : 'Meets the brief';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `hullCard${brief.hull === c.hull && design.hull === c.hull ? ' on' : ''}`;
    const pic = hullPics.get(c.hull);
    const tags = (label: string, list: string[], kind: string) => (list.length ? `<div class="tags"><span class="lbl">${label}</span>${list.map((x) => `<span class="tag ${kind}">${esc(x)}</span>`).join('')}</div>` : '');
    el.innerHTML = `<div class="pic">${pic ? `<img alt="${esc(c.title)} from the side" src="${pic}">` : '<span class="meta">drawing her…</span>'}</div><div class="body"><div class="head"><b>${esc(c.title)}</b>${verdict ? `<span class="verdict ${t!.misses ? 'bad' : 'ok'}">${esc(verdict)}</span>` : ''}</div><div class="sub">${esc(c.sub)}</div>${tags('Made for', c.roles.main, 'main')}${tags('Also', c.roles.light, 'light')}<div class="figs">${c.figures.map((f) => `<span><span class="meta">${esc(f.label)}</span>${esc(f.value)}</span>`).join('')}</div></div>`;
    el.title = `Start from the ${c.title.toLowerCase()}`;
    el.onclick = () => void pickHull(c.hull);
    grid.appendChild(el);
  }
  if (!hullPicsStarted && !$('hullGallery').hidden) drawHullPictures();
}
/** Render each type's picture, one at a time (each builds her boat), filling the cards in as they come. */
function drawHullPictures(): void {
  hullPicsStarted = true;
  const todo = hullCards().map((c) => c.hull);
  const next = () => {
    const hull = todo.shift();
    if (hull === undefined) return;
    try {
      const { root } = boatFor({ ...DEFAULT_DESIGN, ...bareHull(hull, (i) => DESIGN_HULLS[i].defaults) } as ShipDesign);
      hullPics.set(hull, profileShot(root));
    } catch {
      /* no picture: the card says "drawing her…" still, and works */
    }
    showHullCards();
    window.setTimeout(next, 30);
  };
  window.setTimeout(next, 60);
}
/** Her profile from starboard (bow to the right), filling a card's picture, on the cards' own colour. */
function profileShot(root: THREE.Object3D): string {
  const W = 640;
  const H = 240;
  const box = new THREE.Box3().setFromObject(root);
  const mpp = Math.max(((box.max.z - box.min.z) * 1.08) / W, ((box.max.y - box.min.y) * 1.12) / H);
  const mid = box.getCenter(new THREE.Vector3());
  cmpRenderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  cmpRenderer.setSize(W, H);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x1c2a34);
  sc.add(new THREE.HemisphereLight(0xe8f0f8, 0x55606a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(8, 14, -6);
  sc.add(sun, root);
  const cam = new THREE.OrthographicCamera((-W / 2) * mpp, (W / 2) * mpp, (H / 2) * mpp, (-H / 2) * mpp, 0.1, 200);
  cam.position.set(60, mid.y, mid.z);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, mid.y, mid.z);
  cmpRenderer.render(sc, cam);
  const url = cmpRenderer.domElement.toDataURL('image/png');
  sc.remove(root);
  root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return url;
}
/**
 * Start from a hull type (a card clicked): her bare hull with her type's usual engine, then on
 * to the Hull step. With targets in the brief, her engines are tried by trial first and the
 * one that does it fitted (startFrom), the card's step waiting for it.
 */
async function pickHull(hull: number): Promise<void> {
  const targets = brief.speedKn || brief.rangeNm || brief.budget || brief.jobs.includes('towing');
  if (targets) await startFrom(hull);
  else {
    ++searchRun;
    setBrief({ hull });
    change(bareHull(hull, (i) => DESIGN_HULLS[i].defaults));
    sizeDeck();
    $('suggestMsg').textContent = '';
  }
  if (stepEls()[stepAt]?.dataset.step === 'brief') goStep('hull');
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
    engineShortM: boat.figures.engineShortM,
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
    const on = (e: MessageEvent<{ id: number; trials?: SeaTrialResults; matched?: boolean }>) => {
      if (e.data.id !== id || e.data.matched) return; // (her gearbox matched: the trials still to come)
      searchWorker.removeEventListener('message', on);
      resolve(e.data.trials ?? null);
    };
    searchWorker.addEventListener('message', on);
    searchWorker.postMessage({ id, design: d, match: true });
  });
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
  // (Only the engine fits that go under her deck: a tall engine in a shallow hull isn't offered.)
  const fits = engineOptions()
    .map((fit) => ({ fit, built: buildDesign({ ...base, ...fit }) }))
    .filter((f) => f.built.figures.engineShortM <= 0);
  for (const [k, { fit, built }] of fits.entries()) {
    msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}. Trying her engines on trial: ${k + 1} of ${fits.length}…`;
    const d = { ...base, ...fit };
    const t = await trialOf(d, run * 100 + k);
    if (run !== searchRun) return; // asked again
    if (t) tried.push({ fit, topSpeedKn: t.topSpeedKn, rangeNm: t.speedTable.at(-1)?.rangeNm ?? 0, price: built.figures.price, bollardT: t.bollard.aheadKN / 9.81 });
  }
  const best = pickEngine(brief, tried);
  // Only if she's still the boat the trials were for (nobody has changed her hull since).
  if (!best || diffFields(design, base).some((k) => k !== 'engine' && k !== 'twin')) {
    msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}. She was changed while her engines were tried: start again to fit one.`;
    return;
  }
  change(best.fit);
  const name = `${best.fit.twin ? 'twin ' : ''}${ENGINES[best.fit.engine ?? 0].name}`;
  msg.innerHTML = `<b>Started:</b> a bare ${esc(h)}, ${esc(name)}: ${best.topSpeedKn.toFixed(1)} kn, ${best.rangeNm.toFixed(0)} nm, £${best.price.toLocaleString('en-GB')} (${tried.length} engine fits tried; the cheapest that does the job). Next: shape her hull and wheelhouse, then place her equipment where you want it (Deck gear).`;
}

// The together box opens from the header.
$('togetherBtn').onclick = () => {
  $('togetherPop').hidden = !$('togetherPop').hidden;
  $('projectsPop').hidden = true;
};

// ── Projects (projects.ts): all of this work, kept by name; a new design; a saved one again ──
function currentProject(): string {
  try {
    return storage()?.getItem(PROJECT_KEY) ?? '';
  } catch {
    return '';
  }
}
/** Nothing worth keeping: the default design, a fresh brief, no variants, pins or sketches. */
function isBlank(doc: YardDoc): boolean {
  const fresh = newBrief();
  return doc.variants.length === 1 && !doc.variants[0].notes.length && !diffFields(doc.variants[0].design, DEFAULT_DESIGN).length && (!doc.brief || JSON.stringify(doc.brief) === JSON.stringify(fresh));
}
/** Save this work as a project, under her name (a new picture of her with `withPicture`). Returns the name, or null if it wouldn't save. */
function saveProject(withPicture = true): string | null {
  const doc = side().doc();
  // Her name; if another project has it (not the one this work came from), numbered, so it isn't overwritten.
  const base = cleanName(brief.name ?? '', defaultName());
  const taken = new Set(readProjects(storage()).map((x) => x.name.toLowerCase()));
  let name = base;
  for (let k = 2; taken.has(name.toLowerCase()) && name !== currentProject(); k++) name = `${base} (${k})`;
  const pins = doc.variants.reduce((n, v) => n + v.notes.filter((x) => x.kind === 'pin').length, 0);
  const sketches = doc.variants.reduce((n, v) => n + v.notes.filter((x) => x.kind === 'sheet').length, 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const summary = [`${DESIGN_HULLS[doc.variants[0].design.hull].name.split(':')[0].trim()} ${boat.figures.lengthM.toFixed(1)} m`, doc.variants.length > 1 ? plural(doc.variants.length - 1, 'variant') : '', pins ? plural(pins, 'pin') : '', sketches ? plural(sketches, 'sketch').replace('sketchs', 'sketches') : ''].filter(Boolean).join(' · ');
  const kept = readProjects(storage()).find((x) => x.name === currentProject())?.picture ?? '';
  const p: Project = { name, savedAt: Date.now(), picture: withPicture && active === MAIN ? picture() : kept, summary, doc };
  // (Renamed at the top: the project takes her new name, not a second copy.)
  const list = saveAs(readProjects(storage()), p, currentProject());
  // Storage full: drop the oldest projects' pictures, then the oldest projects, before giving up.
  const ok = writeProjects(storage(), list) || writeProjects(storage(), list.map((x, i) => (i ? { ...x, picture: '' } : x))) || writeProjects(storage(), list.slice(0, 5));
  if (!ok) return null;
  try {
    storage()?.setItem(PROJECT_KEY, name);
  } catch {
    /* only the mark in the list */
  }
  return name;
}
/** Leave this work for `doc` (a new design, or a saved project): this work saved first, then the page starts again on `doc`. */
function switchProject(doc: YardDoc, name: string): void {
  const msg = $('projMsg');
  if (sessionId) {
    msg.textContent = 'You’re designing together: leave the session first (👥), then start a new design or open another.';
    return;
  }
  if (!isBlank(side().doc()) && !currentProject()) {
    if (!confirm('This scratch boat isn’t saved: leave her? (Press 💾 Save first to keep her.)')) return;
  } else if (!isBlank(side().doc())) {
    const kept = saveProject();
    if (!kept) {
      msg.textContent = 'This browser won’t save (storage full or switched off), so this work would be lost: delete an old project, or copy her code first.';
      return;
    }
  }
  clearTimeout(saveTimer);
  try {
    storage()?.setItem(SESSION_KEY('solo'), JSON.stringify({ ...doc, savedAt: Date.now() }));
    storage()?.setItem(PROJECT_KEY, name);
    sessionStorage.removeItem(STEP_KEY);
    markProjectOpen();
  } catch {
    msg.textContent = 'This browser won’t save, so it can’t switch designs.';
    return;
  }
  // Start the page again on it (no code in the address, which would replace her design).
  location.replace(location.pathname);
}
function showProjects(): void {
  const box = $('projList');
  const list = readProjects(storage());
  const now = currentProject();
  box.innerHTML = list.length ? '' : '<div class="meta">No projects saved yet.</div>';
  for (const p of list) {
    const card = document.createElement('div');
    card.className = `fav${p.name === now ? ' current' : ''}`;
    const when = new Date(p.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `${p.picture ? `<img alt="" src="${p.picture}">` : '<div class="nopic"></div>'}<div><b title="${esc(p.name)}">${esc(p.name)}</b><div class="meta">${esc(p.summary)}</div><div class="meta">${when}${p.name === now ? ' · open now' : ''}</div><div class="acts"><button data-act="open">Open</button><button data-act="del">Delete</button></div></div>`;
    card.querySelector<HTMLElement>('[data-act=open]')!.onclick = () => switchProject(p.doc, p.name);
    card.querySelector<HTMLElement>('[data-act=del]')!.onclick = () => {
      if (!confirm(`Delete the project “${p.name}”? Its pins, sketches and variants go with it.`)) return;
      writeProjects(storage(), removeProject(readProjects(storage()), p.name, p.savedAt));
      showProjects();
    };
    box.appendChild(card);
  }
}
$('projectsBtn').onclick = () => {
  $('projectsPop').hidden = !$('projectsPop').hidden;
  $('togetherPop').hidden = true;
  if (!$('projectsPop').hidden) showProjects();
};
$('projClose').onclick = () => closeProject();
/** A scratch boat (no project) to a project, by her name (asked for if she has none): she then saves herself as you work. */
function saveScratch(): void {
  if (sessionId) return;
  const n = (brief.name ?? '').trim() || prompt('Her name, for the project:', defaultName())?.trim();
  if (!n) return;
  if (n !== brief.name) setBrief({ name: n });
  const kept = saveProject();
  $('projState').textContent = kept ? `“${kept}”, saved as you work` : 'This browser won’t save (storage full or switched off): delete an old project, or copy her code.';
  showSaved();
}
$('saveBtn').onclick = saveScratch;
/** The 💾 Save button (only on a scratch boat, on your own) and the Projects box's line on this work. */
function showSaved(): void {
  const scratch = !sessionId && !currentProject();
  $('saveBtn').hidden = !scratch;
  $('projState').textContent = scratch ? 'A scratch boat: not saved. Press 💾 Save to keep her as a project.' : currentProject() ? `“${currentProject()}”, saved as you work` : $('projState').textContent;
}

/** Does this tab have a project open (see OPEN_KEY)? */
function tabHasProject(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markProjectOpen(): void {
  try {
    sessionStorage.setItem(OPEN_KEY, '1');
  } catch {
    /* the tab won't remember it: a reload shows the start screen, the work is still kept */
  }
}
/**
 * Opened afresh: what this browser left on the table (the last design, as it kept it) goes
 * into its project, or a new "Unsaved work" one, and the table is cleared.
 */
function keepWorkLeftOnTable(): void {
  const store = storage();
  const doc = readDocCopy('solo');
  try {
    // (A scratch boat, no project, isn't kept: owner, Oct 2026.)
    if (doc && !isBlank(doc) && currentProject()) {
      const d = doc.variants[0].design;
      const summary = `${DESIGN_HULLS[d.hull]?.name.split(':')[0].trim() ?? 'A boat'}${doc.variants.length > 1 ? ` · ${doc.variants.length - 1} variant${doc.variants.length > 2 ? 's' : ''}` : ''}`;
      writeProjects(store, keepLeftWork(readProjects(store), doc, currentProject(), Date.now(), summary));
    }
    localStorage.removeItem(SESSION_KEY('solo'));
    localStorage.removeItem(PROJECT_KEY);
  } catch {
    /* storage off: nothing was kept to clear */
  }
}
let pictureAt = 0;
/** The project saves itself as you work: her picture now and then (it takes a render). */
function autosaveProject(): void {
  const withPicture = performance.now() - pictureAt > 60000;
  if (withPicture) pictureAt = performance.now();
  const name = saveProject(withPicture);
  $('projState').textContent = name ? `“${name}”, saved as you work` : 'This browser won’t save (storage full or switched off): delete an old project, or copy her code.';
}
/** Close the project: saved, then the page starts again with no project (the start screen). */
function closeProject(): void {
  if (sessionId) {
    $('projMsg').textContent = 'You’re designing together: leave the session first (👥).';
    return;
  }
  clearTimeout(saveTimer);
  if (!currentProject()) {
    if (!isBlank(side().doc()) && !confirm('This scratch boat isn’t saved: close her and lose her? (Press 💾 Save first to keep her.)')) return;
  } else if (!saveProject()) {
    if (!confirm('This browser won’t save (storage full or switched off), so this work would be lost. Close it anyway?')) return;
  }
  try {
    localStorage.removeItem(SESSION_KEY('solo'));
    localStorage.removeItem(PROJECT_KEY);
    sessionStorage.removeItem(OPEN_KEY);
    sessionStorage.removeItem(STEP_KEY);
  } catch {
    /* nothing kept to clear */
  }
  location.replace(location.pathname);
}
/**
 * The start screen (owner, Oct 2026): a new project (name her), a saved one, or one started
 * from a favourite. Nothing of the last design is on the table until you choose.
 */
function showStartScreen(): void {
  const pop = $('yardStart');
  pop.hidden = false;
  const name = $('startName') as HTMLInputElement;
  const go = () => {
    markProjectOpen();
    pop.hidden = true;
    const n = name.value.trim();
    // Named, she's a project from the start; unnamed, a scratch boat, kept by nobody until 💾 Save (owner, Oct 2026).
    try {
      localStorage.removeItem(PROJECT_KEY);
    } catch {
      /* nothing to clear */
    }
    if (n) setBrief({ name: n });
    goStep(0);
    if (n) saveProject();
    saveSessionCopy();
    showSaved();
  };
  $('startNew').onclick = go;
  name.onkeydown = (e) => {
    if (e.key === 'Enter') go();
  };
  const card = (picture: string, title: string, lines: string[], open: () => void, del?: () => void) => {
    const c = document.createElement('div');
    c.className = 'fav startCard';
    c.innerHTML = `${picture ? `<img alt="" src="${picture}">` : '<div class="nopic"></div>'}<div><b title="${esc(title)}">${esc(title)}</b>${lines.map((l) => `<div class="meta">${esc(l)}</div>`).join('')}<div class="acts"><button data-act="open" class="primary">Open</button>${del ? '<button data-act="del">Delete</button>' : ''}</div></div>`;
    c.querySelector<HTMLElement>('[data-act=open]')!.onclick = open;
    if (del) c.querySelector<HTMLElement>('[data-act=del]')!.onclick = del;
    return c;
  };
  const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fill = () => {
    const projects = readProjects(storage());
    const box = $('startProjects');
    box.innerHTML = projects.length ? '' : '<div class="meta">No projects yet: start a new one.</div>';
    for (const p of projects)
      box.appendChild(
        card(p.picture, p.name, [p.summary, when(p.savedAt)], () => switchProject(p.doc, p.name), () => {
          if (!confirm(`Delete the project “${p.name}”? Its pins, sketches and variants go with it.`)) return;
          writeProjects(storage(), removeProject(readProjects(storage()), p.name, p.savedAt));
          fill();
        }),
      );
    const favs = readFavourites(storage());
    $('startFavsHead').hidden = !favs.length;
    const fbox = $('startFavs');
    fbox.innerHTML = '';
    for (const f of favs) {
      const read = readDesign(f.code);
      if (!('design' in read)) continue;
      // A new project from it, named as the favourite (a number added if a project has the name).
      fbox.appendChild(card(f.picture, f.name, [f.summary], () => switchProject(newDoc(read.design), f.name)));
    }
  };
  fill();
  name.focus();
}

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
  onGo: (go, by) => {
    // Someone pressed "Try her together": into the game in her, joining their game.
    const who = people.find((p) => p.id === by)?.name ?? 'Someone';
    $('sessionState').textContent = `${who} is taking everyone into the game…`;
    location.assign(gameUrl(go.design, `&together=${go.room}`));
  },
  onBrief: (b) => {
    brief = b ?? newBrief();
    showBrief();
    saveSessionCopy();
  },
  onStep: (s, by) => {
    // Someone moved the session on (or back): everyone's on the same step.
    const who = by ? people.find((p) => p.id === by)?.name : null;
    goStep(s, false);
    $('flowWho').textContent = who ? `${who} moved everyone here` : '';
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
  root.add(buildVesselMesh(def.hull, def.layout, wetOutlet(def), def.livery));
  const view = assembleView(RECIPES.design, def, LIBRARY);
  root.add(new BoatView('design', def, view, true).root);
  showDisplays(view, def);
  addSkiff(root);
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
  if (k === 'controls') return v ? 'Advanced' : d.oldSchool ? 'Old school (analogue)' : 'Basic electronic';
  if (k === 'oldSchool') return v ? 'Analogue gauges' : 'Screens';
  if (k === 'touch') return ['Separate screens', 'One touchscreen', 'Two touchscreens'][v] ?? 'Separate screens';
  if (k === 'paint') return LIVERIES[v]?.name ?? String(v);
  if (k === 'roofPaint') return ROOF_PAINTS[v]?.name ?? String(v);
  if (k === 'houseColour') return HOUSE_PAINTS[v]?.name ?? String(v);
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
  cmpWorker.onmessage = (e: MessageEvent<{ id: number; trials?: SeaTrialResults; matched?: boolean }>) => {
    if (Math.floor(e.data.id / 10) !== run || e.data.matched) return; // (her gearbox matched: the trials still to come)
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
let frameAt = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = (now - frameAt) / 1000;
  frameAt = now;
  // The hull cards cover the view: don't draw her underneath them.
  if (!$('hullGallery').hidden) return;
  if (live) stepLive(dt);
  orbit.update();
  // Turned to (or away from) a square-on view: its sketch shows (or goes).
  if (facingPlane() !== inkFacing) drawInk();
  updateHandles();
  renderer.render(scene, viewCam());
});
// For checking from a script (headless browser tests).
/** For scripted checks (headless screenshots): aim the camera from `eye` at `at`. */
function look(eye: [number, number, number], at: [number, number, number]): void {
  camera.position.set(...eye);
  orbit.target.set(...at);
  orbit.update();
}
if (showStart) showStartScreen();
showSaved();
/** For scripted checks: where a point on her (boat axes) is on the page (client pixels). */
function toScreen(p: [number, number, number]): [number, number] {
  const v = new THREE.Vector3(...p).project(viewCam());
  const r = renderer.domElement.getBoundingClientRect();
  return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
}
(window as unknown as { shipyard: unknown }).shipyard = { toScreen, get placing() { return placing; }, get design() { return design; }, get boat() { return boat; }, get trial() { return trial; }, get people() { return people; }, get brief() { return brief; }, goStep, sheetEditor, get notes() { return notes; }, putMyNote, hullFrac: () => [hullMin, hullMax], get link() { return link; }, change, setView, look, undo: () => undoRedo(false), redo: () => undoRedo(true) };
