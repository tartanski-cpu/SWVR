/**
 * Module deck.solar-roof: a solar boat's panels (owner, 26 Oct 2026: the Shipyard's solar
 * catamaran, from her renders): rows of dark panels in thin aluminium frames over her house's
 * roof and its aft overhang, a wing of them along each side of it, and a rack of them over
 * her foredeck on short legs, or on her house's front where it slopes below its windows. The wings hinge at the roof's outer edges; drawn stowed, folded
 * in flat over the roof's outer panels (opening them out and tilting them is a moving part
 * for later).
 *
 * Plain geometry from its config (the Shipyard works out where the roof is): merged with the
 * boat's fixed parts, so no draw calls of its own however many panels.
 *
 * Charging (`charge`; owner, 27 Oct 2026: "solar charging from the sun with a realistic
 * model"), each tick on real-time power (the energy goes in at the rate the motors take it
 * out, so what the screens show is what drives her):
 *   light    the sunlight on each group of panels as she lies (environment/sunlight.ts): the
 *            roof's and the rack's flat, the sloped front's facing ahead and up, each turned
 *            with her heading, heel and trim; the stowed wings lie on the roof's outer panels
 *            and shade them, so those count once
 *   panels   power = light x area x `panelEff`, less `tempCoeff` a degree their cells run over
 *            25 C (cells at the air's `airTempC` plus light x (`noctC` - 20) / 800), through
 *            the charge controller (`controllerEff`) and into the battery (`chargeEff`)
 *   battery  full charge up to `taperFrom` of full, then less and less to nothing at full (a
 *            lithium pack's absorption); what her motors draw now is fed straight from the
 *            panels first (VesselState.engine.powerKw), so a full battery still runs her on sun
 * Her battery is VesselState.battery (the share of `batteryKWh`, her usable kWh); what the
 * panels do now is VesselState.solar, for the SOLAR screen. Not modelled: her own house
 * shading her panels.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';
import { planeIrradiance, sunlight } from '../../environment/sunlight';
import type { VesselState } from '../../vessel/vesselState';

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
  /**
   * Panels on a house front sloped below its windows (the Shipyard's `kick`), from its foot
   * (forward, low: z0, y0) up to the windows (aft, high: z1, y1), x0 to x1 across (none: absent).
   */
  slope?: { x0: number; x1: number; z0: number; y0: number; z1: number; y1: number };
  /** One panel's size (m, across and along) and the gap between panels. */
  panel: [number, number];
  gap: number;
  /** Her panels charging her battery (see above; none: they're only drawn). */
  charge?: SolarCharge;
}

/** How her panels charge her battery (CONFIG.shipyard.solarCat.solar, and her battery's usable kWh). */
export interface SolarCharge {
  batteryKWh: number;
  panelEff: number;
  tempCoeff: number;
  noctC: number;
  airTempC: number;
  controllerEff: number;
  chargeEff: number;
  taperFrom: number;
}

const CELLS = 0x1b2740;
const FRAME = 0xb8bcbe;

/** How many whole panels fit a field (across, along), as drawn. */
function panelsIn(f: PanelField, c: SolarRoofConfig): [number, number] {
  const [pw, pl] = c.panel;
  return [Math.max(1, Math.floor((f.x1 - f.x0 + c.gap) / (pw + c.gap))), Math.max(1, Math.floor((Math.abs(f.z1 - f.z0) + c.gap) / (pl + c.gap)))];
}

/** Her panels in groups by the way they face: area (m2) and the normal (boat axes, z aft). */
export function panelGroups(c: SolarRoofConfig): { area: number; n: [number, number, number] }[] {
  const one = c.panel[0] * c.panel[1];
  const area = (f: PanelField) => {
    const [nx, nz] = panelsIn(f, c);
    return nx * nz * one;
  };
  // Flat: the roof's (the stowed wings lie on its outer panels, so the roof counts once), the rack's.
  const groups: { area: number; n: [number, number, number] }[] = [{ area: area(c.roof) + (c.rack ? area(c.rack) : 0), n: [0, 1, 0] }];
  if (c.slope) {
    // The sloped front: its panels laid along the slope (as drawn), facing forward and up.
    const s = c.slope;
    const len = Math.hypot(s.z1 - s.z0, s.y1 - s.y0);
    groups.push({ area: area({ x0: s.x0, x1: s.x1, z0: 0.05, z1: len - 0.05, y: 0 }), n: [0, (s.z1 - s.z0) / len, -(s.y1 - s.y0) / len] });
  }
  return groups;
}

/** A vector in the boat's axes turned into the world's by her orientation (x, y, z, w). */
function toWorld(q: readonly number[], v: readonly number[], out: [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  // v + 2w (q x v) + 2 q x (q x v), the vector part of q being (x, y, z).
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * tx + (y * tz - z * ty);
  out[1] = v[1] + w * ty + (z * tx - x * tz);
  out[2] = v[2] + w * tz + (x * ty - y * tx);
  return out;
}
const nWorld: [number, number, number] = [0, 0, 0];
const groupCache = new WeakMap<SolarRoofConfig, ReturnType<typeof panelGroups>>();

/** A field's panels on a thin frame plate: as many whole panels as fit, centred. */
function field(f: PanelField, c: SolarRoofConfig): THREE.BufferGeometry[] {
  const [pw, pl] = c.panel;
  const w = f.x1 - f.x0;
  const l = f.z1 - f.z0;
  const parts = [part(new THREE.BoxGeometry(w, 0.03, l).translate((f.x0 + f.x1) / 2, f.y - 0.04, (f.z0 + f.z1) / 2), FRAME)];
  const [nx, nz] = panelsIn(f, c);
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

export const SOLAR_ROOF: ModuleDefinition<SolarRoofConfig, VesselState> = {
  id: 'deck.solar-roof',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { roof: { x0: -1, x1: 1, z0: 0, z1: -2, y: 2.5 }, wings: [], rack: null, panel: [1.0, 1.6], gap: 0.04 },
  validateConfig: (c) => [...(c.roof.x1 > c.roof.x0 && c.roof.z0 > c.roof.z1 ? [] : ['the solar roof has no room']), ...(c.panel[0] > 0.2 && c.panel[1] > 0.2 ? [] : ['the solar panels are too small'])],
  ports: {},
  sim: {
    init: () => {
      throw new Error('the solar roof charges VesselState.battery until 6d');
    },
    legacyState: (v) => v,
    tick({ config: c, env }, v, dt) {
      const ch = c.charge;
      if (!ch) return;
      let groups = groupCache.get(c);
      if (!groups) groupCache.set(c, (groups = panelGroups(c)));
      const light = sunlight(env.sun, env.cloud, env.rain);
      let watts = 0;
      for (const g of groups) {
        const poa = planeIrradiance(light, toWorld(v.orientation, g.n, nWorld));
        const cellC = ch.airTempC + (poa * (ch.noctC - 20)) / 800;
        watts += poa * g.area * ch.panelEff * Math.max(0, 1 + ch.tempCoeff * (cellC - 25));
      }
      const panelKw = (watts * ch.controllerEff) / 1000;
      // What the battery takes: all of it below `taperFrom`, less and less to none at full; what
      // the motors draw now comes straight from the panels.
      const soc = v.battery ?? 0;
      const accept = soc < ch.taperFrom ? 1 : Math.max(0, (1 - soc) / (1 - ch.taperFrom));
      const motors = Math.max(0, v.engine.powerKw ?? 0);
      const chargeKw = Math.min(panelKw, motors + panelKw * accept) * ch.chargeEff;
      v.battery = Math.min(1, soc + (chargeKw * dt) / 3600 / ch.batteryKWh);
      const s = (v.solar ??= { wm2: 0, panelKw: 0, chargeKw: 0 });
      s.wm2 = light.ghi;
      s.panelKw = panelKw;
      s.chargeKw = chargeKw;
    },
  },
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
      if (c.slope) {
        // Laid out flat along the slope (z from its foot), then tilted up to it about its foot.
        const s = c.slope;
        const dz = s.z1 - s.z0;
        const dy = s.y1 - s.y0;
        const tilt = new THREE.Matrix4().makeRotationX(-Math.atan2(dy, dz)).setPosition(0, s.y0, s.z0);
        for (const g of field({ x0: s.x0, x1: s.x1, z0: 0.05, z1: Math.hypot(dz, dy) - 0.05, y: 0.06 }, c)) parts.push(g.applyMatrix4(tilt));
      }
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
