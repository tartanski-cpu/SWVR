/**
 * Module deck.solar-roof: a solar boat's panels (owner, 26 Oct 2026: the Shipyard's solar
 * catamaran, from her renders): rows of dark panels in thin aluminium frames over her house's
 * roof and its aft overhang, a wing of them along each side of it, and a rack of them over
 * her foredeck on short legs. The wings hinge at the roof's outer edges; drawn stowed, folded
 * in flat over the roof's outer panels (opening them out and tilting them is a moving part
 * for later, as are her panels charging her battery).
 *
 * Plain geometry from its config (the Shipyard works out where the roof is): merged with the
 * boat's fixed parts, so no draw calls of its own however many panels.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

/** A flat field of panels: from z0 (aft) to z1 (forward), x0 to x1 across, its top at `y`. */
export interface PanelField {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

export interface SolarRoofConfig {
  /** The roof's field and each wing's (stowed: folded in flat over the roof's edge, hinged at its outer side). */
  roof: PanelField;
  wings: PanelField[];
  /** The foredeck rack, and the deck under its legs (null: none). */
  rack: (PanelField & { deckY: number }) | null;
  /** One panel's size (m, across and along) and the gap between panels. */
  panel: [number, number];
  gap: number;
}

const CELLS = 0x1b2740;
const FRAME = 0xb8bcbe;

/** A field's panels on a thin frame plate: as many whole panels as fit, centred. */
function field(f: PanelField, c: SolarRoofConfig): THREE.BufferGeometry[] {
  const [pw, pl] = c.panel;
  const w = f.x1 - f.x0;
  const l = f.z1 - f.z0;
  const parts = [part(new THREE.BoxGeometry(w, 0.03, l).translate((f.x0 + f.x1) / 2, f.y - 0.04, (f.z0 + f.z1) / 2), FRAME)];
  const nx = Math.max(1, Math.floor((w + c.gap) / (pw + c.gap)));
  const nz = Math.max(1, Math.floor((l + c.gap) / (pl + c.gap)));
  const sx = (w - nx * pw - (nx - 1) * c.gap) / 2;
  const sz = (l - nz * pl - (nz - 1) * c.gap) / 2;
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const x = f.x0 + sx + i * (pw + c.gap) + pw / 2;
      const z = f.z0 + sz + k * (pl + c.gap) + pl / 2;
      parts.push(part(new THREE.BoxGeometry(pw, 0.03, pl).translate(x, f.y - 0.015, z), CELLS));
    }
  return parts;
}

export const SOLAR_ROOF: ModuleDefinition<SolarRoofConfig> = {
  id: 'deck.solar-roof',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { roof: { x0: -1, x1: 1, z0: 0, z1: -2, y: 2.5 }, wings: [], rack: null, panel: [1.0, 1.6], gap: 0.04 },
  validateConfig: (c) => [...(c.roof.x1 > c.roof.x0 && c.roof.z0 > c.roof.z1 ? [] : ['the solar roof has no room']), ...(c.panel[0] > 0.2 && c.panel[1] > 0.2 ? [] : ['the solar panels are too small'])],
  ports: {},
  view: {
    frame: 'boat',
    build({ config: c }) {
      // (Fields run aft to forward: z0 > z1, so each is drawn from its forward edge.)
      const flip = (f: PanelField): PanelField => ({ ...f, z0: Math.min(f.z0, f.z1), z1: Math.max(f.z0, f.z1) });
      const parts = [...field(flip(c.roof), c), ...c.wings.flatMap((w) => field(flip(w), c))];
      // Each wing's hinge: a bar along the roof's edge.
      for (const w of c.wings) {
        const x = w.x0 + w.x1 > 0 ? w.x1 : w.x0;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, Math.abs(w.z0 - w.z1), 6).rotateX(Math.PI / 2).translate(x, w.y - 0.04, (w.z0 + w.z1) / 2), FRAME));
      }
      if (c.rack) {
        const r = flip(c.rack);
        parts.push(...field(r, c));
        // Its legs: one at each corner, down to her deck.
        const h = r.y - 0.05 - c.rack.deckY;
        for (const x of [r.x0 + 0.05, r.x1 - 0.05]) for (const z of [r.z0 + 0.05, r.z1 - 0.05]) parts.push(part(new THREE.BoxGeometry(0.05, h, 0.05).translate(x, c.rack.deckY + h / 2, z), FRAME));
      }
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
