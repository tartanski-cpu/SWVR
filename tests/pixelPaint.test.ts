import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitPaint, mergeParts, paintLocal, part } from '../src/render/geometryUtils';
import { PAINTS, TILE, TINTED, paintIndex, paintPixels } from '../src/render/pixelPaint';

describe('pixel painting', () => {
  it('each tile is mid-grey on average (it adds detail, not a darker or lighter colour), and the same every time (but the tinted ones)', () => {
    const px = paintPixels();
    PAINTS.forEach((name, k) => {
      if (TINTED.includes(name)) return; // made for one colour (the beamed liners): their own test
      const base = (k + 1) * TILE * TILE * 4;
      let sum = 0;
      for (let i = 0; i < TILE * TILE; i++) sum += px[base + i * 4];
      expect(sum / (TILE * TILE) / 255, name).toBeGreaterThan(0.44);
      expect(sum / (TILE * TILE) / 255, name).toBeLessThan(0.56);
    });
    expect(paintPixels()).toEqual(px);
  });

  it('a painted part carries its tile, and where on it each face falls, in metres along the face', () => {
    const plain = part(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
    const deck = part(new THREE.BoxGeometry(3, 0.1, 2).translate(0, 1, 0), 0xffffff, 'nonSlip');
    const g = mergeParts([plain, deck]);
    const paint = g.attributes.paint;
    const uv = g.attributes.paintUv;
    const n = plain.attributes.position.count;
    expect(paint.getX(0)).toBe(0);
    expect(paint.getX(n)).toBe(paintIndex('nonSlip'));
    // The deck's top face (facing up) is mapped across (x) and along (z): it spans 3 x 2 m.
    const us: number[] = [];
    const vs: number[] = [];
    for (let i = n; i < g.attributes.position.count; i++) {
      if (Math.abs(g.attributes.normal.getY(i) - 1) > 1e-6) continue;
      us.push(uv.getX(i));
      vs.push(uv.getY(i));
    }
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(3);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2);
  });

  /** A merged geometry's paint coordinates on its faces looking along `axis` (+/-). */
  const faceUvs = (g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z') => {
    const us: number[] = [];
    const ws: number[] = [];
    const k = { x: 0, y: 1, z: 2 }[axis];
    for (let i = 0; i < g.attributes.position.count; i++) {
      if (Math.abs(Math.abs(g.attributes.normal.array[i * 3 + k]) - 1) > 1e-6) continue;
      us.push(g.attributes.paintUv.getX(i));
      ws.push(g.attributes.paintUv.getY(i));
    }
    return { u: [Math.min(...us), Math.max(...us)], w: [Math.min(...ws), Math.max(...ws)] };
  };

  it('a whole-picture tile (a crate side, a window) fills each face once, whatever its size', () => {
    const g = mergeParts([fitPaint(part(new THREE.BoxGeometry(0.7, 0.5, 0.6).translate(3, 1, -2), 0xffffff, 'crate'))]);
    for (const axis of ['x', 'y', 'z'] as const) {
      const { u, w } = faceUvs(g, axis);
      expect(u[0]).toBeCloseTo(0);
      expect(u[1]).toBeCloseTo(1);
      expect(w[0]).toBeCloseTo(0);
      expect(w[1]).toBeCloseTo(1);
    }
  });

  it("paint set in a part's own frame stays square to it once it's turned (a house at 45 degrees), and a roof's turns a quarter", () => {
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 4).setPosition(100, 0, 50);
    // An 8 m wall facing +z: its paint runs 8 m across it, turned or not.
    const wall = paintLocal(part(new THREE.BoxGeometry(8, 3, 0.2), 0xffffff, 'boards')).applyMatrix4(turn);
    const g = mergeParts([wall]);
    const pos = g.attributes.position;
    const uv = g.attributes.paintUv;
    let span = 0;
    for (let i = 0; i < pos.count; i++) for (let j = 0; j < pos.count; j++) span = Math.max(span, Math.abs(uv.getX(i) - uv.getX(j)));
    expect(span).toBeCloseTo(8);
    // Seen from above, a roof's picture is turned: along the ridge (z) is across the tile.
    const roof = mergeParts([paintLocal(part(new THREE.BoxGeometry(6, 0.1, 10), 0xffffff, 'slates'), true)]);
    const top = faceUvs(roof, 'y');
    expect(top.u[1] - top.u[0]).toBeCloseTo(10);
    expect(top.w[1] - top.w[0]).toBeCloseTo(6);
  });
});

describe('hull weathering', () => {
  it("a hull's topsides wear the weathering tile, placed by the freeboard: 0 at the waterline, 1 at the deck edge", async () => {
    const { VESSEL_DEFS } = await import('../src/vessel/vesselDef');
    const { buildVesselMesh } = await import('../src/vessel/view/hullMesh');
    const { hullPlan } = await import('../src/vessel/layout');
    const def = VESSEL_DEFS.workboat;
    const g = buildVesselMesh(def.hull, def.layout).geometry;
    const paint = g.attributes.paint;
    const pos = g.attributes.position;
    const uv = g.attributes.paintUv;
    const top = paintIndex('topsides');
    const deckY = hullPlan({ hull: def.hull }).deckY;
    let n = 0;
    let atDeck = 0;
    for (let i = 0; i < pos.count; i++) {
      if (paint.getX(i) !== top) continue;
      n++;
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // Up her: the height over the waterline as a fraction of the freeboard here.
      expect(uv.getY(i)).toBeCloseTo(y / Math.max(0.3, deckY(z)), 5);
      if (Math.abs(y - deckY(z)) < 1e-6) atDeck++;
    }
    expect(n).toBeGreaterThan(100); // her sides, transom and bow
    expect(atDeck).toBeGreaterThan(10); // the deck edge, where the runs start
    // The deck itself keeps its non-slip, in metres.
    let deck = 0;
    for (let i = 0; i < pos.count; i++) if (paint.getX(i) === paintIndex('nonSlip')) deck++;
    expect(deck).toBeGreaterThan(10);
  });

  it('how used she looks is her livery\'s (0 as new .. 1 well used), on her hull\'s own material; the config\'s if she has none', async () => {
    const { VESSEL_DEFS } = await import('../src/vessel/vesselDef');
    const { buildVesselMesh } = await import('../src/vessel/view/hullMesh');
    const { CONFIG } = await import('../src/config');
    const def = VESSEL_DEFS.workboat;
    const amount = (m: THREE.Mesh) => (m.material as THREE.Material).userData.paintWeathering.value as number;
    expect(amount(buildVesselMesh(def.hull, def.layout, undefined, { weathering: 0 }))).toBe(0);
    expect(amount(buildVesselMesh(def.hull, def.layout, undefined, { weathering: 0.4 }))).toBeCloseTo(0.4);
    expect(amount(buildVesselMesh(def.hull, def.layout))).toBe(CONFIG.pixelPaint.weathering.strength);
  });
});
