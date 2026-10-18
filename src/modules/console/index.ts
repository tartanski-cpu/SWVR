/**
 * Module console.standard: the helm console's dash, pedestals and group plates, and its
 * SLOTS, where controls and screens go (modular boats M3). The console itself only stands
 * there: everything you touch or read is another module in one of its slots, so a boat's
 * bridge layout is a sub-recipe (the console, and what goes in which slot).
 *
 * Its fixed parts (the dash box, the pedestals, the plates with their coloured strips) are
 * merged with the boat's other fixed parts into one draw call. Positions are from its socket: the console's
 * top, on the centreline, at its aft face (CONFIG.modules.helmConsole).
 *
 * Wrapped (`wrap`, owner: a three-facet wheelhouse front): the dash's middle stays square
 * across and its wings, outside `centre` either side, are set back `k` m per m out, following
 * the angled outer windows. A slot on a wing is set back with it but NOT turned (owner): every
 * control stays square to the boat, so a lever pushed forward goes forward and a joystick's
 * forward is her bow. The pedestals under them stay square too, set back as a whole; the dash,
 * the desk and the group plates are what angle back. Screens are the exception (`wrap.turn`,
 * their slots): set into the dash's angled face, they turn with it, flush, facing the helm.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { LABEL_OFFSET } from '../../modular/module';
import type { Socket } from '../../modular/socket';
import { part } from '../../render/geometryUtils';

export type ConsoleConfig = typeof CONFIG.modules.helmConsole & { wrap?: { centre: number; k: number; turn?: string[] } };

/** A wrapped dash's setback at x (m aft), and a wing's turn (deg about y): 0 across the middle. */
const setback = (c: ConsoleConfig, x: number) => (c.wrap ? Math.max(0, Math.abs(x) - c.wrap.centre) * c.wrap.k : 0);
const wingYaw = (c: ConsoleConfig, x: number) => (c.wrap && Math.abs(x) > c.wrap.centre ? (x < 0 ? 1 : -1) * (Math.atan(c.wrap.k) * 180) / Math.PI : 0);
/** The x's a wrapped dash's pieces are split at (its wings' inner ends). */
const splits = (c: ConsoleConfig, x0: number, x1: number): [number, number][] => {
  const cuts = c.wrap ? [-c.wrap.centre, c.wrap.centre].filter((x) => x > x0 && x < x1) : [];
  const xs = [x0, ...cuts, x1];
  return xs.slice(1).map((x, i) => [xs[i], x]);
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

export const CONSOLE: ModuleDefinition<ConsoleConfig> = {
  id: 'console.standard',
  version: 1,
  fits: ['helm.console'],
  defaults: CONFIG.modules.helmConsole,
  ports: {},
  // Its size, for the space its socket gives (M7): across its dash and group plates, from the
  // floor to the dash top, from the dash's front to its pedestals' aft ends.
  physical: (c) => {
    const half = Math.max(c.dash.halfWidth, ...c.groups.map((g) => Math.max(Math.abs(g.x[0]), Math.abs(g.x[1]))));
    return { size: [2 * half, c.dash.top - c.pedestals.floor, Math.max(c.pedestals.aft, c.plates.aft) - c.dash.front] };
  },
  // Its instruments' draw on the INSTR circuit.
  power: (c) => [{ role: 'load', circuit: 'instruments', amps: () => c.instrumentsAmps }],
  sockets: (c) =>
    Object.entries(c.slots).map(([id, s]): Socket => {
      const [x, y, z] = s.position;
      // Wrapped: set back with the wing; square to the boat, unless it's a screen's (`turn`).
      const at: [number, number, number] = [x, y, z + setback(c, x)];
      if (!c.wrap?.turn?.includes(id)) return { id, type: 'panel.slot', transform: { position: at, rotationDeg: s.rotationDeg } };
      const [rx, ry, rz] = (s as { rotationDeg?: [number, number, number] }).rotationDeg ?? [0, 0, 0];
      return { id, type: 'panel.slot', transform: { position: at, rotationDeg: [rx, ry + wingYaw(c, x), rz] } };
    }),
  view: {
    build({ config: c }) {
      const d = c.dash;
      const staticParts = splits(c, -d.halfWidth, d.halfWidth).map(([a, b]) => box(b - a, d.top - d.bottom, d.aft - d.front, (a + b) / 2, (d.top + d.bottom) / 2, (d.front + d.aft) / 2, 0x30363b));
      // Group plates under the switch row, a coloured strip along the forward edge of each,
      // its title on the strip.
      const top = 0.005;
      const labels = [];
      for (const g of c.groups) {
        for (const [x0, x1] of splits(c, g.x[0], g.x[1])) {
          staticParts.push(box(x1 - x0, 0.004, c.plates.aft - c.plates.front, (x0 + x1) / 2, top + 0.002, (c.plates.front + c.plates.aft) / 2, 0x3b434a));
          staticParts.push(box(x1 - x0, 0.005, 0.028, (x0 + x1) / 2, top + 0.0025, c.plates.front + 0.014, g.color));
        }
        const mx = (g.x[0] + g.x[1]) / 2;
        labels.push({ text: g.title, at: [mx, top + 0.004, c.plates.front + 0.014 - LABEL_OFFSET + setback(c, mx)] as const, title: true });
      }
      // Wrapped: every piece set back at its x (the wings angle back with the windows).
      if (c.wrap)
        for (const g of staticParts) {
          const p = g.attributes.position;
          for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + setback(c, p.getX(i)));
          p.needsUpdate = true;
          g.computeVertexNormals();
        }
      // Pedestals: from the console top down to the floor, jutting aft under the throttle
      // and the joysticks. Square to the boat, set back as a whole with what stands on them.
      const p = c.pedestals;
      for (const x of p.x) staticParts.push(box(p.halfWidth * 2, -p.floor, p.aft - p.front, x, p.floor / 2, (p.aft + p.front) / 2 + setback(c, x), 0x3c4248));
      // The middle of the dash's face: the app measures how far you are from the screens.
      const dashAnchor = new THREE.Object3D();
      dashAnchor.name = 'dashAnchor';
      dashAnchor.position.set(0, (d.top + d.bottom) / 2, d.aft);
      return { staticParts, movingParts: [dashAnchor], controls: [], labels, update: () => {} };
    },
  },
};
