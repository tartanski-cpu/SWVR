import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';
import type { Control } from './Control';
import { InstrumentPanel } from './instruments';
import { Lever } from './Lever';
import { Toggle } from './Toggle';
import { Wheel } from './Wheel';

/**
 * Builds a vessel's bridge from its config: controls, instrument dash, labels.
 * Everything is in vessel axes and is added to the vessel's root, so it rides the boat.
 */
export class Bridge {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  private readonly instruments: InstrumentPanel;

  constructor(private readonly def: VesselDef) {
    const b = def.bridge;
    this.root.name = 'bridge';

    const wheel = new Wheel('wheel', b.wheel);
    wheel.root.position.fromArray(b.wheel.position);
    wheel.root.rotation.x = (-b.wheel.tiltDeg * Math.PI) / 180;

    const lever = new Lever('lever', b.lever, def.engine.neutralBand * 0.75);
    lever.root.position.fromArray(b.lever.position);

    const start = new Button('start', 'engineStartStop', 'Engine start / stop', 'pulse', 0x3aa04a, (s) => s.engine.phase === 'running');
    start.root.position.fromArray(b.startButton.position);

    const horn = new Button('horn', 'horn', 'Horn', 'momentary', 0xe0b020);
    horn.root.position.fromArray(b.hornButton.position);

    const nav = new Toggle('navLights', 'navLights', 'Navigation lights', (s) => s.controls.navLights);
    nav.root.position.fromArray(b.navLightsSwitch.position);

    this.controls.push(wheel, lever, start, horn, nav);
    for (const c of this.controls) this.root.add(c.root);

    // Instrument dash: a box across the front of the console with the displays on its face.
    const d = b.dash;
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(d.halfWidth * 2, d.top - d.bottom, d.aft - d.front).translate(0, (d.top + d.bottom) / 2, (d.front + d.aft) / 2),
      new THREE.MeshLambertMaterial({ color: 0x30363b, flatShading: true }),
    );
    this.instruments = new InstrumentPanel(b);
    this.root.add(dash, this.instruments.mesh, buildLabels(b));
  }

  /** Visuals from authoritative state (controls skip this while locally held). */
  update(state: VesselState, dt: number): void {
    for (const c of this.controls) c.sync(state);
    this.instruments.update(state, this.def, dt);
  }
}

/** Small engraved labels on the console top in front of each control (one draw call). */
function buildLabels(b: VesselDef['bridge']): THREE.Mesh {
  const labels: [string, [number, number, number]][] = [
    ['AHEAD ▲  ▼ ASTERN', b.lever.position],
    ['START / STOP', b.startButton.position],
    ['HORN', b.hornButton.position],
    ['NAV LIGHTS', b.navLightsSwitch.position],
  ];
  const slotW = 512;
  const slotH = 64;
  const canvas = document.createElement('canvas');
  canvas.width = slotW;
  canvas.height = slotH * labels.length;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e8e2cc';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  labels.forEach(([text], i) => g.fillText(text, slotW / 2, slotH * i + slotH / 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const planes = labels.map(([, pos], i) => {
    const plane = new THREE.PlaneGeometry(0.2, 0.025);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      const v0 = 1 - (i + 1) / labels.length;
      uv.setXY(k, uv.getX(k), v0 + uv.getY(k) / labels.length);
    }
    plane.rotateX(-Math.PI / 2);
    plane.translate(pos[0], pos[1] + 0.002, pos[2] + 0.085);
    return plane;
  });
  const mesh = new THREE.Mesh(mergeGeometries(planes), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.name = 'bridgeLabels';
  return mesh;
}
