/**
 * The coast viewer (the coast pipeline's milestone 1): load a generated region (region.json
 * and terrain.bin from public/regions/<id>/, written by tools/coast/src/mesh.ts), fly round
 * it, and toggle overlays: chunk borders, wireframe, depth bands, land-cover classes, the
 * OpenStreetMap coastline, the water. ?region=<id> picks the region (default oban). Not part
 * of the game: a page to judge regions before they go into it.
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

interface RegionFile {
  id: string;
  name: string;
  box: { x0: number; x1: number; z0: number; z1: number };
  terrain: { file: string; vertices: { offset: number; count: number }; faces: { offset: number; count: number }; colours: { offset: number }; classes: { offset: number } };
  chunks: { id: number; x0: number; z0: number; size: number; start: number; count: number }[];
  coast: number[][];
  credits: string;
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
scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x40463a, 1.6));
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

const toggles: Record<string, boolean> = { water: true, chunks: false, wireframe: false, depth: false, cover: false, coast: false };
const groups = { terrain: new THREE.Group(), chunks: new THREE.Group(), coast: new THREE.Group() };
scene.add(groups.terrain, groups.chunks, groups.coast);
let water: THREE.Mesh;
let geos: { geo: THREE.BufferGeometry; natural: Float32Array; depth: Float32Array; cover: Float32Array }[] = [];
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

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
    groups.terrain.add(new THREE.Mesh(geo, mat));
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
  const legend = document.getElementById('legend')!;
  legend.style.display = toggles.cover ? 'block' : 'none';
  legend.innerHTML = Object.values(CLASSES).map(([n, c]) => `<span style="background:#${c.toString(16).padStart(6, '0')}"></span>${n}`).join(' ');
  for (const [k, btn] of buttons) btn.classList.toggle('on', toggles[k]);
}

const buttons = new Map<string, HTMLButtonElement>();
const labels: Record<string, string> = { water: 'Water', chunks: 'Chunks', wireframe: 'Wireframe', depth: 'Heights & depths', cover: 'Land cover', coast: 'OSM coastline' };
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
  controls.update();
  renderer.render(scene, camera);
});

// For scripted checks (headless screenshots): the camera and its controls.
(window as unknown as { viewer: unknown }).viewer = { camera, controls, toggles, apply };

load().catch((e) => (document.getElementById('name')!.textContent = `Could not load region "${id}": ${e.message}`));
