/**
 * Paper in the wheelhouse at night (owner, Oct 2026: the chart table and the whiteboard were
 * very bright at night). The chart, the whiteboard and the duty board are pictures drawn
 * without the scene's lighting (so they read crisply by day): their brightness and colour are
 * set here instead, from the light that falls on them.
 *
 *   level   daylight (the sky's ambient light), the cabin lamp (white: bright; red: faint)
 *           and, for the chart, its own lamp: much dimmer at night, when it's turned down.
 *   night   at night the wheelhouse goes to red light to keep the crew's night vision (the
 *           panels turn red with the dark: CONFIG.panelLighting), and the paper follows: its
 *           whites become a dim red, as a chart under a red chart lamp looks. A white cabin
 *           light, switched on, keeps it white (but it's still no brighter than `nightMax`).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';

export interface PaperLight {
  /** The sky's ambient light (EnvironmentView.ambientIntensity: about 0.06 at night, 1 by day). */
  ambient: number;
  /** 0 day .. 1 night (App's darkness: from the sun's height). */
  darkness: number;
  /** The cabin lamp: 0 off, 1 white, 2 red (and powered). */
  cabin: number;
  /** The chart table's own lamp is lit. */
  lamp?: boolean;
}

/** The colour to multiply the paper's picture by, for the light on it. */
export function paperColour(l: PaperLight, out = new THREE.Color()): THREE.Color {
  const c = CONFIG.nightPaper;
  const p = CONFIG.panelLighting;
  const red = THREE.MathUtils.smoothstep(l.darkness, p.redFrom, p.redTo);
  // The chart lamp: full by day, turned down at night (a chart lamp is dimmed after dark).
  const lamp = l.lamp ? 1 - (1 - c.lampNight) * red : 0;
  const cabin = l.cabin === 1 ? c.cabinWhite : l.cabin === 2 ? c.cabinRed : 0;
  const max = 1 - (1 - c.nightMax) * red;
  const level = Math.min(max, Math.max(c.least, l.ambient * c.daylight + cabin + lamp));
  // How red: the night's red light, unless a white cabin light is on.
  const tint = red * (l.cabin === 1 ? c.whiteLightRed : 1);
  return out.setRGB(level, level * (1 - c.redGreen * tint), level * (1 - c.redBlue * tint));
}
