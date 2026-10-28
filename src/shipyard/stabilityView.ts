/**
 * Her stability drawn on her during the roll and the inclining trials (owner, 27 Oct 2026: they
 * "should not show the buoyancy debug, they should show the GZ and GM"; liveTrial.ts
 * stabilityOf), in her own axes, seen square on from astern, over everything:
 *   G  her centre of gravity (red)
 *   B  her centre of buoyancy (blue), and the buoyancy's line straight up through it
 *   Z  the foot of the righting lever on that line; GZ, from G to Z, in green (red if it
 *      would capsize her)
 *   M  the metacentre (amber), where the buoyancy's line crosses her centreline, joined to G
 *      (GM): at small heels the true metacentre, at large ones only where the line crosses
 *   her centreline (grey, dashed), from her keel up.
 * A few lines and four labels: drawn only while a test runs.
 */
import * as THREE from 'three';
import type { Stability } from './liveTrial';

const ON_TOP = { depthTest: false, transparent: true, fog: false } as const;

function label(text: string, colour: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = colour;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '700 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), ...ON_TOP, toneMapped: false }));
  s.renderOrder = 1001;
  return s;
}

function line(colour: number, width = 1, dashed = false): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const mat = dashed ? new THREE.LineDashedMaterial({ color: colour, dashSize: 0.25, gapSize: 0.15, ...ON_TOP }) : new THREE.LineBasicMaterial({ color: colour, linewidth: width, ...ON_TOP });
  const l = new THREE.Line(geo, mat);
  l.renderOrder = 1000;
  l.frustumCulled = false;
  return l;
}

export class StabilityView {
  readonly root = new THREE.Group();
  private readonly g = label('G', '#d23a2a');
  private readonly b = label('B', '#2f6fd0');
  private readonly z = label('Z', '#2e9a4a');
  private readonly m = label('M', '#d89a18');
  private readonly buoyancy = line(0x2f6fd0);
  private readonly gz = line(0x2e9a4a);
  private readonly gm = line(0xd89a18);
  private readonly centre = line(0x8a96a0, 1, true);

  /** @param size how big the labels are drawn (m; a share of her length) */
  constructor(
    size: number,
    private readonly keelY: number,
    private readonly topY: number,
  ) {
    this.root.name = 'stability';
    for (const s of [this.g, this.b, this.z, this.m]) s.scale.set(size, size, 1);
    this.root.add(this.centre, this.buoyancy, this.gz, this.gm, this.g, this.b, this.z, this.m);
  }

  private set(l: THREE.Line, a: readonly number[], b: readonly number[]): void {
    const p = l.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, a[0], a[1], a[2]);
    p.setXYZ(1, b[0], b[1], b[2]);
    p.needsUpdate = true;
    l.computeLineDistances();
  }

  /** Where it all is now (null: nothing immersed, hide it). */
  update(s: Stability | null): void {
    this.root.visible = !!s;
    if (!s) return;
    const z = s.g[2];
    // Everything at G's station along her, so it reads square on from astern.
    this.set(this.centre, [0, this.keelY, z], [0, this.topY, z]);
    this.g.position.set(s.g[0], s.g[1], z);
    this.b.position.set(s.b[0], s.b[1], z);
    this.z.position.set(s.z[0], s.z[1], z);
    // The buoyancy's line, up through B past Z (and past M when it's drawn).
    const reach = Math.max(1.5, s.m ? Math.abs(s.m[1] - s.b[1]) + 0.6 : 0, Math.abs(s.z[1] - s.b[1]) + 0.8);
    this.set(this.buoyancy, [s.b[0] - s.up[0] * 0.4, s.b[1] - s.up[1] * 0.4, z], [s.b[0] + s.up[0] * reach, s.b[1] + s.up[1] * reach, z]);
    this.set(this.gz, [s.g[0], s.g[1], z], [s.z[0], s.z[1], z]);
    (this.gz.material as THREE.LineBasicMaterial).color.setHex(s.gzM >= 0 ? 0x2e9a4a : 0xd23a2a);
    // M only where the line crosses her centreline sensibly (not off at infinity when she's nearly upright).
    const showM = !!s.m && Math.abs(s.m[1] - s.g[1]) < 30;
    this.m.visible = this.gm.visible = showM;
    if (showM) {
      this.m.position.set(s.m![0], s.m![1], z);
      this.set(this.gm, [s.g[0], s.g[1], z], [s.m![0], s.m![1], z]);
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Line) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.map?.dispose();
    });
  }
}
