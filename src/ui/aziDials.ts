/**
 * Desktop, at the helm of a boat with azimuth drives (the harbour tug): two small dials in
 * the bottom corners, the port drive's left and the starboard's right (owner, 27 Oct 2026; as
 * on her ENGINE screen and her poster): an arrow the way the drive really pushes, a ring where
 * its lever asks it to go, and a bar for its power. Not in VR (there the levers and the
 * screens are in front of you). Two small canvases, redrawn only when what they show changes.
 */
import { CONFIG } from '../config';
import { azimuthDial } from '../controls/instruments';

const RED = '#e0523c';
const GREEN = '#3cbf62';

/** What a dial shows: where its drive points and where its lever asks (deg), and its power (0..1). */
export interface DialShows {
  deg: number;
  askDeg: number;
  power: number;
}

export class AziDials {
  private readonly canvases: HTMLCanvasElement[] = [];
  private shown = ['', ''];
  private on = false;

  constructor() {
    const px = CONFIG.aziHelm.dialPx;
    (['left', 'right'] as const).forEach((side) => {
      const c = document.createElement('canvas');
      c.width = 150;
      c.height = 176;
      const s = c.style;
      s.position = 'fixed';
      s.bottom = '16px';
      s[side] = '16px';
      s.width = `${px}px`;
      s.height = `${Math.round((px * 176) / 150)}px`;
      s.pointerEvents = 'none';
      s.display = 'none';
      document.body.appendChild(c);
      this.canvases.push(c);
    });
  }

  /** Each frame: shown (the two drives, port first) or hidden (null). */
  update(drives: [DialShows, DialShows] | null): void {
    const on = !!drives;
    if (on !== this.on) {
      this.on = on;
      for (const c of this.canvases) c.style.display = on ? 'block' : 'none';
      this.shown = ['', ''];
    }
    if (!drives) return;
    drives.forEach((d, i) => {
      const key = `${Math.round(d.deg)} ${Math.round(d.askDeg)} ${Math.round(d.power * 50)}`;
      if (key === this.shown[i]) return;
      this.shown[i] = key;
      this.draw(this.canvases[i], d, i);
    });
  }

  private draw(c: HTMLCanvasElement, d: DialShows, i: number): void {
    const g = c.getContext('2d');
    if (!g) return;
    const colour = i ? GREEN : RED;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(14, 22, 26, 0.72)';
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 14);
    g.fill();
    g.fillStyle = '#f2f5f5';
    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(i ? 'STBD DRIVE' : 'PORT DRIVE', 75, 18);
    azimuthDial(g, 75, 86, d.deg, d.askDeg, colour);
    // Its power: a bar under the dial, and the figure.
    g.fillStyle = 'rgba(255, 255, 255, 0.18)';
    g.fillRect(16, 150, 118, 10);
    g.fillStyle = colour;
    g.fillRect(16, 150, 118 * Math.max(0, Math.min(1, d.power)), 10);
    g.fillStyle = '#f2f5f5';
    g.font = '600 11px system-ui, sans-serif';
    g.fillText(d.power > 0 ? `POWER ${Math.round(d.power * 100)} %` : 'IDLE', 75, 172);
  }
}
