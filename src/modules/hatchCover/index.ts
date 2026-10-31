/**
 * Module fitting.hatch-cover: a hatch cover in a deck or floor, hinged on one edge, opened
 * and shut by a press on its lifting ring (modular boats M3c). It fits the hatch's opening
 * exactly: its size is the socket's (the hull's opening). The opening and what open does
 * to walking are the hull's; the cover throws the key the recipe binds ('hatch.engine.open').
 *
 * Its socket is the middle of the hinged edge, at floor level; the cover lies toward -x.
 */
import { EngineHatch } from '../../controls/deckGear';
import { busOf } from '../../modular/bus';
import type { EngravedLabel, ModuleDefinition } from '../../modular/module';

export interface HatchCoverConfig {
  /** Engraved on the floor beside it ('' for none). */
  engrave: string;
  /**
   * The lid of a box standing on deck (the RIB's engine box, owner Oct 2026: her inboard
   * stands up out of her shallow hull): the box's plan and height (boat axes), solid to walk
   * round. Unset: a hatch flush in the floor or deck.
   */
  box?: { x0: number; x1: number; z0: number; z1: number; base: number; top: number };
}

export const HATCH_COVER: ModuleDefinition<HatchCoverConfig> = {
  id: 'fitting.hatch-cover',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { engrave: '' },
  ports: { open: { dir: 'write' } },
  footprints: (c) => (c.box ? [{ ...c.box }] : []),
  view: {
    build({ config, keys, socket }) {
      const size = socket.capacity?.size;
      if (!size) throw new Error(`${socket.id}: a hatch cover's socket must give the opening's size`);
      const [width, , length] = size;
      const key = keys.open;
      const hatch = new EngineHatch(width, length, socket.id, { channel: key, read: (s) => busOf(s).num(key) });
      // The engraving lies on the floor beside the forward end, read from inboard.
      const labels: EngravedLabel[] = config.engrave ? [{ text: config.engrave, at: [0.2 - width, 0.002, length / 2 - 0.1], yaw: -Math.PI / 2 }] : [];
      return { staticParts: [], movingParts: [], controls: [hatch], labels, update: () => {} };
    },
  },
};
