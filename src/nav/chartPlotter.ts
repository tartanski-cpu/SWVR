import { isPowered } from '../vessel/electrics';
import { panelLit } from '../controls/panelLighting';
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { part } from '../render/geometryUtils';
import { cargoPaused, portById } from '../rescue/rescue';
import { CURRENTS, FISHING_GROUNDS, MARKS, PORTS, POTTING_GROUNDS, WRECKS } from '../world/archipelago';
import { raceReading } from '../world/currents';
import { REGIONS } from '../world/regions';
import type { RegionDef } from '../world/defs';
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
 * At most this many land samples a region (it's sampled on the frame when it first comes into
 * view): a big region (the Fjord's mountain) is sampled coarser than RES so it doesn't hitch.
 */
const MAX_SAMPLES = 260_000;

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
  /** The land, shallows and sea of each region, sampled from the terrain once when first in view (regions). */
  private readonly lands = new Map<string, { canvas: HTMLCanvasElement; x0: number; z0: number; res: number }>();
  private dark = false;
  private since = Infinity;
  /** Debug: draw the targets too. */
  showTargets = false;
  /** Your pots shown too (casual mode, CONFIG.potting.showOnPlotter, or the debug toggle). */
  showPots = CONFIG.potting.showOnPlotter;
  /** The crew's pencil marks, drawn faintly over the map (null: not shown). */
  marks: ChartMarks | null = null;
  /** Its case and its brackets to the roof (root axes), to be merged with the boat's other fixed parts. */
  readonly fixedParts: THREE.BufferGeometry[];

  /**
   * Built at its root's origin (the chartplotter module places it, turned toward the helm).
   * @param tiltDeg how far its screen is tilted down toward the helmsman
   * @param drop    from its root up to the roof (its brackets' length, m)
   */
  constructor(tiltDeg: number, drop: number) {
    this.root.name = 'chartPlotter';
    const set = new THREE.Group();
    set.rotation.x = (tiltDeg * Math.PI) / 180;
    this.root.add(set);
    const sw = 0.36;
    const sh = 0.27;
    const tilt = new THREE.Matrix4().makeRotationX(set.rotation.x);
    this.fixedParts = [
      part(new THREE.BoxGeometry(sw + 0.04, sh + 0.04, 0.05).translate(0, 0, -0.025), 0x24292d).applyMatrix4(tilt),
      ...[-0.12, 0.12].map((x) => part(new THREE.BoxGeometry(0.02, drop, 0.04).translate(x, drop / 2, -0.03), 0x3a3f44)),
    ];
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), panelLit(new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })));
    screen.position.z = 0.002;
    set.add(screen);
  }

  /** A region's land, shallows and sea, sampled from the terrain once. */
  private buildLand(region: RegionDef): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const i of region.islands) {
      x0 = Math.min(x0, i.x - i.radius);
      x1 = Math.max(x1, i.x + i.radius);
      z0 = Math.min(z0, i.z - i.radius);
      z1 = Math.max(z1, i.z + i.radius);
    }
    x0 -= MARGIN;
    z0 -= MARGIN;
    x1 += MARGIN;
    z1 += MARGIN;
    const res = Math.max(RES, Math.sqrt(((x1 - x0) * (z1 - z0)) / MAX_SAMPLES));
    const cw = Math.ceil((x1 - x0) / res);
    const ch = Math.ceil((z1 - z0) / res);
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cw, ch);
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const h = groundHeight(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res);
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
    this.lands.set(region.id, { canvas: c, x0, z0, res });
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
    // Each region's land image that reaches the screen (built the first time it does).
    const reachX = span / 2 + MARGIN;
    const reachZ = (span * H) / W / 2 + MARGIN;
    for (const r of REGIONS) {
      const b = r.bounds;
      if (b.x1 < sx - reachX || b.x0 > sx + reachX || b.z1 < sz - reachZ || b.z0 > sz + reachZ) continue;
      if (!this.lands.has(r.id)) this.buildLand(r);
      const land = this.lands.get(r.id)!;
      const [dx, dz] = toPx(land.x0, land.z0);
      g.drawImage(land.canvas, dx, dz, (land.canvas.width * land.res) / mpp, (land.canvas.height * land.res) / mpp);
    }

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

    // Hazards: wrecks (a cross in a red ring) and their buoys (small diamonds in the mark's
    // colours: yellow/black cardinals, black-red isolated danger, red and green laterals).
    for (const w of WRECKS) {
      const [px, py] = toPx(w.x, w.z);
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
      g.strokeStyle = '#ff5040';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px, py, 8, 0, Math.PI * 2);
      g.moveTo(px - 5, py - 5);
      g.lineTo(px + 5, py + 5);
      g.moveTo(px + 5, py - 5);
      g.lineTo(px - 5, py + 5);
      g.stroke();
    }
    for (const m of MARKS) {
      const [px, py] = toPx(m.x, m.z);
      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      g.fillStyle = m.kind === 'port' ? '#ff4030' : m.kind === 'stbd' ? '#30d060' : m.kind === 'isolated' ? '#ff4030' : '#ffd23a';
      g.strokeStyle = '#101010';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px, py - 6);
      g.lineTo(px + 5, py);
      g.lineTo(px, py + 6);
      g.lineTo(px - 5, py);
      g.closePath();
      g.fill();
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

    // Tidal races (regions): the zone outlined, turned to its set, an arrow the way the water
    // runs now and its speed; slack, a still box and the word.
    for (const z of CURRENTS) {
      const [cx, cy] = toPx(z.x, z.z);
      const hl = z.length / 2 / mpp;
      const hw = z.width / 2 / mpp;
      if (cx + hl < 0 || cx - hl > W || cy + hl < 0 || cy - hl > H) continue;
      const r = raceReading(z, world.environment.timeOfDay, world.environment.raceOverride);
      g.save();
      g.translate(cx, cy);
      g.rotate((z.setDeg * Math.PI) / 180);
      g.strokeStyle = r.slack ? 'rgba(150,190,240,0.8)' : 'rgba(255,150,80,0.9)';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.strokeRect(-hw, -hl, 2 * hw, 2 * hl);
      g.setLineDash([]);
      if (!r.slack) {
        const dir = r.dirDeg === z.setDeg ? -1 : 1; // the set is up in this frame
        const len = Math.max(14, hl * 0.6);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, -dir * len);
        g.lineTo(0, dir * len);
        g.lineTo(-6, dir * len - dir * 9);
        g.moveTo(0, dir * len);
        g.lineTo(6, dir * len - dir * 9);
        g.stroke();
      }
      g.restore();
      g.fillStyle = r.slack ? '#9ec0f0' : '#ffb070';
      g.fillText(r.slack ? `${z.name}: slack` : `${z.name}: ${r.kn.toFixed(1)} kn`, cx + hw + 6, cy);
    }

    // Fishing grounds: dashed teal rings with their names.
    g.lineWidth = 2;
    for (const fg of FISHING_GROUNDS) {
      const [cx, cy] = toPx(fg.x, fg.z);
      const rad = fg.radius / mpp;
      if (cx + rad < 0 || cx - rad > W || cy + rad < 0 || cy - rad > H) continue;
      g.strokeStyle = 'rgba(90, 220, 200, 0.75)';
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(cx, cy, Math.max(rad, 8), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#7fe8d8';
      g.fillText(`${fg.name} (fish)`, cx - 60, cy);
    }
    // Potting grounds (when potting's on): hatched rings, orange, with their names.
    if (world.potting) {
      for (const pg of POTTING_GROUNDS) {
        const [cx, cy] = toPx(pg.x, pg.z);
        const rad = Math.max(pg.radius / mpp, 8);
        if (cx + rad < 0 || cx - rad > W || cy + rad < 0 || cy - rad > H) continue;
        g.save();
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.clip();
        g.strokeStyle = 'rgba(240, 150, 60, 0.45)';
        g.lineWidth = 1;
        for (let d = -2 * rad; d <= 2 * rad; d += 7) {
          g.beginPath();
          g.moveTo(cx + d - rad, cy + rad);
          g.lineTo(cx + d + rad, cy - rad);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = 'rgba(240, 150, 60, 0.85)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#f2b070';
        g.fillText(`${pg.name.split(',')[0]} (pots)`, cx - 50, cy - rad - 4);
      }
      // Casual mode / debug: the pots themselves, small orange dots.
      if (this.showPots) {
        g.fillStyle = '#ff9a3a';
        for (const pot of world.potting.shot) {
          const [px2, py2] = toPx(pot.x, pot.z);
          if (px2 < 0 || px2 > W || py2 < 0 || py2 > H) continue;
          g.beginPath();
          g.arc(px2, py2, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // Salvage logs washed up: brown bars, LOG.
    for (const l of world.salvage?.logs ?? []) {
      const [lx, ly] = toPx(l.x, l.z);
      if (lx < -20 || lx > W + 20 || ly < -20 || ly > H + 20) continue;
      const hx = Math.max(6, (Math.sin(l.yaw) * l.len) / 2 / mpp);
      const hz = Math.max(0, (Math.cos(l.yaw) * l.len) / 2 / mpp);
      g.strokeStyle = '#c8894a';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(lx - hx, ly - hz);
      g.lineTo(lx + hx, ly + hz);
      g.stroke();
      g.fillStyle = '#e0a868';
      g.fillText('LOG', lx + 9, ly - 10);
    }

    // Radar (a career upgrade): echoes of floating debris and lost crates near us.
    if (world.career?.upgrades.includes('radar')) {
      g.fillStyle = '#ffe14a';
      const echo = (x: number, z: number) => {
        if (Math.hypot(x - sx, z - sz) > CONFIG.career.radarRange) return;
        const [px, py] = toPx(x, z);
        g.beginPath();
        g.arc(px, py, 4, 0, Math.PI * 2);
        g.fill();
      };
      for (const d of world.traffic?.debris ?? []) echo(d.x, d.z);
      for (const t of world.rescue?.active?.targets ?? []) if (t.kind === 'crate' && (!t.phase || t.phase === 'floating')) echo(t.x, t.z);
      g.fillText('RADAR', W - 80, 22);
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

    // AIS targets (with the boatyard's AIS receiver): passing ships as triangles along their
    // course, with a 6-minute course line and their name (AIS works in any visibility -
    // that's the point of it).
    for (const ship of world.career?.upgrades.includes('ais') ? (world.traffic?.ships ?? []) : []) {
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
