/**
 * The crew area's drawing (crew/layout.ts says where everything is): drawn only while you're
 * inside, in place of everything outside (BelowDecks), as the engine room is. Built when a
 * player first goes in on that boat, and loaded as its own piece of the game.
 *
 * In her axes, and moved with her each frame, so it rolls and pitches as she does. Kept cheap
 * for the Quest:
 *   - everything that doesn't move is one merged, vertex-coloured mesh, wearing the game's
 *     pixel paint (render/pixelPaint.ts: wood lining, floor matting, woven cloth, brushed
 *     steel, the deckhead's cladding, the linings' painted render);
 *   - what glows (the windows' daylight, the portholes, the ceiling lights, the mirror) is a
 *     second, unlit;
 *   - the name plates on the doors, the harbour chart and the notices are a third, one canvas;
 *   - a soft fill light and three lamps, moved to the ceiling lights nearest you.
 * The bunks are real: lie down in one to rest (the furniture's own BerthRest).
 */
import * as THREE from 'three';
import { CONFIG } from '../../../config';
import type { Control } from '../../../controls/Control';
import { BerthRest } from '../../../modules/furniture';
import { mergeParts } from '../../../render/geometryUtils';
import type { VesselState } from '../../../vessel/vesselState';
import { roomMaterial } from '../look';
import { Kit, type V3 } from '../tug/kit';
import { deckAtHeight, type CrewLayout, type Face, type Piece } from './layout';

const C = CONFIG.crewArea.look.colours;

/** The atlas: the door plates, the notices and the chart, one canvas. */
const ATLAS = 1024;
type Cell = { x: number; y: number; w: number; h: number };
const PLATE: [number, number] = [256, 64];
const PLATES = ['MESS', 'GALLEY', 'MASTER', 'CREW', 'WC', 'LAUNDRY', 'LIFEJACKETS', 'MUSTER LIST'];
const plateCell = (i: number): Cell => ({ x: (i % 4) * PLATE[0], y: Math.floor(i / 4) * PLATE[1], w: PLATE[0], h: PLATE[1] });
const CHART: Cell = { x: 0, y: 256, w: 640, h: 448 };
const NOTICE: Cell = { x: 640, y: 256, w: 384, h: 448 };

/** Turn (about the vertical) that takes a piece's local +z (its front) to `face`. */
function yawOf(face: Face): number {
  return face === '+z' ? 0 : face === '-z' ? Math.PI : face === '+x' ? Math.PI / 2 : -Math.PI / 2;
}

/** A quad showing an atlas cell, `w` x `h`, its middle at `c`, facing `face`. */
function plate(cell: Cell, c: V3, face: Face, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(yawOf(face));
  g.translate(...c);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const [u0, u1] = [cell.x / ATLAS, (cell.x + cell.w) / ATLAS];
  const [v0, v1] = [1 - (cell.y + cell.h) / ATLAS, 1 - cell.y / ATLAS];
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  return g;
}

/** Draw the atlas: the door plates, the harbour chart, the muster list. */
function drawAtlas(canvas: HTMLCanvasElement, name: string): void {
  canvas.width = canvas.height = ATLAS;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  PLATES.forEach((text, i) => {
    const r = plateCell(i);
    // Engraved plates: white on blue for the rooms, white on red for the lifejackets.
    g.fillStyle = text === 'LIFEJACKETS' ? '#c8321e' : text === 'MUSTER LIST' ? '#2d6b3a' : '#1f3f66';
    g.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    g.strokeStyle = '#e8e6de';
    g.lineWidth = 3;
    g.strokeRect(r.x + 9, r.y + 9, r.w - 18, r.h - 18);
    g.fillStyle = '#f4f2ea';
    g.font = `bold ${text.length > 8 ? 26 : 32}px sans-serif`;
    g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 30);
  });
  // The chart: a harbour approach, original: sea in two blues by depth, the land, soundings, a compass rose.
  const ch = CHART;
  g.fillStyle = '#eef2ea';
  g.fillRect(ch.x, ch.y, ch.w, ch.h);
  g.fillStyle = '#b9d4e6';
  g.beginPath();
  g.moveTo(ch.x + 20, ch.y + 20);
  g.bezierCurveTo(ch.x + 260, ch.y + 60, ch.x + 330, ch.y + 200, ch.x + 260, ch.y + 430);
  g.lineTo(ch.x + 20, ch.y + 430);
  g.fill();
  g.fillStyle = '#e6d6a8';
  g.beginPath();
  g.moveTo(ch.x + 620, ch.y + 20);
  g.bezierCurveTo(ch.x + 430, ch.y + 90, ch.x + 470, ch.y + 250, ch.x + 380, ch.y + 300);
  g.bezierCurveTo(ch.x + 330, ch.y + 330, ch.x + 360, ch.y + 400, ch.x + 400, ch.y + 430);
  g.lineTo(ch.x + 620, ch.y + 430);
  g.fill();
  g.strokeStyle = '#7a9cb5';
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.moveTo(ch.x + 80, ch.y + 410);
  g.lineTo(ch.x + 330, ch.y + 260);
  g.lineTo(ch.x + 420, ch.y + 120);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#3b5a78';
  g.font = '15px sans-serif';
  for (const [x, y, n] of [[60, 90, 24], [120, 200, 18], [200, 320, 12], [90, 330, 21], [180, 120, 31], [300, 380, 9], [260, 220, 11]]) g.fillText(String(n), ch.x + x, ch.y + y);
  g.strokeStyle = '#5a5040';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(ch.x + 120, ch.y + 360, 34, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(ch.x + 120, ch.y + 318);
  g.lineTo(ch.x + 127, ch.y + 360);
  g.lineTo(ch.x + 113, ch.y + 360);
  g.closePath();
  g.fillStyle = '#5a5040';
  g.fill();
  g.font = 'bold 18px serif';
  g.fillText('HARBOUR APPROACHES', ch.x + 470, ch.y + 400);
  g.strokeStyle = '#4a4a44';
  g.lineWidth = 6;
  g.strokeRect(ch.x + 3, ch.y + 3, ch.w - 6, ch.h - 6);
  // The muster list: who goes where, in the boat's name.
  const n = NOTICE;
  g.fillStyle = '#fbfaf4';
  g.fillRect(n.x + 6, n.y + 6, n.w - 12, n.h - 12);
  g.fillStyle = '#1b1d20';
  g.font = 'bold 28px sans-serif';
  g.fillText('MUSTER LIST', n.x + n.w / 2, n.y + 42);
  g.font = '18px sans-serif';
  g.fillText(name ? name.toUpperCase() : 'HARBOUR TUG', n.x + n.w / 2, n.y + 72, n.w - 30);
  g.textAlign = 'left';
  g.font = '17px sans-serif';
  const lines = ['GENERAL ALARM: 7 short, 1 long', '', 'MASTER      bridge, in command', 'MATE          on deck, boats', 'ENGINEER   engine room', 'DECKHAND   fire party', '', 'ABANDON SHIP: liferaft,', 'starboard side, aft', '', 'Muster at the lifejacket locker'];
  lines.forEach((t, i) => g.fillText(t, n.x + 26, n.y + 112 + i * 28, n.w - 40));
  g.textAlign = 'center';
}

export class CrewAreaView {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  private readonly atlasTex: THREE.CanvasTexture;
  /** The lamps (moved to the ceiling lights nearest you, on your deck). */
  private readonly lamps: THREE.PointLight[] = [];

  constructor(readonly layout: CrewLayout, name = '') {
    const l = layout;
    const kit = new Kit();
    const glow: THREE.BufferGeometry[] = [];
    const glowKit = new Kit();
    const plates: THREE.BufferGeometry[] = [];

    this.shell(kit, glowKit);
    this.doorways(kit, plates);
    this.stair(kit);
    for (const p of l.pieces) this.piece(kit, glowKit, plates, p);
    this.mainDoor(kit);

    const merged = mergeParts(kit.parts);
    const mesh = new THREE.Mesh(merged, roomMaterial());
    this.root.add(mesh);
    glow.push(...glowKit.parts);
    this.root.add(new THREE.Mesh(mergeParts(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    const canvas = document.createElement('canvas');
    drawAtlas(canvas, name);
    this.atlasTex = new THREE.CanvasTexture(canvas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 4;
    if (plates.length) {
      const pg = plates.length === 1 ? plates[0] : mergeGeometriesUv(plates);
      this.root.add(new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ map: this.atlasTex })));
    }

    // The lights: a soft fill, and the lamps (placed each frame).
    const lit = CONFIG.crewArea.look.lights;
    const M = l.plan.main;
    const hemi = new THREE.HemisphereLight(0xfff4e2, 0x6a6460, lit.hemi);
    hemi.position.set(0, M.deckhead, (M.z0 + M.z1) / 2);
    this.root.add(hemi, new THREE.AmbientLight(0xffffff, lit.ambient));
    for (let i = 0; i < lit.lamps; i++) {
      const pl = new THREE.PointLight(0xfff0d8, lit.lamp, lit.lampRange, lit.lampDecay);
      this.lamps.push(pl);
      this.root.add(pl);
    }
    this.placeLamps(l.inside);

    // The bunks: lie down in one to rest (BerthRest: the app's 'berthRest').
    for (const p of l.pieces) {
      const deck = l.decks[p.deck]!;
      const along = p.face === '+x' || p.face === '-x';
      const len = along ? p.z1 - p.z0 : p.x1 - p.x0;
      const wid = along ? p.x1 - p.x0 : p.z1 - p.z0;
      const tops = p.kind === 'berth' ? [0.5] : p.kind === 'bunk' ? [0.4, 1.2] : [];
      for (const top of tops) {
        const rest = new BerthRest(len - 0.1, wid - 0.1, top);
        rest.root.position.set((p.x0 + p.x1) / 2, deck.floor, (p.z0 + p.z1) / 2);
        if (along) rest.root.rotation.y = Math.PI / 2;
        this.controls.push(rest);
        this.root.add(rest.root);
      }
    }
    this.root.matrixAutoUpdate = false;
  }

  /** Each frame while inside: moved with her; the lamps at the ceiling lights nearest `at` (her axes: the player). */
  update(boatRoot: THREE.Object3D, v: VesselState | undefined, dt: number, _time = 0, at?: readonly number[]): void {
    this.root.matrix.copy(boatRoot.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    if (at) this.placeLamps(at);
    if (!v) return;
    for (const c of this.controls) {
      c.sync(v);
      c.tick(dt);
    }
  }

  private placeLamps(at: readonly number[]): void {
    const l = this.layout;
    const deck = deckAtHeight(l, at[1]);
    const d = l.decks[deck]!;
    const near = l.lamps
      .filter((p) => p.deck === deck)
      .sort((a, b) => Math.hypot(a.x - at[0], a.z - at[2]) - Math.hypot(b.x - at[0], b.z - at[2]));
    this.lamps.forEach((pl, i) => {
      const p = near[i];
      pl.visible = !!p;
      if (p) pl.position.set(p.x, d.deckhead - 0.25, p.z);
    });
  }

  // ── The shell: floors (the well cut out), deckheads, linings, partitions, windows, lamps ──

  private shell(kit: Kit, glow: Kit): void {
    const l = this.layout;
    const M = l.plan.main;
    const L = l.decks.lower;
    const w = l.well;
    const rect = (x0: number, x1: number, z0: number, z1: number, y: number, t: number, colour: number) => {
      if (x1 - x0 > 0.01 && z1 - z0 > 0.01) kit.box(x1 - x0, t, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, colour);
    };
    /** A level sheet over a deck's plan with the well cut out of it. */
    const sheet = (x0: number, x1: number, z0: number, z1: number, y: number, t: number, colour: number, hole: boolean) => {
      if (!hole || !w) return rect(x0, x1, z0, z1, y, t, colour);
      rect(x0, x1, z0, Math.max(z0, w.z0), y, t, colour);
      rect(x0, x1, Math.min(z1, w.z1), z1, y, t, colour);
      rect(x0, w.x0, Math.max(z0, w.z0), Math.min(z1, w.z1), y, t, colour);
      rect(w.x1, x1, Math.max(z0, w.z0), Math.min(z1, w.z1), y, t, colour);
    };
    // The main deck's floor: the lobby's rubber matting aft, vinyl forward.
    const zL = l.doorways.find((d) => d.plate === 'MESS')?.at ?? M.z1 - 2;
    kit.painted('mat', () => {
      sheet(-M.halfWidth, M.halfWidth, zL, M.z1, M.floor - 0.02, 0.04, C.lobbyFloor, true);
      sheet(-M.halfWidth, M.halfWidth, M.z0, zL, M.floor - 0.02, 0.04, C.vinyl, true);
    });
    kit.painted('perforated', () => sheet(-M.halfWidth, M.halfWidth, M.z0, M.z1, M.deckhead + 0.02, 0.04, C.deckhead, false));
    // Its sides, front and aft wall (the linings), and skirting along their feet.
    const box = (deck: { halfWidth: number; z0: number; z1: number; floor: number; deckhead: number }) => {
      const h = deck.deckhead - deck.floor;
      const ym = (deck.floor + deck.deckhead) / 2;
      const len = deck.z1 - deck.z0;
      const zm = (deck.z0 + deck.z1) / 2;
      kit.painted('render', () => {
        for (const s of [-1, 1]) kit.box(0.05, h, len, s * (deck.halfWidth + 0.025), ym, zm, C.lining);
        for (const z of [deck.z0 - 0.025, deck.z1 + 0.025]) kit.box(2 * deck.halfWidth + 0.1, h, 0.05, 0, ym, z, C.lining);
      });
      for (const s of [-1, 1]) kit.box(0.02, 0.1, len, s * (deck.halfWidth - 0.01), deck.floor + 0.05, zm, C.trim);
      for (const z of [deck.z0 + 0.01, deck.z1 - 0.01]) kit.box(2 * deck.halfWidth, 0.1, 0.02, 0, deck.floor + 0.05, z, C.trim);
      // A wooden rail round the walls at hand height (the boat moves).
      for (const s of [-1, 1]) kit.box(0.04, 0.05, len - 0.2, s * (deck.halfWidth - 0.03), deck.floor + 0.95, zm, C.darkWood);
    };
    box(M);
    if (L) {
      // Carpet in the cabins (aft of the corridor across); vinyl in the corridor, the washroom and the laundry.
      const cabins = l.plan.stair?.zFoot ?? (L.z0 + L.z1) / 2;
      kit.painted('sacking', () => sheet(-L.halfWidth, L.halfWidth, cabins, L.z1, L.floor - 0.02, 0.04, C.carpet, false));
      kit.painted('mat', () => sheet(-L.halfWidth, L.halfWidth, L.z0, cabins, L.floor - 0.02, 0.04, C.wetFloor, false));
      kit.painted('perforated', () => sheet(-L.halfWidth, L.halfWidth, L.z0, L.z1, L.deckhead + 0.02, 0.04, C.deckhead, true));
      box(L);
      // The well's sides between the decks (the deck's thickness, lined).
      if (w) {
        const y0 = L.deckhead;
        const y1 = M.floor;
        kit.painted('render', () => {
          for (const x of [w.x0 - 0.02, w.x1 + 0.02]) kit.box(0.04, y1 - y0, w.z1 - w.z0, x, (y0 + y1) / 2, (w.z0 + w.z1) / 2, C.lining);
          for (const z of [w.z0 - 0.02, w.z1 + 0.02]) kit.box(w.x1 - w.x0 + 0.08, y1 - y0, 0.04, (w.x0 + w.x1) / 2, (y0 + y1) / 2, z, C.lining);
        });
      }
    }
    // The partitions (the lining's colour), each with a skirting.
    for (const b of l.walls) {
      const deck = l.decks[b.deck]!;
      kit.painted('render', () => kit.box(b.x1 - b.x0, b.h, b.z1 - b.z0, (b.x0 + b.x1) / 2, deck.floor + b.h / 2, (b.z0 + b.z1) / 2, C.lining));
      kit.box(b.x1 - b.x0 + 0.02, 0.1, b.z1 - b.z0 + 0.02, (b.x0 + b.x1) / 2, deck.floor + 0.05, (b.z0 + b.z1) / 2, C.trim);
    }
    // Windows (daylight through them) and portholes, each in its frame on the lining.
    for (const win of l.windows) {
      const h = win.y1 - win.y0;
      const yc = (win.y0 + win.y1) / 2;
      const inset = win.side * 0.005;
      if (win.round) {
        const at: V3 = win.along === 'z' ? [win.at - win.side * 0.01, yc, win.c] : [win.c, yc, win.at + 0.01];
        kit.ring(win.w / 2 + 0.02, 0.025, at, win.along === 'z' ? 'x' : 'z', C.steel);
        const g = new THREE.CircleGeometry(win.w / 2, 18).rotateY(win.along === 'z' ? -win.side * (Math.PI / 2) : 0);
        glow.add(g.translate(at[0] - win.side * 0.002, at[1], at[2]), 0x9fbccb);
        continue;
      }
      if (win.along === 'z') {
        const x = win.at - win.side * 0.03;
        kit.box(0.03, h + 0.08, win.w + 0.08, x, yc, win.c, C.darkWood);
        glow.box(0.01, h, win.w, x - win.side * 0.02 + inset, yc, win.c, 0xc4dbe8);
      } else {
        const z = win.at + 0.03;
        kit.box(win.w + 0.08, h + 0.08, 0.03, win.c, yc, z, C.darkWood);
        glow.box(win.w, h, 0.01, win.c, yc, z + 0.02, 0xc4dbe8);
      }
    }
    // The ceiling lights: a fitting each, its diffuser lit.
    for (const p of l.lamps) {
      const d = l.decks[p.deck]!;
      kit.box(0.5, 0.04, 0.5, p.x, d.deckhead - 0.02, p.z, C.steel);
      glow.box(0.42, 0.02, 0.42, p.x, d.deckhead - 0.05, p.z, 0xfff3dc);
    }
  }

  // ── Doorways: frames, open doors, name plates ──

  private doorways(kit: Kit, plates: THREE.BufferGeometry[]): void {
    const l = this.layout;
    for (const d of l.doorways) {
      const deck = l.decks[d.deck]!;
      const head = Math.min(1.95, deck.deckhead - deck.floor - 0.08);
      const width = d.to - d.from;
      const mid = (d.from + d.to) / 2;
      const at = (along: number, y: number, off = 0): V3 => (d.along === 'x' ? [along, y, d.at + off] : [d.at + off, y, along]);
      // The frame: two jambs and a head.
      for (const e of [d.from, d.to]) {
        const [x, y, z] = at(e, deck.floor + head / 2);
        kit.box(d.along === 'x' ? 0.05 : 0.1, head, d.along === 'x' ? 0.1 : 0.05, x, y, z, C.darkWood);
      }
      const [hx, hy, hz] = at(mid, deck.floor + head + 0.03);
      kit.box(d.along === 'x' ? width + 0.1 : 0.1, 0.06, d.along === 'x' ? 0.1 : width + 0.1, hx, hy, hz, C.darkWood);
      // The door, open square to the wall into the room it opens into.
      if (d.leaf) {
        const hinge = d.leaf.hinge ? d.to : d.from;
        const into = d.leaf.into;
        const lw = width - 0.04;
        const [x, y, z] = at(hinge + (d.leaf.hinge ? -0.03 : 0.03), deck.floor + (head - 0.02) / 2, into * (lw / 2 + 0.05));
        kit.painted('wood', () => kit.box(d.along === 'x' ? 0.04 : lw, head - 0.02, d.along === 'x' ? lw : 0.04, x, y, z, C.wood));
      }
      // Its name plate beside it, at eye height, on the side it's read from.
      if (d.plate) {
        const i = PLATES.indexOf(d.plate);
        if (i < 0) continue;
        const face: Face = d.along === 'x' ? (d.plateSide > 0 ? '+z' : '-z') : d.plateSide > 0 ? '+x' : '-x';
        // (On the doorway's outer side, away from her centreline: clear of the next doorway along.)
        const beside = Math.abs(d.from) > Math.abs(d.to) ? d.from - 0.2 : d.to + 0.2;
        plates.push(plate(plateCell(i), at(beside, deck.floor + 1.55, d.plateSide * 0.035), face, 0.24, 0.06));
      }
    }
  }

  // ── The stair: treads and risers, stringers, handrails ──

  private stair(kit: Kit): void {
    const l = this.layout;
    const S = l.plan.stair;
    if (!S) return;
    const x0 = S.x - S.width / 2;
    const x1 = S.x + S.width / 2;
    kit.painted('chequer', () => {
      for (const s of l.steps) kit.box(S.width, 0.04, s.z1 - s.z0 + 0.02, S.x, s.y - 0.02, (s.z0 + s.z1) / 2, 0x8d9296);
    });
    for (const s of l.steps) {
      // The riser at its aft edge, a yellow nosing on its forward edge.
      kit.box(S.width, S.rise, 0.02, S.x, s.y + S.rise / 2, s.z1, 0x7a8086);
      kit.box(S.width, 0.015, 0.04, S.x, s.y + 0.005, s.z0 + 0.02, 0xe0b020);
    }
    // Stringers along each side, from its head down to its foot.
    const top: V3 = [0, S.top, S.zTop];
    const foot: V3 = [0, S.foot, S.zFoot];
    for (const x of [x0 - 0.03, x1 + 0.03]) kit.cyl(0.05, [x, top[1] - 0.15, top[2]], [x, foot[1] - 0.05, foot[2] - 0.2], 0x6e7478, 4);
    // Handrails on both sides, at a rail's height over the treads.
    for (const x of [x0 - 0.06, x1 + 0.06]) {
      kit.cyl(0.022, [x, top[1] + 0.9, top[2] + 0.3], [x, foot[1] + 0.9, foot[2]], C.darkWood, 8);
      kit.cyl(0.018, [x, foot[1], foot[2]], [x, foot[1] + 0.9, foot[2]], C.steel, 8);
    }
    // A rail across the well's forward end, on the main deck (nothing to fall into from there).
    const M = l.plan.main;
    if (S.zFoot > M.z0 + 0.05) {
      kit.cyl(0.022, [x0, M.floor + 0.95, S.zFoot - 0.02], [x1, M.floor + 0.95, S.zFoot - 0.02], C.darkWood, 8);
      kit.cyl(0.022, [x0, M.floor + 0.5, S.zFoot - 0.02], [x1, M.floor + 0.5, S.zFoot - 0.02], C.steel, 8);
    }
  }

  // ── The weathertight door, seen from inside ──

  private mainDoor(kit: Kit): void {
    const l = this.layout;
    const d = l.plan.door;
    const M = l.plan.main;
    const z = M.z1 - 0.03;
    const h = Math.min(d.height, M.deckhead - M.floor - 0.1);
    const y = M.floor + h / 2;
    // Its frame (a steel coaming round it), the door (rounded: a box and a band), its six dogs.
    kit.box(d.width + 0.16, h + 0.16, 0.06, d.x, y, z, 0xb8bcbc);
    kit.box(d.width, h, 0.07, d.x, y, z - 0.02, 0xdcdedb);
    kit.box(d.width - 0.12, h - 0.12, 0.02, d.x, y, z - 0.06, 0xd0d3d0);
    for (const fy of [0.25, 0.5, 0.75])
      for (const s of [-1, 1]) {
        const dx = d.x + s * (d.width / 2 - 0.08);
        kit.box(0.04, 0.16, 0.05, dx, M.floor + h * fy, z - 0.08, 0x30353a);
      }
    // A grab handle, and the coaming's step inside.
    kit.cyl(0.02, [d.x - 0.12, M.floor + 1.0, z - 0.1], [d.x + 0.12, M.floor + 1.0, z - 0.1], C.steel, 8);
    kit.box(d.width + 0.2, 0.08, 0.25, d.x, M.floor + 0.04, z - 0.15, 0x8d9296);
  }

  // ── The furniture and kit ──

  private piece(kit: Kit, glow: Kit, plates: THREE.BufferGeometry[], p: Piece): void {
    const deck = this.layout.decks[p.deck]!;
    const along = p.face === '+x' || p.face === '-x';
    const L = along ? p.z1 - p.z0 : p.x1 - p.x0;
    const D = along ? p.x1 - p.x0 : p.z1 - p.z0;
    const H = p.h;
    // Built in its own axes (x along it, y up from the floor or its lift, z out of its back
    // toward its front: back at -D/2), then turned and set in place.
    const k = new Kit();
    const g = new Kit();
    /** Its plates (on the atlas), in its own axes. */
    const local: THREE.BufferGeometry[] = [];
    const b = (w: number, h: number, d: number, x: number, y: number, z: number, colour: number) => k.box(w, h, d, x, y, z, colour);
    const back = -D / 2;
    const front = D / 2;
    switch (p.kind) {
      case 'settee': {
        k.painted('wood', () => b(L, 0.12, D - 0.04, 0, 0.06, -0.02, C.darkWood));
        k.painted('sacking', () => {
          b(L, 0.3, D - 0.06, 0, 0.27, -0.03, C.upholstery);
          b(L - 0.02, 0.09, D - 0.18, 0, 0.465, 0.03, C.upholstery);
          b(L, 0.42, 0.13, 0, 0.66, back + 0.065, C.upholstery);
        });
        break;
      }
      case 'table': {
        k.painted('wood', () => b(L, 0.035, D, 0, H - 0.0175, 0, C.wood));
        // A fiddle rail round its edge, a pedestal and its foot bolted to the deck.
        for (const s of [-1, 1]) {
          b(L, 0.025, 0.02, 0, H + 0.0125, s * (D / 2 - 0.01), C.darkWood);
          b(0.02, 0.025, D, s * (L / 2 - 0.01), H + 0.0125, 0, C.darkWood);
        }
        k.cyl(0.05, [0, 0, 0], [0, H - 0.03, 0], C.steel, 10);
        k.cyl(0.25, [0, 0, 0], [0, 0.03, 0], C.steel, 14);
        // Two mugs and a newspaper.
        k.cyl(0.04, [L * 0.2, H, 0.1], [L * 0.2, H + 0.1, 0.1], 0xd85a3a, 10);
        k.cyl(0.04, [-L * 0.15, H, -0.15], [-L * 0.15, H + 0.1, -0.15], 0x3a6fb0, 10);
        b(0.3, 0.01, 0.4, -L * 0.05, H + 0.005, 0.05, 0xe8e4d6);
        break;
      }
      case 'tv': {
        // On its bracket off the wall: the case, the dark screen.
        b(L, H, 0.05, 0, H / 2, back + 0.08, 0x16181b);
        b(0.08, 0.08, 0.08, 0, H / 2, back + 0.04, 0x2a2d30);
        g.box(L - 0.04, H - 0.04, 0.005, 0, H / 2, back + 0.108, 0x0d1013);
        break;
      }
      case 'chart': {
        // A framed chart: the picture is on the atlas.
        b(L, H, 0.02, 0, H / 2, back + 0.01, C.darkWood);
        break;
      }
      case 'counter': {
        // The carcass round any cooker or sink set into it, the doors' lines, the worktop over all.
        // (Their places along it in its own x: her z or x, turned as the piece is: yawOf.)
        const inserts = this.layout.pieces.filter((q) => (q.kind === 'cooker' || q.kind === 'sink') && q.deck === p.deck && q.x0 < p.x1 && q.x1 > p.x0 && q.z0 < p.z1 && q.z1 > p.z0);
        const cut = inserts.map((q) => (along ? [q.z0 - (p.z0 + p.z1) / 2, q.z1 - (p.z0 + p.z1) / 2] : [q.x0 - (p.x0 + p.x1) / 2, q.x1 - (p.x0 + p.x1) / 2]).map((v) => (p.face === '+x' || p.face === '-z' ? -v : v)).sort((a, c) => a - c) as [number, number]);
        let a = -L / 2;
        const runs: [number, number][] = [];
        for (const [c0, c1] of cut.sort((m, n) => m[0] - n[0])) {
          if (c0 > a + 0.02) runs.push([a, c0]);
          a = Math.max(a, c1);
        }
        if (L / 2 > a + 0.02) runs.push([a, L / 2]);
        for (const [r0, r1] of runs) {
          k.painted('wood', () => b(r1 - r0, 0.78, D - 0.04, (r0 + r1) / 2, 0.47, -0.02, 0xe8e2d4));
          b(r1 - r0, 0.08, D - 0.1, (r0 + r1) / 2, 0.04, -0.05, C.trim);
          for (let x = r0 + 0.5; x < r1 - 0.1; x += 0.5) b(0.01, 0.7, 0.01, x, 0.47, front - 0.035, 0x9a8f80);
        }
        k.painted('brushed', () => b(L + 0.02, 0.04, D + 0.02, 0, 0.88, 0, 0xcfcac0));
        break;
      }
      case 'cooker': {
        // Stainless, a black hob with its rings and a fiddle rail round it (pans stay put at sea), the oven door, the hood over.
        k.painted('brushed', () => b(L - 0.02, 0.86, D - 0.04, 0, 0.45, -0.02, C.steel));
        b(L - 0.04, 0.02, D - 0.08, 0, 0.9, -0.02, 0x1a1c1e);
        for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.12], [0.14, 0.12]]) k.ring(0.07, 0.008, [x, 0.915, z], 'y', 0x55595c);
        for (const s of [-1, 1]) {
          k.cyl(0.008, [-L / 2 + 0.03, 0.97, s * (D / 2 - 0.06)], [L / 2 - 0.03, 0.97, s * (D / 2 - 0.06)], C.steel, 6);
          k.cyl(0.008, [s * (L / 2 - 0.03), 0.97, -D / 2 + 0.06], [s * (L / 2 - 0.03), 0.97, D / 2 - 0.06], C.steel, 6);
        }
        b(L - 0.12, 0.42, 0.01, 0, 0.42, front - 0.02, 0x222528);
        k.cyl(0.012, [-L / 2 + 0.08, 0.68, front], [L / 2 - 0.08, 0.68, front], C.steel, 6);
        k.painted('brushed', () => {
          b(L, 0.12, D - 0.1, 0, 1.75, -0.05, C.steel);
          b(L * 0.6, 0.35, 0.3, 0, 1.98, back + 0.15, C.steel);
        });
        // The kettle on the hob.
        k.cyl(0.08, [0.14, 0.92, -0.1], [0.14, 1.1, -0.1], 0xb8bcc0, 12, 0.06);
        break;
      }
      case 'sink': {
        k.painted('wood', () => b(L, 0.78, D - 0.04, 0, 0.47, -0.02, 0xe8e2d4));
        k.painted('brushed', () => {
          b(L + 0.02, 0.04, D + 0.02, 0, 0.88, 0, 0xcfcac0);
          b(L - 0.2, 0.012, D - 0.2, 0, 0.902, 0.02, 0x9da2a6);
        });
        k.cyl(0.015, [0, 0.9, back + 0.08], [0, 1.15, back + 0.08], C.steel, 8);
        k.cyl(0.012, [0, 1.15, back + 0.08], [0, 1.15, back + 0.22], C.steel, 8);
        break;
      }
      case 'fridge': {
        b(L - 0.02, H, D - 0.04, 0, H / 2, -0.02, C.white);
        b(L - 0.04, 0.01, 0.01, 0, H * 0.68, front - 0.035, 0x9a9a96);
        k.cyl(0.012, [L / 2 - 0.08, H * 0.75, front - 0.02], [L / 2 - 0.08, H * 0.92, front - 0.02], C.steel, 6);
        k.cyl(0.012, [L / 2 - 0.08, H * 0.35, front - 0.02], [L / 2 - 0.08, H * 0.6, front - 0.02], C.steel, 6);
        break;
      }
      case 'cupboards': {
        // Lockers over the worktop: the doors' lines and a lip on each shelf.
        k.painted('wood', () => b(L, H, D, 0, H / 2, 0, 0xe8e2d4));
        for (let x = -L / 2 + 0.5; x < L / 2 - 0.1; x += 0.5) b(0.01, H - 0.06, 0.01, x, H / 2, front + 0.005, 0x9a8f80);
        b(L, 0.03, 0.02, 0, 0.015, front + 0.01, C.darkWood);
        break;
      }
      case 'bootRack': {
        // Two slatted shelves, boots on them in pairs.
        for (const y of [0.05, 0.28]) for (let z = back + 0.04; z < front; z += 0.07) b(L, 0.02, 0.04, 0, y, z, C.darkWood);
        for (const s of [-1, 1]) b(0.03, 0.45, D, s * (L / 2 - 0.015), 0.225, 0, C.darkWood);
        for (let i = 0; i < 3; i++)
          for (const s of [-1, 1]) {
            const x = -L / 2 + 0.2 + i * 0.32 + s * 0.06;
            k.box(0.1, 0.3, 0.26, x, 0.07 + 0.15, 0, i === 1 ? 0xd8b020 : 0x1c1d1f);
          }
        break;
      }
      case 'oilskins': {
        // A rail of hooks on the wall, oilskins hanging from them.
        b(L, 0.06, 0.04, 0, H, back + 0.02, C.darkWood);
        const colours = [0xe8701c, 0xe6c21e, 0xe8701c, 0x2a3b55];
        colours.forEach((col, i) => {
          const x = -L / 2 + (L / (colours.length + 1)) * (i + 1);
          k.cyl(0.012, [x, H, back + 0.03], [x, H, back + 0.12], C.steel, 6);
          k.box(0.42, 0.8, 0.14, x, H - 0.45, back + 0.12, col);
          k.box(0.2, 0.08, 0.16, x, H - 0.08, back + 0.12, col);
        });
        break;
      }
      case 'lifejackets': {
        b(L, H, D, 0, H / 2, 0, 0xe0dcd2);
        b(L - 0.1, H - 0.4, 0.01, 0, H / 2 - 0.05, front + 0.005, 0xe8701c);
        local.push(plate(plateCell(PLATES.indexOf('LIFEJACKETS')), [0, H - 0.12, front + 0.012], '+z', 0.4, 0.1));
        break;
      }
      case 'extinguisher': {
        k.cyl(0.08, [0, 0, 0], [0, H - 0.12, 0], 0xc8261a, 14);
        k.ball(0.075, 0, H - 0.12, 0, 0xc8261a, 12);
        k.cyl(0.02, [0, H - 0.05, 0], [0, H, 0], 0x202224, 8);
        k.cyl(0.012, [0, H, 0], [0.12, H - 0.25, 0.06], 0x202224, 6);
        b(0.12, 0.04, 0.05, 0, H * 0.6, back + 0.025, 0x30353a);
        break;
      }
      case 'notice': {
        b(L, H, 0.015, 0, H / 2, back + 0.008, 0x8a6a48);
        break;
      }
      case 'berth': {
        k.painted('wood', () => {
          b(L, 0.4, D, 0, 0.2, 0, C.wood);
          b(L, 0.12, 0.03, 0, 0.6, front - 0.015, C.darkWood); // the lee board
        });
        for (const x of [-L / 4, L / 4]) b(L / 2 - 0.1, 0.01, 0.01, x, 0.2, front + 0.005, C.darkWood);
        k.painted('sacking', () => b(L - 0.04, 0.12, D - 0.08, 0, 0.46, -0.02, C.mattress));
        b(0.45, 0.1, D - 0.2, -L / 2 + 0.3, 0.57, -0.04, C.white);
        k.painted('sacking', () => b(L * 0.6, 0.03, D - 0.06, L * 0.18, 0.535, -0.02, 0x7a2e2a));
        break;
      }
      case 'bunk': {
        // Two berths, one over the other, between end boards; a ladder at the foot; a lee rail on the upper.
        k.painted('wood', () => {
          for (const s of [-1, 1]) b(0.04, H, D, s * (L / 2 - 0.02), H / 2, 0, C.wood);
          b(L, 0.3, D, 0, 0.15, 0, C.wood);
          b(L - 0.08, 0.06, D, 0, 1.03, 0, C.wood);
          b(L - 0.08, 0.2, 0.03, 0, 1.28, front - 0.015, C.darkWood);
        });
        k.painted('sacking', () => {
          b(L - 0.1, 0.11, D - 0.08, 0, 0.355, -0.02, C.mattress);
          b(L - 0.1, 0.11, D - 0.08, 0, 1.115, -0.02, C.mattress);
          b(L * 0.6, 0.03, D - 0.06, L * 0.15, 0.425, -0.02, 0x2e5a3a);
          b(L * 0.6, 0.03, D - 0.06, L * 0.15, 1.185, -0.02, 0x7a2e2a);
        });
        for (const y of [0.42, 1.18]) b(0.42, 0.1, D - 0.2, -L / 2 + 0.3, y + 0.04, -0.04, C.white);
        const lx = L / 2 - 0.3;
        for (const s of [-1, 1]) k.cyl(0.015, [lx + s * 0.18, 0.3, front + 0.04], [lx + s * 0.18, 1.35, front + 0.04], C.steel, 6);
        for (let y = 0.5; y < 1.3; y += 0.25) k.cyl(0.012, [lx - 0.18, y, front + 0.04], [lx + 0.18, y, front + 0.04], C.steel, 6);
        break;
      }
      case 'desk': {
        k.painted('wood', () => {
          b(L, 0.03, D, 0, H - 0.015, 0, C.wood);
          b(0.42, H - 0.03, D - 0.04, L / 2 - 0.21, (H - 0.03) / 2, -0.02, C.wood);
          b(L, 0.25, 0.25, 0, H + 0.5, back + 0.125, C.wood); // a shelf over it
        });
        for (const y of [0.18, 0.42, 0.62]) b(0.36, 0.01, 0.01, L / 2 - 0.21, y, front - 0.03, C.darkWood);
        // A laptop, a book, a lamp.
        b(0.34, 0.02, 0.24, -0.1, H + 0.01, 0.02, 0x2a2d30);
        b(0.34, 0.22, 0.01, -0.1, H + 0.12, -0.1, 0x2a2d30);
        b(0.2, 0.04, 0.28, 0.25, H + 0.02, 0.05, 0x7a3a2a);
        k.cyl(0.01, [-L / 2 + 0.15, H, back + 0.1], [-L / 2 + 0.15, H + 0.35, back + 0.15], C.steel, 6);
        k.cyl(0.06, [-L / 2 + 0.15, H + 0.33, back + 0.16], [-L / 2 + 0.15, H + 0.4, back + 0.2], 0x2a4a6a, 10, 0.03);
        break;
      }
      case 'chair': {
        const s = Math.min(L, D);
        k.painted('sacking', () => {
          b(s, 0.06, s, 0, 0.45, 0, C.upholstery);
          b(s, 0.4, 0.05, 0, 0.7, back + 0.03, C.upholstery);
        });
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.015, [(x * s) / 2.4, 0, (z * s) / 2.4], [(x * s) / 2.4, 0.43, (z * s) / 2.4], C.steel, 6);
        break;
      }
      case 'wardrobe': {
        k.painted('wood', () => b(L - 0.02, H, D - 0.02, 0, H / 2, -0.01, C.wood));
        b(0.01, H - 0.1, 0.01, 0, H / 2, front - 0.015, C.darkWood);
        for (const x of [-0.05, 0.05]) b(0.02, 0.15, 0.03, x, H * 0.55, front, C.steel);
        break;
      }
      case 'shower': {
        // A tray, walls to the ceiling at the back and the far side, a curtain drawn half across its front, the shower head.
        b(L, 0.08, D, 0, 0.04, 0, C.white);
        b(L, H, 0.03, 0, H / 2, back + 0.015, C.white);
        b(0.03, H, D, -L / 2 + 0.015, H / 2, 0, C.white);
        b(0.03, H, D, L / 2 - 0.015, H / 2, 0, C.white);
        k.cyl(0.012, [-L / 2, 2.0, front - 0.03], [L / 2, 2.0, front - 0.03], C.steel, 6);
        b(L * 0.45, 1.85, 0.015, -L / 2 + L * 0.225, 1.05, front - 0.03, 0x7fa8c0);
        k.cyl(0.012, [0, 0.9, back + 0.04], [0, 1.95, back + 0.04], C.steel, 6);
        k.cyl(0.07, [0, 1.95, back + 0.12], [0, 1.92, back + 0.12], C.steel, 12);
        break;
      }
      case 'wc': {
        k.cyl(0.17, [0, 0, 0.05], [0, 0.38, 0.05], C.white, 14, 0.2);
        b(0.38, 0.03, 0.42, 0, 0.4, 0.06, C.white);
        b(0.42, 0.35, 0.16, 0, 0.6, back + 0.08, C.white);
        b(0.08, 0.02, 0.04, 0.12, 0.78, back + 0.08, C.steel);
        // The paper on the wall beside it.
        k.cyl(0.05, [L / 2, 0.7, back + 0.15], [L / 2 - 0.1, 0.7, back + 0.15], C.white, 10);
        break;
      }
      case 'basin': {
        k.painted('wood', () => b(L, 0.78, D - 0.04, 0, 0.39, -0.02, C.white));
        b(L + 0.02, 0.05, D, 0, 0.8, 0, C.white);
        b(L - 0.16, 0.01, D - 0.18, 0, 0.83, 0.02, 0xdfe4e6);
        k.cyl(0.012, [0, 0.82, back + 0.06], [0, 1.0, back + 0.06], C.steel, 6);
        k.cyl(0.01, [0, 1.0, back + 0.06], [0, 1.0, back + 0.16], C.steel, 6);
        // The mirror over it, and a cabinet beside.
        b(L - 0.04, 0.6, 0.02, 0, 1.55, back + 0.01, 0x8a8f92);
        g.box(L - 0.1, 0.54, 0.005, 0, 1.55, back + 0.023, 0xc9d2d6);
        break;
      }
      case 'washer': {
        // The washing machine, the dryer stacked on it: round doors and their controls.
        for (const [y0, col] of [[0, C.white], [0.88, 0xe8e8e4]] as const) {
          b(L - 0.02, 0.85, D - 0.04, 0, y0 + 0.425, -0.02, col);
          k.ring(0.17, 0.025, [0, y0 + 0.42, front - 0.02], 'z', 0x9aa0a6);
          b(0.2, 0.04, 0.01, -L / 2 + 0.18, y0 + 0.75, front - 0.02, 0x4a4e52);
          g.box(0.22, 0.22, 0.004, 0, y0 + 0.42, front - 0.018, 0x5a6870);
        }
        break;
      }
      case 'shelves': {
        // Steel shelving, its shelves full of stores: tins, boxes, bottles, rolls.
        for (const s of [-1, 1]) for (const z of [back + 0.02, front - 0.02]) b(0.03, H, 0.03, s * (L / 2 - 0.015), H / 2, z, 0x8a9096);
        const goods = [0xc8a060, 0x8a2a2a, 0xd8d0b0, 0x3a6a9a, 0xe0e0d8, 0x6a8a3a];
        for (let i = 0; i < 4; i++) {
          const y = 0.1 + i * 0.45;
          b(L, 0.02, D, 0, y, 0, 0x9aa0a6);
          for (let j = 0; j < Math.floor(L / 0.22); j++) {
            const x = -L / 2 + 0.12 + j * 0.22;
            const col = goods[(i * 5 + j) % goods.length];
            if ((i + j) % 3 === 0) k.cyl(0.06, [x, y + 0.01, 0], [x, y + 0.2, 0], col, 10);
            else b(0.18, 0.18 + ((i + j) % 2) * 0.08, D - 0.08, x, y + 0.1 + ((i + j) % 2) * 0.04, 0, col);
          }
        }
        break;
      }
      case 'stores': {
        // Boxes of stores and a mop and bucket.
        b(0.4, 0.3, 0.35, -0.08, 0.15, 0, 0xc8a060);
        b(0.35, 0.25, 0.3, -0.06, 0.425, 0, 0xb89050);
        k.cyl(0.13, [0.22, 0, 0.05], [0.22, 0.28, 0.05], 0x2a6ac0, 12, 0.15);
        k.cyl(0.012, [0.22, 0.05, 0.05], [0.25, 1.2, -0.05], 0xb08a5c, 6);
        break;
      }
    }
    // Turned to face its way, set on its deck (lifted if it hangs on a wall).
    const m = new THREE.Matrix4().makeRotationY(yawOf(p.face)).setPosition((p.x0 + p.x1) / 2, deck.floor + (p.lift ?? 0), (p.z0 + p.z1) / 2);
    kit.parts.push(...Kit.moved(k.parts, m));
    glow.parts.push(...Kit.moved(g.parts, m));
    plates.push(...local.map((q) => q.applyMatrix4(m)));
    // The chart's picture and the muster list on the atlas.
    if (p.kind === 'chart' || p.kind === 'notice') {
      const cell = p.kind === 'chart' ? CHART : NOTICE;
      const pg = plate(cell, [0, 0, 0], '+z', L - 0.06, H - 0.06);
      pg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, H / 2, back + 0.022)).applyMatrix4(m);
      plates.push(pg);
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.atlasTex.dispose();
  }
}

/** Merge quads carrying their own uvs (the plates): position, normal, uv. */
function mergeGeometriesUv(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position.array as Float32Array));
    nrm.push(...(g.attributes.normal.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

