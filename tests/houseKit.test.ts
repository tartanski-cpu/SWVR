/**
 * The house kit (the settlements brief, Part A): the pipeline's classification of
 * OpenStreetMap buildings (tools/coast/src/houses.ts: tags first, then the rules) and the
 * game's generators (world/view/houseKit.ts): each type's shape and its cost in triangles,
 * and the coast maps' packages carrying the types.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { classify, colours, parseColour, type HouseStyle } from '../tools/coast/src/houses';
import { buildKitHouse } from '../src/world/view/houseKit';
import type { BuildingDef } from '../src/world/defs';
import oban from '../src/world/regions/oban.coast.json';

const STYLE: HouseStyle = {
  walls: [0xffffff],
  painted: [0x2f5d8a, 0xc23b2e],
  doors: [0x222222],
  signs: [0x112233],
  roofs: [0x444444],
  shedWalls: [0x888888],
  shedRoofs: [0x666666],
  stone: [0x888880],
  levels: { cottage: 1.5, house: 2, terrace: 2, shed: 1, church: 2.5, warehouse: 2, boathouse: 1, castle: 4, ruin: 2 },
  roofShapes: { cottage: 'gabled', house: 'gabled', terrace: 'gabled', shed: 'gabled', church: 'gabled', warehouse: 'gabled', boathouse: 'gabled', castle: 'flat', ruin: 'flat' },
  paintedShare: 1,
};
const open = { nearQuay: false, nearShore: false, sharesWalls: false };
const fp = (length: number, width: number) => ({ length, width, area: length * width });

describe('classifying buildings (the pipeline)', () => {
  it('reads the tags first: type, floors, roof shape, colours, a pub', () => {
    const c = classify({ building: 'church' }, fp(20, 10), open, STYLE, 0.3);
    expect(c.type).toBe('church');
    expect(c.source).toBe('tag');
    const h = classify({ building: 'house', 'building:levels': '3', 'roof:shape': 'hipped', 'building:colour': '#336699', amenity: 'pub' }, fp(12, 8), open, STYLE, 0.3);
    expect([h.type, h.levels, h.roof, h.wallColour, h.special]).toEqual(['house', 3, 'hipped', 0x336699, 'pub']);
    expect(h.height).toBe(9);
    expect(classify({ building: 'yes', historic: 'castle' }, fp(20, 20), open, STYLE, 0).type).toBe('castle');
    expect(parseColour('white')).toBe(0xf2f0ea);
  });

  it('infers the rest from the footprint and its surroundings', () => {
    const t = (f: ReturnType<typeof fp>, s: Partial<typeof open> & { landuse?: string } = {}) => classify({ building: 'yes' }, f, { ...open, ...s }, STYLE, 0.5).type;
    expect(t(fp(20, 12), { nearQuay: true })).toBe('warehouse');
    expect(t(fp(7, 5), { nearShore: true })).toBe('boathouse');
    expect(t(fp(20, 12), { landuse: 'farmyard' })).toBe('shed');
    expect(t(fp(5, 4))).toBe('shed');
    expect(t(fp(9, 6), { sharesWalls: true })).toBe('terrace');
    expect(t(fp(36, 7), { landuse: 'residential' })).toBe('terrace');
    expect(t(fp(8, 7))).toBe('cottage');
    expect(t(fp(12, 9))).toBe('house');
    expect(t(fp(40, 20))).toBe('warehouse');
    expect(classify({ building: 'yes' }, fp(12, 9), open, STYLE, 0.5).source).toBe('rule');
  });

  it('colours: painted fronts for a harbour-front terrace and a pub, sheds from their own list', () => {
    const terrace = classify({ building: 'terrace' }, fp(30, 8), open, STYLE, 0.2);
    expect(STYLE.painted).toContain(colours(terrace, STYLE, 0.2, true).wall);
    const shed = classify({ building: 'shed' }, fp(6, 4), open, STYLE, 0.2);
    expect(colours(shed, STYLE, 0.2, false).wall).toBe(0x888888);
  });
});

describe('the house kit (the game)', () => {
  const tris = (bd: Partial<BuildingDef>) => {
    const parts: THREE.BufferGeometry[] = [];
    buildKitHouse({ x: 0, z: 0, width: 8, depth: 12, height: 6, yawDeg: 0, wall: 0xffffff, roof: 0x444444, kind: 'house', roofShape: 'gabled', levels: 2, seed: 1, ...bd } as BuildingDef, 0, parts);
    return parts.reduce((n, g) => n + g.attributes.position.count / 3, 0);
  };

  it('a plain gabled house is 14 triangles (the old box and prism: 20); hipped 14, flat 10', () => {
    expect(tris({ plain: true })).toBe(14);
    expect(tris({ plain: true, roofShape: 'hipped' })).toBe(14);
    expect(tris({ plain: true, roofShape: 'flat' })).toBe(10);
  });

  it('full detail adds a door and chimneys; a church a tower; a terrace its houses', () => {
    expect(tris({})).toBe(14 + 2 + 8);
    expect(tris({ kind: 'cottage', levels: 1.5 })).toBe(14 + 2 + 16);
    expect(tris({ kind: 'church', width: 10, depth: 20 })).toBeGreaterThan(14 + 8);
    const row = tris({ kind: 'terrace', depth: 26, units: [1, 2, 3, 4], plain: true });
    expect(row).toBeGreaterThan(4 * 10);
    expect(row).toBeLessThanOrEqual(4 * 14);
  });

  it('every face points outwards (the walls and roof light from outside)', () => {
    const parts: THREE.BufferGeometry[] = [];
    buildKitHouse({ x: 0, z: 0, width: 8, depth: 12, height: 6, yawDeg: 0, wall: 0xffffff, roof: 0x444444, kind: 'house', roofShape: 'gabled', levels: 2, seed: 1, plain: true } as BuildingDef, 0, parts);
    const p = parts[0].attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      const mid = a.add(b).add(c).divideScalar(3).sub(new THREE.Vector3(0, 3, 0));
      expect(n.dot(mid)).toBeGreaterThan(0);
    }
  });

  it("Oban's package carries the types: terraces, churches, warehouses, not one repeated house", () => {
    const kinds = new Set((oban.buildings as { kind?: string }[]).map((b) => b.kind));
    for (const k of ['house', 'terrace', 'church', 'warehouse', 'cottage', 'boathouse', 'shed']) expect(kinds.has(k), k).toBe(true);
  });
});
