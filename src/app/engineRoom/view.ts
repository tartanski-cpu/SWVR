/**
 * The engine room's drawing (plan.ts says where it is): drawn only while you're below, in
 * place of everything outside (App: going below). Built when a player first goes below in
 * that boat, from her own plan and her engines, and loaded as its own piece of the game (a
 * separate download, the first time anyone goes below).
 *
 * In her axes, and moved with her each frame, so it rolls and pitches as she does. Kept cheap
 * for the Quest: everything that doesn't move is one merged, vertex-coloured mesh (the floor
 * plates, the lined sides and their frames, the deckhead and its beams, the bulkheads, the
 * engines and shafts, the light fittings, the ladder); the gauge panels are one more, a canvas
 * redrawn a few times a second; two cheap lights (a hemisphere and an ambient: no shadows).
 */
import * as THREE from 'three';
import { engineGeometry } from '../../vessel/view/engineModels';
import { mergeParts, part } from '../../render/geometryUtils';
import type { VesselState, EngineState } from '../../vessel/vesselState';
import type { EngineRoomPlan } from './plan';
import { tugLayout } from './tug/layout';
import { TugRoom } from './tug/room';
import type { Control } from '../../controls/Control';
import type { PaintName } from '../../render/pixelPaint';
import { grime, roomMaterial } from './look';

const PLATE = 0x8d9296; // chequer plate, worn grey
const LINING = 0xd9dcd6; // painted lining, off-white
const FRAME = 0xb9bdb6;
const DECKHEAD = 0xe6e6e0;
const BULKHEAD = 0xcfd3cc;
const SHAFT = 0x6a6e70;
const LADDER = 0xd8a020; // safety yellow
const LAMP = 0xfff4d8;
const DOOR = 0x9aa3a8;

/** A box of size (w, h, d) centred at (x, y, z), coloured, and wearing a pixel paint tile if given. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number, paint?: PaintName): THREE.BufferGeometry {
  return part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), colour, paint);
}

export class EngineRoomView {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly panelsAt: { engine: number; side: 'port' | 'stbd' | 'single' }[] = [];
  private sinceDraw = 1;
  /** The harbour tug's room in detail (tug/room.ts), in place of the plain one's contents. */
  private readonly tug: TugRoom | null = null;

  /** Its controls (the tug's start-up: tug/controls.ts); none in a plain room. */
  get controls(): Control[] {
    return this.tug?.controls ?? [];
  }

  /** @param name her name, for the tug's screens */
  constructor(readonly plan: EngineRoomPlan, name = '') {
    const p = plan;
    const parts: THREE.BufferGeometry[] = [];
    const layout = tugLayout(p);
    const w = 2 * p.halfWidth;
    const len = p.z1 - p.z0;
    const zm = (p.z0 + p.z1) / 2;
    const h = p.deckhead - p.sole;
    const ym = (p.sole + p.deckhead) / 2;
    // Floor plates (the tug's are her own), and the sides, the deckhead and the two bulkheads: a closed box.
    // (Painted: the sides and bulkheads steel plating with its welds, the deckhead's insulation
    // cladded in perforated sheet, the floor chequer plate. look.ts.)
    if (!layout) parts.push(box(w, 0.04, len, 0, p.sole - 0.02, zm, PLATE, 'chequer'));
    for (const s of [-1, 1]) parts.push(box(0.04, h, len, s * (p.halfWidth + 0.02), ym, zm, LINING, 'steel'));
    parts.push(box(w, 0.04, len, 0, p.deckhead + 0.02, zm, DECKHEAD, 'perforated'));
    parts.push(box(w, h, 0.04, 0, ym, p.z0 - 0.02, BULKHEAD, 'steel'));
    parts.push(box(w, h, 0.04, 0, ym, p.z1 + 0.02, BULKHEAD, 'steel'));
    // Her frames up the sides and the deck beams over them, every 0.6 m (a steel hull's spacing).
    for (let z = p.z0 + 0.3; z < p.z1 - 0.1; z += 0.6) {
      for (const s of [-1, 1]) parts.push(box(0.08, h, 0.08, s * (p.halfWidth - 0.04), ym, z, FRAME));
      parts.push(box(w, 0.14, 0.08, 0, p.deckhead - 0.07, z, FRAME));
    }
    // A watertight door in the forward bulkhead (shut: the forepeak beyond isn't built yet).
    if (!layout) parts.push(box(0.75, 1.6, 0.06, -p.halfWidth / 2, p.sole + 0.95, p.z0 + 0.03, DOOR, 'steel'));
    // Her engines, as the boat's own are drawn (vessel/view/engineModels.ts), and their shafts aft through the bulkhead.
    for (const e of layout ? [] : p.engines) {
      parts.push(...engineGeometry(e.model, e.size, { x: e.x, flangeY: e.flangeY, flangeZ: e.flangeZ, angleDeg: e.angleDeg }));
      const shaftLen = Math.max(0.1, p.z1 - e.flangeZ);
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, shaftLen, 10).rotateX(Math.PI / 2).translate(e.x, e.flangeY, e.flangeZ + shaftLen / 2), SHAFT));
    }
    // Light fittings along the deckhead (they light nothing themselves: the room's lights do).
    if (!layout) for (let z = p.z0 + 1; z < p.z1 - 0.5; z += 2) for (const x of [-p.halfWidth / 2, p.halfWidth / 2]) parts.push(box(0.12, 0.05, 1.2, x, p.deckhead - 0.17, z, LAMP));
    // The ladder: two stringers from the foot to the hatch's edge, rungs every 0.28 m.
    const L = p.ladder;
    const rise = L.head - L.foot;
    const lean = Math.min(0.6, rise * 0.25); // its foot out from under the hatch
    const stringer = (x: number) => {
      const g = new THREE.BoxGeometry(0.05, Math.hypot(rise, lean), 0.07);
      g.rotateX(-Math.atan2(lean, rise)).translate(x, L.foot + rise / 2, L.z + lean / 2);
      return part(g, LADDER);
    };
    parts.push(stringer(L.x - 0.22), stringer(L.x + 0.22));
    for (let y = 0.28; y < rise - 0.1; y += 0.28) parts.push(box(0.44, 0.03, 0.05, L.x, L.foot + y, L.z + lean * (1 - y / rise), LADDER));
    const merged = mergeParts(parts);
    grime(merged, p.sole, p.deckhead);
    const mesh = new THREE.Mesh(merged, roomMaterial());
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);

    // The harbour tug's in detail: everything else is hers.
    if (layout) {
      this.tug = new TugRoom(p, layout, name);
      this.root.add(this.tug.root);
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.root.matrixAutoUpdate = false;
      return;
    }
    // The gauge panels: one per engine, on the forward bulkhead, at eye height.
    const engines = p.engines.length ? p.engines : [];
    const sides = engines.length >= 2 ? (['port', 'stbd'] as const) : (['single'] as const);
    sides.forEach((side, i) => this.panelsAt.push({ engine: i, side }));
    this.canvas.width = 512 * Math.max(1, this.panelsAt.length);
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const pw = Math.min(w - 0.6, 1.1 * Math.max(1, this.panelsAt.length));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, 0.55), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    panel.position.set(p.halfWidth / 3, p.sole + 1.55, p.z0 + 0.05);
    this.root.add(panel);

    // Its lights: no shadows, nothing per pixel beyond what the boat already pays.
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0x606468, 1.6);
    hemi.position.set(0, p.deckhead, zm);
    this.root.add(hemi, new THREE.AmbientLight(0xffffff, 0.35));
    this.root.matrixAutoUpdate = false;
  }

  /** Each frame while below: moved with her (her root's world matrix), the gauges redrawn a few times a second. */
  update(boatRoot: THREE.Object3D, v: VesselState | undefined, dt: number, time = 0): void {
    this.root.matrix.copy(boatRoot.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    if (this.tug) return this.tug.update(v, time, dt);
    this.sinceDraw += dt;
    if (!v || this.sinceDraw < 0.2) return;
    this.sinceDraw = 0;
    this.draw(v);
  }

  private draw(v: VesselState): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.fillStyle = '#1c2227';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.panelsAt.forEach(({ side }, i) => {
      // Port is the boat's own engine state; a twin worked separately has the starboard's own (EngineState.stbd).
      const e: EngineState = side === 'stbd' ? (v.engine.stbd ?? v.engine) : v.engine;
      const x0 = i * 512;
      g.fillStyle = '#e8e4d8';
      g.font = 'bold 26px sans-serif';
      g.fillText(side === 'single' ? 'MAIN ENGINE' : side === 'port' ? 'PORT ENGINE' : 'STBD ENGINE', x0 + 24, 36);
      g.font = '20px sans-serif';
      g.fillStyle = e.phase === 'running' ? '#6fd36f' : e.phase === 'cranking' ? '#f0c040' : '#a0a4a8';
      g.fillText(e.phase === 'running' ? 'RUNNING' : e.phase === 'cranking' ? 'CRANKING' : 'STOPPED', x0 + 330, 36);
      this.dial(g, x0 + 90, 150, 'RPM', e.rpm, 0, 2000, 1800);
      this.dial(g, x0 + 256, 150, 'COOLANT °C', e.coolantC, 0, 120, 95);
      this.dial(g, x0 + 422, 150, 'OIL °C', e.oilC, 0, 140, 115);
    });
    this.texture.needsUpdate = true;
  }

  /** A round gauge: its scale, a red mark from `red` up, and the needle at `value`. */
  private dial(g: CanvasRenderingContext2D, cx: number, cy: number, label: string, value: number, lo: number, hi: number, red: number): void {
    const r = 62;
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const at = (val: number) => a0 + sweep * Math.min(1, Math.max(0, (val - lo) / (hi - lo)));
    g.fillStyle = '#f2efe6';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c0392b';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, cy, r - 8, at(red), a0 + sweep);
    g.stroke();
    g.strokeStyle = '#222';
    g.lineWidth = 2;
    for (let k = 0; k <= 10; k++) {
      const a = a0 + (sweep * k) / 10;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
      g.stroke();
    }
    const a = at(value);
    g.strokeStyle = '#111';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    g.stroke();
    g.fillStyle = '#e8e4d8';
    g.font = '16px sans-serif';
    g.textAlign = 'center';
    g.fillText(label, cx, cy + r + 22);
    g.fillText(String(Math.round(value)), cx, cy + r + 42);
    g.textAlign = 'left';
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.texture.dispose();
    this.tug?.dispose();
  }
}
