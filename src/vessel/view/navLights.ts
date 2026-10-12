import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VesselDef } from '../vesselDef';

const COLORS = { masthead: 0xfff4dc, port: 0xff2a1a, starboard: 0x22ff55, stern: 0xfff4dc };

/**
 * Navigation lights: masthead (white), sidelights (port red, starboard green) and stern
 * light (white). Lamp housings are one vertex-coloured mesh whose material dims when off;
 * the glow is one additive Points draw call, stronger at night.
 * (Arcs of visibility are not modelled yet - all lights show all round.)
 */
export class NavLightsView {
  readonly root = new THREE.Group();
  private readonly lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly glow: THREE.Points;
  private readonly glowMat: THREE.PointsMaterial;

  constructor(def: VesselDef) {
    this.root.name = 'navLights';
    const entries = Object.entries(def.navLights) as [keyof typeof COLORS, [number, number, number]][];
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
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
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

  /** @param darkness 0 (noon) .. 1 (night): glow is subtle by day, bright at night. */
  update(on: boolean, darkness: number): void {
    this.lampMat.color.setScalar(on ? 1 : 0.18);
    this.glow.visible = on;
    this.glowMat.opacity = 0.25 + 0.75 * darkness;
    this.glowMat.size = 0.6 + 0.8 * darkness;
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
