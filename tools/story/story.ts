/**
 * Live demos for the "how Workboat World was built" deck. Every demo runs the game's own
 * code (aliased as @game): the hull study's lofting, the Shipyard's builder, the modular
 * assembler, the physics step and the ocean. Nothing here is imported by the game.
 *
 *   window.Story.mount(kind, host, panel) -> { dispose() }
 *
 * kinds: 'ocean' | 'hull' | 'float' | 'fleet' | 'design' | 'explode'
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DESIGNS } from '@game/hulls/designs';
import { buildHullMesh, hydrostatics as loftHydro, loft, type LoftedHull } from '@game/hulls/loft';
import { LIBRARY, RECIPES } from '@game/boats/library';
import { FLEET } from '@game/boats/fleet';
import { VESSEL_DEFS, wetOutlet } from '@game/vessel/vesselDef';
import { assembleView } from '@game/modular/assemble';
import { BoatView } from '@game/app/boatView';
import { buildVesselMesh } from '@game/vessel/view/hullMesh';
import { createWorld } from '@game/core/world';
import { IdFactory } from '@game/core/ids';
import { stepWorld, type SimDebug } from '@game/core/simulation';
import { placeVessel } from '@game/vessel/vesselControl';
import { createEnvironment, seaStateWaves } from '@game/environment/environmentState';
import { prepareWaves, displacedPosition, surfaceHeight, significantWaveHeight, type PreparedWave } from '@game/ocean/waves';
import { uprightHydrostatics, gzCurve } from '@game/vessel/hydrostatics';
import { HydroDebugView } from '@game/debug/hydroDebugView';
import { OceanView } from '@game/ocean/oceanView';
import { SkyView } from '@game/environment/skyView';
import { EnvironmentView } from '@game/environment/environmentView';
import { buildDesign, DESIGN_HULLS, ENGINES, LIVERIES } from '@game/shipyard/build';
import { DEFAULT_DESIGN, HULL_TYPES, type ShipDesign } from '@game/shipyard/design';
import { useDesign, gearOf } from '@game/boats/sims';
import { shortCode } from '@game/shipyard/designDoc';
import { CONFIG } from '@game/config';

type Panel = HTMLElement;
interface Demo {
  dispose(): void;
}

// ── Shared scaffolding ──────────────────────────────────────────────────────────────────

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Run `fn` every frame (dt in seconds) until disposed. */
  loop(fn: (dt: number, t: number) => void): void;
  dispose(): void;
}

function stage(host: HTMLElement, opts: { sky?: boolean; far?: number } = {}): Stage {
  host.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  if (!opts.sky) {
    scene.background = new THREE.Color(0x9fb8c8);
    scene.fog = new THREE.Fog(0x9fb8c8, 60, 200);
    scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a6a60, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(-8, 14, -6);
    scene.add(sun);
  }
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, opts.far ?? 400);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  const size = () => {
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);
  let fn: ((dt: number, t: number) => void) | null = null;
  let last = performance.now();
  let t = 0;
  let alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    controls.update();
    fn?.(dt, t);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    renderer,
    scene,
    camera,
    controls,
    loop: (f) => (fn = f),
    dispose() {
      alive = false;
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      host.innerHTML = '';
    },
  };
}

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
function row(panel: Panel, label: string, input: HTMLElement, out?: HTMLElement): void {
  const r = el('label', 'ctl');
  r.appendChild(el('span', 'ctl-label', label));
  r.appendChild(input);
  if (out) r.appendChild(out);
  panel.appendChild(r);
}
function slider(min: number, max: number, step: number, value: number, onInput: (v: number) => void): { input: HTMLInputElement; out: HTMLElement } {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', 'ctl-out');
  input.addEventListener('input', () => onInput(Number(input.value)));
  return { input, out };
}
function select(options: string[], value: number, onChange: (i: number) => void): HTMLSelectElement {
  const s = document.createElement('select');
  options.forEach((o, i) => {
    const op = document.createElement('option');
    op.value = String(i);
    op.textContent = o;
    s.appendChild(op);
  });
  s.value = String(value);
  s.addEventListener('change', () => onChange(Number(s.value)));
  return s;
}
function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
const f = (v: number, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '–');
function table(rows: [string, string][]): string {
  return `<table class="facts">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

/** A boat drawn as the game draws her: her hull mesh plus her modules from her recipe. */
function drawBoat(id: string): { root: THREE.Group; view: BoatView | null; def: any } {
  const def = VESSEL_DEFS[id];
  const root = new THREE.Group();
  root.add(buildVesselMesh(def.hull, def.layout, wetOutlet(def), def.livery));
  let view: BoatView | null = null;
  const recipe = RECIPES[id];
  if (recipe) {
    view = new BoatView(id, def, assembleView(recipe, def, LIBRARY), false);
    root.add(view.root);
  }
  return { root, view, def };
}

/** A flat sea at the waterline, slightly transparent so the underbody shows. */
function flatSea(size = 300): THREE.Mesh {
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: 0x2f5f78, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  sea.rotation.x = -Math.PI / 2;
  return sea;
}

/** The sea displaced on the CPU by the game's own wave sums (ocean/waves.ts), for the small scenes. */
class CpuSea {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly geo: THREE.PlaneGeometry;
  constructor(size = 90, n = 72) {
    this.geo = new THREE.PlaneGeometry(size, size, n, n);
    this.geo.rotateX(-Math.PI / 2);
    this.base = (this.geo.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: 0x2f6078, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.9 }));
  }
  update(waves: readonly PreparedWave[], cx = 0, cz = 0): void {
    const p = this.geo.attributes.position;
    const b = this.base;
    for (let i = 0; i < p.count; i++) {
      const x0 = b[i * 3] + cx;
      const z0 = b[i * 3 + 2] + cz;
      const [x, y, z] = displacedPosition(waves, x0, z0);
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// ── 1. The ocean: the game's Gerstner shader, and the CPU height that matches it ───────

function oceanDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host, { sky: true, far: 6000 });
  const env = createEnvironment();
  let seaState = 2;
  env.waves = seaStateWaves(seaState);
  const environment = new EnvironmentView(st.scene);
  const sky = new SkyView();
  const ocean = new OceanView();
  st.scene.add(sky.mesh, ocean.mesh);
  st.camera.position.set(0, 7, 26);
  st.controls.target.set(0, 1, 0);
  st.controls.maxDistance = 120;

  // CPU probes: the physics' own surface height (surfaceHeight) riding the drawn water.
  const probeGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const probeMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const probes = new THREE.InstancedMesh(probeGeo, probeMat, 49);
  const pm = new THREE.Matrix4();
  st.scene.add(probes);
  // On a slide with no panel showing (the cover), just the sea: no probes.
  let showProbes = panel.offsetParent !== null;
  probes.visible = showProbes;

  const hs = el('div', 'readout');
  const { input, out } = slider(0, 6, 0.25, seaState, (v) => {
    seaState = v;
    env.waves = seaStateWaves(v);
    out.textContent = v.toFixed(2);
  });
  out.textContent = seaState.toFixed(2);
  row(panel, 'Sea state', input, out);
  const pb = button('Hide CPU probes', () => {
    showProbes = !showProbes;
    probes.visible = showProbes;
    pb.textContent = showProbes ? 'Hide CPU probes' : 'Show CPU probes';
  });
  panel.appendChild(pb);
  panel.appendChild(hs);
  panel.appendChild(el('p', 'note', 'The water is the game\'s own ocean shader: Gerstner waves summed on the GPU, 1 m cells near you growing to a 3 km horizon in one draw call. The yellow probes are placed by the physics\' <code>surfaceHeight(x, z)</code>, which inverts the same wave sums on the CPU, so the hull always feels the water you see.'));

  let waves: PreparedWave[] = [];
  const focus = new THREE.Vector3();
  st.loop((_dt, t) => {
    waves = prepareWaves(env.waves, t, waves);
    focus.set(st.camera.position.x, 0, st.camera.position.z);
    environment.update(env, focus, t);
    sky.update(environment, st.camera.position, env, t);
    ocean.update(waves, focus, environment, t, { x: 0, z: 0 });
    if (showProbes) {
      let i = 0;
      for (let a = -3; a <= 3; a++)
        for (let b = -3; b <= 3; b++) {
          const x = a * 3;
          const z = b * 3;
          pm.makeTranslation(x, surfaceHeight(waves, x, z), z);
          probes.setMatrixAt(i++, pm);
        }
      probes.instanceMatrix.needsUpdate = true;
    }
    if (Math.floor(t * 4) % 2 === 0) hs.innerHTML = table([['Wave components', String(env.waves.length)], ['Significant height Hs', `${f(significantWaveHeight(env.waves))} m`], ['Longest period', `${f(Math.max(0, ...env.waves.map((w) => w.period)), 1)} s`]]);
  });
  return { dispose: () => st.dispose() };
}

// ── 2. The hull study: lines lofted from design curves, with the hydrostatics ───────────

function hullDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host);
  const sea = flatSea();
  st.scene.add(sea);
  const grid = new THREE.GridHelper(60, 60, 0x6f8fa0, 0x6f8fa0);
  grid.position.y = -3.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.3;
  st.scene.add(grid);
  const group = new THREE.Group();
  st.scene.add(group);
  let current: LoftedHull | null = null;
  let showLines = true;
  const facts = el('div', 'readout');
  const blurb = el('p', 'note');

  function linesOverlay(h: LoftedHull): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'lines';
    const mat = new THREE.LineBasicMaterial({ color: 0x102030, transparent: true, opacity: 0.65 });
    const cat = h.design.catamaran;
    for (const o of cat ? [-cat.spacing / 2, cat.spacing / 2] : [0]) {
      const at = (p: THREE.Vector3, side: number) => new THREE.Vector3(o + side * p.x, p.y, p.z);
      for (const s of h.sections) {
        const pts = [...s.pts.map((p) => at(p, 1)), ...s.pts.slice().reverse().map((p) => at(p, -1))];
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      }
      const deck = h.sections.map((s) => s.pts[s.pts.length - 1]);
      const keel = h.sections.map((s) => s.pts[0]);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(deck.map((p) => at(p, 1))), mat));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(deck.map((p) => at(p, -1))), mat));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(keel.map((p) => at(p, 1))), mat));
    }
    g.scale.setScalar(1.004);
    g.visible = showLines;
    return g;
  }
  function view(k: 'bow' | 'side' | 'stern' | 'top'): void {
    const L = current?.design.length ?? 12;
    const v: Record<string, [number, number, number]> = { bow: [-1.0, 0.42, -1.17], side: [1.7, 0.25, 0], stern: [0.85, 0.42, 1.25], top: [0.001, 2.2, 0] };
    const [x, y, z] = v[k];
    st.camera.position.set(x * L, y * L, z * L);
    st.controls.target.set(0, current ? loftHydro(current).depth * 0.3 : 0.8, 0);
  }
  function show(i: number): void {
    const d = DESIGNS[i];
    const same = current?.design.id === d.id;
    group.clear();
    current = loft(d);
    group.add(buildHullMesh(current));
    group.add(linesOverlay(current));
    const hs = loftHydro(current);
    blurb.innerHTML = `<b>${d.name}</b><br>${d.blurb}`;
    facts.innerHTML = table([
      ['LOA / LWL', `${f(hs.loa, 1)} / ${f(hs.lwl, 1)} m`],
      ['Beam (deck / WL)', `${f(hs.beam)} / ${f(hs.beamWl)} m`],
      ['Draught / depth', `${f(hs.draught)} / ${f(hs.depth)} m`],
      ['Displacement', `${f(hs.volume, 1)} m³ · ${f(hs.displacementT, 1)} t`],
      ['LCB / LCF', `${f(hs.lcb)} / ${f(hs.lcf)} m (+aft)`],
      ['Cb / Cp / Cm / Cwp', `${f(hs.cb)} / ${f(hs.cp)} / ${f(hs.cm)} / ${f(hs.cwp)}`],
      ['KM (transverse)', `${f(hs.km)} m`],
      ['L/B · B/T', `${f(hs.loa / hs.beam)} · ${f(hs.beam / hs.draught)}`],
    ]);
    if (!same) view('bow');
  }
  row(panel, 'Design', select(DESIGNS.map((d) => d.name), 3, show));
  const views = el('div', 'btns');
  for (const k of ['bow', 'side', 'stern', 'top'] as const) views.appendChild(button(k === 'top' ? 'Plan' : k[0].toUpperCase() + k.slice(1), () => view(k)));
  views.appendChild(
    button('Lines on/off', () => {
      showLines = !showLines;
      const l = group.getObjectByName('lines');
      if (l) l.visible = showLines;
    }),
  );
  panel.appendChild(views);
  panel.appendChild(blurb);
  panel.appendChild(facts);
  panel.appendChild(el('p', 'note', 'Each design is a short set of curves, the way a naval architect sketches a type: sheer, half-breadth, keel profile, section shape. <code>loft()</code> turns them into stations, <code>buildHullMesh()</code> panels them, and <code>hydrostatics()</code> integrates the figures at the design waterline. Fifteen original types, all in <code>src/hulls/</code>.'));
  show(3);
  st.loop(() => {});
  return { dispose: () => st.dispose() };
}

// ── 3. Afloat: the game's physics step, with the stations' buoyancy drawn ───────────────

function floatDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host);
  const BOATS = [
    ['pilotBoat', 'Pilot boat 11.2 m'],
    ['smallTug', 'Small tug 13 m'],
    ['fishingBoat', 'Fishing boat 9.75 m'],
    ['lander', 'Fast landing craft 9 m'],
    ['diveShip', 'Dive support vessel 20 m'],
    ['starterBoat', 'Gillnetter 7.8 m'],
  ].filter(([id]) => VESSEL_DEFS[id]);
  const sea = new CpuSea(110, 80);
  st.scene.add(sea.mesh);
  let world: any;
  let v: any;
  let def: any;
  let boatRoot = new THREE.Group();
  let hydro: HydroDebugView | null = null;
  let seaState = 2;
  let showStations = true;
  let acc = 0;
  const debug: SimDebug = new Map();
  const facts = el('div', 'readout');
  const gz = el('div', 'chart');

  function gzChart(): void {
    const pts = gzCurve(def, Array.from({ length: 15 }, (_, i) => i * 5));
    const h = uprightHydrostatics(def);
    const W = 260;
    const H = 110;
    const maxGz = Math.max(0.1, ...pts.map((p) => Math.abs(p.gz)));
    const x = (deg: number) => 28 + (deg / 70) * (W - 36);
    const y = (g: number) => H - 22 - (g / maxGz) * (H - 36);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.deg).toFixed(1)},${y(p.gz).toFixed(1)}`).join(' ');
    gz.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="gzsvg"><line x1="28" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}" class="ax"/><line x1="28" y1="8" x2="28" y2="${H - 22}" class="ax"/>
      <path d="${path}" class="gzline"/>
      <text x="${W - 8}" y="${H - 8}" text-anchor="end" class="lbl">heel 70°</text><text x="30" y="12" class="lbl">GZ ${f(maxGz)} m</text>
      <text x="${x(0) + 4}" y="${H - 8}" class="lbl">0°</text></svg>
      <div class="chart-cap">Righting arm GZ by heel angle, from her stations · GM ${f(h.gmt)} m</div>`;
  }
  function load(id: string): void {
    st.scene.remove(boatRoot);
    boatRoot.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    const made = createWorld(new IdFactory(), id);
    world = made.world;
    world.geography = 'openSea';
    world.environment.waves = seaStateWaves(seaState);
    v = world.vessels[made.vesselId];
    placeVessel(v, 0, 0, 0, 0);
    def = VESSEL_DEFS[id];
    const drawn = drawBoat(id);
    boatRoot = drawn.root;
    hydro = new HydroDebugView(def, showStations);
    boatRoot.add(hydro.root);
    st.scene.add(boatRoot);
    const L = def.hull.params.length;
    st.camera.position.set(-1.3 * L, 0.55 * L, -1.4 * L);
    st.controls.target.set(0, 0.5, 0);
    gzChart();
  }
  row(panel, 'Boat', select(BOATS.map((b) => b[1]), 0, (i) => load(BOATS[i][0])));
  const { input, out } = slider(0, 5, 0.25, seaState, (vv) => {
    seaState = vv;
    world.environment.waves = seaStateWaves(vv);
    out.textContent = vv.toFixed(2);
  });
  out.textContent = seaState.toFixed(2);
  row(panel, 'Sea state', input, out);
  const btns = el('div', 'btns');
  btns.appendChild(
    button('Drop her from 4 m', () => {
      v.position[1] += 4;
      v.linearVelocity = [0, 0, 0];
      v.angularVelocity = [0, 0, 0];
    }),
  );
  btns.appendChild(
    button('Heel 20° and let go', () => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (20 * Math.PI) / 180);
      const cur = new THREE.Quaternion().fromArray(v.orientation);
      cur.multiply(q);
      v.orientation = cur.toArray();
      v.angularVelocity = [0, 0, 0];
    }),
  );
  const sb = button('Stations off', () => {
    showStations = !showStations;
    if (hydro) hydro.root.visible = showStations;
    sb.textContent = showStations ? 'Stations off' : 'Stations on';
  });
  btns.appendChild(sb);
  btns.appendChild(
    button('Engine: full ahead', () => {
      const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'deck', targetId: v.id, control, value }], 1 / 60, debug);
      if (gearOf(v, 'outboard')) {
        if (!v.controls.obOn) send('obPower', 1);
        if (v.controls.obGear !== 1) send('obGear', 1);
        send('lever', 1);
      } else {
        send('lever', 0);
        send('engineStartStop', 1);
        for (let i = 0; i < 180; i++) stepWorld(world, [], 1 / 60, debug);
        send('lever', 1);
      }
    }),
  );
  panel.appendChild(btns);
  panel.appendChild(facts);
  panel.appendChild(gz);
  panel.appendChild(el('p', 'note', 'This is <code>stepWorld()</code>, the game\'s fixed 60 Hz simulation, running on one boat. Each blue outline is a hull station the physics slices at the local waterline every tick; the yellow arrows are each station\'s buoyant force at its immersed centroid, the red dot her centre of gravity. The same stations loft the hull you see, so the drawn waterline is the physics waterline.'));
  load(BOATS[0][0]);
  const q = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  let waves: PreparedWave[] = [];
  st.loop((dt) => {
    acc += dt;
    let n = 0;
    while (acc > 1 / 60 && n++ < 6) {
      stepWorld(world, [], 1 / 60, debug);
      acc -= 1 / 60;
    }
    waves = prepareWaves(world.environment.waves, world.time, waves);
    sea.update(waves, v.position[0], v.position[2]);
    boatRoot.position.fromArray(v.position);
    boatRoot.quaternion.fromArray(v.orientation);
    hydro?.update(debug.get(v.id));
    st.controls.target.lerp(new THREE.Vector3(v.position[0], v.position[1] + 0.5, v.position[2]), 0.1);
    q.fromArray(v.orientation);
    side.set(1, 0, 0).applyQuaternion(q);
    fwd.set(0, 0, -1).applyQuaternion(q);
    const heel = (-Math.asin(THREE.MathUtils.clamp(side.y, -1, 1)) * 180) / Math.PI;
    const trim = (-Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) * 180) / Math.PI;
    const spd = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) * 1.9438;
    if (world.tick % 6 === 0)
      facts.innerHTML = table([
        ['Heel / trim', `${f(heel, 1)}° / ${f(trim, 1)}°`],
        ['Heave', `${f(v.position[1])} m`],
        ['Speed', `${f(spd, 1)} kn`],
        ['Engine', v.engine ? `${Math.round(v.engine.rpm)} rpm` : '–'],
        ['Stations', String(debug.get(v.id)?.stations.length ?? 0)],
        ['Immersed volume', `${f(debug.get(v.id)?.submergedVolume ?? 0, 1)} m³`],
      ]);
  });
  return { dispose: () => st.dispose() };
}

// ── 4. The fleet: every boat the game has, built from her recipe ────────────────────────

function fleetDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host, { far: 600 });
  st.scene.add(flatSea(600));
  const ids = [...FLEET.map((b) => b.id), 'alaskan38', 'landingCraft', 'workboat', 'rib', 'skiff'].filter((id) => RECIPES[id] && VESSEL_DEFS[id]);
  const names: Record<string, string> = Object.fromEntries(FLEET.map((b) => [b.id, b.name]));
  Object.assign(names, { alaskan38: 'Alaskan 38 (one-off)', landingCraft: 'Landing craft 9 m', workboat: 'The original 12 m workboat', rib: 'Fast rescue boat (6 m RIB)', skiff: 'The dinghy' });
  const lengths = ids.map((id) => VESSEL_DEFS[id].hull.params.length as number);
  const total = lengths.reduce((a, b) => a + b, 0) + 4 * (ids.length - 1);
  const groups: THREE.Group[] = [];
  const facts = el('div', 'readout');
  const list = el('div', 'fleet-list');
  panel.appendChild(list);
  panel.appendChild(facts);
  panel.appendChild(el('p', 'note', 'Every boat here is built the same way the game builds her when you play: her hull plus a recipe listing her modules (wheel, levers, engine, crane, lights…). The six fleet boats are Shipyard designs kept as files; the Alaskan 38 is a one-off drawn from the owner\'s photos. Click a boat.'));
  let x = -total / 2;
  const queue = [...ids];
  const placeNext = () => {
    const id = queue.shift();
    if (!id) return;
    const i = ids.indexOf(id);
    let root: THREE.Group;
    try {
      root = drawBoat(id).root;
    } catch (e) {
      console.warn(`fleet: ${id} couldn't be drawn`, e);
      return;
    }
    if (groups.length === 0) setTimeout(() => pick(id), 50);
    root.position.x = x + lengths[i] / 2;
    x += lengths[i] + 4;
    root.rotation.y = Math.PI / 2;
    root.userData.id = id;
    groups.push(root);
    st.scene.add(root);
    const b = button(names[id] ?? id, () => pick(id));
    b.dataset.id = id;
    list.appendChild(b);
  };
  function pick(id: string): void {
    const g = groups.find((gg) => gg.userData.id === id);
    if (!g) return;
    for (const b of list.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === id);
    const def = VESSEL_DEFS[id];
    const h = uprightHydrostatics(def);
    const fleet = FLEET.find((b) => b.id === id);
    const fig = fleet ? buildDesign(fleet.design).figures : null;
    const recipe = RECIPES[id];
    facts.innerHTML = `<b>${names[id] ?? id}</b>` + table([
      ['Length', `${f(def.hull.params.length, 1)} m`],
      ['Displacement', fig ? `${f(fig.massT, 1)} t` : '–'],
      ['Draught', fig ? `${f(fig.draughtM)} m` : '–'],
      ['GM', `${f(h.gmt)} m`],
      ['Engine', fig ? fig.engine : '–'],
      ['Price', fig ? `£${Math.round(fig.price).toLocaleString('en-GB')}` : '–'],
      ['Modules in her recipe', String(recipe.mounts?.length ?? '–')],
    ]);
    const L = def.hull.params.length;
    const to = new THREE.Vector3(g.position.x, 0.6, g.position.z);
    st.controls.target.copy(to);
    st.camera.position.set(to.x - 1.1 * L, 0.5 * L, to.z + 1.4 * L);
  }
  st.camera.position.set(0, total * 0.22, total * 0.55);
  st.controls.target.set(0, 0, 0);
  const ray = new THREE.Raycaster();
  const m = new THREE.Vector2();
  host.addEventListener('click', (e) => {
    const r = host.getBoundingClientRect();
    m.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(m, st.camera);
    const hit = ray.intersectObjects(groups, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.id) o = o.parent;
    if (o) pick(o.userData.id);
  });
  let frames = 0;
  st.loop(() => {
    // One boat a frame, so the page never freezes while they're built.
    if (frames++ % 2 === 0) placeNext();
  });
  return { dispose: () => st.dispose() };
}

// ── 5. The Shipyard: design a boat live with the game's builder ─────────────────────────

function designDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host);
  st.scene.add(flatSea());
  let root: THREE.Group | null = null;
  const d: ShipDesign = { ...DEFAULT_DESIGN };
  const facts = el('div', 'readout');
  const code = el('div', 'code');
  const warn = el('div', 'warn');
  let timer = 0;
  let building = false;
  let dirty = false;

  function rebuild(): void {
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    const t0 = performance.now();
    try {
      const boat = useDesign(d);
      if (root) {
        st.scene.remove(root);
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      }
      root = drawBoat('design').root;
      st.scene.add(root);
      const fig = boat.figures;
      facts.innerHTML = table([
        ['Length / beam', `${f(fig.lengthM, 1)} / ${f(fig.beamM)} m`],
        ['Displacement', `${f(fig.massT, 1)} t (${fig.material})`],
        ['Draught / freeboard', `${f(fig.draughtM)} / ${f(fig.freeboardM)} m`],
        ['GM', `${f(fig.gmM)} m`],
        ['Engine', `${fig.engine}${d.twin ? ' ×2' : ''}`],
        ['Propeller', `${f(fig.propellerM)} m`],
        ['Price', `£${Math.round(fig.price).toLocaleString('en-GB')}`],
        ['Built in', `${(performance.now() - t0).toFixed(0)} ms`],
      ]);
      const c = shortCode(d);
      code.innerHTML = `Her code: <b>${c ?? '(too much for a short code: a link instead)'}</b>`;
      warn.textContent = boat.warnings.slice(0, 3).join(' ');
    } catch (e) {
      warn.textContent = `The builder refused her: ${(e as Error).message.slice(0, 200)}`;
    }
    building = false;
    if (dirty) {
      dirty = false;
      schedule();
    }
  }
  function schedule(): void {
    clearTimeout(timer);
    timer = window.setTimeout(rebuild, 120);
  }
  const hullNames = Array.from({ length: HULL_TYPES }, (_, i) => (DESIGN_HULLS[i]?.name ?? `type ${i}`).split(':')[0]);
  row(panel, 'Hull type', select(hullNames, d.hull, (i) => ((d.hull = i), schedule())));
  const step = (key: keyof ShipDesign, label: string, min: number, max: number, stepBy = 1, fmt?: (v: number) => string) => {
    const { input, out } = slider(min, max, stepBy, d[key] as number, (v) => {
      (d as any)[key] = v;
      out.textContent = fmt ? fmt(v) : String(v);
      schedule();
    });
    out.textContent = fmt ? fmt(d[key] as number) : String(d[key]);
    row(panel, label, input, out);
  };
  step('length', 'Length', 0, 15, 1, (v) => `×${(0.8 + 0.025 * v).toFixed(3)}`);
  step('beam', 'Beam', 0, 15, 1, (v) => `×${(0.8 + 0.025 * v).toFixed(3)}`);
  step('depth', 'Depth', 0, 15, 1, (v) => `×${(0.8 + 0.025 * v).toFixed(3)}`);
  step('bow', 'Stem rake', 0, 10, 1, (v) => `${v * 5}°`);
  step('houseLength', 'Wheelhouse length', 2.4, 5.4, 0.1, (v) => `${v.toFixed(1)} m`);
  step('bulwark', 'Bulwark height', 0, 9, 1, (v) => `${(0.3 + 0.1 * v).toFixed(1)} m`);
  row(panel, 'Engine', select(ENGINES.map((e) => e.name.split(' (')[0]), d.engine, (i) => ((d.engine = i), schedule())));
  row(panel, 'Engines', select(['Single', 'Twin'], d.twin, (i) => ((d.twin = i), schedule())));
  row(panel, 'Paint', select(LIVERIES.map((l) => l.name), d.paint, (i) => ((d.paint = i), schedule())));
  panel.appendChild(facts);
  panel.appendChild(code);
  panel.appendChild(warn);
  panel.appendChild(el('p', 'note', 'Every move of a slider runs <code>buildDesign()</code>, the Shipyard\'s real builder: it scales the hull\'s lines, weighs her part by part (plating, house, machinery, gear), raises or lowers her lines until she displaces exactly that weight, places the engine on her shaft line, fits the wheelhouse and console with fit checks, and writes her recipe. The code is the design: 17 characters in Crockford base-32 with a check character, short enough to type in VR.'));
  st.camera.position.set(-16, 7, -18);
  st.controls.target.set(0, 1, 0);
  rebuild();
  st.loop(() => {});
  return { dispose: () => st.dispose() };
}

// ── 6. Modular boats: a boat pulled apart into her modules ──────────────────────────────

function explodeDemo(host: HTMLElement, panel: Panel): Demo {
  const st = stage(host);
  st.scene.add(flatSea());
  const BOATS = [
    ['pilotBoat', 'Pilot boat'],
    ['smallTug', 'Small tug'],
    ['workboat', 'The original workboat'],
    ['fishingBoat', 'Fishing boat'],
  ].filter(([id]) => VESSEL_DEFS[id] && RECIPES[id]);
  let parts: { obj: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  let root: THREE.Group | null = null;
  let k = 0;
  const facts = el('div', 'readout');
  const modsList = el('div', 'mods');

  function load(id: string): void {
    if (root) {
      st.scene.remove(root);
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    }
    const { root: r, view, def } = drawBoat(id);
    root = r;
    st.scene.add(root);
    parts = [];
    const centre = new THREE.Vector3(0, 1.0, 0);
    const movers: THREE.Object3D[] = view ? [...view.root.children] : [];
    for (const obj of movers) {
      const base = obj.position.clone();
      const dir = base.clone().sub(centre);
      if (dir.lengthSq() < 0.05) dir.set(0, 1, 0);
      dir.normalize();
      dir.y += 0.9;
      parts.push({ obj, base, dir });
    }
    const list = view?.moduleList ?? [];
    const byKind = new Map<string, number>();
    for (const m of list) {
      const kind = m.split(': ')[1]?.split('.')[0] ?? 'other';
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }
    facts.innerHTML = table([
      ['Modules in her recipe', String(list.length)],
      ['Her length', `${f(def.hull.params.length, 1)} m`],
      ...[...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([kk, n]) => [kk, String(n)] as [string, string]),
    ]);
    modsList.innerHTML = list.slice(0, 40).map((m) => `<span>${m.split(': ')[1]}</span>`).join('') + (list.length > 40 ? `<span>… and ${list.length - 40} more</span>` : '');
    const L = def.hull.params.length;
    st.camera.position.set(-1.4 * L, 0.7 * L, -1.3 * L);
    st.controls.target.set(0, 1.5, 0);
    apply();
  }
  function apply(): void {
    for (const p of parts) p.obj.position.copy(p.base).addScaledVector(p.dir, k * 4);
  }
  row(panel, 'Boat', select(BOATS.map((b) => b[1]), 0, (i) => load(BOATS[i][0])));
  const { input, out } = slider(0, 1, 0.01, 0, (v) => {
    k = v;
    out.textContent = `${Math.round(v * 100)} %`;
    apply();
  });
  out.textContent = '0 %';
  row(panel, 'Pull apart', input, out);
  panel.appendChild(facts);
  panel.appendChild(modsList);
  panel.appendChild(el('p', 'note', 'A boat is a hull plus a recipe: a JSON parts list saying which module sits in which socket. Modules never import each other; they only read and write named keys on a bus (<code>throttle.demand</code>, <code>engine.rpm</code>…). Take the rudder out and she drives but the wheel does nothing; take the cleats out and she can\'t moor. The slider moves each module\'s own object away from its socket. Fixed parts are baked into one mesh, so they stay.'));
  load(BOATS[0][0]);
  st.loop(() => {});
  return { dispose: () => st.dispose() };
}

// ── Mount ───────────────────────────────────────────────────────────────────────────────

const DEMOS: Record<string, (host: HTMLElement, panel: Panel) => Demo> = { ocean: oceanDemo, hull: hullDemo, float: floatDemo, fleet: fleetDemo, design: designDemo, explode: explodeDemo };

function mount(kind: string, host: HTMLElement, panel: Panel): Demo {
  panel.innerHTML = '';
  try {
    return DEMOS[kind](host, panel);
  } catch (e) {
    host.innerHTML = `<div class="demo-error">This demo couldn't start here: ${(e as Error).message}</div>`;
    console.error(e);
    return { dispose: () => (host.innerHTML = '') };
  }
}

(window as any).Story = { mount, kinds: Object.keys(DEMOS), facts: { tests: 0, config: Object.keys(CONFIG).length } };
document.dispatchEvent(new Event('story-ready'));
