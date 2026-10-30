import { isPowered } from '../vessel/electrics';
import { panelLit } from '../controls/panelLighting';
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { part } from '../render/geometryUtils';
import { cargoPaused, portById } from '../rescue/rescue';
import { CURRENTS, FISHING_GROUNDS, MARKS, PLACES, PORTS, POTTING_GROUNDS, WRECKS } from '../world/archipelago';

/** The place names, most prominent first (they claim their room on the screen first). */
const PLACES_BY_RANK = [...PLACES].sort((a, b) => a.rank - b.rank);
import { raceReading } from '../world/currents';
import { CONFIG } from '../config';
import { MODE, VOYAGE_MAP_ID } from '../mode';
import { ferriesInSight } from '../traffic/ferries';
import { boatOwnerName, playerBoats } from '../core/launch';
import { nextPoint, pointLabel } from '../voyage/plan';
import type { ChartMarks } from '../chart/marks';
import { towFast } from '../tow/tow';
import { Button } from '../controls/Button';
import { Control } from '../controls/Control';
import { ChartPad, type ChartPadHost, type PadFace } from '../voyage/chartPad';
import { allFarms } from '../world/windFarm';
import { LandLayer } from './landLayer';
import { activeProject, foundations, installAt, jackUpAt, laidMarks, towId } from '../career/projects';
import { siteWorld, sitesOn } from '../dive/diveSites';
import { foundNames } from '../dive/diveReturn';

/** The dive sites on this page's map (the career's, or the Voyage map's). */
const DIVE_SITES_HERE = sitesOn(MODE === 'career' ? 'career' : VOYAGE_MAP_ID);

const W = 512;
const H = 384;
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
 * PLAN (owner, 29 Oct 2026: "the chartplotter gets a PLAN button: drag on it to look away from
 * your boat, tap to add a point"): a key at the strip's right end turns its screen to the
 * planning chart (voyage/chartPad.ts), your own view of it, starting round your boat at the
 * range it showed: drag on the screen to look round, press it to put a point (WAY STOP LOOK
 * DEL along its foot; UNDO), − and + zoom it and AUTO brings your boat back to the middle (the
 * boat's own range is left as it was). PLAN again goes back. Each player's own (nothing sent
 * but the points).
 *
 * Draw calls: bezel (merged) + screen (+ the buttons' caps, the PLAN key). The screen redraws
 * at a few Hz, and only when the App says it could be seen.
 */
export class ChartPlotter {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  /** Its land, shallows and sea (nav/landLayer.ts, shared with the planning chart's drawing). */
  private readonly land = new LandLayer();

  /** The world view's built terrains, for the career map's outlines (null until a region's view is built). */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.land.setLandSource(source);
  }
  private dark = false;
  private since = Infinity;
  /** Debug: draw the targets too. */
  showTargets = false;
  /** Your pots shown too (casual mode, CONFIG.potting.showOnPlotter, or the debug toggle). */
  showPots = CONFIG.potting.showOnPlotter;
  /** The crew's pencil marks, drawn faintly over the map (null: not shown). */
  marks: ChartMarks | null = null;
  /**
   * Special places drawn on the chart (Voyage's timber run, voyage/timber.ts): an anchorage
   * with something ashore (a ring of its radius and an anchor), or a merchant at a quay (a
   * square). Each with its name.
   */
  specials: { x: number; z: number; r?: number; label: string; kind: 'anchorage' | 'merchant' }[] = [];
  /** Its case and its brackets to the roof (root axes), to be merged with the boat's other fixed parts. */
  readonly fixedParts: THREE.BufferGeometry[];
  /** Its zoom buttons, − AUTO + (on the strip under the screen). */
  readonly zoomButtons: Button[];
  /** The ground across the screen at its last redraw (m): − and + step on from it. */
  private shownSpan = 1000;
  /** The PLAN key (at the strip's right end): the screen to the planning chart and back. */
  readonly planKey: PlotterPlanKey;
  /** The planning chart in PLAN mode (made when the App gives it the world: setPlanHost). */
  private planPad: ChartPad | null = null;
  private planOn = false;
  /** The boat's own zoom at the last look (what − AUTO + send back unchanged in PLAN). */
  private zoomNow = 0;
  /** The App said it could be seen, last frame. */
  private seen = false;
  private readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

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
    // (In PLAN, they zoom the planning chart, AUTO puts your boat back in its middle, and the boat's range is sent back as it was.)
    const zoomIn = () => {
      if (this.planning) return this.planPad!.zoomBy(1.6), this.zoomNow;
      for (let k = ranges.length - 1; k >= 0; k--) if (ranges[k] < this.shownSpan * 0.99) return k + 1;
      return 1;
    };
    const zoomOut = () => {
      if (this.planning) return this.planPad!.zoomBy(1 / 1.6), this.zoomNow;
      for (let k = 0; k < ranges.length; k++) if (ranges[k] > this.shownSpan * 1.01) return k + 1;
      return ranges.length;
    };
    const auto = () => (this.planning ? (this.planPad!.centreOnBoat(), this.zoomNow) : 0);
    this.zoomButtons = (
      [
        ['chartZoomOut', 'Chartplotter: ZOOM OUT', 0x3a3f44, -0.075, zoomOut],
        ['chartZoomAuto', 'Chartplotter: AUTO ZOOM (it chooses the range; in PLAN, your boat to the middle)', 0xe0a020, 0, auto],
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
    this.screen = screen;
    this.planKey = new PlotterPlanKey(() => this.togglePlan(), () => this.planOn);
    this.planKey.root.position.set(0.172, stripY, 0);
    set.add(this.planKey.root);
  }

  /** In PLAN mode, with the planning chart made. */
  private get planning(): boolean {
    return this.planOn && !!this.planPad;
  }

  /**
   * The App's world for PLAN mode (the planning chart is made here, once), and the world
   * view's built terrains for its coast. Returns its screen as a planning chart's face, for
   * the pointer (voyage/chartPad.ts PadFaces).
   */
  setPlanHost(host: ChartPadHost, landSource: (regionId: string) => Float32Array | null): PadFace {
    const c = CONFIG.voyage.plan.chart.plotter;
    const pad = (this.planPad ??= new ChartPad(host, { px: c.px, aspect: W / H, toolbarShare: c.toolbarShare, keys: ['way', 'stop', 'look', 'remove', 'undo'], redrawS: c.redrawS }));
    pad.setLandSource(landSource);
    return { mesh: this.screen, pad, reach: c.reach, on: () => this.planOn && this.seen && !this.dark };
  }

  /** PLAN pressed: the screen to the planning chart (round your boat at the range it showed, the first time) or back. */
  private togglePlan(): void {
    if (!this.planPad) return;
    this.planOn = !this.planOn;
    if (this.planOn && !this.planLooked) this.planPad.centreOnBoat(this.shownSpan);
    this.planLooked ||= this.planOn;
    this.planPad.input(null, false);
    this.planKey.sync();
    this.showScreen();
  }
  private planLooked = false;

  /** The screen's picture: the planning chart in PLAN (powered), else its own. */
  private showScreen(): void {
    const map = this.planOn && !this.dark && this.planPad ? this.planPad.texture : this.texture;
    if (this.screen.material.map === map) return;
    this.screen.material.map = map;
    this.screen.material.needsUpdate = true;
  }

  update(world: WorldState, vesselId: string, dt: number, visible: boolean): void {
    this.since += dt;
    this.seen = visible;
    if (!visible) return;
    const v = world.vessels[vesselId];
    if (!v) return;
    this.zoomNow = v.controls.chartZoom ?? 0;
    // No 12 V: a black screen (drawn once).
    if (!isPowered(v, 'chart')) {
      if (!this.dark) {
        this.dark = true;
        this.g.fillStyle = '#020303';
        this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.texture.needsUpdate = true;
        this.showScreen();
      }
      return;
    }
    if (this.dark) {
      this.dark = false;
      this.showScreen();
    }
    // PLAN: the planning chart (it redraws when it changes); its own picture waits.
    if (this.planning) {
      this.planPad!.update(dt);
      return;
    }
    if (this.since < 0.4) return;
    this.since = 0;
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
    const planNext = nextPoint(world);
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
    } else if (planNext) {
      // The crew's voyage plan (voyage/plan.ts): its next point, when no job wants us.
      [fx, fz] = [planNext.p.x, planNext.p.z];
      label = pointLabel(planNext.p, planNext.i).replace(/^(\w+) (\d+): /, '$1 $2 ').toUpperCase();
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
    // The land, shallows and sea (nav/landLayer.ts).
    this.land.draw(g, W, H, sx, sz, mpp);

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

    // A construction project under way (career/projects.ts): its site, the stage's survey lines
    // (dashed magenta, the stretches run in green) and its buoys' spots (a magenta ring and the
    // mark's name until laid, then a mark like the others).
    // A project's laid marks: yellow diamonds, as the map's own buoys.
    const drawLaid = () => {
      for (const m of laidMarks(world)) {
        const [px, py] = toPx(m.x, m.z);
        g.fillStyle = '#ffd23a';
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
    };
    const proj = activeProject(world);
    if (proj) {
      const { def, p, jobs } = proj;
      g.save();
      // Small print, as the chart's other notes; the buoys' names only zoomed in (they'd pile up).
      g.font = '11px system-ui, sans-serif';
      const named = mpp < 4;
      for (const t of def.turbines) {
        const [px, py] = toPx(t.x, t.z);
        g.strokeStyle = 'rgba(230, 90, 200, 0.7)';
        g.lineWidth = 1.5;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(px, py, 6, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      const [lx, ly] = toPx(def.turbines[0].x, def.turbines[0].z);
      g.fillStyle = '#f0a0e0';
      g.fillText(`${def.name.replace(' wind farm', '')} works`, lx - 20, ly - 12);
      const segs = CONFIG.career.projectSurvey.segments;
      for (const job of jobs) {
        if (p.done.includes(job.id)) continue;
        if (job.kind === 'survey') {
          const [ax, ay] = toPx(job.from[0], job.from[1]);
          const [bx, by] = toPx(job.to[0], job.to[1]);
          g.strokeStyle = '#e65ac8';
          g.lineWidth = 2;
          g.setLineDash([6, 4]);
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = '#4be08a';
          g.lineWidth = 3;
          for (const k of p.survey[job.id] ?? []) {
            g.beginPath();
            g.moveTo(ax + ((bx - ax) * k) / segs, ay + ((by - ay) * k) / segs);
            g.lineTo(ax + ((bx - ax) * (k + 1)) / segs, ay + ((by - ay) * (k + 1)) / segs);
            g.stroke();
          }
          g.fillStyle = '#f0a0e0';
          g.fillText(job.name.replace(/Survey line (\d).*/, 'L$1'), bx + 4, by + 4);
        } else if (job.kind === 'tow' || job.kind === 'supply') {
          // A tow or a supply run: the hand-over ring (at a monopile's turbine, or round the
          // jack-up), and a tow itself where it is (at the laydown, or in tow): a magenta bar
          // along its length.
          const ju = jackUpAt(world);
          const t = job.kind === 'tow' && job.turbine !== undefined ? def.turbines[job.turbine] : ju;
          if (t) {
            const [tx, ty] = toPx(t.x, t.z);
            const r = job.kind === 'supply' ? CONFIG.career.projectSupply.radius : job.turbine !== undefined ? CONFIG.career.projectTow.handover.radius : CONFIG.career.projectTow.toJackUpRadius;
            g.strokeStyle = '#e65ac8';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(tx, ty, Math.max(r / mpp, 5), 0, Math.PI * 2);
            g.stroke();
          }
          if (job.kind === 'supply') continue;
          const mv = world.vessels[towId(def, job)];
          if (mv) {
            const [mx, my] = toPx(mv.position[0], mv.position[2]);
            const [qx, qy, qz, qw] = mv.orientation;
            const fx = -(2 * (qx * qz + qw * qy));
            const fz = -(1 - 2 * (qx * qx + qy * qy));
            const half = Math.max(20 / mpp, 4);
            g.strokeStyle = '#f080e0';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(mx - fx * half, my - fz * half);
            g.lineTo(mx + fx * half, my + fz * half);
            g.stroke();
            g.fillStyle = '#f0a0e0';
            g.fillText(job.turbine !== undefined ? `Pile ${job.turbine + 1}` : 'TP barge', mx + 8, my - 6);
          }
        } else if (job.kind === 'buoy') {
          const [px, py] = toPx(job.at[0], job.at[1]);
          g.strokeStyle = '#e65ac8';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(px, py, Math.max(CONFIG.career.projectBuoy.radius / mpp, 5), 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#f0a0e0';
          if (named) g.fillText(job.name, px + 8, py - 6);
        }
      }
      // Guard duty: the installation ship (a grey block), the zone round her (red, dashed) and
      // where a guard boat stands by (faint); the ships sent for the works (red, named: her
      // radar's contacts, passed to the guard, AIS or not).
      const inst = installAt(world);
      if (inst) {
        const gc = CONFIG.career.projectGuard;
        const [ix, iy] = toPx(inst.x, inst.z);
        g.strokeStyle = 'rgba(230, 90, 200, 0.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(ix, iy, gc.standBy / mpp, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = '#ff4040';
        g.lineWidth = 2;
        g.setLineDash([6, 4]);
        g.beginPath();
        g.arc(ix, iy, Math.max(gc.zone / mpp, 6), 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        const [hl, hw] = CONFIG.career.projectInstall.hull;
        g.fillStyle = '#7c8488';
        g.fillRect(ix - Math.max(hl / 2 / mpp, 4), iy - Math.max(hw / 2 / mpp, 2), Math.max(hl / mpp, 8), Math.max(hw / mpp, 4));
        for (const sh of world.traffic?.ships ?? []) {
          if (sh.bound !== def.id) continue;
          const [sx, sy] = toPx(sh.x, sh.z);
          const fx = Math.sin(sh.course);
          const fz = -Math.cos(sh.course);
          g.fillStyle = '#ff4040';
          g.beginPath();
          g.moveTo(sx + fx * 8, sy + fz * 8);
          g.lineTo(sx - fx * 5 - fz * 4, sy - fz * 5 + fx * 4);
          g.lineTo(sx - fx * 5 + fz * 4, sy - fz * 5 - fx * 4);
          g.closePath();
          g.fill();
          g.fillText(sh.name, sx + 8, sy - 6);
        }
      }
      // The foundations driven (and the one being driven): grey discs, yellow once their
      // transition piece is on, white once the turbine's up.
      for (const f of foundations(world)) {
        const [px, py] = toPx(f.x, f.z);
        g.fillStyle = f.erect === 1 ? '#f4f6f6' : f.tp === 1 ? '#e8c020' : f.driving === null ? '#9aa0a4' : '#c8ccd0';
        g.beginPath();
        g.arc(px, py, 4, 0, Math.PI * 2);
        g.fill();
      }
      drawLaid();
      g.restore();
    } else drawLaid(); // (a finished project's marks stay laid round its farm)

    // Wind turbines (world/windFarm.ts): a white three-bladed sign each; the crew transfer's
    // turbine (transfer/transfer.ts) ringed in amber with its number, while the job is on.
    const tj = world.transfer?.job && !world.transfer.job.done ? world.transfer.job : null;
    allFarms().forEach((f, fi) =>
      f.turbines.forEach((t, ti) => {
        const [px, py] = toPx(t.x, t.z);
        if (px < -20 || px > W + 20 || py < -20 || py > H + 20) return;
        g.strokeStyle = '#f2f2ee';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6);
        }
        g.stroke();
        if (tj && tj.farm === fi && tj.turbine === ti) {
          g.strokeStyle = '#f0b030';
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(px, py, 11, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#f0b030';
          g.font = 'bold 15px system-ui, sans-serif';
          g.textBaseline = 'middle';
          g.fillText(`T${ti + 1}`, px + 14, py);
        }
      }),
    );

    // Special places: the timber camp's anchorage, the timber merchant.
    g.font = 'bold 16px system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const o of this.specials) {
      const [px, py] = toPx(o.x, o.z);
      if (px < -60 || px > W + 60 || py < -30 || py > H + 30) continue;
      g.strokeStyle = '#c99a5a';
      g.fillStyle = '#c99a5a';
      g.lineWidth = 2;
      if (o.kind === 'anchorage') {
        g.setLineDash([5, 4]);
        g.beginPath();
        g.arc(px, py, Math.max(8, (o.r ?? 50) / mpp), 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        // An anchor: shank, stock and crown.
        g.beginPath();
        g.moveTo(px, py - 7);
        g.lineTo(px, py + 6);
        g.moveTo(px - 4, py - 4);
        g.lineTo(px + 4, py - 4);
        g.moveTo(px - 6, py + 2);
        g.quadraticCurveTo(px, py + 10, px + 6, py + 2);
        g.stroke();
      } else g.fillRect(px - 5, py - 5, 10, 10);
      g.fillText(o.label, px + 12, py - 12);
    }

    // Ports (their names' boxes kept, so the place names below keep clear of them).
    const labels: [number, number, number, number][] = [];
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
      if (isDest || span <= 8000) {
        const name = p.name.replace(' (anchorage)', '');
        g.fillText(name, px + 10, py - 12);
        labels.push([px + 10, py - 24, px + 10 + g.measureText(name).width, py]);
      }
    }

    // Place names (a coast map's, the coast extras plan C4): rank 1 (towns, the big waters) on
    // the widest ranges, down to rank 4 (islets, small points) close in (CONFIG.places
    // plotterSpan); the sea's names in italic blue, islands in capitals, towns and villages
    // plain; one that would overprint a port's name or another place's is left out.
    const spans = CONFIG.places.plotterSpan;
    for (const pl of PLACES_BY_RANK) {
      if (span > (spans[pl.rank - 1] ?? 0)) continue;
      const [px, py] = toPx(pl.x, pl.z);
      if (px < -80 || px > W + 80 || py < -20 || py > H + 20) continue;
      const water = pl.kind === 'bay' || pl.kind === 'strait' || pl.kind === 'sea';
      const isle = pl.kind === 'island' || pl.kind === 'islet' || pl.kind === 'archipelago';
      const text = isle ? pl.name.toUpperCase() : pl.name;
      g.font = `${water ? 'italic ' : isle ? 'bold ' : ''}${pl.rank <= 2 ? 17 : 14}px system-ui, sans-serif`;
      const w = g.measureText(text).width;
      const box: [number, number, number, number] = [px - w / 2 - 3, py - 10, px + w / 2 + 3, py + 10];
      if (labels.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      labels.push(box);
      g.textAlign = 'center';
      g.fillStyle = water ? '#8ec8e8' : isle ? '#e8e2cc' : '#c8c2ae';
      g.fillText(text, px, py);
      g.textAlign = 'left';
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

    // Fishing grounds: dashed teal rings with their names (named close in only: CONFIG.chartPlotter.groundLabelsWithin).
    const labelGrounds = span <= CONFIG.chartPlotter.groundLabelsWithin;
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
      if (labelGrounds) g.fillText(`${fg.name} (fish)`, cx - 60, cy);
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
        if (labelGrounds) g.fillText(`${pg.name.split(',')[0]} (pots)`, cx - 50, cy - rad - 4);
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
    // Dive sites (dive/diveSites.ts: wrecks for the submersible game): a dashed pale blue ring,
    // the chart's wreck mark (a line crossed by three strokes) in it, the depth (and her name, once found).
    for (const site of DIVE_SITES_HERE) {
      const at = siteWorld(site);
      if (!at) continue;
      const [cx, cy] = toPx(at.x, at.z);
      const rad = Math.max(CONFIG.dive.radius / mpp, 7);
      if (cx + rad < -60 || cx - rad > W + 60 || cy + rad < -20 || cy - rad > H + 20) continue;
      g.strokeStyle = 'rgba(170, 215, 255, 0.85)';
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 6, cy);
      g.lineTo(cx + 6, cy);
      for (const dx of [-3.5, 0, 3.5]) {
        g.moveTo(cx + dx, cy - 3);
        g.lineTo(cx + dx, cy + 3);
      }
      g.stroke();
      g.fillStyle = '#b8dcff';
      // Unnamed until a dive identifies her (dive/diveReturn.ts).
      const named = foundNames()[site.id];
      g.fillText(named ? `${named} (wreck, ${site.depthM} m)` : `Wreck, ${site.depthM} m`, cx - 40, cy - rad - 4);
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

    // The ferries (a coast map's, C7) on AIS: in Voyage (no receiver to buy there) or with the
    // receiver; each a triangle along her heading with her name, a 6-minute line when under way.
    if (MODE === 'voyage' || world.career?.upgrades.includes('ais'))
      for (const { f, p } of ferriesInSight(world)) {
        const [px, py] = toPx(p.x, p.z);
        if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
        g.strokeStyle = '#7af0c0';
        g.lineWidth = 2;
        if (f.v > 0.3) {
          const [ex, ey] = toPx(p.x + Math.sin(p.heading) * f.v * 360, p.z - Math.cos(p.heading) * f.v * 360);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(ex, ey);
          g.stroke();
        }
        g.save();
        g.translate(px, py);
        g.rotate(p.heading);
        g.beginPath();
        g.moveTo(0, -11);
        g.lineTo(6, 8);
        g.lineTo(-6, 8);
        g.closePath();
        g.stroke();
        g.restore();
        g.fillStyle = '#7af0c0';
        g.font = 'bold 14px system-ui, sans-serif';
        g.fillText(f.ship.toUpperCase(), px + 10, py + 14);
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

    // The voyage plan: the route (waypoints and stops) joined up (legs done dashed grey), each
    // point numbered, the next ringed; things to look at off it, teal diamonds (grey once seen).
    const plan = world.plan;
    if (plan?.points.length) {
      const pts = plan.points;
      const route = pts.map((p, i) => ({ p, i })).filter((r) => r.p.kind !== 'look');
      g.lineWidth = 3;
      for (let k = 1; k < route.length; k++) {
        const [ax, ay] = toPx(route[k - 1].p.x, route[k - 1].p.z);
        const [bx, by] = toPx(route[k].p.x, route[k].p.z);
        const done = route[k].i < plan.next;
        g.strokeStyle = done ? '#8a8a8a' : '#e040a0';
        g.setLineDash(done ? [8, 8] : []);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.setLineDash([]);
      g.font = 'bold 14px system-ui, sans-serif';
      pts.forEach((p, i) => {
        const [px, py] = toPx(p.x, p.z);
        const look = p.kind === 'look';
        g.fillStyle = (look ? p.seen : i < plan.next) ? '#8a8a8a' : look ? '#18a89a' : '#e040a0';
        g.beginPath();
        if (p.kind === 'stop') g.rect(px - 7, py - 7, 14, 14);
        else if (look) {
          g.moveTo(px, py - 9);
          g.lineTo(px + 9, py);
          g.lineTo(px, py + 9);
          g.lineTo(px - 9, py);
          g.closePath();
        } else g.arc(px, py, 6, 0, Math.PI * 2);
        g.fill();
        if (i === planNext?.i) {
          g.strokeStyle = '#ffd23a';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(px, py, 14, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = look ? '#b8f0e8' : '#ffe0f0';
        g.fillText(`${i + 1}${p.name ? ` ${p.name.toUpperCase()}` : ''}`, px + 11, py - 9);
      });
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

/**
 * The PLAN key at the right end of the plotter's zoom strip: a small square key, PLAN printed
 * on it, lit magenta while the planning chart is on the screen. A press turns it on or off
 * (this page's own: nothing is sent).
 */
class PlotterPlanKey extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Chartplotter: PLAN (the planning chart: drag to look round, press to put a point)';
  private readonly face: THREE.MeshLambertMaterial;
  private pressed = false;
  private wasLit = false;

  constructor(
    private readonly onPress: () => void,
    private readonly lit: () => boolean,
  ) {
    super('chartPlan', 'chartPlan');
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#101418';
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PLAN', 64, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.face = this.material(0x8a8f94);
    this.face.map = tex;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.012).translate(0, 0, 0.006), this.material(0x3a3f44));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.026).translate(0, 0, 0.0125), this.face);
    this.root.add(body, top);
    this.hitObjects.push(body, top);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.5, 30);
    this.onPress();
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(): void {
    const on = this.lit();
    if (on === this.wasLit) return;
    this.wasLit = on;
    this.face.color.setHex(on ? 0xff60c0 : 0x8a8f94);
  }
}
