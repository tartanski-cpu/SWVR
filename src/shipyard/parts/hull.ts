/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her lines and stations.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import type { HullDefinition } from '../../modular/hull';
import { hullFormOf } from '../../modular/hull';
import { SCALES } from '../design';
import type { BuildArgs } from './common';
import { DESIGN_HULLS, sizeScale } from './catalog';

/** Her lines: her type's hull scaled to her length, beam and depth (and raised or lowered to float at her weight, `raise`), and the stations she floats and is drawn on. */
export function hullPart(a: BuildArgs) {
  const { d, raise } = a;
  const warnings: string[] = [];
  const base = DESIGN_HULLS[d.hull];
  // Her size: length, beam and depth as factors of her type's own. A hull that `growsTo` a
  // bigger size grows past her base size in length and beam together, and in depth as the
  // square root of it (and her plating thicker by as much: `grownPlate`): scaled fully in
  // depth, a 22 m landing craft weighed 24 t and floated with 3 m of freeboard (a hull's
  // weight goes with its area, its buoyancy with its volume). Big landing craft are
  // relatively shallower and more heavily plated.
  const L = sizeScale(base, d.length);
  const grown = Math.max(1, L);
  const grownPlate = Math.sqrt(grown);
  const B = SCALES.scale(d.beam) * grown;
  const D = SCALES.scale(d.depth) * grownPlate;
  const form = raised(base.form(L, B, D, d.bow), raise);
  const shape = hullFormOf(form);
  const st = shape.stations;
  const transom = st[0].z;
  const stem = st[st.length - 1].z;
  const bulwarkHeight = Math.round(SCALES.bulwark(d.bulwark) * 100) / 100;

  return { base, bulwarkHeight, form, grownPlate, shape, st, stem, transom, warnings };
}
export type HullPart = ReturnType<typeof hullPart>;

/** Her lines raised by `rise` (m; negative lowers them): her keel and sheer lines, which every height of her hull is measured from. */
function raised(form: HullDefinition['form'], rise: number): HullDefinition['form'] {
  if (!rise) return form;
  // (The workboat's chine hull: its keel, chine and deck heights.)
  if (form.kind === 'chine') {
    const p = form.params;
    return { ...form, params: { ...p, keelY: p.keelY + rise, chineYAft: p.chineYAft + rise, chineYBow: p.chineYBow + rise, deckYAft: p.deckYAft + rise, deckYBow: p.deckYBow + rise } };
  }
  const up = (c: [number, number][]) => c.map(([t, v]) => [t, v + rise] as [number, number]);
  const dsg = form.design;
  return { ...form, design: { ...dsg, keel: up(dsg.keel), sheer: up(dsg.sheer), ...(dsg.chineKeel ? { chineKeel: up(dsg.chineKeel) } : {}) } };
}
