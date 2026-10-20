/**
 * The coast viewer (the coast pipeline's milestones 1 and 2): load a generated region
 * (region.json and terrain.bin from public/regions/<id>/, written by tools/coast/src/mesh.ts,
 * and nav.json from tools/coast/src/nav.ts), fly round it, and toggle overlays: chunk
 * borders, wireframe, depth bands, land-cover classes, the OpenStreetMap coastline, the
 * water, the buoys and lights with their labels, night. Drop a test boat and drive her by
 * the marks, with the tidal race at slack, flood or ebb. ?region=<id> picks the region
 * (default oban). Not part of the game: a page to judge regions before they go into it.
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { NavLayer, type NavFile } from './nav';
import { TestBoat, DRAFT } from './boat';
import { HarbourLayer, type HarbourFile } from './harbours';

interface RegionFile {
  id: string;
  name: string;
  box: { x0: number; x1: number; z0: number; z1: number };
  terrain: { file: string; vertices: { offset: number; count: number }; faces: { offset: number; count: number }; colours: { offset: number }; classes: { offset: number } };
  chunks: { id: number; x0: number; z0: number; size: number; start: number; count: number }[];
  coast: number[][];
  credits: string;
  nav?: string;
  harbours?: string;
}

const id = new URLSearchParams(location.search).get('region') ?? 'oban';
const base = `${import.meta.env.BASE_URL}regions/${id}/`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8cfdc);
scene.fog = new THREE.Fog(0xb8cfdc, 6000, 22000);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 40000);
const hemi = new THREE.HemisphereLight(0xdfeaf2, 0x40463a, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.position.set(-3000, 5000, 4000);
scene.add(sun);
const controls = new MapControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.49;
controls.screenSpacePanning = false;

/** WorldCover classes: name and a plain colour for the overlay. */
const CLASSES: Record<number, [string, number]> = {
  0: ['sea', 0x2e5f80],
  10: ['trees', 0x1f6b2a],
  20: ['shrub (heather)', 0x9a6a9a],
  30: ['grass', 0x9fd36a],
  40: ['crops', 0xe6d35a],
  50: ['built-up', 0xd23a2a],
  60: ['bare rock', 0xaaaaaa],
  80: ['water', 0x3a8ad0],
  90: ['wetland', 0x3ab0a0],
  100: ['moss', 0xd0e0b0],
};

const toggles: Record<string, boolean> = { water: true, chunks: false, wireframe: false, depth: false, cover: false, coast: false, marks: true, harbours: true, labels: true, night: false };
const groups = { terrain: new THREE.Group(), chunks: new THREE.Group(), coast: new THREE.Group() };
scene.add(groups.terrain, groups.chunks, groups.coast);
let water: THREE.Mesh;
let geos: { geo: THREE.BufferGeometry; natural: Float32Array; depth: Float32Array; cover: Float32Array }[] = [];
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
let nav: NavLayer | null = null;
let harbours: HarbourLayer | null = null;
/** Made fast at a berth: the berth and its harbour (the boat doesn't move until cast off). */
let moored: { name: string; harbour: string } | null = null;
const boat = new TestBoat();
boat.root.visible = false;
scene.add(boat.root);
let driving = false;
/** The tidal race's strength as a share of peak: 0 slack, +1 flood (along its set), -1 ebb. */
let race = 0;

/** Chunk meshes by their south-west corner, so a height probe tests one chunk, not all. */
const chunkMeshes = new Map<string, THREE.Mesh>();
let chunkSize = 2000;
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const hits: THREE.Intersection[] = [];
/**
 * Ground height (m above mean sea level) at (x, z), from the mesh. The mesher leaves out the
 * seabed where it's all deeper than 3 m (the water hides it), so a miss there means deep:
 * -60, which the boat's depth sounder shows as "deep".
 */
function groundAt(x: number, z: number): number {
  ray.set(new THREE.Vector3(x, 2000, z), down);
  const key = `${Math.floor(x / chunkSize) * chunkSize},${Math.floor(z / chunkSize) * chunkSize}`;
  const own = chunkMeshes.get(key);
  hits.length = 0;
  if (own) ray.intersectObject(own, false, hits);
  // A face near a chunk border can belong to its neighbour: fall back to every chunk.
  if (!hits.length) ray.intersectObjects(groups.terrain.children, false, hits);
  return hits.length ? 2000 - hits[0].distance : -60;
}

async function load(): Promise<void> {
  const region = (await (await fetch(`${base}region.json`)).json()) as RegionFile;
  const bin = await (await fetch(`${base}${region.terrain.file}`)).arrayBuffer();
  const t = region.terrain;
  const V = new Float32Array(bin, t.vertices.offset, t.vertices.count * 3);
  const F = new Uint32Array(bin, t.faces.offset, t.faces.count * 3);
  const C = new Uint8Array(bin, t.colours.offset, t.faces.count * 3);
  const K = new Uint8Array(bin, t.classes.offset, t.faces.count);
  const tmp = new THREE.Color();
  for (const ch of region.chunks) {
    const n = ch.count;
    const pos = new Float32Array(n * 9);
    const natural = new Float32Array(n * 9);
    const depth = new Float32Array(n * 9);
    const cover = new Float32Array(n * 9);
    for (let f = 0; f < n; f++) {
      const fi = ch.start + f;
      let my = 0;
      for (let k = 0; k < 3; k++) {
        const v = F[fi * 3 + k];
        pos.set([V[v * 3], V[v * 3 + 1], V[v * 3 + 2]], f * 9 + k * 3);
        my += V[v * 3 + 1] / 3;
      }
      // sRGB bytes -> linear for the renderer.
      tmp.setRGB(C[fi * 3] / 255, C[fi * 3 + 1] / 255, C[fi * 3 + 2] / 255, THREE.SRGBColorSpace);
      const nat = [tmp.r, tmp.g, tmp.b];
      // Depth bands: land in height steps, sea in depth steps (5 m).
      if (my >= 0) tmp.setHSL(0.3 - Math.min(0.3, my / 900), 0.45, 0.35 + Math.min(0.5, my / 600));
      else tmp.setHSL(0.58, 0.6, Math.max(0.12, 0.6 - Math.floor(-my / 5) * 0.08));
      const dep = [tmp.r, tmp.g, tmp.b];
      tmp.setHex(CLASSES[K[fi]]?.[1] ?? 0xff00ff);
      const cov = [tmp.r, tmp.g, tmp.b];
      for (let k = 0; k < 3; k++) (natural.set(nat, f * 9 + k * 3), depth.set(dep, f * 9 + k * 3), cover.set(cov, f * 9 + k * 3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(natural.slice(), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    groups.terrain.add(mesh);
    chunkMeshes.set(`${ch.x0},${ch.z0}`, mesh);
    chunkSize = ch.size;
    geos.push({ geo, natural, depth, cover });
    // Chunk border.
    const s = ch.size;
    const pts = [ch.x0, 2, ch.z0, ch.x0 + s, 2, ch.z0, ch.x0 + s, 2, ch.z0 + s, ch.x0, 2, ch.z0 + s, ch.x0, 2, ch.z0];
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    groups.chunks.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff3366 })));
  }
  for (const line of region.coast) {
    const p: number[] = [];
    for (let i = 0; i + 1 < line.length; i += 2) p.push(line[i], 1.2, line[i + 1]);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    groups.coast.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffee00 })));
  }
  const b = region.box;
  water = new THREE.Mesh(
    new THREE.PlaneGeometry(b.x1 - b.x0 + 20000, b.z1 - b.z0 + 20000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2f5f78, transparent: true, opacity: 0.93 }),
  );
  water.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  scene.add(water);
  camera.position.set(b.x0 - 2000, 6500, b.z1 + 5000);
  controls.target.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  controls.update();
  const verts = t.vertices.count;
  document.getElementById('name')!.textContent = region.name;
  document.getElementById('stats')!.innerHTML = `${t.faces.count.toLocaleString()} triangles, ${verts.toLocaleString()} vertices, ${region.chunks.length} chunks of ${region.chunks[0].size / 1000} km<br>${((b.x1 - b.x0) / 1000).toFixed(1)} × ${((b.z1 - b.z0) / 1000).toFixed(1)} km, ${(bin.byteLength / 1e6).toFixed(1)} MB`;
  document.getElementById('credits')!.textContent = region.credits;
  if (region.nav) {
    scene.updateMatrixWorld();
    const file = (await (await fetch(`${base}${region.nav}`)).json()) as NavFile;
    nav = new NavLayer(file, groundAt);
    scene.add(nav.root);
    document.getElementById('stats')!.innerHTML += `<br>${file.marks.length} buoys and beacons, ${file.lights.length} lights, ${file.hazards.length} charted rocks and wrecks, ${file.currents.length} race zone${file.currents.length === 1 ? '' : 's'}`;
    document.getElementById('boatrow')!.style.display = 'flex';
  }
  if (region.harbours) {
    const file = (await (await fetch(`${base}${region.harbours}`)).json()) as HarbourFile;
    harbours = new HarbourLayer(file);
    scene.add(harbours.root);
    const roles = file.harbours.filter((h) => h.role).length;
    // Go to a harbour: a view from 250 m off and 120 m up, looking at it.
    const pick = document.createElement('select');
    pick.innerHTML = `<option value="">Go to harbour...</option>` + file.harbours.map((h, i) => `<option value="${i}">${h.name}${h.role ? ` (${h.role})` : ''}</option>`).join('');
    pick.onchange = () => {
      const h = file.harbours[Number(pick.value)];
      if (!h) return;
      if (driving) leaveBoat();
      camera.position.set(h.x + 180, 120, h.z + 180);
      controls.target.set(h.x, 0, h.z);
      controls.update();
      pick.value = '';
    };
    document.getElementById('views')!.appendChild(pick);
    document.getElementById('stats')!.innerHTML += `<br>${file.harbours.length} harbours (${roles} spine roles), ${file.blocks.length} kit pieces, ${file.berths.length} berths, ${file.buildings.length} buildings (${harbours.buildingTriangles.toLocaleString()} triangles in ${harbours.drawCalls - 2} chunk meshes)`;
  }
  apply();
}

function apply(): void {
  for (const g of geos) {
    const src = toggles.cover ? g.cover : toggles.depth ? g.depth : g.natural;
    (g.geo.attributes.color as THREE.BufferAttribute).copyArray(src);
    g.geo.attributes.color.needsUpdate = true;
  }
  mat.wireframe = toggles.wireframe;
  if (water) water.visible = toggles.water;
  groups.chunks.visible = toggles.chunks;
  groups.coast.visible = toggles.coast;
  if (nav) nav.root.visible = toggles.marks;
  if (harbours) harbours.root.visible = toggles.harbours;
  labelBox.style.display = toggles.labels ? 'block' : 'none';
  // Night: the sky and the land go dark so the lights read as they would from the wheelhouse.
  const night = toggles.night;
  (scene.background as THREE.Color).setHex(night ? 0x0b1420 : 0xb8cfdc);
  scene.fog!.color.setHex(night ? 0x0b1420 : 0xb8cfdc);
  hemi.intensity = night ? 0.12 : 1.6;
  sun.intensity = night ? 0.05 : 2.2;
  const legend = document.getElementById('legend')!;
  legend.style.display = toggles.cover ? 'block' : 'none';
  legend.innerHTML = Object.values(CLASSES).map(([n, c]) => `<span style="background:#${c.toString(16).padStart(6, '0')}"></span>${n}`).join(' ');
  for (const [k, btn] of buttons) btn.classList.toggle('on', toggles[k]);
}

const buttons = new Map<string, HTMLButtonElement>();
const labels: Record<string, string> = { water: 'Water', chunks: 'Chunks', wireframe: 'Wireframe', depth: 'Heights & depths', cover: 'Land cover', coast: 'OSM coastline', marks: 'Buoys & lights', harbours: 'Harbours', labels: 'Labels', night: 'Night' };
for (const k of Object.keys(toggles)) {
  const b = document.createElement('button');
  b.textContent = labels[k];
  b.onclick = () => {
    toggles[k] = !toggles[k];
    if (k === 'depth' && toggles.depth) toggles.cover = false;
    if (k === 'cover' && toggles.cover) toggles.depth = false;
    apply();
  };
  buttons.set(k, b);
  document.getElementById('toggles')!.appendChild(b);
}
/** Quick views: from above, and at a boat's eye height looking along the coast. */
const views: [string, () => void][] = [
  ['From above', () => (camera.position.set(controls.target.x, 9000, controls.target.z + 1), controls.update())],
  ['Boat eye', () => (camera.position.set(controls.target.x - 400, 4, controls.target.z + 400), controls.update())],
];
for (const [n, f] of views) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = f;
  document.getElementById('views')!.appendChild(b);
}

/** Labels: HTML tags over the scene for the nearer marks, lights, farms and race zones. */
const labelBox = document.getElementById('labels')!;
const labelEls: HTMLDivElement[] = [];
const proj = new THREE.Vector3();
function drawLabels(): void {
  if (labelBox.style.display === 'none') return;
  const near = Math.max(2500, camera.position.y * 3);
  let n = 0;
  const all = [...(toggles.marks && nav ? nav.labels : []), ...(toggles.harbours && harbours ? harbours.labels : [])];
  for (const l of all) {
    if (camera.position.distanceTo(l.pos) > near) continue;
    proj.copy(l.pos).project(camera);
    if (proj.z > 1 || Math.abs(proj.x) > 1 || Math.abs(proj.y) > 1) continue;
    let el = labelEls[n];
    if (!el) {
      el = document.createElement('div');
      el.className = 'label';
      labelBox.appendChild(el);
      labelEls.push(el);
    }
    el.style.display = 'block';
    el.textContent = l.text;
    el.style.transform = `translate(${((proj.x + 1) / 2) * innerWidth}px, ${((1 - proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    if (++n >= 60) break;
  }
  for (let i = n; i < labelEls.length; i++) labelEls[i].style.display = 'none';
}

/** Put the test boat at (x, z), or the nearest water deep enough for her (spiral search). */
function dropBoat(x: number, z: number, heading = 0): boolean {
  for (let r = 0; r <= 1500; r += 25) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 25));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (boatGround(px, pz) < -(DRAFT + 1.5)) {
        moored = null;
        boat.place(px, pz, heading);
        boat.throttle = 0;
        boat.rudder = 0;
        boat.root.visible = true;
        driving = true;
        // Chase view: behind and above her.
        camera.position.set(px - Math.sin(heading) * 30, 10, pz + Math.cos(heading) * 30);
        controls.target.set(px, 1, pz);
        controls.update();
        hud.style.display = 'block';
        boatBtn.textContent = 'Leave boat';
        return true;
      }
    }
  }
  return false;
}
function leaveBoat(): void {
  driving = false;
  moored = null;
  boat.root.visible = false;
  hud.style.display = 'none';
  boatBtn.textContent = 'Drop test boat';
}
const hud = document.getElementById('hud')!;
const boatBtn = document.createElement('button');
boatBtn.textContent = 'Drop test boat';
boatBtn.onclick = () => (driving ? leaveBoat() : dropBoat(controls.target.x, controls.target.z, 0));
const raceBtn = document.createElement('button');
const RACE_NAMES: Record<number, string> = { 0: 'Race: slack', 1: 'Race: flood', [-1]: 'Race: ebb' };
raceBtn.textContent = RACE_NAMES[race];
raceBtn.onclick = () => {
  race = race === 0 ? 1 : race === 1 ? -1 : 0;
  raceBtn.textContent = RACE_NAMES[race];
};
document.getElementById('boatrow')!.append(boatBtn, raceBtn);

const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  if (driving) driveStep(dt);
  else fly(dt);
  controls.update();
  nav?.update(clock.elapsedTime, camera);
  renderer.render(scene, camera);
  drawLabels();
});

/** What the test boat feels under her: the terrain, the skerries, and the harbour pieces (solid). */
function boatGround(x: number, z: number): number {
  if (nav?.onRock(x, z)) return 1;
  const deck = harbours?.pieceAt(x, z);
  if (deck != null) return deck;
  return groundAt(x, z);
}

/** Make fast at the nearest berth, if she's close (within 6 m) and nearly stopped (under 1 kn). */
function makeFast(): boolean {
  if (!harbours || moored) return false;
  const p = boat.root.position;
  const near = harbours.berthNear(p.x, p.z, 6);
  if (!near || boat.sog > 0.514444) return false;
  const b = near.berth;
  // Lie along the berth, whichever way round she came in.
  let h = (b.headingDeg * Math.PI) / 180;
  const d = Math.atan2(Math.sin(h - boat.heading), Math.cos(h - boat.heading));
  if (Math.abs(d) > Math.PI / 2) h += Math.PI;
  boat.place(b.x, b.z, h);
  boat.throttle = 0;
  boat.rudder = 0;
  boat.sog = 0;
  moored = { name: b.id, harbour: near.harbour };
  return true;
}

/** Boat mode: W/S open and close the throttle, A/D put the rudder over, space stops her, T makes fast. */
function driveStep(dt: number): void {
  if (keys.has('w') || keys.has('arrowup')) boat.throttle = Math.min(1, boat.throttle + 0.5 * dt);
  if (keys.has('s') || keys.has('arrowdown')) boat.throttle = Math.max(-0.3, boat.throttle - 0.5 * dt);
  if (keys.has(' ')) boat.throttle = 0;
  if (keys.has('t')) makeFast();
  boat.rudder = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const before = boat.root.position.clone();
  if (moored) {
    // Made fast: she stays put until the throttle is touched (that casts her off).
    if (keys.has('w') || keys.has('s') || keys.has('arrowup') || keys.has('arrowdown')) moored = null;
  }
  if (!moored) boat.step(dt, boatGround, (x, z) => (nav ? nav.currentAt(x, z, race) : [0, 0]));
  // The camera rides along, so the owner can still orbit round her with the mouse.
  const moved = boat.root.position.clone().sub(before);
  camera.position.add(moved);
  controls.target.copy(boat.root.position).setY(1);
  const hdg = ((((boat.heading * 180) / Math.PI) % 360) + 360) % 360;
  const set = nav ? nav.currentAt(boat.root.position.x, boat.root.position.z, race) : [0, 0];
  const cur = Math.hypot(set[0], set[1]) / 0.514444;
  hud.innerHTML =
    `Heading ${hdg.toFixed(0).padStart(3, '0')}°  Throttle ${(boat.throttle * 100).toFixed(0)}%<br>` +
    `Speed over ground ${(boat.sog / 0.514444).toFixed(1)} kn  Depth ${boat.depth >= 59 ? 'deep' : `${boat.depth.toFixed(1)} m`}` +
    (cur > 0.05 ? `<br>Current ${cur.toFixed(1)} kn` : '') +
    (boat.aground ? '<br><b class="aground">AGROUND</b> (back her off: S)' : '') +
    (moored ? `<br><b class="fast">MADE FAST</b> at ${moored.harbour} (W or S casts off)` : harbours && !boat.aground && boat.sog < 0.52 && harbours.berthNear(boat.root.position.x, boat.root.position.z, 6) ? '<br>At a berth: T to make fast' : '');
}

function fly(dt: number): void {
  // Fly: speed grows with height, so it's slow at a boat's eye and fast from the air.
  const v = Math.max(20, camera.position.y * 1.2) * dt;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) move.add(fwd);
  if (keys.has('s') || keys.has('arrowdown')) move.sub(fwd);
  if (keys.has('d') || keys.has('arrowright')) move.add(right);
  if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
  if (keys.has('e')) move.y += 1;
  if (keys.has('q')) move.y -= 1;
  if (move.lengthSq()) {
    move.multiplyScalar(v);
    camera.position.add(move);
    controls.target.add(new THREE.Vector3(move.x, 0, move.z));
  }
}

// For scripted checks (headless screenshots): the camera, controls, toggles and the test boat.
(window as unknown as { viewer: unknown }).viewer = {
  camera,
  controls,
  toggles,
  apply,
  boat,
  groundAt,
  dropBoat,
  leaveBoat,
  makeFast,
  boatGround,
  get moored() {
    return moored;
  },
  get harbours() {
    return harbours;
  },
  setRace: (r: number) => ((race = r), (raceBtn.textContent = RACE_NAMES[r])),
  get nav() {
    return nav;
  },
};

load().catch((e) => (document.getElementById('name')!.textContent = `Could not load region "${id}": ${e.message}`));
