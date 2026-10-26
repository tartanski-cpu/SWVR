/**
 * The Shipyard's trials, off the page's main thread (a few seconds of physics): match her
 * gearbox (shipyard/trial.ts), then run the game's own sea trials on her (vessel/seaTrials.ts).
 * Posts back the design with its matched gear, and the results.
 */
import { useDesign } from '../boats/sims';
import { runSeaTrials } from '../vessel/seaTrials';
import type { ShipDesign } from './design';
import { matchGear } from './trial';

self.onmessage = (e: MessageEvent<{ id: number; design: ShipDesign; match: boolean }>) => {
  const { id, match } = e.data;
  let design = e.data.design;
  try {
    // Her gearbox first, sent back at once (her code is ready to save), then the longer trials
    // (owner, Oct 2026: on the Quest a big boat's code waited minutes for both).
    if (match) {
      design = { ...design, gear: matchGear(design).gear };
      self.postMessage({ id, design, matched: true });
    }
    useDesign(design);
    const trials = runSeaTrials('design');
    self.postMessage({ id, design, trials });
  } catch (err) {
    self.postMessage({ id, design, error: String(err) });
  }
};
