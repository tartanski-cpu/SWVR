/**
 * Module radio.fm: the FM set (modular boats M3b). A small display, a power switch and a
 * TUNE button that steps through the stations; it mounts in a panel slot (the workboat's
 * is in the overhead panel, so its display faces down and its controls hang upside down,
 * read and pressed from the helm below).
 *
 * The set's state is on the bus: 'fm.on', 'fm.station' and the 'fm.tune' press. Its
 * display is dark without 12 V on its circuit. The music itself is the app's (it plays the
 * station's stream near the set); what the player is doing (tuning, no signal) reaches the
 * display as the local value 'fm.status'.
 *
 * Draw calls: the display (one; redrawn only when its text changes). The switch bat and
 * the button cap are shared parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { Toggle } from '../../controls/Toggle';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { colourOf } from '../../modular/palette';

export type FmRadioConfig = typeof CONFIG.modules.fmRadio;

const W = 256;
const H = 96;

export const FM_RADIO: ModuleDefinition<FmRadioConfig> = {
  id: 'radio.fm',
  version: 1,
  fits: ['panel.slot'],
  defaults: CONFIG.modules.fmRadio,
  ports: {
    on: { dir: 'write', key: 'fm.on' },
    tune: { dir: 'write', key: 'fm.tune' },
    station: { dir: 'read', key: 'fm.station' },
    live: { dir: 'read', key: 'circuit.radio.live' },
  },
  needs: () => [{ power: 'electrical', circuit: 'radio' }],
  power: (c) => [{ role: 'load', circuit: 'radio', amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    build({ config: c, keys, socket, share, local }) {
      // Hang a control upside down beside the display.
      const hang = <T extends Toggle | Button>(ctl: T, x: number): T => {
        ctl.root.position.set(x, 0, 0);
        ctl.root.rotation.x = Math.PI;
        return ctl;
      };
      const power = hang(new Toggle(`${socket.id}On`, keys.on, 'FM radio on/off', (s) => busOf(s).num(keys.on)), c.power);
      const tune = hang(new Button(`${socket.id}Tune`, keys.tune, 'FM: next station', 'pulse', colourOf(c.tuneColor, 0xd88a2a), (s) => busOf(s).num(keys.on) > 0), c.tune);
      share(power.batMesh, 'toggleBat');
      share(tune.cap, 'buttonCap');

      // The display, facing down, its top edge toward the bow: it reads from the helm looking up.
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(c.display.width, c.display.height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      screen.rotation.x = Math.PI / 2;
      screen.position.set(0, -0.002, 0);

      let shown: string | null = null;
      const draw = (text: string) => {
        shown = text;
        g.fillStyle = text ? '#0a1418' : '#020303';
        g.fillRect(0, 0, W, H);
        if (text) {
          g.fillStyle = text.includes('OFF') ? '#3a5560' : '#7fe3ff';
          g.textBaseline = 'middle';
          const [a, b] = text.split('\n');
          g.font = 'bold 34px ui-monospace, Menlo, Consolas, monospace';
          g.fillText(a, 10, b ? 28 : H / 2, W - 20);
          if (b) {
            g.font = '24px system-ui, sans-serif';
            g.fillText(b, 10, 70, W - 20);
          }
        }
        texture.needsUpdate = true;
      };
      draw('FM  OFF');

      return {
        staticParts: [],
        movingParts: [screen],
        controls: [power, tune],
        update(read) {
          const st = CONFIG.fmRadio.stations[read.num(keys.station)];
          const status = local('fm.status');
          // No 12 V: the display is dark (an empty text draws a blank screen).
          const text = !read.get(keys.live) ? '' : read.get(keys.on) && st ? `FM ${st.freq}\n${st.name}${status ? `  ${status}` : ''}` : 'FM  OFF';
          if (text !== shown) draw(text);
        },
      };
    },
  },
};
