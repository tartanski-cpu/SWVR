/**
 * The wheelhouse's colour and its window frames' (owner, Oct 2026: "an option to color the
 * wheelhouse and whether the frames around the windows are black or white"; catalog.ts
 * HOUSE_PAINTS, FRAME_COLOURS).
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { mergeParts } from '../src/render/geometryUtils';
import { PAINTS } from '../src/render/pixelPaint';
import { DESIGN_HULLS, FRAME_COLOURS, HOUSE_PAINTS } from '../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, FRAMES_FIELD, HOUSE_COLOUR_FIELD, type ShipDesign } from '../src/shipyard/design';
import { VESSEL_DEFS, wetOutlet } from '../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../src/vessel/view/hullMesh';

afterAll(() => useDesign(DEFAULT_DESIGN));

const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };

/** Her house mesh: how many vertices in each colour (hex), and in each tile. */
const house = (d: ShipDesign) => {
  useDesign(d);
  const def = VESSEL_DEFS.design;
  const g = mergeParts([buildVesselMeshParts(def.hull, def.layout, wetOutlet(def), def.livery).house!.geometry]);
  const colours = new Map<number, number>();
  const tiles: Record<string, number> = {};
  const c = new THREE.Color();
  for (let i = 0; i < g.attributes.color.count; i++) {
    c.fromBufferAttribute(g.attributes.color as THREE.BufferAttribute, i);
    const h = c.getHex();
    colours.set(h, (colours.get(h) ?? 0) + 1);
    const t = PAINTS[g.attributes.paint.getX(i) - 1];
    if (t) tiles[t] = (tiles[t] ?? 0) + 1;
  }
  return { colours, tiles, livery: def.livery! };
};

describe("the wheelhouse's colour and its frames'", () => {
  it('the Shipyard offers every one', () => {
    expect(HOUSE_COLOUR_FIELD.steps).toBe(HOUSE_PAINTS.length);
    expect(FRAMES_FIELD.steps).toBe(FRAME_COLOURS.length);
  });

  it('a colour chosen paints her house; white frames replace the black; her walls are still lined inside', () => {
    const red = HOUSE_PAINTS.findIndex((p) => p.name === 'Red');
    const white = HOUSE_PAINTS.findIndex((p) => p.name === 'White');
    const r = house({ ...plain, houseColour: red });
    expect(r.livery.house).toBe(HOUSE_PAINTS[red].colour);
    expect(r.colours.get(HOUSE_PAINTS[red].colour!)).toBeGreaterThan(0);
    expect(r.colours.get(FRAME_COLOURS[0].colour)).toBeGreaterThan(0); // black frames as she comes
    const w = house({ ...plain, houseColour: white, frames: 1 });
    expect(w.colours.get(FRAME_COLOURS[1].colour)).toBeGreaterThan(0);
    expect(w.colours.get(FRAME_COLOURS[0].colour) ?? 0).toBe(0);
    expect(w.tiles.wood).toBeGreaterThan(0); // the lining, inside the white walls only
    expect(FRAME_COLOURS[1].colour).not.toBe(HOUSE_PAINTS[white].colour);
  });

  it('in the code (version 32); older codes read as her paint and black frames', () => {
    for (const [houseColour, frames] of [[0, 0], [5, 1], [HOUSE_PAINTS.length - 1, 1]]) {
      const back = decodeDesign(encodeDesign({ ...plain, houseColour, frames }));
      expect('design' in back && [back.design.houseColour, back.design.frames]).toEqual([houseColour, frames]);
    }
  });
});
