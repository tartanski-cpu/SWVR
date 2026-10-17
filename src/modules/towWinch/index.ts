/**
 * Module deck.tow-winch: the hydraulic tow winch just forward of the transom (modular boats
 * M5a): a small drum between two cheeks (it turns while it runs), driven from a gearbox
 * housing on its starboard end, with HEAVE IN and PAY OUT (hold to run) on the housing's
 * top. You stand forward of it facing aft: the winch, the roller and the tow beyond.
 *
 * Its buttons throw 'winch.heaveIn' / 'winch.payOut'; the towing system (tow/tow.ts) heaves
 * and pays out the line while there's hydraulic pressure. The drum turns as the app says
 * through its `api` (it turns for the trawl's net too). Drawn in the boat's axes from its
 * config (defaults: CONFIG.vessels.workboat.towWinch).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { drumAxleY, drumLead, drumParts, turnDrum } from '../../mechanisms/drum';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type TowWinchConfig = typeof CONFIG.vessels.workboat.towWinch;

/** What the app gives the winch each frame: which way the drum turns (+1 in, -1 out, 0 still). */
export interface TowWinchApi {
  drumTurn: number;
}

export const TOW_WINCH: ModuleDefinition<TowWinchConfig> = {
  id: 'deck.tow-winch',
  version: 1,
  fits: ['deck.equipment'],
  defaults: CONFIG.vessels.workboat.towWinch,
  validateConfig: (c) => (c.drumRadius > 0 && c.drumWidth > 0 ? [] : ['the drum needs a radius and a width']),
  ports: {
    heave: { dir: 'write', key: 'winch.heaveIn' },
    payOut: { dir: 'write', key: 'winch.payOut' },
  },
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'towWinch' }],
  gear: (c, hull) => ({ towWinch: { lead: drumLead(drumAxleY(hull.deckY(c.z), c.drumRadius), c.z, c.drumRadius) } }),
  // The drum between its cheeks, and the gearbox housing on its starboard end.
  footprints: (c, hull) => [{ x0: -c.drumWidth / 2 - 0.12, x1: c.drumWidth / 2 + 0.1 + c.housing.width, z0: c.z - 0.25, z1: c.z + 0.25, top: hull.deckY(c.z) + c.housing.height }],
  view: {
    frame: 'boat',
    build({ config: tw, keys, hull, share }) {
      const dy = hull.deckY(tw.z);
      const r = tw.drumRadius;
      const hw = tw.drumWidth / 2;
      const axle = drumAxleY(dy, r);
      const hs = tw.housing;
      const hx = hw + 0.095 + hs.width / 2;
      const steel = 0x5a5f64;
      const staticParts = [
        part(new THREE.BoxGeometry(tw.drumWidth + 0.2 + hs.width, 0.1, 0.5).translate(hs.width / 2, dy + 0.05, tw.z), steel), // the bed
        ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.05, axle + 0.12 - dy, 0.34).translate(s * (hw + 0.07), (axle + 0.12 + dy) / 2, tw.z), steel)), // the cheeks
        part(new THREE.BoxGeometry(hs.width, hs.height, 0.4).translate(hx, dy + hs.height / 2, tw.z), steel), // the gearbox housing
        part(new THREE.BoxGeometry(hs.width - 0.02, 0.012, 0.38).translate(hx, dy + hs.height + 0.006, tw.z), 0x3a4148), // its control panel
      ];
      const drum = new THREE.Group();
      const drumMesh = new THREE.Mesh(mergeParts(drumParts(r, tw.drumWidth)), flatVertexColorMaterial());
      drumMesh.name = 'towWinchDrum';
      drum.position.set(0, axle, tw.z);
      drum.add(drumMesh);
      // Facing aft, HEAVE IN is on your left (outboard), PAY OUT on your right.
      const top = dy + hs.height + 0.012;
      const heave = new Button('winchHeave', keys.heave, 'Tow winch: HEAVE IN (hold)', 'momentary', 0x3a9a4a);
      heave.root.position.set(hx + 0.095, top, tw.z + 0.06);
      const payOut = new Button('winchPayOut', keys.payOut, 'Tow winch: PAY OUT (hold)', 'momentary', 0xe0a020);
      payOut.root.position.set(hx - 0.095, top, tw.z + 0.06);
      share(heave.cap, 'deckButtonCap');
      share(payOut.cap, 'deckButtonCap');
      const api: TowWinchApi = { drumTurn: 0 };
      return {
        staticParts,
        movingParts: [drum],
        controls: [heave, payOut],
        // Read facing aft: the labels lie forward of the buttons, toward you.
        labels: [
          { text: 'HEAVE IN', at: [hx + 0.095, top, tw.z + 0.06], yaw: Math.PI },
          { text: 'PAY OUT', at: [hx - 0.095, top, tw.z + 0.06], yaw: Math.PI },
        ],
        update: (_read, _s, dt) => turnDrum(drum, api.drumTurn, dt),
        api,
      };
    },
  },
};
