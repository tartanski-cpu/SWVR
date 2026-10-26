/**
 * Module panel.helm-assist (owner, Oct 2026): a small box on the wheelhouse wall beside the
 * breaker panel, with two push buttons:
 *   - AUTO START (green): the whole start-up in one press, master and breakers on and the
 *     engine started ('helmAssist.autoStart');
 *   - DOCK (blue): the menu's Dock / Cast off ('helmAssist.dock').
 * What they do is vessel/autopilot.ts's. It also gives the boat an autopilot (gear 'autopilot',
 * its steering CONFIG.modules.helmAssist.autopilot), which works only with the INSTRUMENTS
 * circuit live. The autopilot's own buttons are on the console (owner, Oct 2026: "a separate
 * control that goes on the main console"): plain push buttons in an AUTOPILOT group, AUTO
 * ('autopilot.engage') and PORT / STBD 5 degrees ('autopilot.port', 'autopilot.starboard'),
 * put there by the Shipyard (shipyard/parts/recipe.ts).
 *
 * Draw calls: the box is merged with the boat's fixed parts; the engraving is one mesh drawn
 * once; the button caps are the boat's shared button caps.
 */
import * as THREE from 'three';
import { panelLit } from '../../controls/panelLighting';
import { Button } from '../../controls/Button';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type HelmAssistConfig = typeof CONFIG.modules.helmAssist;

const BUTTONS = [
  { id: 'autoStart', port: 'start', engrave: 'AUTO START', label: 'AUTO START: master, breakers and engine, in one press', colour: 0x3aa04a },
  { id: 'autoDock', port: 'dock', engrave: 'DOCK', label: 'DOCK: lines ashore at the berth in range, or cast off', colour: 0x2f6fd0 },
] as const;

export const HELM_ASSIST: ModuleDefinition<HelmAssistConfig> = {
  id: 'panel.helm-assist',
  version: 1,
  fits: ['wall.panel'],
  defaults: CONFIG.modules.helmAssist,
  validateConfig: (c) => (c.autopilot.maxHelm > 0 && c.autopilot.maxHelm <= 1 ? [] : ['the autopilot’s maxHelm is a share of the wheel’s travel (0 to 1)']),
  ports: {
    start: { dir: 'write', key: 'helmAssist.autoStart' },
    dock: { dir: 'write', key: 'helmAssist.dock' },
  },
  provides: () => [{ gear: 'autopilot' }],
  gear: (c) => ({ autopilot: c.autopilot }),
  power: (c) => [{ role: 'load', amps: () => c.amps }],
  view: {
    build({ config: c, keys, share }) {
      const W = c.width;
      const H = c.height;
      const body = part(new THREE.BoxGeometry(W, H, 0.06).translate(0, 0, -0.03), 0x2a2f33);
      const xs = BUTTONS.map((_, i) => (i - (BUTTONS.length - 1) / 2) * c.pitch);
      const buttonY = -0.012;
      const controls = BUTTONS.map((b, i) => {
        const button = new Button(b.id, keys[b.port], b.label, 'pulse', b.colour);
        button.root.position.set(xs[i], buttonY, 0);
        button.root.rotation.x = Math.PI / 2; // its cap out of the panel's face
        share(button.cap, 'buttonCap');
        return button;
      });
      const labels = new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelLit(new THREE.MeshBasicMaterial({ map: engraving(W, H, xs, buttonY), transparent: true })));
      labels.position.z = 0.0015;
      return { staticParts: [body], movingParts: [labels], controls, update: () => {} };
    },
  },
};

/** The engraving: HELM ASSIST along the top, each button's name under it (drawn once). */
function engraving(W: number, H: number, xs: number[], buttonY: number): THREE.CanvasTexture {
  const px = 1024 / W;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = Math.round(H * px);
  const g = cv.getContext('2d')!;
  const toC = (x: number, y: number): [number, number] => [(x + W / 2) * px, (H / 2 - y) * px];
  g.fillStyle = '#e8e2cc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText('HELM ASSIST', ...toC(0, H / 2 - 0.016));
  g.font = 'bold 46px system-ui, sans-serif';
  BUTTONS.forEach((b, i) => g.fillText(b.engrave, ...toC(xs[i], buttonY - 0.047), 0.082 * px));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
