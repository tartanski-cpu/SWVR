/**
 * Module deck.tender-crane: the knuckle-boom crane on the foredeck that launches and
 * recovers the ship's skiff, with her cradle (modular boats M5a). One press on any of its
 * buttons (on the column's control box, SKIFF CRANE on the helm console, a remote in the
 * skiff) launches her from the cradle or recovers her from alongside, on deck hydraulics.
 *
 * It gives the boat a tender crane: its geometry and its launch and recovery path, which
 * the world's tender system follows (vessel/tenderCrane.ts). Its view (controls/
 * TenderCraneView.ts) poses the arm with the mechanism library's arm solver. The skiff it
 * carries is given to it by the app (`api.attach`): a recipe can't know which boat that is;
 * her buttons, remote and tarpaulin come with her.
 *
 * Drawn in the boat's axes from its config (the vessel's, CONFIG.vessels.workboat.tenderCrane,
 * until M6); the column, saddles and control box are merged with the bridge's fixed parts.
 */
import { CONFIG } from '../../config';
import { TenderCraneView } from '../../controls/TenderCraneView';
import type { ModuleDefinition } from '../../modular/module';
import type { TenderCrane } from '../../vessel/tenderCrane';

export type TenderCraneConfig = TenderCrane & {
  /** Where its SKIFF CRANE button stands on the helm console (the boat's axes). */
  consoleButton: readonly [number, number, number];
};

export const TENDER_CRANE: ModuleDefinition<TenderCraneConfig> = {
  id: 'deck.tender-crane',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { ...CONFIG.vessels.workboat.tenderCrane, consoleButton: CONFIG.vessels.workboat.bridge.craneButton },
  validateConfig: (c) => (c.boom > 0 && c.jib > 0 ? [] : ['the boom and the jib need lengths']),
  ports: {},
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'tenderCrane' }],
  gear: (c) => ({ tenderCrane: c }),
  view: {
    frame: 'boat',
    build({ config, hull }) {
      const crane = new TenderCraneView(config, hull.deckY, config.consoleButton);
      return {
        staticParts: crane.fixedParts,
        movingParts: [crane.root],
        // Its buttons come with the skiff (api.attach); the app hands them to the interaction system.
        controls: [],
        labels: [{ text: 'SKIFF CRANE', at: [...config.consoleButton] }],
        update: () => {},
        api: crane,
      };
    },
  },
};
