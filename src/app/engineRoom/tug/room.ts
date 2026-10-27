/**
 * The harbour tug's engine room, in detail (owner, 27 Oct 2026: "go to the next level of
 * detail for the engine room, just for the tug ... get that triangles and draw calls count
 * back up and use that Quest processing"). Built from her layout (layout.ts) and her engines
 * (engine.ts), in her axes. While you're below it's all the Quest draws, so it can be rich:
 *
 *   one merged, vertex-coloured mesh for everything that doesn't move (the engines and their
 *   gear, the machinery, pipes, rails, the control room, the floor plates and gratings ...);
 *   one for the glass of the control room's window;
 *   one each for the live panels (screens, gauges) and the fixed ones (switchboard, signs);
 *   one for each shaft line, turning with its engine's revs;
 *   and its lights: the room's two plus three lamps along the deckhead.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeParts } from '../../../render/geometryUtils';
import { withPixelPaint } from '../../../render/pixelPaint';
import type { VesselState } from '../../../vessel/vesselState';
import type { EngineRoomPlan } from '../plan';
import { detailedEngine } from './engine';
import { Kit, circle, type V3 } from './kit';
import type { TugLayout } from './layout';
import { FIXED, LIVE, TugPanels, type Region } from './panels';
import { tugControls, type ControlPlaces } from './controls';
import type { Control } from '../../../controls/Control';
import { busLive, nextControls } from '../../../plant/plant';
import { CONFIG } from '../../../config';

// Colours (as an engine room is painted; the pipes colour-coded, as is usual practice).
const PLATE = 0x8a8f92;
const PLATE2 = 0x7f8487;
const GRATING = 0x6b7074;
const DARK = 0x2a2e31;
const STEEL = 0x8c9399;
const GALV = 0xa9b0b4;
const YELLOW = 0xe2b21c;
const RED = 0xb52a20;
const GREEN = 0x3f8a52; // sea water
const BLUE = 0x3d6fa8; // fresh (jacket) water
const BROWN = 0x7a5a32; // fuel
const OIL = 0xc9a227; // lube oil
const AIR = 0x8ec3e0; // compressed air
const BLACK = 0x222222; // bilge
const LAGGING = 0xc8ccc8;
const ECR_WALL = 0xe9ebe6;
const ECR_FLOOR = 0x5e6c74;
const DESK = 0x50575c;
const WOOD = 0x9c7a50;
const GENSET = 0x4a7d5a;
const CABLE = 0x333638;

/** Round things big enough to be looked at closely (drums, fans, reels): more sides. */
const SIDES_ROUND = 26;
const FRAME = 0xc3c7c0;

/** A frame's knee: the triangular bracket where a deck beam meets a frame (to starboard; mirrored for port). */
function knee(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-0.3, 0);
  s.lineTo(0, -0.3);
  s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }).translate(0, 0, -0.006);
}

/** A quad facing one way, its texture coordinates on a region of a canvas. */
function panel(region: Region, size: readonly [number, number], centre: V3, facing: '+x' | '-x' | '+z' | '-z', w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  if (facing === '-z') g.rotateY(Math.PI);
  else if (facing === '+x') g.rotateY(Math.PI / 2);
  else if (facing === '-x') g.rotateY(-Math.PI / 2);
  g.translate(...centre);
  const [W, H] = size;
  const u0 = region.x / W;
  const u1 = (region.x + region.w) / W;
  const v0 = 1 - (region.y + region.h) / H;
  const v1 = 1 - region.y / H;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // PlaneGeometry's corners: top-left, top-right, bottom-left, bottom-right.
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  return g;
}

export class TugRoom {
  readonly root = new THREE.Group();
  private readonly panels: TugPanels;
  private readonly liveTex: THREE.CanvasTexture;
  private readonly fixedTex: THREE.CanvasTexture;
  /** Each shaft line's mesh (turning about its own axis), port then starboard. */
  private readonly shafts: THREE.Mesh[] = [];
  private readonly turned = [0, 0];
  private sinceDraw = 1;
  /** The start-up's controls (controls.ts), in the room; the app hands them to the interaction system. */
  readonly controls: Control[];
  /** Her lights: full on a live switchboard, the emergency lights (dim) on batteries alone. */
  private readonly lights: { light: THREE.Light; full: number; dead: number }[] = [];
  private lit = 1;
  /** The controls glowing as the next step's (a cue). */
  private readonly cued = new Set<Control>();

  constructor(readonly p: EngineRoomPlan, readonly t: TugLayout, name: string) {
    const k = new Kit();
    const hw = p.halfWidth;
    const sole = p.sole;
    const head = p.deckhead;
    const live: THREE.BufferGeometry[] = [];
    const fixed: THREE.BufferGeometry[] = [];
    const L = t.port.size[0];
    const places: ControlPlaces = { lops: [] };

    // ── The engines, in detail, placed as hers are (at the flange, tilted to the shaft) ──
    for (const e of [t.port, t.stbd]) {
      const side = e.x < 0 ? 1 : -1; // their panels and filters face the centre aisle
      const de = detailedEngine(e.size, side);
      const m = new THREE.Matrix4().makeRotationX((e.angleDeg * Math.PI) / 180).setPosition(e.x, e.flangeY, e.flangeZ);
      k.parts.push(...Kit.moved(de.kit.parts, m));
      // Its local control stand in the aisle: a pedestal, its live panel at eye height, an
      // emergency stop on its forward edge, the plate for its pre-lube switch, START and STOP
      // under the panel (the room's controls: controls.ts).
      const st = t.lops[e === t.port ? 0 : 1];
      const f = st.facing === '+x' ? 1 : -1;
      k.box(0.3, 0.06, 0.5, st.x, sole + 0.03, st.z, DARK);
      k.box(0.1, 1.05, 0.14, st.x - f * 0.05, sole + 0.55, st.z, 0x5f676c);
      k.box(0.12, de.lop.h + 0.42, de.lop.w + 0.08, st.x - f * 0.04, sole + 1.3, st.z, 0x6c7378);
      k.box(0.05, 0.1, 0.1, st.x + f * 0.03, sole + 1.62, st.z + de.lop.w / 2 + 0.02, YELLOW);
      k.cyl(0.035, [st.x + f * 0.05, sole + 1.62, st.z + de.lop.w / 2 + 0.02], [st.x + f * 0.1, sole + 1.62, st.z + de.lop.w / 2 + 0.02], RED, 12);
      live.push(panel(e.x < 0 ? LIVE.lopPort : LIVE.lopStbd, LIVE.size, [st.x + f * 0.021, sole + 1.42, st.z], st.facing, de.lop.w, de.lop.h));
      places.lops.push({ at: [st.x + f * 0.02, sole + 1.42, st.z], facing: st.facing });
      // The exhaust uptakes, lagged, from the turbochargers up through the deckhead, with expansion bellows.
      for (const ex of de.exhausts) {
        const o = new THREE.Vector3(...ex).applyMatrix4(m);
        k.cyl(0.17, [o.x, o.y, o.z], [o.x, head + 0.05, o.z], LAGGING, 18);
        for (let y = o.y + 0.12; y < head - 0.05; y += 0.06) k.ring(0.18, 0.012, [o.x, y, o.z], 'y', STEEL, 18);
      }
      // A drip tray under it, and the handrails along both its sides.
      k.box(e.size[1] + 0.3, 0.05, L + 0.1, e.x, sole + 0.025, e.flangeZ - L / 2, DARK);
      for (const s of [-1, 1]) {
        const rx = e.x + s * (e.size[1] / 2 + 0.28);
        // (A gap in it where the ladder comes down beside it.)
        const L2 = p.ladder;
        const gap = Math.abs(rx - L2.x) < 0.6 ? [L2.z - 0.55, L2.z + 0.55] : null;
        const spans = gap ? [[e.flangeZ - L + 0.2, gap[0]], [gap[1], e.flangeZ]] : [[e.flangeZ - L + 0.2, e.flangeZ]];
        for (const [a0, a1] of spans) {
          if (a1 - a0 < 0.2) continue;
          const posts = Math.max(1, Math.round((a1 - a0) / 1.1));
          for (let i = 0; i <= posts; i++) {
            const z = a0 + ((a1 - a0) * i) / posts;
            k.cyl(0.022, [rx, sole, z], [rx, sole + 1.0, z], YELLOW, 8);
          }
          k.cyl(0.024, [rx, sole + 1.0, a0], [rx, sole + 1.0, a1], YELLOW, 8);
          k.cyl(0.018, [rx, sole + 0.5, a0], [rx, sole + 0.5, a1], YELLOW, 8);
        }
      }
      // Its fire pump on the free end: the pump's red volute, the clutch, and the fire main up to the deckhead.
      const fp = t.firePumps[e.x < 0 ? 0 : 1];
      k.box(0.7, 0.12, 0.7, fp.x, sole + 0.06, fp.z, DARK);
      k.ring(0.24, 0.12, [fp.x, sole + 0.5, fp.z - 0.1], 'z', RED, 22);
      k.cyl(0.24, [fp.x, sole + 0.5, fp.z - 0.12], [fp.x, sole + 0.5, fp.z + 0.05], RED, 22);
      k.cyl(0.13, [fp.x, sole + 0.5, fp.z + 0.05], [fp.x, sole + 0.5, t.front], 0x6a6e70, 16);
      k.bolts(circle([fp.x, sole + 0.5, fp.z - 0.13], 0.2, 10, 'z'), 0.015, 'z', STEEL);
      k.pipe(0.1, [[fp.x + 0.22, sole + 0.5, fp.z - 0.1], [fp.x + 0.45, sole + 0.5, fp.z - 0.1], [fp.x + 0.45, head - 0.15, fp.z - 0.1], [fp.x + 0.45, head - 0.15, p.z0 + 0.2]], RED);
      k.valve([fp.x + 0.45, sole + 1.1, fp.z - 0.1], 0.06, RED, YELLOW);
      fixed.push(panel(FIXED.signFire, FIXED.size, [fp.x, sole + 1.25, fp.z - 0.36], '-z', 0.4, 0.1));
      k.box(0.04, 0.6, 0.04, fp.x, sole + 0.9, fp.z - 0.32, STEEL);
      // The lifting rail over it, under the deckhead, and a chain block on it.
      k.box(0.08, 0.2, L + 0.8, e.x, head - 0.1, e.flangeZ - L / 2, YELLOW);
      k.box(0.2, 0.025, L + 0.8, e.x, head - 0.2, e.flangeZ - L / 2, YELLOW);
      const cz = e.flangeZ - L * 0.55;
      k.box(0.26, 0.12, 0.22, e.x, head - 0.28, cz, 0x6c7378);
      k.cyl(0.11, [e.x - 0.08, head - 0.45, cz], [e.x + 0.08, head - 0.45, cz], 0x6c7378, 14);
      for (const dx of [-0.05, 0.05]) for (let y = head - 0.55; y > sole + 1.6; y -= 0.05) k.ring(0.015, 0.006, [e.x + dx, y, cz], dx < 0 ? 'x' : 'z', GALV, 6);
      k.ring(0.06, 0.016, [e.x, sole + 1.55, cz], 'z', 0xd04a1c, 10);
    }

    // ── The floor: chequer plates, round the engines; gratings over the shaft lines aft ──
    const overShaft = (x: number, z: number) => z > t.aft - 0.05 && [t.port, t.stbd].some((e) => Math.abs(x - e.x) < 0.5);
    let n = 0;
    for (let z = p.z0; z < p.z1 - 0.01; z += 0.6)
      for (let x = -hw; x < hw - 0.01; x += 1.2) {
        const w = Math.min(1.2, hw - x) - 0.012;
        const d = Math.min(0.6, p.z1 - z) - 0.012;
        const cx = x + w / 2;
        const cz = z + d / 2;
        if (overShaft(cx, cz)) continue;
        k.painted('chequer', () => k.box(w, 0.03, d, cx, sole - 0.015, cz, n++ % 3 ? PLATE : PLATE2));
      }
    for (const e of [t.port, t.stbd]) {
      // The bilge under the grating, and the grating's bars across it.
      k.box(1.0, 0.02, p.z1 - t.aft, e.x, e.flangeY - 0.35, (t.aft + p.z1) / 2, 0x3a3a34);
      for (const s of [-1, 1]) k.box(0.04, 0.03, p.z1 - t.aft, e.x + s * 0.5, sole - 0.015, (t.aft + p.z1) / 2, GRATING);
      for (let z = t.aft; z < p.z1; z += 0.05) k.box(1.0, 0.025, 0.008, e.x, sole - 0.0125, z, GRATING);
      // Where the shaft goes through the aft bulkhead: its seal plate.
      k.cyl(0.2, [e.x, e.flangeY, p.z1 - 0.06], [e.x, e.flangeY, p.z1], STEEL, 18);
    }

    // ── The sides: frames, and the pipe runs along both, colour-coded, on brackets ──
    for (const s of [-1, 1]) {
      const x = s * (hw - 0.14);
      const runs: [number, number, number][] = [
        [sole + 1.95, 0.05, s < 0 ? GREEN : RED],
        [sole + 1.82, 0.04, BLUE],
        [sole + 1.7, 0.03, s < 0 ? OIL : AIR],
        [sole + 1.6, 0.025, BROWN],
        [sole + 0.25, 0.06, BLACK],
      ];
      runs.forEach(([y, r, c], i) => k.pipe(r, [[x - s * i * 0.02, y, p.z0 + 0.1], [x - s * i * 0.02, y, p.z1 - 0.1]], c, false));
      for (let z = p.z0 + 0.5; z < p.z1 - 0.2; z += 1.2) {
        k.box(0.03, 0.5, 0.05, s * (hw - 0.05), sole + 1.78, z, GALV);
        k.box(0.2, 0.03, 0.05, s * (hw - 0.12), sole + 1.55, z, GALV);
      }
      // Fire extinguishers on the frames.
      for (const z of [p.z0 + 2.2, (p.z0 + p.z1) / 2 + 1.5]) {
        k.vessel(0.08, s * (hw - 0.14), sole + 0.6, sole + 1.15, z, RED);
        k.cyl(0.012, [s * (hw - 0.14), sole + 1.12, z + 0.05], [s * (hw - 0.14), sole + 0.7, z + 0.12], DARK, 6);
      }
    }

    // ── The engine control room ──
    const ecr = t.ecr;
    let glass: THREE.Mesh | null = null;
    if (ecr) {
      const h = head - sole;
      const wz = ecr.z1;
      const [wx0, wx1] = ecr.window;
      const sill = sole + 1.05;
      const lintel = sole + 1.95;
      // Its aft wall, the window cut in it.
      k.box(wx0 - ecr.x0, h, 0.1, (ecr.x0 + wx0) / 2, sole + h / 2, wz, ECR_WALL);
      k.box(ecr.x1 - wx1, h, 0.1, (wx1 + ecr.x1) / 2, sole + h / 2, wz, ECR_WALL);
      k.box(wx1 - wx0, sill - sole, 0.1, (wx0 + wx1) / 2, (sole + sill) / 2, wz, ECR_WALL);
      k.box(wx1 - wx0, head - lintel, 0.1, (wx0 + wx1) / 2, (lintel + head) / 2, wz, ECR_WALL);
      for (const x of [wx0, (wx0 + wx1) / 2, wx1]) k.box(0.05, lintel - sill, 0.12, x, (sill + lintel) / 2, wz, DARK);
      for (const y of [sill, lintel]) k.box(wx1 - wx0 + 0.05, 0.05, 0.12, (wx0 + wx1) / 2, y, wz, DARK);
      glass = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, lintel - sill).translate((wx0 + wx1) / 2, (sill + lintel) / 2, wz), new THREE.MeshLambertMaterial({ color: 0x9fc4d6, transparent: true, opacity: 0.22, depthWrite: false }));
      // Its inboard wall, the door's gap in it, and the door standing open into the room.
      const [d0, d1] = ecr.door;
      k.box(0.1, h, d0 - ecr.z0, ecr.x1, sole + h / 2, (ecr.z0 + d0) / 2, ECR_WALL);
      k.box(0.1, h, ecr.z1 - d1, ecr.x1, sole + h / 2, (d1 + ecr.z1) / 2, ECR_WALL);
      k.box(0.1, head - (sole + 2.0), d1 - d0, ecr.x1, (sole + 2.0 + head) / 2, (d0 + d1) / 2, ECR_WALL);
      k.box(d1 - d0 - 0.04, 1.96, 0.05, ecr.x1 - (d1 - d0) / 2, sole + 0.99, d0 + 0.03, 0xc9cec8);
      k.ball(0.03, ecr.x1 - 0.12, sole + 1.0, d0 + 0.08, STEEL, 8);
      fixed.push(panel(FIXED.signEcr, FIXED.size, [ecr.x1 + 0.055, sole + 2.08, (d0 + d1) / 2], '+x', 0.84, 0.18));
      // The start-up checklist card on its inboard wall, facing the aisle, beside the door on its
      // longer side (owner, 27 Oct 2026), at eye height.
      {
        const fwd = d0 - ecr.z0;
        const aft = ecr.z1 - d1;
        const cz = fwd > aft ? (ecr.z0 + d0) / 2 : (d1 + ecr.z1) / 2;
        k.box(0.012, 0.58, 0.44, ecr.x1 + 0.056, sole + 1.45, cz, 0xc9c4b2);
        fixed.push(panel(FIXED.card, FIXED.size, [ecr.x1 + 0.063, sole + 1.45, cz], '+x', 0.42, 0.56));
      }
      // Its floor, a step up on sound-deadening, and its ceiling panels.
      k.box(ecr.x1 - ecr.x0, 0.04, ecr.z1 - ecr.z0, (ecr.x0 + ecr.x1) / 2, sole + 0.02, (ecr.z0 + ecr.z1) / 2, ECR_FLOOR);
      k.box(ecr.x1 - ecr.x0, 0.03, ecr.z1 - ecr.z0, (ecr.x0 + ecr.x1) / 2, head - 0.02, (ecr.z0 + ecr.z1) / 2, 0xf2f3ee);
      // The console under the window, its three screens facing in, a keyboard and the telephone.
      const cz0 = ecr.z1 - 0.7;
      const cx0 = ecr.x0 + 0.2;
      const cx1 = ecr.x1 - 0.3;
      k.box(cx1 - cx0, 0.75, 0.64, (cx0 + cx1) / 2, sole + 0.375, cz0 + 0.32, DESK);
      k.box(cx1 - cx0 + 0.04, 0.04, 0.7, (cx0 + cx1) / 2, sole + 0.77, cz0 + 0.33, 0x3a4044);
      const screens = [LIVE.mimic, LIVE.power, LIVE.alarms];
      const sw = Math.min(0.62, (cx1 - cx0 - 0.2) / 3);
      screens.forEach((r, i) => {
        const x = cx0 + 0.1 + sw / 2 + i * ((cx1 - cx0 - 0.2 - sw) / 2);
        k.box(sw + 0.04, sw * 0.66 + 0.04, 0.04, x, sole + 1.1, cz0 + 0.42, 0x15191c);
        k.box(0.06, 0.28, 0.06, x, sole + 0.92, cz0 + 0.46, 0x15191c);
        live.push(panel(r, LIVE.size, [x, sole + 1.1, cz0 + 0.395], '-z', sw, sw * 0.62));
        k.box(sw * 0.7, 0.02, 0.16, x, sole + 0.8, cz0 + 0.15, 0x22272a);
      });
      k.box(0.12, 0.06, 0.18, cx1 - 0.15, sole + 0.82, cz0 + 0.2, 0xb52a20);
      // The chair: five-star base, column, seat, back.
      const chx = (cx0 + cx1) / 2;
      const chz = cz0 - 0.55;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cyl(0.02, [chx, sole + 0.08, chz], [chx + Math.cos(a) * 0.3, sole + 0.05, chz + Math.sin(a) * 0.3], DARK, 6);
      }
      k.cyl(0.03, [chx, sole + 0.08, chz], [chx, sole + 0.45, chz], STEEL, 10);
      k.box(0.48, 0.08, 0.46, chx, sole + 0.48, chz, 0x2f3a44);
      k.box(0.46, 0.55, 0.07, chx, sole + 0.8, chz - 0.22, 0x2f3a44);
      // The main switchboard along the forward bulkhead, its face drawn.
      const mx0 = ecr.x0 + 0.1;
      const mx1 = ecr.x1 - 0.5;
      k.box(mx1 - mx0, 2.0, 0.48, (mx0 + mx1) / 2, sole + 1.0, ecr.z0 + 0.25, 0x98a09e);
      k.box(mx1 - mx0, 0.05, 0.5, (mx0 + mx1) / 2, sole + 2.03, ecr.z0 + 0.25, 0x7a827f);
      fixed.push(panel(FIXED.msb, FIXED.size, [(mx0 + mx1) / 2, sole + 1.15, ecr.z0 + 0.492], '+z', mx1 - mx0 - 0.04, 1.4));
      k.box(mx1 - mx0, 0.04, 0.9, (mx0 + mx1) / 2, sole + 0.02, ecr.z0 + 0.95, 0x1c1c1c); // its rubber mat
      // The brass gauge board on the outboard wall, over the console's end.
      live.push(panel(LIVE.board, LIVE.size, [ecr.x0 + 0.02, sole + 1.62, (ecr.z0 + ecr.z1) / 2 + 0.2], '+x', 1.3, 0.4));
      k.box(0.03, 0.46, 1.36, ecr.x0 + 0.005, sole + 1.62, (ecr.z0 + ecr.z1) / 2 + 0.2, 0x5a3b22);
      // Outside it: the emergency stops and the ear defenders sign, on its aft wall.
      fixed.push(panel(FIXED.signEars, FIXED.size, [ecr.x1 - 0.25 - 0.3, sole + 2.1, wz + 0.052], '+z', 0.5, 0.125));
      fixed.push(panel(FIXED.signStop, FIXED.size, [ecr.x0 + 0.32, sole + 1.62, wz + 0.052], '+z', 0.44, 0.11));
      for (const dx of [0.2, 0.44]) {
        k.box(0.16, 0.16, 0.08, ecr.x0 + dx, sole + 1.4, wz + 0.09, YELLOW);
        k.cyl(0.05, [ecr.x0 + dx, sole + 1.4, wz + 0.13], [ecr.x0 + dx, sole + 1.4, wz + 0.17], RED, 14);
      }
    }

    // ── Forward: the bench and tool board, the day tanks, the air receivers and compressor ──
    if (t.bench) {
      const b = t.bench;
      const bx = (b.x0 + b.x1) / 2;
      k.box(b.x1 - b.x0, 0.06, b.z1 - b.z0, bx, sole + 0.88, (b.z0 + b.z1) / 2, WOOD);
      k.box(b.x1 - b.x0 - 0.06, 0.7, b.z1 - b.z0 - 0.08, bx, sole + 0.45, (b.z0 + b.z1) / 2, 0x6f777c);
      for (let i = 0; i < 3; i++) k.box(0.4, 0.02, 0.01, b.x0 + 0.3 + i * 0.45, sole + 0.6, b.z1 - 0.04, STEEL);
      // The vice on its corner.
      k.box(0.14, 0.12, 0.22, b.x1 - 0.2, sole + 0.97, b.z1 - 0.2, 0x3d5a80);
      k.cyl(0.012, [b.x1 - 0.2, sole + 0.97, b.z1 - 0.08], [b.x1 - 0.2, sole + 0.97, b.z1 + 0.06], STEEL, 6);
      k.box(0.1, 0.06, 0.06, b.x1 - 0.2, sole + 0.97, b.z1 + 0.06, STEEL);
      fixed.push(panel(FIXED.tools, FIXED.size, [bx, sole + 1.45, p.z0 + 0.02], '+z', Math.min(1.4, b.x1 - b.x0), 0.7));
    }
    for (const tk of t.dayTanks) {
      const x = (tk.x0 + tk.x1) / 2;
      const z = (tk.z0 + tk.z1) / 2;
      k.box(tk.x1 - tk.x0, 1.6, tk.z1 - tk.z0, x, sole + 0.8, z, 0x8b6f45);
      // Its sight glass, the quick-closing valve at its foot (wire to deck), the vent up.
      k.cyl(0.02, [tk.x0 + 0.1, sole + 0.15, tk.z1 + 0.04], [tk.x0 + 0.1, sole + 1.5, tk.z1 + 0.04], 0xd9c48a, 8);
      for (const y of [sole + 0.15, sole + 1.5]) k.box(0.06, 0.05, 0.06, tk.x0 + 0.1, y, tk.z1 + 0.03, STEEL);
      // (Its outlet valve is a control: controls.ts.)
      k.box(0.12, 0.12, 0.06, x, sole + 0.35, tk.z1 + 0.03, BROWN);
      k.pipe(0.04, [[x, sole + 1.6, z], [x, head, z]], BROWN, false);
      k.pipe(0.035, [[x, sole + 0.2, tk.z1 + 0.1], [x, sole + 0.12, tk.z1 + 0.35], [t.stbd.x + 0.6, sole + 0.12, tk.z1 + 0.35], [t.stbd.x + 0.6, sole + 0.12, t.front + 0.4]], BROWN);
    }
    for (const r of t.receivers) {
      k.vessel(r.r, r.x, sole + 0.1, sole + 1.7, r.z, 0x7c868c);
      k.box(r.r * 2, 0.1, r.r * 2, r.x, sole + 0.05, r.z, DARK);
      // (The forward bottle's valve is the main air valve, a control: controls.ts.)
      if (r !== t.receivers[0]) k.valve([r.x, sole + 1.75, r.z], 0.035, AIR, RED);
      k.ball(0.05, r.x + r.r * 0.8, sole + 1.2, r.z, 0xf2efe6, 10); // its pressure gauge
    }
    k.pipe(0.025, [[t.receivers[0].x, sole + 1.6, t.receivers[0].z], [t.receivers[0].x, sole + 1.9, t.receivers[0].z], [t.receivers[1].x, sole + 1.9, t.receivers[1].z], [t.receivers[1].x, sole + 1.6, t.receivers[1].z]], AIR);
    if (t.compressor) {
      const c = t.compressor;
      k.box(0.8, 0.12, 0.6, c.x, sole + 0.06, c.z, DARK);
      k.cyl(0.18, [c.x - 0.38, sole + 0.38, c.z], [c.x + 0.05, sole + 0.38, c.z], 0x3d6fa8, 16); // its motor
      k.box(0.3, 0.42, 0.34, c.x + 0.22, sole + 0.35, c.z, 0x7c868c);
      for (let i = 0; i < 5; i++) k.box(0.32, 0.015, 0.36, c.x + 0.22, sole + 0.6 + i * 0.03, c.z, STEEL);
      k.box(0.18, 0.24, 0.1, c.x - 0.2, sole + 0.6, c.z + 0.15, 0x6c7378); // its starter box (its switch: controls.ts)
      k.pipe(0.025, [[c.x + 0.22, sole + 0.75, c.z], [c.x + 0.22, sole + 1.9, c.z], [t.receivers[1].x, sole + 1.9, c.z], [t.receivers[1].x, sole + 1.9, t.receivers[1].z]], AIR);
    }

    // ── Down the sides: the valve chest and bilge pumps (starboard), the sea water strainers (port) ──
    {
      const v = t.valveChest;
      k.box(0.24, 0.3, v.z1 - v.z0, v.x, sole + 0.75, (v.z0 + v.z1) / 2, BLACK);
      for (let z = v.z0 + 0.2; z < v.z1 - 0.1; z += 0.3) {
        k.valve([v.x - 0.08, sole + 0.95, z], 0.04, BLACK, RED);
        k.box(0.01, 0.05, 0.16, v.x - 0.125, sole + 0.72, z, 0xf2efe6); // its name plate
      }
      k.pipe(0.05, [[v.x, sole + 0.6, v.z1], [v.x, sole + 0.25, v.z1 + 0.2]], BLACK);
      for (const bp of t.bilgePumps) {
        k.box(0.42, 0.1, 0.42, bp.x - 0.05, sole + 0.05, bp.z, DARK);
        k.ring(0.13, 0.07, [bp.x - 0.05, sole + 0.3, bp.z], 'y', BLACK, 18);
        k.cyl(0.13, [bp.x - 0.05, sole + 0.3, bp.z], [bp.x - 0.05, sole + 0.85, bp.z], 0x3d6fa8, 16); // its motor, upright
        k.ball(0.13, bp.x - 0.05, sole + 0.85, bp.z, 0x3d6fa8, 12);
        k.box(0.16, 0.2, 0.1, bp.x - 0.2, sole + 0.7, bp.z, 0x6c7378); // its starter box
      }
      for (const st of t.strainers) {
        k.box(0.44, 0.08, 0.44, st.x + 0.02, sole + 0.04, st.z, DARK);
        for (const dz of [-0.1, 0.1]) k.vessel(0.09, st.x, sole + 0.08, sole + 0.6, st.z + dz, GREEN);
        k.cyl(0.015, [st.x, sole + 0.66, st.z], [st.x + 0.2, sole + 0.66, st.z], RED, 6); // the changeover lever
        // (Its sea suction valve is a control: controls.ts.)
        k.cyl(0.05, [st.x + 0.05, sole + 0.35, st.z + 0.28], [st.x + 0.05, sole + 0.72, st.z + 0.28], GREEN, 12);
        k.pipe(0.06, [[st.x, sole + 0.35, st.z + 0.22], [st.x + 0.4, sole + 0.35, st.z + 0.22], [st.x + 0.4, sole + 0.35, t.front - 0.2], [t.port.x - 0.4, sole + 0.35, t.front - 0.2]], GREEN);
      }
    }

    // ── Aft: the generator sets and the thruster room door ──
    for (const g of t.gensets) {
      const len = g.z1 - g.z0;
      k.box(0.84, 0.12, len, g.x, sole + 0.06, (g.z0 + g.z1) / 2, DARK);
      for (const s of [-1, 1]) for (const z of [g.z0 + 0.25, g.z1 - 0.25]) k.box(0.12, 0.06, 0.16, g.x + s * 0.35, sole + 0.15, z, 0x1b1b1b);
      // Its engine forward (a four-in-line, heads and covers), the alternator aft, the control box over it.
      const ez0 = g.z0 + 0.1;
      const ez1 = g.z0 + len * 0.55;
      k.box(0.5, 0.55, ez1 - ez0, g.x, sole + 0.5, (ez0 + ez1) / 2, GENSET);
      for (let i = 0; i < 4; i++) {
        const z = ez0 + (ez1 - ez0) * ((i + 0.5) / 4);
        k.box(0.42, 0.14, (ez1 - ez0) / 4 - 0.04, g.x, sole + 0.85, z, GENSET);
        k.box(0.34, 0.06, (ez1 - ez0) / 4 - 0.08, g.x, sole + 0.95, z, STEEL);
      }
      k.box(0.6, 0.6, 0.12, g.x, sole + 0.55, ez0 - 0.02, 0x30393e); // its heat exchanger end
      k.cyl(0.34, [g.x, sole + 0.55, ez1 + 0.02], [g.x, sole + 0.55, g.z1 - 0.05], GENSET, 22);
      for (let i = 0; i < 8; i++) k.box(0.05, 0.05, (g.z1 - ez1) * 0.8, g.x + Math.cos((i / 8) * Math.PI * 2) * 0.34, sole + 0.55 + Math.sin((i / 8) * Math.PI * 2) * 0.34, (ez1 + g.z1) / 2, 0x3e6a4c);
      k.box(0.4, 0.34, 0.22, g.x, sole + 1.08, g.z1 - 0.3, 0x6c7378);
      k.box(0.3, 0.2, 0.01, g.x, sole + 1.1, g.z1 - 0.185, 0xf2efe6);
      // Its fuel supply (the port set's valve on it is a control: controls.ts), along the floor.
      k.box(0.1, 0.1, 0.1, g.x - 0.55, sole + 0.05, g.z0 + 0.3, BROWN);
      k.pipe(0.025, [[g.x - 0.55, sole + 0.08, g.z0 + 0.3], [g.x - 0.25, sole + 0.08, g.z0 + 0.3], [g.x - 0.25, sole + 0.3, g.z0 + 0.3]], BROWN, false);
      // Its exhaust up, lagged.
      k.cyl(0.07, [g.x + 0.15, sole + 0.95, ez0 + 0.2], [g.x + 0.15, head + 0.05, ez0 + 0.2], LAGGING, 12);
    }
    {
      // The thruster room door, its coaming and its sign; the rotating machinery sign by the shafts.
      const z = p.z1 - 0.03;
      k.box(0.8, 1.7, 0.05, t.aftDoor, sole + 0.95, z, 0x9aa3a8);
      k.box(0.95, 0.15, 0.08, t.aftDoor, sole + 0.075, z, 0x9aa3a8);
      for (const [dx, dy] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, 1.3], [0.3, 1.3]]) k.box(0.08, 0.03, 0.05, t.aftDoor + dx, sole + dy, z - 0.04, STEEL);
      fixed.push(panel(FIXED.signThruster, FIXED.size, [t.aftDoor, sole + 1.95, z - 0.03], '-z', 0.7, 0.175));
      for (const e of [t.port, t.stbd]) fixed.push(panel(FIXED.signRotating, FIXED.size, [e.x, sole + 1.3, z - 0.03], '-z', 0.6, 0.15));
    }

    // ── Overhead: cable trays, the ventilation duct and its outlets, the light fittings ──
    for (const x of [-0.75, 0.75, -(hw - 0.45), hw - 0.45]) {
      k.box(0.36, 0.015, p.z1 - p.z0 - 0.2, x, head - 0.12, (p.z0 + p.z1) / 2, GALV);
      for (const s of [-1, 1]) k.box(0.015, 0.06, p.z1 - p.z0 - 0.2, x + s * 0.18, head - 0.09, (p.z0 + p.z1) / 2, GALV);
      for (let i = 0; i < 4; i++) k.cyl(0.022, [x - 0.12 + i * 0.08, head - 0.09, p.z0 + 0.1], [x - 0.12 + i * 0.08, head - 0.09, p.z1 - 0.1], CABLE, 6);
      for (let z = p.z0 + 0.6; z < p.z1; z += 1.5) k.cyl(0.012, [x, head - 0.115, z], [x, head, z], GALV, 6);
    }
    const duct = -0.35;
    k.box(0.55, 0.32, p.z1 - p.z0 - 0.3, duct, head - 0.18, (p.z0 + p.z1) / 2, GALV);
    for (let z = p.z0 + 1; z < p.z1 - 0.5; z += 2.2) {
      k.box(0.4, 0.08, 0.4, duct, head - 0.38, z, 0x8f969a);
      for (let i = 0; i < 5; i++) k.box(0.36, 0.01, 0.02, duct, head - 0.42, z - 0.16 + i * 0.08, DARK);
    }
    const lamps: V3[] = [];
    for (let z = p.z0 + 0.8; z < p.z1 - 0.3; z += 1.9)
      for (const x of [-1.6, 1.6, -(hw - 0.9), hw - 0.9]) {
        k.box(0.14, 0.06, 1.25, x, head - 0.06, z, 0xe8e8e2);
        k.box(0.08, 0.025, 1.18, x, head - 0.1, z, 0xfffbe8);
        if (Math.abs(x) < 2 && lamps.length < 3 && Math.abs(z - (p.z0 + p.z1) / 2) < 3.5) lamps.push([x, head - 0.3, z]);
      }

    // (The game's pixel paint on it: the chequer plate underfoot, worn and brushed metal.)
    // ── More: the CO2 smothering pipes and nozzles, supply fans, frame knees, drums, spares, sounding pipes, the escape ladder ──
    for (const x of [-(hw - 0.9), -0.9, 0.9, hw - 0.9]) {
      k.pipe(0.025, [[x, head - 0.25, p.z0 + 0.2], [x, head - 0.25, p.z1 - 0.2]], RED, false);
      for (let z = p.z0 + 0.7; z < p.z1 - 0.3; z += 1.6) {
        k.cyl(0.012, [x, head - 0.25, z], [x, head - 0.36, z], RED, 6);
        k.cyl(0.035, [x, head - 0.36, z], [x, head - 0.42, z], 0xb0b5b8, 10, 0.015);
      }
    }
    for (const s of [-1, 1]) {
      const fx = s * (hw - 0.55);
      const fz = p.z0 + 0.45;
      if (s < 0 && ecr) continue; // (the control room has that corner: its own air)
      k.cyl(0.32, [fx, head - 0.05, fz], [fx, head - 0.55, fz], 0x6f8790, SIDES_ROUND);
      k.ring(0.32, 0.03, [fx, head - 0.55, fz], 'y', DARK, SIDES_ROUND);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        k.add(new THREE.BoxGeometry(0.26, 0.012, 0.09).rotateX(0.5).translate(0.14, 0, 0).rotateY(a).translate(fx, head - 0.36, fz), 0x9aa1a5);
      }
      k.cyl(0.06, [fx, head - 0.25, fz], [fx, head - 0.45, fz], DARK, 12);
      for (let i = 0; i < 4; i++) k.cyl(0.006, [fx, head - 0.56, fz], [fx + Math.cos(i * 1.57) * 0.3, head - 0.56, fz + Math.sin(i * 1.57) * 0.3], DARK, 4); // its guard
    }
    for (let z = p.z0 + 0.3; z < p.z1 - 0.1; z += 0.6)
      for (const s of [-1, 1]) k.add(new THREE.BufferGeometry().copy(knee()).scale(s, 1, 1).translate(s * (hw - 0.02), head - 0.14, z), FRAME);
    // Oil drums on a spill pallet, port aft outboard.
    const drumX = t.drums.x;
    k.box(0.75, 0.12, 1.6, drumX, sole + 0.06, t.drums.z, 0xd4a417);
    for (const dz of [-0.4, 0.38]) {
      const dzz = t.drums.z + dz;
      k.cyl(0.29, [drumX, sole + 0.13, dzz], [drumX, sole + 1.0, dzz], dz < 0 ? 0x2c5f8a : 0x8a2c2c, SIDES_ROUND);
      for (const y of [0.42, 0.72]) k.ring(0.295, 0.012, [drumX, sole + y, dzz], 'y', DARK, SIDES_ROUND);
      k.cyl(0.03, [drumX + 0.12, sole + 1.0, dzz], [drumX + 0.12, sole + 1.03, dzz], STEEL, 8);
    }
    // The spares rack aft to starboard: three shelves of boxes, and the fire hose reel.
    const rackX = t.rack.x;
    const rz0 = t.rack.z0;
    for (const dz of [0, 0.9]) k.box(0.04, 1.8, 0.04, rackX - 0.2, sole + 0.9, rz0 + dz, GALV);
    for (let i = 0; i < 4; i++) {
      const y = sole + 0.15 + i * 0.52;
      k.box(0.42, 0.025, 0.94, rackX, y, rz0 + 0.45, GALV);
      if (i < 3) for (let j = 0; j < 4; j++) k.box(0.3, 0.22 + ((i + j) % 3) * 0.06, 0.18, rackX, y + 0.13 + ((i + j) % 3) * 0.03, rz0 + 0.12 + j * 0.22, [0x2f5e9e, 0xc84a2a, 0x3f8a52, 0x8a8f92][(i + j) % 4]);
    }
    {
      const hz = (t.valveChest.z0 + t.front) / 2;
      const hx = -(hw - 0.14);
      k.cyl(0.32, [hx, sole + 1.3, hz - 0.12], [hx, sole + 1.3, hz + 0.12], RED, SIDES_ROUND);
      k.ring(0.24, 0.07, [hx + 0.01, sole + 1.3, hz], 'z', 0xd8c9a0, SIDES_ROUND);
      k.valve([hx + 0.1, sole + 0.85, hz], 0.04, RED, RED);
    }
    // Sounding pipes, their brass caps just clear of the floor plates.
    for (const [x, z] of [[-(hw - 0.3), p.z0 + 1.6], [hw - 0.3, t.front + 0.3], [-(hw - 0.3), t.aft + 0.4], [0.6, p.z1 - 0.5]] as const) {
      k.cyl(0.03, [x, sole - 0.2, z], [x, sole + 0.1, z], STEEL, 10);
      k.cyl(0.04, [x, sole + 0.1, z], [x, sole + 0.14, z], 0xb88a3a, 10);
    }
    // The escape: a ladder in its cage up to the escape hatch, port aft corner.
    {
      const ex = t.escape.x;
      const ez = t.escape.z;
      for (const dx of [-0.2, 0.2]) k.cyl(0.02, [ex + dx, sole, ez], [ex + dx, head + 0.02, ez], YELLOW, 8);
      for (let y = sole + 0.3; y < head; y += 0.28) k.cyl(0.014, [ex - 0.2, y, ez], [ex + 0.2, y, ez], YELLOW, 6);
      for (let y = sole + 1.1; y < head - 0.1; y += 0.35) k.add(new THREE.TorusGeometry(0.38, 0.012, 4, 16, Math.PI).rotateX(Math.PI / 2).translate(ex, y, ez - 0.02), YELLOW);
      k.box(0.7, 0.04, 0.7, ex, head + 0.01, ez - 0.2, 0x7a8287);
      k.box(0.4, 0.1, 0.3, ex, sole + 2.0 > head ? head - 0.3 : sole + 1.9, ez + 0.0, 0x1f6b3a);
    }

    const material = withPixelPaint(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const mesh = new THREE.Mesh(mergeParts(k.parts), material);
    this.root.add(mesh);
    if (glass) this.root.add(glass);

    // ── The shaft lines (turning): coupling, cardan shaft with its joints, through to the Z-drive ──
    for (const e of [t.port, t.stbd]) {
      const s = new Kit();
      const len = p.z1 - 0.06 - (e.flangeZ + 0.02);
      s.cyl(0.36, [0, 0, 0], [0, 0, 0.16], 0xd3a21c, 24); // flexible coupling, its rubber elements
      for (const q of circle([0, 0, 0.17], 0.28, 8, 'z')) s.box(0.09, 0.09, 0.06, q[0], q[1], q[2], 0x1b1b1b);
      s.cyl(0.22, [0, 0, 0.2], [0, 0, 0.3], STEEL, 20);
      for (const z0 of [0.3, len - 0.3]) {
        s.ring(0.14, 0.04, [0, 0, z0 + 0.08], 'z', STEEL, 16);
        s.box(0.06, 0.26, 0.16, 0, 0, z0 + 0.16, 0x6a6e70);
        s.box(0.26, 0.06, 0.16, 0, 0, z0 + 0.16, 0x6a6e70);
      }
      s.cyl(0.085, [0, 0, 0.5], [0, 0, len - 0.3], 0x6a6e70, 16);
      for (let z = 0.8; z < len - 0.5; z += 0.9) s.ring(0.09, 0.012, [0, 0, z], 'z', YELLOW, 12); // balance marks
      const m = new THREE.Mesh(mergeParts(s.parts), material);
      m.position.set(e.x, e.flangeY, e.flangeZ + 0.02);
      m.rotation.order = 'YXZ';
      m.rotation.x = (e.angleDeg * Math.PI) / 180;
      this.shafts.push(m);
      this.root.add(m);
    }

    // ── The panels: live and fixed ──
    this.panels = new TugPanels(name);
    this.liveTex = new THREE.CanvasTexture(this.panels.live);
    this.fixedTex = new THREE.CanvasTexture(this.panels.fixed);
    for (const tex of [this.liveTex, this.fixedTex]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    this.root.add(new THREE.Mesh(mergeGeometries(live), new THREE.MeshBasicMaterial({ map: this.liveTex, toneMapped: false })));
    this.root.add(new THREE.Mesh(mergeGeometries(fixed), new THREE.MeshLambertMaterial({ map: this.fixedTex })));

    // ── Its lights: the room's, and three lamps along the deckhead ──
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0x5d6064, 1.25);
    hemi.position.set(0, head, (p.z0 + p.z1) / 2);
    const amb = new THREE.AmbientLight(0xffffff, 0.3);
    this.root.add(hemi, amb);
    // (Dead ship: the emergency lights only, a dim glow; the lamps out.)
    this.lights.push({ light: hemi, full: 1.25, dead: 0.16 }, { light: amb, full: 0.3, dead: 0.05 });
    for (const l of lamps) {
      const pl = new THREE.PointLight(0xfff1d6, 2.2, 7, 1.6);
      pl.position.set(...l);
      this.root.add(pl);
      this.lights.push({ light: pl, full: 2.2, dead: 0 });
    }

    // ── The start-up's controls ──
    this.controls = tugControls(p, t, places);
    for (const c of this.controls) this.root.add(c.root);
  }

  /** Each frame: the shafts turned with their engines; the live panels redrawn a few times a second. */
  update(v: VesselState | undefined, time: number, dt: number): void {
    if (!v) return;
    for (const c of this.controls) {
      c.sync(v);
      c.tick(dt);
    }
    // The next step's controls glow, a slow soft pulse (owner, 27 Oct 2026: "highlight the next
    // thing ... don't make it too easy"); the rest are put out once, so a lit button relights.
    const cfg = CONFIG.plant.cue;
    const next = cfg.on ? new Set(nextControls(v)) : new Set<string>();
    const level = cfg.level * (0.5 + 0.5 * Math.sin((time * Math.PI * 2) / cfg.periodS));
    for (const c of this.controls) {
      if (next.has(c.channel)) {
        c.cue(level);
        this.cued.add(c);
      } else if (this.cued.delete(c)) c.cue(0);
    }
    // The main lights come up (or go out) with the switchboard, over about a second.
    const want = !v.plant || busLive(v.plant) ? 1 : 0;
    if (this.lit !== want) {
      this.lit = want > this.lit ? Math.min(1, this.lit + dt * 1.5) : Math.max(0, this.lit - dt * 3);
      for (const l of this.lights) l.light.intensity = l.dead + (l.full - l.dead) * this.lit;
    }
    const rpm = [v.engine.rpm, (v.engine.stbd ?? v.engine).rpm];
    this.shafts.forEach((m, i) => {
      // Shown turning at a tenth of its speed (at its true speed, many turns a frame, it would
      // seem to stand still or run backwards): enough to see it's going, and how fast.
      this.turned[i] += ((rpm[i] / 60) * Math.PI * 2 * dt) / 10;
      m.rotation.z = this.turned[i];
    });
    this.sinceDraw += dt;
    if (this.sinceDraw < 0.25) return;
    this.sinceDraw = 0;
    this.panels.drawLive(v, time);
    this.liveTex.needsUpdate = true;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.liveTex.dispose();
    this.fixedTex.dispose();
  }
}

