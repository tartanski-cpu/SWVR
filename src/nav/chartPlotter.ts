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
import { boatOwnerName, playerBoats } from '../core/launch';
import type { ChartMarks } from '../chart/marks';
import { towFast } from '../tow/tow';
import { Button } from '../controls/Button';
import { coastTerrains } from '../world/coastTerrain';
import { CHART_LEVELS, cellOutlines, chartCells, terrainMesh, type ChartCell, type MeshArrays } from './chartLand';

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
/** The chart's colours: deep water, then each of CHART_LEVELS' (the shallows, the beach, the land). */
const DEEP: [number, number, number] = [16, 46, 66];
const BANDS: [number, number, number][] = [
  [44, 98, 118],
  [196, 178, 126],
  [118, 128, 86],
];
const css = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

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
 * Zoom (owner, Oct 2026): three buttons on a strip under the screen, − AUTO +. − and + step
 * through CONFIG.chartPlotter.ranges (the ground across the screen) from whatever it shows
 * now; AUTO goes back to choosing for you. The zoom is the boat's (`chartZoom`), so the crew
 * see the range the helmsman set; the screen says which, top left.
 *
 * Draw calls: bezel (merged) + screen (+ the buttons' caps). The screen redraws at a few Hz,
 * and only when the App says it could be seen.
 */
export class ChartPlotter {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  /** The land, shallows and sea of each region, sampled from the terrain once when first in view (regions). */
  private readonly lands = new Map<string, { canvas: HTMLCanvasElement; x0: number; z0: number; res: number }>();
  /** A coast map's mesh as outlines (chartLand.ts), square by square, and their canvas paths once drawn; kept while the mesh is loaded. */
  private readonly outlines = new WeakMap<MeshArrays, { cells: ChartCell[]; paths: (Path2D[] | undefined)[] }>();
  /** A hand-built region's drawn terrain as a mesh to cut (owner: the same sharp coast on the career map), once its view has built it. */
  private readonly landMeshes = new Map<string, MeshArrays>();
  /** Where a hand-built region's built terrain comes from (the world view; App sets it). */
  private landSource: ((regionId: string) => Float32Array | null) | null = null;

  /** The world view's built terrains, for the career map's outlines (null until a region's view is built). */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.landSource = source;
  }
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
  /** Its zoom buttons, − AUTO + (on the strip under the screen). */
  readonly zoomButtons: Button[];
  /** The ground across the screen at its last redraw (m): − and + step on from it. */
  private shownSpan = 1000;

  /**
   * Built at its root's origin (the chartplotter module places it, turned toward the helm).
   * @param tiltDeg how far its screen is tilted down toward the helmsman
   * @param drop    from its root up to the roof (its brackets' length, m)
   */
  constructor(tiltDeg: number, drop: number, zoomChannel = 'chartZoom') {
    this.root.name = 'chartPlotter';
    const set = new THREE.Group();
    set.rotation.x = (tiltDeg * Math.PI) / 180;
    this.root.add(set);
    const sw = 0.36;
    const sh = 0.27;
    const tilt = new THREE.Matrix4().makeRotationX(set.rotation.x);
    // The zoom strip under the screen: − AUTO + (the buttons face you, as the screen does),
    // a white − and + engraved beside the outer two.
    const stripY = -sh / 2 - 0.02 - 0.035;
    const glyph = (w: number, h: number, x: number) => part(new THREE.BoxGeometry(w, h, 0.004).translate(x, stripY, 0.002), 0xd8dadc).applyMatrix4(tilt);
    this.fixedParts = [
      part(new THREE.BoxGeometry(sw + 0.04, sh + 0.04, 0.05).translate(0, 0, -0.025), 0x24292d).applyMatrix4(tilt),
      part(new THREE.BoxGeometry(sw + 0.04, 0.07, 0.05).translate(0, stripY, -0.025), 0x24292d).applyMatrix4(tilt),
      glyph(0.024, 0.006, -0.125),
      glyph(0.024, 0.006, 0.125),
      glyph(0.006, 0.024, 0.125),
      ...[-0.12, 0.12].map((x) => part(new THREE.BoxGeometry(0.02, drop, 0.04).translate(x, drop / 2, -0.03), 0x3a3f44)),
    ];
    const ranges = CONFIG.chartPlotter.ranges;
    // The next range in (smaller than what it shows now), or out; as a zoom number (1 the first range).
    const zoomIn = () => {
      for (let k = ranges.length - 1; k >= 0; k--) if (ranges[k] < this.shownSpan * 0.99) return k + 1;
      return 1;
    };
    const zoomOut = () => {
      for (let k = 0; k < ranges.length; k++) if (ranges[k] > this.shownSpan * 1.01) return k + 1;
      return ranges.length;
    };
    this.zoomButtons = (
      [
        ['chartZoomOut', 'Chartplotter: ZOOM OUT', 0x3a3f44, -0.075, zoomOut],
        ['chartZoomAuto', 'Chartplotter: AUTO ZOOM (it chooses the range)', 0xe0a020, 0, () => 0],
        ['chartZoomIn', 'Chartplotter: ZOOM IN', 0x3a3f44, 0.075, zoomIn],
      ] as const
    ).map(([id, label, colour, x, sends]) => {
      const b = new Button(id, zoomChannel, label, 'pulse', colour, undefined, sends);
      b.root.position.set(x, stripY, 0);
      b.root.rotation.x = Math.PI / 2;
      set.add(b.root);
      return b;
    });
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
    // A coast region (real coastline) has no islands: its whole box.
    if (region.coast) ({ x0, x1, z0, z1 } = { x0: region.bounds.x0 + MARGIN, x1: region.bounds.x1 - MARGIN, z0: region.bounds.z0 + MARGIN, z1: region.bounds.z1 - MARGIN });
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
        const [r, gg, b] = h > CHART_LEVELS[2] ? BANDS[2] : h > CHART_LEVELS[1] ? BANDS[1] : h > CHART_LEVELS[0] ? BANDS[0] : DEEP;
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

  /**
   * A coast map's land, shallows and sea from its mesh (chartLand.ts) over the screen, centred
   * on (sx, sz) at `mpp` metres a pixel. Square by square (a whole map's mesh on a 2 km grid,
   * a big map's streamed squares each its own): deep water over each square that's ready,
   * then each level's outlines, all squares' for one level before the next (a face can reach
   * past its square). A square's outlines are made the first time it's in view, the nearest
   * first and only for CONFIG.chartPlotter.buildMs each redraw, so a map's first look doesn't
   * stall the frame: until a square's ready, the map's coarse picture shows there.
   */
  private drawCoast(sx: number, sz: number, mpp: number, reachX: number, reachZ: number): void {
    const g = this.g;
    const vx0 = sx - reachX;
    const vx1 = sx + reachX;
    const vz0 = sz - reachZ;
    const vz1 = sz + reachZ;
    const reach = 400; // how far a face may reach past its square (m)
    const meets = (c: ChartCell) => c.x0 + c.size + reach > vx0 && c.x0 - reach < vx1 && c.z0 + c.size + reach > vz0 && c.z0 - reach < vz1;
    const shown: { piece: MeshArrays; paths: (Path2D[] | undefined)[]; cell: ChartCell; k: number }[] = [];
    const add = (piece: MeshArrays, box?: { x0: number; z0: number; size: number }) => {
      let o = this.outlines.get(piece);
      if (!o) {
        const cells = chartCells(piece, box);
        this.outlines.set(piece, (o = { cells, paths: cells.map(() => undefined) }));
      }
      o.cells.forEach((cell, k) => {
        if (meets(cell)) shown.push({ piece, paths: o!.paths, cell, k });
      });
    };
    for (const t of coastTerrains()) {
      if (t.x1 < vx0 || t.x0 > vx1 || t.z1 < vz0 || t.z0 > vz1) continue;
      if (t.piece) add(t.piece);
      else
        for (const [k, p] of t.pieces) {
          const c = t.chunked!.chunks[k];
          add(p, { x0: c.x0 + t.ox, z0: c.z0 + t.oz, size: c.size });
        }
    }
    // The hand-built regions the same, from the terrain their views have built (the world
    // view builds a region's mesh as the boat nears it, well inside the plotter's reach); the
    // sampled picture stays underneath until then, and for the far ones.
    if (this.landSource) {
      for (const r of REGIONS) {
        if (r.coast) continue;
        const b = r.bounds;
        if (b.x1 < vx0 || b.x0 > vx1 || b.z1 < vz0 || b.z0 > vz1) continue;
        let m = this.landMeshes.get(r.id);
        if (!m) {
          const pos = this.landSource(r.id);
          if (!pos) continue;
          this.landMeshes.set(r.id, (m = terrainMesh(pos)));
        }
        add(m);
      }
    }
    if (!shown.length) return;
    // Make the missing outlines, nearest first, while there's time.
    const t0 = performance.now();
    const todo = shown.filter((s) => !s.paths[s.k]);
    todo.sort((a, b) => Math.hypot(a.cell.x0 + a.cell.size / 2 - sx, a.cell.z0 + a.cell.size / 2 - sz) - Math.hypot(b.cell.x0 + b.cell.size / 2 - sx, b.cell.z0 + b.cell.size / 2 - sz));
    for (const s of todo) {
      if (performance.now() - t0 > CONFIG.chartPlotter.buildMs) break;
      s.paths[s.k] = cellOutlines(s.piece, s.cell).map((d) => new Path2D(d));
    }
    const ready = shown.filter((s) => s.paths[s.k]);
    g.save();
    // In world metres from here on.
    g.setTransform(1 / mpp, 0, 0, 1 / mpp, W / 2 - sx / mpp, H / 2 - sz / mpp);
    g.fillStyle = css(DEEP);
    for (const s of ready) g.fillRect(s.cell.x0, s.cell.z0, s.cell.size, s.cell.size);
    CHART_LEVELS.forEach((_, l) => {
      g.fillStyle = css(BANDS[l]);
      for (const s of ready) g.fill(s.paths[s.k]![l]);
    });
    g.restore();
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
    // (Or the range chosen with the zoom buttons.)
    const zoom = Math.min(v.controls.chartZoom ?? 0, CONFIG.chartPlotter.ranges.length);
    const span = zoom > 0 ? CONFIG.chartPlotter.ranges[zoom - 1] : Math.min(5000, Math.max(700, dist * 2.6 + (inc ? inc.radius * 2 : 0)));
    this.shownSpan = span;
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
    // Over a coast map's picture (coarse), its ground as outlines wherever its mesh is in.
    this.drawCoast(sx, sz, mpp, reachX, reachZ);

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
      // Zoomed out wide, the names would pile up: only the destination's.
      if (isDest || span <= 8000) g.fillText(p.name.replace(' (anchorage)', ''), px + 10, py - 12);
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

    // The crew's boats (multi-boat M5): every other player's boat as an AIS-like target in
    // the crew's colour, with whose she is; no receiver needed (you're one crew).
    for (const b of playerBoats(world)) {
      if (b.id === vesselId) continue;
      const [px, py] = toPx(b.position[0], b.position[2]);
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      const [bx, by, bz, bw] = b.orientation;
      const course = Math.atan2(-(2 * (bx * bz + bw * by)), 1 - 2 * (bx * bx + by * by));
      const sp = Math.hypot(b.linearVelocity[0], b.linearVelocity[2]);
      const [ex, ey] = toPx(b.position[0] + Math.sin(course) * sp * 360, b.position[2] - Math.cos(course) * sp * 360);
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(ex, ey);
      g.stroke();
      g.save();
      g.translate(px, py);
      g.rotate(course);
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(6, 7);
      g.lineTo(-6, 7);
      g.closePath();
      g.stroke();
      g.restore();
      g.fillStyle = '#ffd27a';
      g.font = 'bold 14px system-ui, sans-serif';
      g.fillText(boatOwnerName(world, b).toUpperCase(), px + 10, py + 14);
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
    g.fillText(zoom > 0 ? `ZOOM ${span >= 1000 ? `${span / 1000} km` : `${span} m`}` : 'ZOOM AUTO', 12, 18);
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
