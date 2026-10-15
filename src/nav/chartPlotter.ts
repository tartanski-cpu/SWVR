import { isPowered } from '../vessel/electrics';
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { cargoPaused, portById } from '../rescue/rescue';
import { ISLANDS, PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { CONFIG } from '../config';
import type { ChartMarks } from '../chart/marks';
import { towFast } from '../tow/tow';

const W = 512;
const H = 384;
/** Land layer resolution (m per pixel) and margin around the islands (m). */
const RES = 8;
const MARGIN = 700;

/**
 * A simple overhead chartplotter, north up, centred on own ship. It zooms to keep in view
 * what matters now: the rescue search area while a rescue is on, else the cargo
 * destination, else the nearest port.
 *
 * Shows: land and shallows (drawn once from the terrain into a cached image), ports (the
 * cargo destination ringed in yellow), the search area as an orange circle (the target
 * itself is not shown - you have to find it), own ship and its heading, a scale bar, and
 * the bearing and range to the search area or destination.
 *
 * Draw calls: bezel (merged) + screen. The screen redraws at a few Hz, and only when the
 * App says it could be seen.
 */
export class ChartPlotter {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private land: { canvas: HTMLCanvasElement; x0: number; z0: number } | null = null;
  private dark = false;
  private since = Infinity;
  /** Debug: draw the targets too. */
  showTargets = false;
  /** The crew's pencil marks, drawn faintly over the map (null: not shown). */
  marks: ChartMarks | null = null;

  constructor(cfg: { position: [number, number, number]; tiltDeg: number; yawDeg?: number }, roofY: number) {
    this.root.name = 'chartPlotter';
    this.root.position.fromArray(cfg.position);
    this.root.rotation.y = ((cfg.yawDeg ?? 0) * Math.PI) / 180;
    const set = new THREE.Group();
    set.rotation.x = (cfg.tiltDeg * Math.PI) / 180;
    this.root.add(set);
    const sw = 0.36;
    const sh = 0.27;
    const drop = roofY - cfg.position[1];
    const body = mergeParts([
      part(new THREE.BoxGeometry(sw + 0.04, sh + 0.04, 0.05).translate(0, 0, -0.025), 0x24292d),
    ]);
    set.add(new THREE.Mesh(body, flatVertexColorMaterial()));
    this.root.add(
      new THREE.Mesh(
        mergeParts([-0.12, 0.12].map((x) => part(new THREE.BoxGeometry(0.02, drop, 0.04).translate(x, drop / 2, -0.03), 0x3a3f44))),
        flatVertexColorMaterial(),
      ),
    );
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    screen.position.z = 0.002;
    set.add(screen);
  }

  /** Land, shallows and sea, sampled from the terrain once. */
  private buildLand(): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const i of ISLANDS) {
      x0 = Math.min(x0, i.x - i.radius);
      x1 = Math.max(x1, i.x + i.radius);
      z0 = Math.min(z0, i.z - i.radius);
      z1 = Math.max(z1, i.z + i.radius);
    }
    x0 -= MARGIN;
    z0 -= MARGIN;
    x1 += MARGIN;
    z1 += MARGIN;
    const cw = Math.ceil((x1 - x0) / RES);
    const ch = Math.ceil((z1 - z0) / RES);
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cw, ch);
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const h = groundHeight(x0 + (i + 0.5) * RES, z0 + (j + 0.5) * RES);
        // Deep water, shallows (< 6 m), beach, land.
        const [r, gg, b] = h > 3 ? [118, 128, 86] : h > 0 ? [196, 178, 126] : h > -6 ? [44, 98, 118] : [16, 46, 66];
        const k = (j * cw + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = gg;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.land = { canvas: c, x0, z0 };
  }

  update(world: WorldState, vesselId: string, dt: number, visible: boolean): void {
    this.since += dt;
    if (!visible || this.since < 0.4) return;
    this.since = 0;
    const v = world.vessels[vesselId];
    if (!v) return;
    // No 12 V: a black screen (drawn once).
    if (!isPowered(v, 'chart')) {
      if (!this.dark) {
        this.dark = true;
        this.g.fillStyle = '#020303';
        this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.texture.needsUpdate = true;
      }
      return;
    }
    this.dark = false;
    if (!this.land) this.buildLand();
    const land = this.land!;
    const g = this.g;
    const [sx, , sz] = v.position;
    const r = world.rescue;
    // Plot-it-yourself mode: no search area here; it's on the paper chart if anywhere.
    const inc = r?.active?.phase === 'accepted' && !CONFIG.rescue.plotYourself ? r.active : null;
    const destId = r?.run?.to ?? null;
    const dest = destId ? portById(destId) : undefined;
    // What to keep in view.
    let fx: number;
    let fz: number;
    let label: string;
    // A tow job: the tow, until it's on the line (then the harbour we're making for).
    const job = world.tow?.job;
    const towS = job && job.phase === 'accepted' ? world.vessels[job.vesselId] : undefined;
    const tow = towS && !CONFIG.rescue.plotYourself ? towS : undefined;
    const fireJob = world.fire?.job && world.fire.job.phase !== 'calling' && !CONFIG.rescue.plotYourself ? world.fire.job : null;
    if (inc) {
      [fx, fz] = [inc.x, inc.z];
      label = 'SEARCH';
    } else if (fireJob) {
      [fx, fz] = [fireJob.x, fireJob.z];
      label = 'FIRE';
    } else if (tow && !towFast(world)) {
      [fx, fz] = [tow.position[0], tow.position[2]];
      label = 'TOW';
    } else if (dest && !cargoPaused(world)) {
      [fx, fz] = [dest.x, dest.z];
      label = dest.name.replace(' (anchorage)', '');
    } else {
      const near = [...PORTS].sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz))[0];
      [fx, fz] = [near.x, near.z];
      label = near.name.replace(' (anchorage)', '');
    }
    const dist = Math.hypot(fx - sx, fz - sz);
    // Metres across the screen: own ship in the middle, the focus comfortably inside.
    const span = Math.min(5000, Math.max(700, dist * 2.6 + (inc ? inc.radius * 2 : 0)));
    const mpp = span / W; // metres per pixel
    const toPx = (x: number, z: number): [number, number] => [W / 2 + (x - sx) / mpp, H / 2 + (z - sz) / mpp];

    g.fillStyle = '#10303f';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    // The land image section that covers the screen.
    const srcX = (sx - span / 2 - land.x0) / RES;
    const srcZ = (sz - (span * H) / W / 2 - land.z0) / RES;
    g.drawImage(land.canvas, srcX, srcZ, span / RES, (span * H) / W / RES, 0, 0, W, H);

    // The crew's pencil marks from the paper chart, faint.
    if (this.marks?.strokes.length) {
      g.strokeStyle = 'rgba(230, 230, 220, 0.55)';
      g.lineWidth = 2;
      g.beginPath();
      for (const st of this.marks.strokes) {
        for (let i = 0; i + 1 < st.pts.length; i += 2) {
          const [px, py] = toPx(st.pts[i], st.pts[i + 1]);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
      }
      g.stroke();
    }

    // Ports.
    g.font = 'bold 18px system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const p of PORTS) {
      const [px, py] = toPx(p.x, p.z);
      if (px < -50 || px > W + 50 || py < -20 || py > H + 20) continue;
      const isDest = p.id === destId && !inc;
      g.fillStyle = isDest ? '#ffd23a' : '#e8e2cc';
      g.beginPath();
      g.arc(px, py, isDest ? 7 : 5, 0, Math.PI * 2);
      g.fill();
      if (isDest) {
        g.strokeStyle = '#ffd23a';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(px, py, 14, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillText(p.name.replace(' (anchorage)', ''), px + 10, py - 12);
    }

    // Search area.
    if (inc) {
      const [cx, cy] = toPx(inc.x, inc.z);
      const rad = inc.radius / mpp;
      g.fillStyle = 'rgba(255, 120, 30, 0.18)';
      g.strokeStyle = '#ff8a2a';
      g.lineWidth = 3;
      g.setLineDash([10, 7]);
      g.beginPath();
      g.arc(cx, cy, Math.max(rad, 6), 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffb070';
      g.fillText('SEARCH AREA', cx - 50, cy - Math.max(rad, 6) - 12);
      if (this.showTargets) {
        g.fillStyle = '#ff2a2a';
        for (const t of inc.targets) {
          const [tx, ty] = toPx(t.x, t.z);
          g.fillRect(tx - 3, ty - 3, 6, 6);
        }
      }
    }

    // A fire: a red flame mark.
    if (fireJob) {
      const [px, py] = toPx(fireJob.x, fireJob.z);
      g.fillStyle = fireJob.phase === 'out' ? '#808080' : '#ff3a1a';
      g.beginPath();
      g.moveTo(px, py - 12);
      g.quadraticCurveTo(px + 9, py, px, py + 8);
      g.quadraticCurveTo(px - 9, py, px, py - 12);
      g.fill();
      g.font = 'bold 16px system-ui, sans-serif';
      g.fillText(fireJob.phase === 'out' ? 'OUT' : 'FIRE', px + 11, py - 10);
    }

    // The tow: an orange diamond.
    if (tow) {
      const [tx, ty] = toPx(tow.position[0], tow.position[2]);
      g.fillStyle = '#ff9a3a';
      g.beginPath();
      g.moveTo(tx, ty - 9);
      g.lineTo(tx + 7, ty);
      g.lineTo(tx, ty + 9);
      g.lineTo(tx - 7, ty);
      g.closePath();
      g.fill();
      g.font = 'bold 16px system-ui, sans-serif';
      g.fillText('TOW', tx + 11, ty - 10);
    }

    // AIS targets: passing ships as triangles along their course, with a 6-minute course
    // line and their name (AIS works in any visibility - that's the point of it).
    for (const ship of world.traffic?.ships ?? []) {
      const [px, py] = toPx(ship.x, ship.z);
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      const [ex, ey] = toPx(ship.x + Math.sin(ship.course) * ship.speed * 360, ship.z - Math.cos(ship.course) * ship.speed * 360);
      g.strokeStyle = '#7af0c0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(ex, ey);
      g.stroke();
      g.save();
      g.translate(px, py);
      g.rotate(ship.course);
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(6, 7);
      g.lineTo(-6, 7);
      g.closePath();
      g.stroke();
      g.restore();
      g.fillStyle = '#7af0c0';
      g.font = 'bold 14px system-ui, sans-serif';
      g.fillText(ship.name.toUpperCase(), px + 10, py + 14);
    }

    // Own ship: a triangle pointing along the heading.
    const [qx, qy, qz, qw] = v.orientation;
    const hx = -(2 * (qx * qz + qw * qy));
    const hz = -(1 - 2 * (qx * qx + qy * qy));
    const hdg = Math.atan2(hx, -hz);
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(hdg);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(8, 9);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // North, scale bar and the readout.
    g.fillStyle = '#e8e2cc';
    g.font = 'bold 18px system-ui, sans-serif';
    g.fillText('N ▲', W - 46, 18);
    const bar = niceDistance(span / 4);
    g.fillRect(14, H - 22, bar / mpp, 4);
    g.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 14, H - 36);
    const brg = ((Math.atan2(fx - sx, -(fz - sz)) * 180) / Math.PI + 360) % 360;
    g.textAlign = 'right';
    g.fillStyle = inc ? '#ffb070' : '#ffd23a';
    g.font = 'bold 22px system-ui, sans-serif';
    g.fillText(`${label}  ${brg.toFixed(0).padStart(3, '0')}°  ${(dist / 1852).toFixed(2)} nm`, W - 12, H - 22);
    g.textAlign = 'left';
    // Bezel.
    g.strokeStyle = '#2b2f2c';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    this.texture.needsUpdate = true;
  }
}

/** A round scale-bar length near `m` (m). */
function niceDistance(m: number): number {
  const steps = [50, 100, 200, 250, 500, 1000, 2000];
  return steps.reduce((best, s) => (Math.abs(s - m) < Math.abs(best - m) ? s : best), steps[0]);
}
