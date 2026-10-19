/**
 * The Alaskan 38 (a one-off boat, Oct 2026): her recipe is valid on her own hull, her
 * drawn outboards turn their propellers where her twin engine module puts its thrust, and
 * her one-off geometry builds. (Her hydrostatics and trials: seaTrials.test.ts, with
 * every boat's.)
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { alaskan38PropellerAt, buildAlaskan38Parts } from '../src/boats/alaskan38/view';
import { ONE_OFF_VIEWS } from '../src/boats/oneOffViews';
import { RECIPES } from '../src/boats/library';
import { CONFIG } from '../src/config';
import { vesselWalkArea } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

describe('the Alaskan 38', () => {
  const def = VESSEL_DEFS.alaskan38;
  const c = CONFIG.vessels.alaskan38;

  it('is a 12 m hard-chine hull floating on her design waterline, her deck low aft and high forward', () => {
    const st = def.hull.stations;
    expect(def.hull.params.length).toBeGreaterThan(11.5);
    expect(def.hull.params.length).toBeLessThan(12.5);
    expect(st[0].polygon[0][1]).toBeLessThan(1.0); // the transom's deck edge
    expect(st[st.length - 1].polygon[0][1]).toBeGreaterThan(1.9); // the stem's
    expect(Math.abs(def.cg[2] - c.cg[2])).toBeLessThan(1e-6); // her modules go back where they were weighed
  });

  it('her twin engine module pushes where her drawn outboards turn their propellers', () => {
    const engine = RECIPES.alaskan38.modules.find((m) => m.socket === 'engine');
    expect(engine).toBeDefined();
    const cfg = engine!.config as { twin: { x: number }; propeller: { position: [number, number, number]; diameter: number } };
    expect(cfg.twin.x).toBe(c.bracket.outboardX);
    const drawn = alaskan38PropellerAt(def);
    expect(drawn.map((p) => p[0]).sort()).toEqual([-c.bracket.outboardX, c.bracket.outboardX]);
    for (const p of drawn) {
      expect(p[1]).toBeCloseTo(cfg.propeller.position[1], 2);
      expect(Math.abs(p[2] - cfg.propeller.position[2])).toBeLessThan(0.15);
    }
    expect(cfg.propeller.diameter).toBe(c.outboards.propDiameter);
    // Under water at rest, by at least a radius: the module fades thrust as the disc comes out.
    expect(cfg.propeller.position[1] + cfg.propeller.diameter / 2).toBeLessThan(0);
  });

  it('her one-off parts build as one opaque mesh and one of glass, astern of and along her hull, with nothing out of range', () => {
    expect(ONE_OFF_VIEWS.alaskan38).toBe(buildAlaskan38Parts);
    const group = buildAlaskan38Parts(def);
    expect(group.children.map((c) => c.name).sort()).toEqual(['alaskan38-glass', 'alaskan38-parts']);
    const mesh = group.children.find((c) => c.name === 'alaskan38-parts') as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(100);
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);
    const transom = def.hull.stations[0].z;
    expect(box.max.z).toBeGreaterThan(transom + c.bracket.length); // the outboards hang off the bracket
    expect(box.max.z).toBeLessThan(transom + 3);
    expect(box.min.z).toBeLessThan(-5.5); // the spray rails and bow rail reach the stem
    expect(box.min.y).toBeGreaterThan(-1.0); // the lower units under the bracket, not under the keel
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.08); // symmetric (but for the side door's handle)
    expect(box.max.y).toBeGreaterThan(CONFIG.vessels.alaskan38.house.saloon.roofY + 0.5); // the rod rack and radar over the saloon roof
    const glass = group.children.find((c) => c.name === 'alaskan38-glass') as THREE.Mesh;
    expect(glass.geometry.getAttribute('position').count).toBeGreaterThan(24 * 6); // front, sides, aft, hatch
    expect((glass.material as THREE.MeshBasicMaterial).transparent).toBe(true);
  });

  it('her house floor is walked on its levels: the helm high, two steps down into the saloon, the sill at the aft door', () => {
    const area = vesselWalkArea(def, def.layout);
    const wh = def.layout.wheelhouse!;
    const lv = wh.levels!;
    expect(area.floorsAt(0, -1.2)).toEqual([lv[0].y]); // the pilothouse
    expect(area.floorsAt(0, -0.35)).toEqual([lv[1].y]); // the tread
    expect(area.floorsAt(0.5, 1.5)).toEqual([lv[2].y]); // the saloon
    // Each step is within a stride of the next: you walk down them (STEP_HEIGHT).
    expect(area.walkable(0, -0.35, lv[0].y)).toBe(true);
    expect(area.walkable(0, 0.0, lv[1].y)).toBe(true);
    // Out of the aft door onto the cockpit deck, a step up.
    const deckAtDoor = def.hull.stations.find((st) => st.z < wh.aft)!.polygon[0][1];
    expect(area.walkable(0, wh.aft + 0.3, lv[2].y)).toBe(true);
    expect(deckAtDoor - lv[2].y).toBeLessThan(0.4);
    // Standing in the saloon your head is in the open, under its roof; below its floor is solid.
    expect(area.insideSolid(0.5, lv[2].y + 1.7, 1.5)).toBe(false);
    expect(area.insideSolid(0.5, lv[2].y - 0.3, 1.5)).toBe(true);
  });

  it('the companionway goes down to port of the helm into the fore cabin, where you stand under the trunk', () => {
    const area = vesselWalkArea(def, def.layout);
    const wh = def.layout.wheelhouse!;
    const treads = def.layout.extraFloors!.filter((f) => f.y > 0.1 && f.y < wh.floorY).sort((a, b) => b.y - a.y);
    expect(treads.length).toBe(3);
    // The hole in the pilothouse floor isn't walked; the top tread is a stride below the floor beside it.
    expect(area.floorsAt(-0.9, -2.3)).not.toContain(wh.floorY);
    expect(area.walkable(-0.9, -1.7, wh.floorY)).toBe(true);
    expect(area.walkable(-0.9, (treads[0].z0 + treads[0].z1) / 2, wh.floorY)).toBe(true);
    for (let i = 1; i < treads.length; i++) {
      expect(treads[i - 1].y - treads[i].y).toBeLessThan(0.4);
      expect(area.floorsAt(-0.9, (treads[i].z0 + treads[i].z1) / 2)).toEqual([treads[i].y]);
    }
    // The sole, and standing room over it under the trunk (eye height 1.7).
    const sole = def.layout.extraFloors!.find((f) => f.y < 0.1)!;
    expect(area.floorsAt(-0.2, -3.3)).toContain(sole.y);
    expect(area.floorsAt(-0.2, -3.3)).not.toContain(def.hull.stations.find((st) => st.z < -3.3)!.polygon[0][1]); // no deck over the fore cabin
    expect(area.walkable(-0.8, -2.9, treads[2].y)).toBe(true); // off the bottom tread onto the sole
    expect(area.insideSolid(-0.2, sole.y + 1.7, -3.3)).toBe(false);
    expect(area.insideSolid(-0.9, 1.9, -2.3)).toBe(false); // your head coming up the companionway
    expect(area.insideSolid(0.8, sole.y + 0.5, -3.2)).toBe(false); // in the cabin to starboard (the locker is drawn, not solid)
  });

  it('her saloon carries the chart table (as the dinette table), the duty board and the whiteboard', () => {
    const ids = RECIPES.alaskan38.modules.map((m) => m.module);
    expect(ids).toEqual(expect.arrayContaining(['furniture.chart-table', 'furniture.duty-board', 'furniture.whiteboard']));
  });
});
