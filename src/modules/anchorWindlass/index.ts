/**
 * Module deck.anchor-windlass: the anchor, its chain and the electric windlass at the bow
 * roller (modular boats M5a). The ANCHOR switch ('anchor.letGo') lets go and pays out
 * scope for the depth, or heaves in and stows; the windlass stalls over its pull, and does
 * nothing without 12 V. The chain's pull acts at the hawse through the physics port, after
 * the hull's contacts (where it always did): soft while the chain lifts off the bottom,
 * stiff once it's bar taut; over its holding power the anchor drags (physics/anchor.ts).
 *
 * Its state is today's VesselState.anchor (until 6d); its config is the vessel's
 * (CONFIG.vessels.workboat.anchor) plus the windlass's (CONFIG.modules.anchorWindlass). The
 * chain is drawn by the app in the world (it lies on the seabed), from that state.
 *
 * Placeable (owner): its socket (bow.windlass, or any deck.equipment socket) is the bow
 * roller, where the chain leaves her (the hawse); the chain leads out along the socket's
 * forward (-z), so a socket turned to face aft makes it a stern (kedge) anchor. It draws the
 * roller at the socket and the windlass on the deck behind it (`draw`).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { matrixOf } from '../../modular/vesselAssembly';
import { part } from '../../render/geometryUtils';
import { anchorStep } from '../../vessel/physics/anchor';
import type { AnchorState } from '../../vessel/vesselState';

export type AnchorWindlassConfig = typeof CONFIG.vessels.workboat.anchor & typeof CONFIG.modules.anchorWindlass;

const chain = { x: 0, y: 0, z: 0 };

export const ANCHOR_WINDLASS: ModuleDefinition<AnchorWindlassConfig, AnchorState> = {
  id: 'deck.anchor-windlass',
  version: 1,
  fits: ['bow.windlass', 'deck.equipment'],
  defaults: { ...CONFIG.vessels.workboat.anchor, ...CONFIG.modules.anchorWindlass },
  validateConfig: (c) => (c.chainM > 0 && c.holdingN > 0 ? [] : ['the anchor needs chain and holding power']),
  ports: {
    letGo: { dir: 'read', key: 'anchor.letGo' },
    powered: { dir: 'read', key: 'electrical.powered' },
    phase: { dir: 'write', key: 'anchor.phase' },
    chainOut: { dir: 'write', key: 'anchor.chainOut' },
    tension: { dir: 'write', key: 'anchor.tension' },
    dragging: { dir: 'write', key: 'anchor.dragging' },
  },
  needs: () => [{ power: 'electrical' }],
  provides: () => [{ gear: 'anchor' }],
  // The hawse is its socket (the config's `hawse` is the starting workboat's, where her socket is).
  gear: (c, _hull, at) => ({ anchor: { hawse: at([0, 0, 0]), chainM: c.chainM } }),
  // The windlass runs while it pays out or heaves in, and while the anchor hangs off the
  // bottom with the switch off (it's still coming up).
  power: (c) => [
    {
      role: 'load',
      amps: (io) => {
        const p = io.get('phase');
        return p === 'paying' || p === 'weighing' || (p === 'hanging' && !io.get('letGo')) ? c.amps : 0;
      },
    },
  ],
  sim: {
    init: () => {
      throw new Error('the anchor keeps its state in VesselState.anchor until 6d');
    },
    legacyState: (v) => v.anchor,
    tick: () => {},
    mooring(port, { config: c, io, socket }, a, dt) {
      // Its socket (a hull's: in the boat's axes) is the hawse.
      const at = socket.transform.position;
      const hawse = port.worldPoint(at);
      anchorStep(a, c, !!io.get('letGo'), !!io.get('powered'), hawse, port.worldVelocity(at), dt, chain);
      if (chain.x !== 0 || chain.y !== 0 || chain.z !== 0) port.addWorldForce(at, chain.x, chain.y, chain.z);
    },
  },
  view: {
    build({ config: c, socket, hull }) {
      if (!c.draw) return { staticParts: [], movingParts: [], controls: [], update: () => {} };
      // In its socket's axes: the roller at the socket, the chain leading out forward (-z),
      // the windlass `aft` behind it standing on the deck there.
      const place = matrixOf(socket.transform);
      const deckAt = (z: number) => {
        const p = new THREE.Vector3(0, 0, z).applyMatrix4(place);
        return hull.deckY(p.z) - p.y; // the deck's height there, in the socket's axes
      };
      const STEEL = 0x8a9096;
      const r = c.roller;
      const [bw, bh, bd] = c.box;
      const deck = deckAt(c.aft);
      const parts = [
        // The roller between its two cheeks, with a plate back to the deck.
        part(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12).rotateZ(Math.PI / 2), 0x3a3f44),
        ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.02, 0.2, r).translate(s * 0.09, 0.02, r / 2 - 0.12), STEEL)),
        part(new THREE.BoxGeometry(0.2, 0.02, r + 0.1).translate(0, -0.08, r / 2), STEEL),
        // The windlass: its motor housing and the gypsy wheel on its side, the chain from it to the roller.
        part(new THREE.BoxGeometry(bw, bh, bd).translate(0, deck + bh / 2, c.aft), 0xc9ced2),
        part(new THREE.CylinderGeometry(c.gypsy, c.gypsy, 0.08, 14).rotateZ(Math.PI / 2).translate(0, deck + bh + c.gypsy * 0.6, c.aft), 0x3a3f44),
      ];
      // The chain over the deck from the gypsy to the roller (a dark bar).
      const from = new THREE.Vector3(0, deck + bh + c.gypsy * 1.5, c.aft);
      const to = new THREE.Vector3(0, 0.07, 0);
      const len = from.distanceTo(to);
      parts.push(
        part(
          new THREE.BoxGeometry(0.04, 0.025, len)
            .lookAt(to.clone().sub(from))
            .translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2),
          0x2a2d30,
        ),
      );
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
