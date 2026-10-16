/**
 * Hull study viewer (hulls.html): the five type designs, one at a time, on a flat sea at
 * the design waterline, with a lines-plan overlay (stations) and the hydrostatics summary.
 * Separate from the game: nothing here is imported by it. Drag to orbit, wheel to zoom.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DESIGNS } from './designs';
import { buildHullMesh, hydrostatics, loft, type LoftedHull } from './loft';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c8);
scene.fog = new THREE.Fog(0x9fb8c8, 40, 120);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(-12, 6, -14);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a6a60, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
sun.position.set(-8, 14, -6);
scene.add(sun);

// The sea: a flat plane at the DWL, slightly transparent so the underbody shows through.
const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x2f5f78, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
sea.rotation.x = -Math.PI / 2;
scene.add(sea);
const grid = new THREE.GridHelper(40, 40, 0x6f8fa0, 0x6f8fa0);
grid.position.y = -3.01;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
scene.add(grid);

const group = new THREE.Group();
scene.add(group);
let current: LoftedHull | null = null;
let showLines = true;
let showSea = true;

function show(id: string): void {
  const d = DESIGNS.find((x) => x.id === id) ?? DESIGNS[0];
  group.clear();
  current = loft(d);
  group.add(buildHullMesh(current));
  group.add(linesOverlay(current));
  const hs = hydrostatics(current);
  const f = (v: number, n = 2) => v.toFixed(n);
  document.getElementById('name')!.textContent = d.name;
  document.getElementById('blurb')!.textContent = d.blurb;
  document.getElementById('stats')!.innerHTML = [
    ['LOA / LWL', `${f(hs.loa, 1)} / ${f(hs.lwl, 1)} m`],
    ['Beam (deck / WL)', `${f(hs.beam, 2)} / ${f(hs.beamWl, 2)} m`],
    ['Draught / depth', `${f(hs.draught, 2)} / ${f(hs.depth, 2)} m`],
    ['Displacement', `${f(hs.volume, 1)} m³ · ${f(hs.displacementT, 1)} t`],
    ['LCB / LCF', `${f(hs.lcb, 2)} / ${f(hs.lcf, 2)} m (+aft)`],
    ['Cb / Cp / Cm / Cwp', `${f(hs.cb)} / ${f(hs.cp)} / ${f(hs.cm)} / ${f(hs.cwp)}`],
    ['KM (transverse)', `${f(hs.km, 2)} m`],
    ['L/B · B/T', `${f(hs.loa / hs.beam)} · ${f(hs.beam / hs.draught)}`],
  ]
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.classList.toggle('on', b.dataset.id === d.id);
  location.hash = d.id;
  view('bow');
}

/** Stations as thin lines (both sides), the deck edge and the keel, in dark ink. */
function linesOverlay(h: LoftedHull): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'lines';
  const mat = new THREE.LineBasicMaterial({ color: 0x102030, transparent: true, opacity: 0.6 });
  for (const s of h.sections) {
    const pts = [...s.pts, ...s.pts.slice().reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  const deck = h.sections.map((s) => s.pts[s.pts.length - 1]);
  const keel = h.sections.map((s) => s.pts[0]);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(deck), mat));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(deck.map((p) => new THREE.Vector3(-p.x, p.y, p.z))), mat));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(keel), mat));
  // Lift the lines a hair off the surface so they don't flicker against it.
  g.scale.setScalar(1.004);
  g.visible = showLines;
  return g;
}

const tabs = document.getElementById('tabs')!;
for (const d of DESIGNS) {
  const b = document.createElement('button');
  b.textContent = d.name.split(' (')[0];
  b.dataset.id = d.id;
  b.onclick = () => show(d.id);
  tabs.appendChild(b);
}
document.getElementById('lines')!.onclick = () => {
  showLines = !showLines;
  const l = group.getObjectByName('lines');
  if (l) l.visible = showLines;
};
document.getElementById('sea')!.onclick = () => {
  showSea = !showSea;
  sea.visible = showSea;
};
// Standard views, as multiples of the boat's length so a 26 m hull frames like a 10 m one.
const views: Record<string, [number, number, number]> = { bow: [-1.0, 0.42, -1.17], side: [-1.7, 0.25, 0], stern: [0.85, 0.42, 1.25], top: [0.001, 2.2, 0] };
function view(k: string): void {
  const L = current?.design.length ?? 12;
  const [x, y, z] = views[k];
  camera.position.set(x * L, y * L, z * L);
  controls.target.set(0, (current ? hydrostatics(current).depth * 0.3 : 0.8), 0);
  controls.update();
}
for (const k of Object.keys(views)) document.getElementById(`view-${k}`)!.onclick = () => view(k);
// Exposed for the screenshot harness.
(window as unknown as { hullViewer: unknown }).hullViewer = { show, view, camera, controls, scene, group };

show(location.hash.slice(1) || DESIGNS[0].id);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
