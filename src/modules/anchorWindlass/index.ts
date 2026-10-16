/**
 * Module deck.anchor-windlass: the anchor, its chain and the electric windlass at the bow
 * roller (modular boats M5a). The ANCHOR switch ('anchor.letGo') lets go and pays out
 * scope for the depth, or heaves in and stows; the windlass stalls over its pull, and does
 * nothing without 12 V. The chain's pull acts at the hawse through the physics port, after
 * the hull's contacts (where it always did): soft while the chain lifts off the bottom,
 * stiff once it's bar taut; over its holding power the anchor drags (physics/anchor.ts).
 *
 * Its state is today's VesselState.anchor (until M6); its config is the vessel's
 * (CONFIG.vessels.workboat.anchor) plus the windlass's draw. The chain is drawn by the app
 * in the world (it lies on the seabed), from that state.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { anchorStep } from '../../vessel/physics/anchor';
import type { AnchorState } from '../../vessel/vesselState';

export type AnchorWindlassConfig = typeof CONFIG.vessels.workboat.anchor & {
  /** The windlass's draw while it runs (A, on the master alone). */
  amps: number;
};

const chain = { x: 0, y: 0, z: 0 };

export const ANCHOR_WINDLASS: ModuleDefinition<AnchorWindlassConfig, AnchorState> = {
  id: 'deck.anchor-windlass',
  version: 1,
  fits: ['bow.windlass'],
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
  gear: (c) => ({ anchor: { hawse: c.hawse, chainM: c.chainM } }),
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
      throw new Error('the anchor keeps its state in VesselState.anchor until M6');
    },
    legacyState: (v) => v.anchor,
    tick: () => {},
    mooring(port, { config: c, io }, a, dt) {
      const hawse = port.worldPoint(c.hawse);
      anchorStep(a, c, !!io.get('letGo'), !!io.get('powered'), hawse, port.worldVelocity(c.hawse), dt, chain);
      if (chain.x !== 0 || chain.y !== 0 || chain.z !== 0) port.addWorldForce(c.hawse, chain.x, chain.y, chain.z);
    },
  },
};
