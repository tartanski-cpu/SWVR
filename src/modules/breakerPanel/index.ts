/**
 * Module panel.breakers: the 12 V panel by the helm (modular boats M3b).
 *   - Voltmeter: a dial (8-16 V, printed once) and a needle swinging to the bus voltage
 *     ('electrical.busVoltage'). Wired straight to the bus, not through a breaker: it
 *     reads 0 with the master off.
 *   - Breakers: a toggle per circuit (its config: which, where, engraved what), each
 *     throwing 'breaker.<circuit>', with a green lamp lit while 'circuit.<circuit>.live'
 *     (master on, battery not flat, breaker on).
 *
 * Only the panel's view and controls: what the breakers DO is the electrics' (vessel/
 * electrics.ts) until the energy network is a module (M4). Its circuits are its config,
 * not ports: each circuit's two keys are the energy network's own, named after it.
 *
 * Draw calls: the housing is merged with the bridge's fixed parts; the dial, the needle,
 * the lamps (one instanced mesh) and the engraving (drawn once) are one each; the breaker
 * bats are shared parts. No per-frame texture work.
 */
import * as THREE from 'three';
import { panelLit } from '../../controls/panelLighting';
import { CONFIG } from '../../config';
import { Toggle } from '../../controls/Toggle';
import { clamp } from '../../core/math';
import { busOf, resolveKey } from '../../modular/bus';
import type { BusKey } from '../../modular/busKeys';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type BreakerPanelConfig = typeof CONFIG.modules.breakerPanel;

const LAMP_ON = 0x50ff70;
const LAMP_OFF = 0x173020;

export const BREAKER_PANEL: ModuleDefinition<BreakerPanelConfig> = {
  id: 'panel.breakers',
  version: 1,
  fits: ['wall.panel'],
  defaults: CONFIG.modules.breakerPanel,
  validateConfig: (c) => c.circuits.flatMap((k) => (resolveKey(`breaker.${k.name}`) && resolveKey(`circuit.${k.name}.live`) ? [] : [`'${k.name}' isn't a circuit this game knows`])),
  ports: { volts: { dir: 'read', key: 'electrical.busVoltage' } },
  // The panel itself, with the master on.
  power: (c) => [{ role: 'load', amps: () => c.amps }],
  view: {
    build({ config: c, keys, share }) {
      const W = c.width;
      const H = c.height;
      // A wedge-ish housing: the sloping face plus a block behind it down to the wall.
      const body = part(new THREE.BoxGeometry(W, H, 0.12).translate(0, 0, -0.06), 0x2a2f33);
      const face = new THREE.Mesh(new THREE.CircleGeometry(c.dial.radius, 32), panelLit(new THREE.MeshBasicMaterial({ map: dialFace() })));
      face.position.set(-W / 2 + c.dial.x, c.dial.y, 0.001);
      const needleArm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.002).translate(0, 0.03, 0), new THREE.MeshBasicMaterial({ color: 0xff3a20 }));
      const needle = new THREE.Group();
      needle.position.copy(face.position).setZ(0.003);
      needle.add(needleArm);

      // The breakers in rows, right of the dial, each with its lamp above and to the right.
      const b = c.breakers;
      const spots = c.circuits.map((k, i) => ({ ...k, x: -W / 2 + b.x0 + (i % b.perRow) * b.pitch, y: b.rows[Math.floor(i / b.perRow)] ?? 0 }));
      const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.007, 12), new THREE.MeshBasicMaterial(), spots.length);
      const m = new THREE.Matrix4();
      const off = new THREE.Color(LAMP_OFF);
      spots.forEach(({ x, y }, i) => {
        lamps.setMatrixAt(i, m.makeTranslation(x + 0.032, y + 0.035, 0.002));
        lamps.setColorAt(i, off);
      });
      const controls = spots.map(({ name, engrave, x, y }) => {
        const key = `breaker.${name}` as BusKey;
        // Its id stays 'brk_<circuit>' (multiplayer, the quick start's hints know it so).
        const t = new Toggle(`brk_${name}`, key, `Breaker: ${engrave.toLowerCase()}`, (s) => busOf(s).num(key));
        t.root.position.set(x, y - 0.005, 0);
        t.root.rotation.x = Math.PI / 2; // its "up" out of the panel face; on = bat up
        t.root.scale.setScalar(b.scale);
        share(t.batMesh, 'toggleBat');
        return t;
      });
      const labels = new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelLit(new THREE.MeshBasicMaterial({ map: panelLabels(W, H, spots, c.dial.x), transparent: true })));
      labels.position.z = 0.0015;

      const live = spots.map(({ name }) => `circuit.${name}.live` as BusKey);
      const lit = live.map(() => false);
      const colour = new THREE.Color();
      let shown = 0;
      const setNeedle = (volts: number) => {
        // 8 V at -120°, 16 V at +120° (clockwise from up is negative z-rotation).
        const f = clamp((volts - 8) / 8, -0.05, 1.05);
        needle.rotation.z = (120 - 240 * f) * (Math.PI / 180);
      };
      setNeedle(0);

      return {
        staticParts: [body],
        movingParts: [face, needle, lamps, labels],
        controls,
        update(read, _s, dt) {
          // The needle follows the bus voltage smoothly (a real meter's movement takes a moment).
          shown += (read.num(keys.volts) - shown) * Math.min(1, dt * 4);
          setNeedle(shown);
          live.forEach((key, i) => {
            const on = !!read.get(key);
            if (on === lit[i]) return;
            lit[i] = on;
            lamps.setColorAt(i, colour.setHex(on ? LAMP_ON : LAMP_OFF));
            lamps.instanceColor!.needsUpdate = true;
          });
        },
      };
    },
  },
};

/** The engraving: each breaker's name under it, BREAKERS and BATTERY titles (drawn once). */
function panelLabels(W: number, H: number, spots: { engrave: string; x: number; y: number }[], dialX: number): THREE.CanvasTexture {
  const px = 1024 / W; // pixels per metre
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round(H * px);
  const g = c.getContext('2d')!;
  const toC = (x: number, y: number): [number, number] => [(x + W / 2) * px, (H / 2 - y) * px];
  g.fillStyle = '#e8e2cc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 30px system-ui, sans-serif';
  for (const { engrave, x, y } of spots) g.fillText(engrave, ...toC(x, y - 0.048), 0.074 * px);
  g.font = 'bold 26px system-ui, sans-serif';
  if (spots[1]) g.fillText('BREAKERS', ...toC(spots[1].x, H / 2 - 0.012));
  g.fillText('BATTERY', ...toC(-W / 2 + dialX, H / 2 - 0.022));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Voltmeter dial: 8-16 V scale, red below 11.5, green 12.4-14.4 (drawn once). */
function dialFace(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2efe6';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  const cx = S / 2;
  const cy = S / 2;
  const ang = (v: number) => (-90 - 120 + ((v - 8) / 8) * 240) * (Math.PI / 180);
  const band = (a: number, b: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = 16;
    g.beginPath();
    g.arc(cx, cy, 96, ang(a), ang(b));
    g.stroke();
  };
  band(8, 11.5, '#d03a2a');
  band(12.4, 14.4, '#3aa04a');
  g.strokeStyle = '#111';
  g.fillStyle = '#111';
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let v = 8; v <= 16; v++) {
    const a = ang(v);
    g.lineWidth = v % 2 === 0 ? 5 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 104, cy + Math.sin(a) * 104);
    g.lineTo(cx + Math.cos(a) * (v % 2 === 0 ? 82 : 90), cy + Math.sin(a) * (v % 2 === 0 ? 82 : 90));
    g.stroke();
    if (v % 2 === 0) g.fillText(String(v), cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
  }
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText('VOLTS', cx, cy + 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
