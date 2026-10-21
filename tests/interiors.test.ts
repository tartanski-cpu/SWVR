/**
 * The wheelhouse's interior finishes (owner, Oct 2026: "options for the interior textures";
 * CONFIG.interiors): each lines her walls inside and her ceiling in its own colour and tile,
 * chosen in the Shipyard and carried in her design code.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { CONFIG } from '../src/config';
import * as THREE from 'three';
import { paintIndex, paintPixels, PAINTS, TILE, type PaintName } from '../src/render/pixelPaint';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { CABIN_FLOOR_FIELD, decodeDesign, DEFAULT_DESIGN, encodeDesign, INTERIOR_FIELD, type ShipDesign } from '../src/shipyard/design';
import { buildVesselMeshParts } from '../src/vessel/view/hullMesh';
import { mergeParts } from '../src/render/geometryUtils';
import { wetOutlet } from '../src/vessel/vesselDef';

/** How many vertices of her hull mesh wear each tile. */
const tiles = (d: ShipDesign) => {
  useDesign(d);
  const def = VESSEL_DEFS.design;
  const { hull, house } = buildVesselMeshParts(def.hull, def.layout, wetOutlet(def), def.livery);
  const g = mergeParts([hull.geometry, ...(house ? [house.geometry] : [])]);
  const n: Record<string, number> = {};
  const paint = g.attributes.paint;
  for (let i = 0; i < paint.count; i++) {
    const name = PAINTS[paint.getX(i) - 1];
    if (name) n[name] = (n[name] ?? 0) + 1;
  }
  return n;
};

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('interior finishes', () => {
  it('the Shipyard offers every one, each with tiles that exist', () => {
    expect(INTERIOR_FIELD.steps).toBe(CONFIG.interiors.length);
    expect(CABIN_FLOOR_FIELD.steps).toBe(CONFIG.cabinFloors.length);
    for (const f of CONFIG.cabinFloors) expect(paintIndex(f.tile), f.name).toBeGreaterThan(0);
    for (const f of CONFIG.interiors) {
      expect(paintIndex(f.wallTile), f.name).toBeGreaterThan(0);
      expect(paintIndex(f.ceilingTile), f.name).toBeGreaterThan(0);
    }
  });

  it('as she comes, the wood lining; chosen, the walls and ceiling take its tiles and the wood goes', () => {
    const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0 };
    const wood = tiles(plain);
    expect(wood.wood).toBeGreaterThan(0);
    const steel = tiles({ ...plain, interior: 4 });
    expect(steel.steel).toBeGreaterThan(0);
    expect(steel.wood ?? 0).toBe(0);
    // A liner with the wooden beams across, painted into its ceiling's tile (no 3D battens).
    const liner = tiles({ ...plain, interior: 1 });
    expect(liner.beamsLight).toBeGreaterThan(0);
    expect(liner.wood ?? 0).toBe(0);
    expect(liner.teak ?? 0).toBe(0);
    expect(tiles({ ...plain, interior: 2 }).beamsDark).toBeGreaterThan(0);
  });

  it("the painted beams: the liner's colour between them and the wood's on them, under either liner", () => {
    const px = paintPixels();
    const at = (name: PaintName, x: number, y: number) => {
      const i = (PAINTS.indexOf(name) + 1) * TILE * TILE * 4 + (y * TILE + x) * 4;
      return [0, 1, 2].map((c) => (px[i + c] / 255) * 2); // the tile's factor on the colour under it
    };
    const shown = (ceiling: number, f: number[]) => {
      const c = new THREE.Color(ceiling);
      return new THREE.Color(c.r * f[0], c.g * f[1], c.b * f[2]);
    };
    const { colour, pitchPx, widthPx, light, dark } = CONFIG.cabinBeams;
    const wood = new THREE.Color(colour);
    for (const [name, spec] of [['beamsLight', light], ['beamsDark', dark]] as const) {
      const beam = shown(spec.ceiling, at(name, 10, 1));
      const between = shown(spec.ceiling, at(name, 10, widthPx + Math.floor(pitchPx / 2)));
      // On a beam: near the wood's colour (its grain aside); between: near the liner's.
      expect(beam.r / wood.r, name).toBeGreaterThan(0.7);
      expect(beam.r / wood.r, name).toBeLessThan(1.3);
      expect(beam.r).toBeGreaterThan(beam.b * 2); // brown, not grey
      const liner = new THREE.Color(spec.liner);
      expect(between.g / liner.g, name).toBeGreaterThan(0.75);
      expect(between.g / liner.g, name).toBeLessThan(1.25);
    }
  });

  it('the floor: matting as she comes; teak planks or grippy utility when chosen', () => {
    const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0 };
    expect(tiles(plain).deckTeak ?? 0).toBe(0);
    expect(tiles({ ...plain, cabinFloor: 1 }).deckTeak).toBeGreaterThan(0);
    const grippy = tiles({ ...plain, cabinFloor: 2 });
    expect(grippy.nonSlip).toBeGreaterThan(tiles(plain).nonSlip ?? 0);
  });

  it('in the code (version 31), alongside the stacks; older codes read as the wood lining on matting', () => {
    const tug: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 };
    for (const [interior, stackStyle, cabinFloor] of [[0, 0, 0], [3, 1, 2], [5, 0, 1], [5, 1, 2]]) {
      const back = decodeDesign(encodeDesign({ ...tug, interior, stackStyle, cabinFloor }));
      expect('design' in back && [back.design.interior, back.design.stackStyle, back.design.cabinFloor]).toEqual([interior, stackStyle, cabinFloor]);
    }
    expect(() => encodeDesign({ ...tug, cabinFloor: CABIN_FLOOR_FIELD.steps })).toThrow();
    expect(() => encodeDesign({ ...tug, interior: INTERIOR_FIELD.steps })).toThrow();
  });
});
