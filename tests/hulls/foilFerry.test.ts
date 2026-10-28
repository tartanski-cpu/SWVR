/**
 * The foiling electric ferry (owner, Oct 2026: 12 m, 30 passengers, 25 kn foilborne; our own
 * lines of the type): her hull and her foils' layout. Her flying is tests/foils.test.ts.
 */
import { CONFIG } from '../../src/config';
import { describe, expect, it } from 'vitest';
import { DESIGNS } from '../../src/hulls/designs';
import { hydrostatics, loft } from '../../src/hulls/loft';
import { hullFormFromDesign } from '../../src/vessel/hullForm';

const design = DESIGNS.find((d) => d.id === 'foilFerry')!;
const study = hydrostatics(loft(design));
const form = hullFormFromDesign(design);

describe('the foiling ferry (hull study)', () => {
  it('12 x 4.5 m, a catamaran of about 9 t with her 30 passengers aboard, 0.76 m on her hulls', () => {
    expect(study.loa).toBeCloseTo(12, 6);
    expect(study.beam).toBeCloseTo(4.5, 3);
    expect(design.catamaran).toBeDefined();
    expect(study.displacementT).toBeGreaterThan(8.4);
    expect(study.displacementT).toBeLessThan(9.4);
    expect(study.draught).toBeCloseTo(0.76, 2);
  });

  it('her foils: the forward one carrying about 70 % of her weight, deep enough under her keels to lift them clear', () => {
    const f = design.foils!;
    const fwd = f.panels.filter((p) => p.role !== 'aft');
    const aft = f.panels.filter((p) => p.role === 'aft');
    const zF = fwd[0].at[2];
    const zA = aft[0].at[2];
    const share = (zA - study.lcb) / (zA - zF);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.8);
    // Flying her forward foil `rideDepth` deep lifts her keels clear by at least 0.5 m.
    const keel = Math.min(...form.stations.map((s) => s.polygon[2][1]));
    expect(keel - fwd[0].at[1] - f.rideDepth).toBeGreaterThan(0.5);
    // Its two halves meet on her centreline and reach past her struts (on her hulls' centrelines).
    expect(fwd[0].at[0] + fwd[0].span / 2).toBeCloseTo(0, 6);
    for (const s of f.struts.filter((s) => s.z === zF)) expect(Math.abs(s.x)).toBeCloseTo(design.catamaran!.spacing / 2, 6);
    expect(fwd.reduce((a, p) => a + p.span, 0) / 2).toBeGreaterThan(design.catamaran!.spacing / 2);
    // Every strut reaches from her hull down to its foil; her pods (her motors, owner 28 Oct:
    // "the bulbs on the stern foils") at the feet of her aft struts, one under each hull, each
    // turning with her steering.
    for (const s of f.struts) expect(s.bottom).toBeCloseTo(fwd[0].at[1], 6);
    const pod = f.struts.filter((s) => s.podDragArea);
    expect(pod.map((s) => s.x).sort((a, b) => a - b)).toEqual([-design.catamaran!.spacing / 2, design.catamaran!.spacing / 2]);
    for (const s of pod) {
      expect(s.steered).toBe(true);
      expect(s.z).toBeGreaterThan(zF);
      expect(keel - s.bottom).toBeGreaterThan(1.5);
    }
    // Retracted (shallow mode), nothing reaches below 1.0 m: her foils and the pod's foot.
    expect(Math.min(...f.panels.map((p) => p.at[1]), ...f.struts.map((s) => s.bottom)) + f.retract!).toBeGreaterThan(-1.0 + CONFIG.foils.belowFoil - 1e-9);
  });
});
