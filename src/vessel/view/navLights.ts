import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorkboatDef } from '../vesselDef';

const COLORS = { masthead: 0xfff4dc, port: 0xff2a1a, starboard: 0x22ff55, stern: 0xfff4dc };
type LightName = keyof typeof COLORS;

/**
 * Arcs of visibility (COLREGs Rule 21) as relative bearings from right ahead, degrees,
 * positive to starboard: masthead 225° centred ahead, sidelights 112.5° each from right
 * ahead to 22.5° abaft the beam, stern light 135° centred astern.
 */
const ARCS: Record<LightName, [number, number]> = {
  masthead: [-112.5, 112.5],
  starboard: [0, 112.5],
  port: [-112.5, 0],
  stern: [112.5, 247.5],
};
/**
 * Practical cut-off outside each arc (degrees): full intensity inside, fading to nothing
 * this far outside (COLREGs Annex I allows 1-3°). It also lets both sidelights show from
 * dead ahead, as they should.
 */
const ARC_FADE = 2;

/**
 * Navigation lights: masthead (white), sidelights (port red, starboard green) and stern
 * light (white). Lamp housings are one vertex-coloured mesh whose material dims when off;
 * the glow is one additive Points draw call, stronger at night. Each glow shows only
 * inside its arc of visibility as seen from the viewer, so from ahead you see red and
 * green together, from the starboard bow green only, and from astern just the stern light.
 */
export class NavLightsView {
  readonly root = new THREE.Group();
  private readonly lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly glow: THREE.Points;
  private readonly glowMat: THREE.PointsMaterial;
  private readonly names: LightName[];
  private readonly lampPos: [number, number, number][];
  private readonly baseCol: Float32Array;
  private readonly glowCol: THREE.BufferAttribute;
  private readonly local = new THREE.Vector3();

  constructor(def: WorkboatDef) {
    this.root.name = 'navLights';
    const entries = Object.entries(def.navLights) as [LightName, [number, number, number]][];
    this.names = entries.map(([name]) => name);
    this.lampPos = entries.map(([, p]) => p);
    const c = new THREE.Color();
    const lamps = entries.map(([name, p]) => {
      const g = new THREE.BoxGeometry(0.07, 0.09, 0.07).toNonIndexed();
      g.deleteAttribute('uv');
      g.translate(...p);
      c.set(COLORS[name]);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const lampMesh = new THREE.Mesh(mergeGeometries(lamps), this.lampMat);

    const pos = new Float32Array(entries.length * 3);
    const col = new Float32Array(entries.length * 3);
    entries.forEach(([name, p], i) => {
      pos.set(p, i * 3);
      c.set(COLORS[name]);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.baseCol = col.slice();
    this.glowCol = new THREE.BufferAttribute(col, 3);
    geo.setAttribute('color', this.glowCol);
    this.glowMat = new THREE.PointsMaterial({
      size: 0.9,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.glow = new THREE.Points(geo, this.glowMat);
    this.glow.frustumCulled = false;
    this.root.add(lampMesh, this.glow);
  }

  /**
   * @param darkness 0 (noon) .. 1 (night): glow is subtle by day, bright at night.
   * @param viewer   world position of the viewer, for the arcs of visibility
   */
  update(on: boolean, darkness: number, viewer: THREE.Vector3): void {
    this.lampMat.color.setScalar(on ? 1 : 0.18);
    this.glow.visible = on;
    this.glowMat.opacity = 0.25 + 0.75 * darkness;
    this.glowMat.size = 0.6 + 0.8 * darkness;
    if (!on) return;
    // Viewer in the vessel's axes (bow -Z, starboard +X); the root rides the vessel root.
    this.root.worldToLocal(this.local.copy(viewer));
    const col = this.glowCol.array as Float32Array;
    this.names.forEach((name, i) => {
      // Relative bearing of the viewer, 0 = right ahead, + to starboard, measured from the
      // centreline abreast the lamp (not from the lamp itself): sidelights sit ~1.5 m off
      // the centreline, so lamp-centred arcs would hide both from someone close dead ahead.
      const z = this.lampPos[i][2];
      let bearing = (Math.atan2(this.local.x, -(this.local.z - z)) * 180) / Math.PI;
      const [from, to] = ARCS[name];
      if (bearing < from) bearing += 360;
      const inside = Math.min(bearing - from, to - bearing);
      const k = Math.min(1, Math.max(0, inside / ARC_FADE + 1));
      for (let c = 0; c < 3; c++) col[i * 3 + c] = this.baseCol[i * 3 + c] * k;
    });
    this.glowCol.needsUpdate = true;
  }
}

function glowTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}
