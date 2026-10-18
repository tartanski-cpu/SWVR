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

  it('her one-off parts build as one mesh, astern of and along her hull, with nothing out of range', () => {
    expect(ONE_OFF_VIEWS.alaskan38).toBe(buildAlaskan38Parts);
    const mesh = buildAlaskan38Parts(def);
    const pos = mesh.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(100);
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);
    const transom = def.hull.stations[0].z;
    expect(box.max.z).toBeGreaterThan(transom + c.bracket.length); // the outboards hang off the bracket
    expect(box.max.z).toBeLessThan(transom + 3);
    expect(box.min.z).toBeLessThan(-5.5); // the spray rails and bow rail reach the stem
    expect(box.min.y).toBeGreaterThan(-1.0); // the lower units under the bracket, not under the keel
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.05); // symmetric
  });
});
