/**
 * The coast viewer's navigation layer (pipeline milestone 2): the region's buoys and
 * beacons in their tagged shapes and colours, its lights flashing their real characters
 * (a sector light shows the colour of the sector the camera is in, or nothing where it's
 * obscured), the fish farms, the hand-placed current zones, and labels.
 */
import * as THREE from 'three';

export interface NavFile {
  marks: { name: string; type: string; category: string; shape: string | null; colour: string | null; pattern: string | null; topmark: string | null; gameKind: string | null; x: number; z: number; light?: string }[];
  lights: { name: string; x: number; z: number; height?: number; character: string; group?: string; period?: number; sequence?: string; sectors: { colour: string; from?: number; to?: number }[]; label: string; on: string }[];
  hazards: { name: string; kind: string; x: number; z: number; depth: number; radius?: number; drawn?: boolean }[];
  farms: { name: string; outline: [number, number][] }[];
  currents: { id: string; name: string; polygon: [number, number][]; x: number; z: number; length: number; width: number; setDeg: number; peakKn: number; periodH: number }[];
}

const COLOURS: Record<string, number> = { red: 0xc8281e, green: 0x1f8a3a, yellow: 0xf2c200, black: 0x1a1a1a, white: 0xf0f0ea, orange: 0xe8701a, blue: 0x2050c0, grey: 0x888888 };
const LIGHT: Record<string, number> = { white: 0xfff6d8, red: 0xff3020, green: 0x30ff70, yellow: 0xffe040, blue: 0x5080ff };

/**
 * A light's on/off rhythm (seconds, alternating on, off, ...) from its tagged sequence or,
 * failing that, its character (the IALA conventions; defaults where the period is untagged).
 */
export function rhythm(l: NavFile['lights'][number]): number[] {
  if (l.sequence) {
    const out: number[] = [];
    for (const part of l.sequence.split(',')) {
      const m = part.match(/([\d.]+)\+\(([\d.]+)\)/);
      if (m) out.push(Number(m[1]), Number(m[2]));
    }
    if (out.length) return out;
  }
  const n = Math.max(1, Number(l.group ?? 1) || 1);
  const ch = l.character;
  const period = l.period;
  const fill = (on: number[], P: number) => {
    const used = on.reduce((s, v) => s + v, 0);
    on[on.length - 1] += Math.max(0.2, P - used);
    return on;
  };
  if (ch === 'F') return [1, 0];
  if (ch === 'Iso') return [(period ?? 4) / 2, (period ?? 4) / 2];
  if (ch === 'Oc') return [(period ?? 4) - 1, 1];
  if (ch === 'LFl') return fill([2, 0.1], period ?? 10);
  if (ch === 'Q' || ch === 'VQ') {
    const f = ch === 'Q' ? 0.5 : 0.25;
    if (n === 1 && !period) return [f, f];
    return fill(Array.from({ length: n }, () => [f, f]).flat(), period ?? (ch === 'Q' ? 10 : 5));
  }
  if (ch === 'Q+LFl' || ch === 'VQ+LFl') {
    const f = ch === 'Q+LFl' ? 0.5 : 0.25;
    return fill([...Array.from({ length: n }, () => [f, f]).flat(), 2, 0.1], period ?? (ch === 'Q+LFl' ? 15 : 10));
  }
  // Fl, Fl(n)
  return fill(Array.from({ length: n }, () => [0.6, 1.2]).flat(), period ?? (n > 1 ? 10 : 5));
}

function isOn(r: number[], t: number, offset: number): boolean {
  const P = r.reduce((s, v) => s + v, 0);
  if (r[1] === 0) return true;
  let u = (((t + offset) % P) + P) % P;
  for (let i = 0; i < r.length; i++) {
    if (u < r[i]) return i % 2 === 0;
    u -= r[i];
  }
  return false;
}

let glowTex: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A buoy or beacon: its body in its colours (horizontal bands as tagged), a simple topmark. */
function markMesh(m: NavFile['marks'][number]): THREE.Object3D {
  const g = new THREE.Group();
  const cols = (m.colour ?? (m.gameKind === 'port' ? 'red' : m.gameKind === 'stbd' ? 'green' : 'yellow')).split(';').map((c) => COLOURS[c] ?? 0xcccccc);
  const beacon = m.type.startsWith('beacon');
  const shape = m.shape ?? (beacon ? 'stake' : 'pillar');
  const H = beacon ? 5 : shape === 'spar' ? 4 : shape === 'pillar' ? 3.2 : 1.8;
  const R = beacon ? 0.3 : shape === 'spar' ? 0.25 : shape === 'pillar' ? 0.7 : 0.9;
  const bands = cols.length;
  for (let i = 0; i < bands; i++) {
    const h = H / bands;
    let geo: THREE.BufferGeometry;
    if (shape === 'conical') geo = new THREE.CylinderGeometry(R * (1 - (i + 1) / bands), R * (1 - i / bands), h, 10);
    else if (shape === 'spherical') geo = new THREE.SphereGeometry(R, 10, 6);
    else geo = new THREE.CylinderGeometry(R, R, h, 10);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: cols[i] }));
    mesh.position.y = H - h * (i + 0.5);
    g.add(mesh);
  }
  const top = m.topmark ?? '';
  if (top) {
    const mat = new THREE.MeshLambertMaterial({ color: COLOURS.black });
    const put = (o: THREE.Mesh, y: number) => (o.position.setY(y), g.add(o));
    const cone = (up: boolean, y: number) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 8), mat);
      c.rotation.x = up ? 0 : Math.PI;
      c.position.y = y;
      g.add(c);
    };
    if (/2 cones up/.test(top)) (cone(true, H + 0.4), cone(true, H + 1));
    else if (/2 cones down/.test(top)) (cone(false, H + 0.4), cone(false, H + 1));
    else if (/base to base/.test(top)) (cone(false, H + 0.4), cone(true, H + 0.9));
    else if (/point to point/.test(top)) (cone(true, H + 0.4), cone(false, H + 0.9));
    else if (/cone/.test(top)) cone(true, H + 0.4);
    else if (/2 spheres/.test(top)) for (const y of [H + 0.4, H + 1]) put(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat), y);
    else if (/cylinder|can/.test(top)) put(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8), new THREE.MeshLambertMaterial({ color: cols[0] })), H + 0.4);
  }
  g.position.set(m.x, 0, m.z);
  return g;
}

export class NavLayer {
  readonly root = new THREE.Group();
  readonly labels: { text: string; pos: THREE.Vector3 }[] = [];
  private readonly lamps: { sprite: THREE.Sprite; light: NavFile['lights'][number]; r: number[]; offset: number }[] = [];
  readonly zones: NavFile['currents'];

  constructor(nav: NavFile, groundAt: (x: number, z: number) => number) {
    this.zones = nav.currents;
    for (const m of nav.marks) {
      this.root.add(markMesh(m));
      this.labels.push({ text: `${m.name || m.category}${m.light ? ` ${m.light}` : ''}`, pos: new THREE.Vector3(m.x, 6, m.z) });
    }
    nav.lights.forEach((l, i) => {
      const ground = Math.max(0, groundAt(l.x, l.z));
      const y = l.on === 'buoy' ? 3.6 : Math.max(ground + 4, l.height ?? ground + 6);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: LIGHT[l.sectors[0].colour] ?? LIGHT.white, transparent: true, depthWrite: false, sizeAttenuation: false }));
      sprite.scale.setScalar(0.05);
      sprite.position.set(l.x, y, l.z);
      this.root.add(sprite);
      this.lamps.push({ sprite, light: l, r: rhythm(l), offset: i * 0.37 });
      if (l.on !== 'buoy') this.labels.push({ text: `${l.name || 'light'} ${l.label}`, pos: new THREE.Vector3(l.x, y + 6, l.z) });
      // A lighthouse or beacon tower under the light.
      if (l.on !== 'buoy' && y - ground > 2) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, y - ground, 8), new THREE.MeshLambertMaterial({ color: 0xf0eee8 }));
        tower.position.set(l.x, (y + ground) / 2, l.z);
        this.root.add(tower);
      }
    });
    // The skerries the 10 m grid lost are stood back up in the mesh itself (mesh.ts); here, their names.
    for (const h of nav.hazards) {
      this.labels.push({ text: h.name || h.kind, pos: new THREE.Vector3(h.x, 4, h.z) });
    }
    for (const f of nav.farms) {
      const pts = [...f.outline, f.outline[0]].flatMap(([x, z]) => [x, 0.6, z]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      this.root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffaa00 })));
      const [cx, cz] = f.outline.reduce(([a, b], [x, z]) => [a + x / f.outline.length, b + z / f.outline.length], [0, 0]);
      this.labels.push({ text: `fish farm${f.name ? ` ${f.name}` : ''}`, pos: new THREE.Vector3(cx, 5, cz) });
    }
    for (const c of nav.currents) {
      const pts = [...c.polygon, c.polygon[0]].flatMap(([x, z]) => [x, 0.8, z]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      this.root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff40c0 })));
      // An arrow along its set.
      const a = (c.setDeg * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      this.root.add(new THREE.ArrowHelper(dir, new THREE.Vector3(c.x - dir.x * c.length * 0.35, 1, c.z - dir.z * c.length * 0.35), c.length * 0.7, 0xff40c0, 40, 25));
      this.labels.push({ text: `${c.name}: race ${c.peakKn} kn at peak`, pos: new THREE.Vector3(c.x, 20, c.z) });
    }
  }

  /** Flash the lights; colour a sector light by the camera's bearing to it (seen from seaward). */
  update(time: number, camera: THREE.Camera): void {
    for (const lp of this.lamps) {
      const l = lp.light;
      let colour: string | null = l.sectors[0].colour;
      if (l.sectors.some((s) => s.from !== undefined)) {
        const dx = l.x - camera.position.x;
        const dz = l.z - camera.position.z;
        const brg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        colour = null;
        for (const s of l.sectors) {
          if (s.from === undefined || s.to === undefined) continue;
          const inside = s.from <= s.to ? brg >= s.from && brg <= s.to : brg >= s.from || brg <= s.to;
          if (inside) colour = s.colour;
        }
      }
      lp.sprite.visible = colour !== null && isOn(lp.r, time, lp.offset);
      if (colour) (lp.sprite.material as THREE.SpriteMaterial).color.setHex(LIGHT[colour] ?? LIGHT.white);
    }
  }

  /** The current at (x, z) now (m/s, x and z) from the zones, at `strength` of peak (signed: + floods along the set). */
  currentAt(x: number, z: number, strength: number): [number, number] {
    for (const c of this.zones) {
      const a = (c.setDeg * Math.PI) / 180;
      const ux = Math.sin(a);
      const uz = -Math.cos(a);
      const dx = x - c.x;
      const dz = z - c.z;
      const al = dx * ux + dz * uz;
      const ac = dx * -uz + dz * ux;
      if (Math.abs(al) > c.length / 2 || Math.abs(ac) > c.width / 2) continue;
      // Full in the middle, fading over the outer 60 m (as the game's zones).
      const fade = Math.min(1, (c.length / 2 - Math.abs(al)) / 60, (c.width / 2 - Math.abs(ac)) / 60);
      const v = c.peakKn * 0.514444 * strength * fade;
      return [ux * v, uz * v];
    }
    return [0, 0];
  }
}
