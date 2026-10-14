import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';
import type { Control } from './Control';
import { InstrumentPanel } from './instruments';
import { Lever } from './Lever';
import { Toggle } from './Toggle';
import { Wheel } from './Wheel';
import { Joystick } from './Joystick';
import { RadioSet } from '../rescue/radioView';
import { ChartPlotter } from '../nav/chartPlotter';
import { OverheadPanel } from './overheadPanel';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';

/**
 * Builds a vessel's bridge from its config: controls, instrument dash, labels.
 * Everything is in vessel axes and is added to the vessel's root, so it rides the boat.
 */
export class Bridge {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  /** Empty object at the centre of the instrument dash (for visibility checks). */
  readonly dashAnchor = new THREE.Object3D();
  private readonly instruments: InstrumentPanel;
  /** Overhead VHF (rescue calls). */
  readonly radio: RadioSet;
  /** Overhead chartplotter (search area, destination). */
  readonly chart: ChartPlotter;
  /** Overhead switch panel: deck lights and the FM radio. */
  readonly overhead: OverheadPanel;

  constructor(private readonly def: WorkboatDef) {
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

    const anchor = new Toggle('anchor', 'anchor', 'Anchor: let go / heave in', (s) => s.controls.anchor);
    anchor.root.position.fromArray(b.anchorSwitch.position);

    const cabin = new Toggle('cabinLight', 'cabinLight', 'Cabin light', (s) => s.controls.cabinLight);
    cabin.root.position.fromArray(b.cabinLightSwitch.position);

    // Lit when there's a berth to dock at (hot spot) or while docking/moored.
    const dock = new Button('dock', 'dock', 'Dock / cast off', 'pulse', 0x2f6fd0, (s) => s.mooring.phase !== 'free' || s.mooring.berthId !== null);
    dock.root.position.fromArray(b.dockButton.position);

    const spot = new Toggle('spotlight', 'spotlight', 'Searchlight on/off', (s) => s.controls.spotlight);
    spot.root.position.fromArray(b.spotlightSwitch.position);
    const joy = new Joystick('spotJoystick', def.spotlight);
    joy.root.position.fromArray(b.spotJoystick.position);

    this.radio = new RadioSet(b.radio, def.layout.wheelhouse.roofY);
    this.root.add(this.radio.root);
    this.chart = new ChartPlotter(b.chart, def.layout.wheelhouse.roofY);
    this.root.add(this.chart.root);
    this.overhead = new OverheadPanel(def);
    this.root.add(this.overhead.root);
    this.controls.push(wheel, lever, start, horn, nav, anchor, cabin, dock, spot, joy, this.radio.handset, ...this.overhead.controls);
    for (const c of this.controls) if (!c.root.parent) this.root.add(c.root);

    // Instrument dash: a box across the front of the console with the displays on its face.
    const d = b.dash;
    const dash = part(
      new THREE.BoxGeometry(d.halfWidth * 2, d.top - d.bottom, d.aft - d.front).translate(0, (d.top + d.bottom) / 2, (d.front + d.aft) / 2),
      0x30363b,
    );
    // Throttle pedestal: from the console's aft face back to under the lever, floor to console top.
    const ped = b.lever.pedestal;
    const lp = b.lever.position;
    const floorY = def.layout.wheelhouse.floorY;
    const pedFront = lp[2] - 0.25; // overlaps into the console body
    const pedestalAt = (x: number) =>
      part(
        new THREE.BoxGeometry(ped.halfWidth * 2, lp[1] - 0.01 - floorY, ped.aft - pedFront).translate(x, (lp[1] - 0.01 + floorY) / 2, (ped.aft + pedFront) / 2),
        0x3c4248,
      );
    // The throttle's pedestal, and its mirror image to port for the searchlight joystick.
    const pedestal = pedestalAt(lp[0]);
    const spotPedestal = pedestalAt(b.spotJoystick.position[0]);
    this.instruments = new InstrumentPanel(b);
    this.dashAnchor.position.set(0, (d.top + d.bottom) / 2, d.aft);
    this.root.add(bakeFixedParts(this.root, [dash, pedestal, spotPedestal, this.overhead.body]), this.instruments.mesh, buildLabels(b), this.dashAnchor);
  }

  /**
   * Visuals from authoritative state (controls skip this while locally held).
   * @param displaysInView false when nobody can see the dash: the instrument canvas then
   *                       skips its redraw and texture upload (the costly part on Quest).
   */
  update(state: VesselState, dt: number, displaysInView = true): void {
    for (const c of this.controls) {
      c.sync(state);
      c.tick(dt);
    }
    if (displaysInView) this.instruments.update(state, this.def, dt);
    this.overhead.update(state);
  }
}

/**
 * Bake every control part marked `fixed` (bases, housings, plates) plus `extra` parts into
 * one vertex-coloured mesh: one draw call instead of one per part. The original meshes are
 * hidden but kept, so the pointer ray (which ignores visibility) still hits them.
 */
function bakeFixedParts(root: THREE.Object3D, extra: THREE.BufferGeometry[]): THREE.Mesh {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const parts = [...extra];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.fixed) return;
    const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld.clone().premultiply(toRoot));
    parts.push(part(geo, (o.material as THREE.MeshLambertMaterial).color.getHex()));
    o.visible = false;
  });
  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'bridgeFixed';
  return mesh;
}

/** Small engraved labels on the console top in front of each control (one draw call). */
function buildLabels(b: WorkboatDef['bridge']): THREE.Mesh {
  const labels: [string, [number, number, number]][] = [
    ['AHEAD ▲  ▼ ASTERN', b.lever.position],
    ['START / STOP', b.startButton.position],
    ['HORN', b.hornButton.position],
    ['NAV LIGHTS', b.navLightsSwitch.position],
    ['ANCHOR', b.anchorSwitch.position],
    ['CABIN', b.cabinLightSwitch.position],
    ['DOCK', b.dockButton.position],
    ['SPOT', b.spotlightSwitch.position],
    ['SEARCHLIGHT', b.spotJoystick.position],
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
    const plane = new THREE.PlaneGeometry(0.16, 0.02);
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
