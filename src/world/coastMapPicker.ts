/**
 * The front page's map picker (owner, Oct 2026: "an interactive map there so you can look
 * around the map and choose an area"): a chart of Europe with every Voyage map marked on it.
 * Drag to look around, scroll or pinch to zoom; a map's box opens out into its own coastline
 * and harbours as you zoom in. Pick a map to sail it (where you were last time, or its start
 * berth), or pick one of its harbours to start there (`voyage.html?map=<id>&start&berth=<id>`,
 * read by world/maps.ts).
 *
 * Everything it draws comes from one small file, regions/overview.json (tools/coast/src/overview.ts:
 * Europe from Natural Earth, each map's coast traced from its reconciled land grid, its ports
 * from its package), so the front page loads none of the game. Plain 2D canvas, Mercator.
 */

type Pt = [number, number];
interface OverviewPort {
  name: string;
  kind: string;
  at: Pt;
  berth?: string;
}
interface OverviewMap {
  id: string;
  name: string;
  blurb: string;
  startBerth?: string;
  bbox: [number, number, number, number];
  ports: OverviewPort[];
  coast: Pt[][];
}
interface Overview {
  credits: string;
  world: { land: Pt[][]; borders: Pt[][] };
  maps: OverviewMap[];
}

/** How the chart looks: the front page's colours (index.html), a chart's sea and land. */
const LOOK = {
  sea: '#123b52',
  grid: 'rgba(120, 170, 200, 0.13)',
  land: '#4f6b4c',
  landEdge: '#7d9a62',
  border: 'rgba(230, 220, 190, 0.35)',
  /** A map's own sea and land, brighter than the coarse Europe round it. */
  mapSea: '#174b66',
  mapLand: '#7d9a62',
  mapShore: '#c8b98a',
  box: '#ffd27a',
  text: '#e8eef2',
  dim: '#b9c7d2',
  port: '#ffd27a',
  start: '#5fc4ff',
};
/** A map's box at least this wide on screen (px) draws its own coast; this wide, its harbours too. */
const SHOW_COAST_PX = 70;
const SHOW_PORTS_PX = 260;
/** How near a click or touch must be to a harbour or a map's marker (px). */
const HIT_PX = 14;
/** Zoom limits (px per degree of longitude). */
const MIN_SCALE = 8;
const MAX_SCALE = 60000;

/** Mercator: lat (deg) to the chart's y, in degrees like the longitude (north up: y grows south). */
const mercY = (lat: number) => -(Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;

class MapPicker {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly panel = document.createElement('div');
  private readonly data: Overview;
  /** The view: the chart point at the canvas's middle, and px per degree. */
  private cx = 10;
  private cy = mercY(50);
  private scale = 30;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private selected: OverviewMap | null = null;
  private port: OverviewPort | null = null;
  private hover: OverviewMap | OverviewPort | null = null;
  private flight: { from: [number, number, number]; to: [number, number, number]; t0: number; ms: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragged = 0;
  private raf = 0;
  /** Each map's coast as a Path2D in chart units (built once). */
  private readonly coastPaths = new Map<string, Path2D>();
  private readonly landPath: Path2D;
  private readonly borderPath: Path2D;

  constructor(data: Overview) {
    this.data = data;
    this.ctx = this.canvas.getContext('2d')!;
    this.landPath = this.rings(data.world.land, true);
    this.borderPath = this.rings(data.world.borders, false);
    for (const m of data.maps) this.coastPaths.set(m.id, this.rings(m.coast, true));
    this.build();
    this.fitAll(false);
  }

  private rings(rings: Pt[][], closed: boolean): Path2D {
    const p = new Path2D();
    for (const r of rings) {
      r.forEach(([lon, lat], i) => (i ? p.lineTo(lon, mercY(lat)) : p.moveTo(lon, mercY(lat))));
      if (closed) p.closePath();
    }
    return p;
  }

  private build(): void {
    this.root.className = 'mp-root';
    this.root.innerHTML = `
      <style>
        .mp-root { position: fixed; inset: 0; z-index: 50; background: ${LOOK.sea}; color: ${LOOK.text}; font: 15px/1.4 system-ui, sans-serif; touch-action: none; user-select: none; }
        .mp-root canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
        .mp-root canvas.mp-drag { cursor: grabbing; }
        .mp-root canvas.mp-point { cursor: pointer; }
        .mp-top { position: absolute; left: 12px; right: 12px; top: 12px; display: flex; gap: 8px; align-items: flex-start; pointer-events: none; }
        .mp-top > * { pointer-events: auto; }
        .mp-title { padding: 8px 14px; border-radius: 10px; background: rgba(11, 20, 25, 0.82); border: 1px solid #2f4a58; }
        .mp-title b { color: #ffd27a; font-size: 17px; }
        .mp-title span { display: block; font-size: 12px; color: ${LOOK.dim}; }
        .mp-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
        .mp-chips button, .mp-btn { font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px; border: 1px solid #35505e; background: rgba(29, 51, 64, 0.92); color: #fff; cursor: pointer; }
        .mp-chips button:hover, .mp-btn:hover { border-color: #ffb347; }
        .mp-chips button.on { border-color: #ffd27a; color: #ffd27a; }
        .mp-close { font-size: 18px; line-height: 1; padding: 7px 12px; }
        .mp-panel { box-sizing: border-box; position: absolute; left: 12px; bottom: 12px; max-width: min(460px, calc(100% - 74px)); padding: 12px 16px 14px; border-radius: 12px; background: rgba(11, 20, 25, 0.88); border: 1px solid #2f4a58; }
        .mp-panel h3 { margin: 0 0 4px; font-size: 19px; color: #ffd27a; }
        .mp-panel p { margin: 0 0 10px; color: #c9d6dd; font-size: 14px; }
        .mp-panel .mp-go { display: inline-block; margin: 2px 8px 0 0; padding: 8px 14px; border-radius: 8px; background: #ffb347; color: #14222b; font-weight: 600; text-decoration: none; }
        .mp-panel .mp-go.alt { background: #1d3340; color: #fff; border: 1px solid #35505e; font-weight: 500; }
        .mp-panel .mp-hint { font-size: 12px; color: ${LOOK.dim}; margin: 8px 0 0; }
        .mp-zoom { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
        .mp-zoom button { width: 38px; height: 38px; font-size: 20px; padding: 0; }
        .mp-credit { position: absolute; right: 60px; bottom: 14px; font-size: 11px; color: rgba(185, 199, 210, 0.7); }
        @media (max-width: 680px) { .mp-credit { display: none; } .mp-chips { display: none; } }
      </style>
      <div class="mp-top">
        <div class="mp-title"><b>Voyage maps</b><span>Drag to look around, scroll or pinch to zoom. Pick a map, or a harbour to start at.</span></div>
        <div class="mp-chips"></div>
        <button class="mp-btn mp-close" title="Close (Esc)" aria-label="Close">×</button>
      </div>
      <div class="mp-zoom"><button class="mp-btn" data-z="1.6" aria-label="Zoom in">+</button><button class="mp-btn" data-z="0.625" aria-label="Zoom out">−</button><button class="mp-btn" data-all title="Every map" aria-label="Every map">⤢</button></div>
      <div class="mp-credit"></div>`;
    this.root.prepend(this.canvas);
    this.root.appendChild(this.panel);
    this.panel.className = 'mp-panel';
    (this.root.querySelector('.mp-credit') as HTMLElement).textContent = this.data.credits;
    const chips = this.root.querySelector('.mp-chips')!;
    for (const m of this.data.maps) {
      const b = document.createElement('button');
      b.textContent = shortName(m.name);
      b.dataset.id = m.id;
      b.title = m.blurb;
      b.onclick = () => this.select(m, null, true);
      chips.appendChild(b);
    }
    this.root.querySelector('.mp-close')!.addEventListener('click', () => this.close());
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.mp-zoom button')) {
      b.onclick = () => (b.dataset.all !== undefined ? this.fitAll(true) : this.zoomBy(Number(b.dataset.z), this.w / 2, this.h / 2, true));
    }
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.offsetX, e.offsetY, false);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.zoomBy(2, e.offsetX, e.offsetY, true));
    this.onKey = this.onKey.bind(this);
    this.onResize = this.onResize.bind(this);
    this.showPanel();
  }

  open(): void {
    document.body.appendChild(this.root);
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  close(): void {
    if (!this.root.parentNode) return;
    this.root.remove();
    document.documentElement.style.overflow = '';
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    if (location.hash === '#maps') history.replaceState(null, '', location.pathname + location.search);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.close();
    else if (e.key === '+' || e.key === '=') this.zoomBy(1.6, this.w / 2, this.h / 2, true);
    else if (e.key === '-') this.zoomBy(0.625, this.w / 2, this.h / 2, true);
  }

  private onResize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.root.clientWidth;
    this.h = this.root.clientHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.draw();
  }

  // --- the view ---

  toScreen(lon: number, lat: number): Pt {
    return [(lon - this.cx) * this.scale + this.w / 2, (mercY(lat) - this.cy) * this.scale + this.h / 2];
  }

  private fromScreen(x: number, y: number): Pt {
    return [this.cx + (x - this.w / 2) / this.scale, this.cy + (y - this.h / 2) / this.scale];
  }

  /** The view that fits a lon/lat box, with room round it for the panel and the bar. */
  private viewFor(b: [number, number, number, number], margin = 0.18): [number, number, number] {
    const w = this.w || window.innerWidth;
    const h = this.h || window.innerHeight;
    const x0 = b[0];
    const x1 = b[2];
    const y0 = mercY(b[3]);
    const y1 = mercY(b[1]);
    const s = Math.min((w * (1 - 2 * margin)) / (x1 - x0), (h * (1 - 2 * margin)) / (y1 - y0));
    return [(x0 + x1) / 2, (y0 + y1) / 2, clamp(s, MIN_SCALE, MAX_SCALE)];
  }

  private fitAll(fly: boolean): void {
    const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const m of this.data.maps) {
      b[0] = Math.min(b[0], m.bbox[0]);
      b[1] = Math.min(b[1], m.bbox[1]);
      b[2] = Math.max(b[2], m.bbox[2]);
      b[3] = Math.max(b[3], m.bbox[3]);
    }
    this.go(this.viewFor(b, 0.12), fly);
  }

  private go(to: [number, number, number], fly: boolean): void {
    if (!fly) {
      [this.cx, this.cy, this.scale] = to;
      this.flight = null;
      this.draw();
      return;
    }
    this.flight = { from: [this.cx, this.cy, this.scale], to, t0: performance.now(), ms: 700 };
    this.tick();
  }

  private tick(): void {
    cancelAnimationFrame(this.raf);
    const f = this.flight;
    if (!f) return;
    const t = Math.min(1, (performance.now() - f.t0) / f.ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    // Zoom on a log scale, and pan in screen terms, so the flight doesn't swoop.
    const s = Math.exp(lerp(Math.log(f.from[2]), Math.log(f.to[2]), e));
    const k = f.from[2] === f.to[2] ? e : (1 / s - 1 / f.from[2]) / (1 / f.to[2] - 1 / f.from[2]);
    this.cx = lerp(f.from[0], f.to[0], clamp(k, 0, 1));
    this.cy = lerp(f.from[1], f.to[1], clamp(k, 0, 1));
    this.scale = s;
    this.draw();
    if (t < 1) this.raf = requestAnimationFrame(() => this.tick());
    else this.flight = null;
  }

  private zoomBy(k: number, x: number, y: number, fly: boolean): void {
    const s = clamp(this.scale * k, MIN_SCALE, MAX_SCALE);
    const [px, py] = this.fromScreen(x, y);
    // Keep the point under the cursor where it is.
    const to: [number, number, number] = [px - (x - this.w / 2) / s, py - (y - this.h / 2) / s, s];
    this.go(to, fly);
  }

  // --- pointing ---

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    this.dragged = 0;
    this.flight = null;
    this.canvas.classList.add('mp-drag');
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      const h = this.hit(e.offsetX, e.offsetY);
      if (h !== this.hover) {
        this.hover = h;
        this.canvas.classList.toggle('mp-point', !!h);
        this.draw();
      }
      return;
    }
    const dx = e.offsetX - p.x;
    const dy = e.offsetY - p.y;
    if (this.pointers.size === 2) {
      // Pinch: zoom by the change in the two fingers' spread, about their middle.
      const [a, b] = [...this.pointers.values()];
      const other = a === p ? b : a;
      const before = Math.hypot(p.x - other.x, p.y - other.y);
      const after = Math.hypot(e.offsetX - other.x, e.offsetY - other.y);
      if (before > 10) this.zoomBy(after / before, (e.offsetX + other.x) / 2, (e.offsetY + other.y) / 2, false);
    } else {
      this.cx -= dx / this.scale;
      this.cy -= dy / this.scale;
      this.draw();
    }
    this.dragged += Math.abs(dx) + Math.abs(dy);
    p.x = e.offsetX;
    p.y = e.offsetY;
  }

  private up(e: PointerEvent): void {
    const was = this.pointers.size;
    this.pointers.delete(e.pointerId);
    this.canvas.classList.remove('mp-drag');
    if (was !== 1 || this.dragged > 6) return;
    const h = this.hit(e.offsetX, e.offsetY);
    if (!h) return;
    if ('coast' in h) this.select(h, null, true);
    else this.select(this.mapOfPort(h), h, false);
  }

  private mapOfPort(p: OverviewPort): OverviewMap {
    return this.data.maps.find((m) => m.ports.includes(p))!;
  }

  /** The harbour or map under a screen point: a harbour first (when they're shown), then a map's box or marker. */
  private hit(x: number, y: number): OverviewMap | OverviewPort | null {
    let best: OverviewPort | null = null;
    let bestD = HIT_PX;
    for (const m of this.data.maps) {
      if (this.boxPx(m) < SHOW_PORTS_PX) continue;
      for (const p of m.ports) {
        if (!p.berth) continue;
        const [sx, sy] = this.toScreen(p.at[0], p.at[1]);
        const d = Math.hypot(sx - x, sy - y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    if (best) return best;
    for (const m of this.data.maps) {
      const [x0, y0] = this.toScreen(m.bbox[0], m.bbox[3]);
      const [x1, y1] = this.toScreen(m.bbox[2], m.bbox[1]);
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      if ((x >= x0 && x <= x1 && y >= y0 && y <= y1) || Math.hypot(mx - x, my - y) < HIT_PX) return m;
    }
    return null;
  }

  private boxPx(m: OverviewMap): number {
    return (m.bbox[2] - m.bbox[0]) * this.scale;
  }

  private select(m: OverviewMap, port: OverviewPort | null, fly: boolean): void {
    this.selected = m;
    this.port = port;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.mp-chips button')) b.classList.toggle('on', b.dataset.id === m.id);
    this.showPanel();
    if (fly) this.go(this.viewFor(m.bbox), true);
    else this.draw();
  }

  private showPanel(): void {
    const m = this.selected;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    if (!m) {
      this.panel.innerHTML = `<h3>Pick a map</h3><p>${this.data.maps.length} stretches of real coast, from the West Highlands to the Aegean. Click one on the chart, or above.</p>`;
      return;
    }
    const start = m.ports.find((p) => p.berth === m.startBerth);
    const sail = `voyage.html?map=${encodeURIComponent(m.id)}`;
    let html = `<h3>${esc(m.name)}</h3><p>${esc(m.blurb)}</p>`;
    if (this.port?.berth) {
      html += `<a class="mp-go" href="${sail}&start&berth=${encodeURIComponent(this.port.berth)}">Start at ${esc(this.port.name)}</a>`;
      html += `<a class="mp-go alt" href="${sail}">Sail the map</a>`;
    } else {
      html += `<a class="mp-go" href="${sail}">Sail the map</a>`;
    }
    html += `<p class="mp-hint">${this.port ? '' : `${m.ports.length} harbours: zoom in and pick one to start there. `}"Sail the map" starts where you were last time${start ? `, or at ${esc(start.name)}` : ''}.</p>`;
    this.panel.innerHTML = html;
  }

  // --- drawing ---

  private draw(): void {
    const c = this.ctx;
    const { w, h, scale } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Round joins: a mitred corner on a sharp turn of the coast draws a spike.
    c.lineJoin = 'round';
    c.fillStyle = LOOK.sea;
    c.fillRect(0, 0, w, h);
    this.drawGrid();
    // Europe, in chart units.
    c.save();
    c.translate(w / 2 - this.cx * scale, h / 2 - this.cy * scale);
    c.scale(scale, scale);
    // Europe's coast is drawn coarse (1:50 million): close in, it fades back behind the maps' own.
    c.globalAlpha = clamp(1.4 - Math.log10(scale) / 3, 0.35, 1);
    c.fillStyle = LOOK.land;
    c.fill(this.landPath, 'evenodd');
    c.lineWidth = 1 / scale;
    c.strokeStyle = LOOK.landEdge;
    c.stroke(this.landPath);
    c.strokeStyle = LOOK.border;
    c.setLineDash([3 / scale, 3 / scale]);
    c.stroke(this.borderPath);
    c.setLineDash([]);
    c.globalAlpha = 1;
    // Each map big enough on screen: its own sea and coast over Europe's.
    for (const m of this.data.maps) {
      if (this.boxPx(m) < SHOW_COAST_PX) continue;
      const [x0, y0, x1, y1] = [m.bbox[0], mercY(m.bbox[3]), m.bbox[2], mercY(m.bbox[1])];
      c.fillStyle = LOOK.mapSea;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      const p = this.coastPaths.get(m.id)!;
      c.fillStyle = LOOK.mapLand;
      c.fill(p, 'evenodd');
      c.lineWidth = 1.2 / scale;
      c.strokeStyle = LOOK.mapShore;
      c.stroke(p);
    }
    c.restore();
    // Boxes, markers and names, in screen pixels.
    const taken: [number, number, number, number][] = [];
    const label = (text: string, x: number, y: number, colour: string, font: string, place: 'right' | 'above' = 'right'): boolean => {
      c.font = font;
      const tw = c.measureText(text).width;
      const lx = place === 'right' ? x + 8 : x - tw / 2;
      const ly = place === 'right' ? y + 4 : y - 10;
      const r: [number, number, number, number] = [lx - 2, ly - 12, lx + tw + 2, ly + 4];
      if (taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
      taken.push(r);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(11, 20, 25, 0.85)';
      c.strokeText(text, lx, ly);
      c.fillStyle = colour;
      c.fillText(text, lx, ly);
      return true;
    };
    // The selected and hovered first, so their names win.
    const order = [...this.data.maps].sort((a, b) => this.rank(b) - this.rank(a));
    for (const m of order) {
      const [x0, y0] = this.toScreen(m.bbox[0], m.bbox[3]);
      const [x1, y1] = this.toScreen(m.bbox[2], m.bbox[1]);
      const on = m === this.selected || m === this.hover;
      if (x1 - x0 >= SHOW_COAST_PX) {
        c.setLineDash(on ? [] : [6, 4]);
        c.lineWidth = on ? 2 : 1.2;
        c.strokeStyle = LOOK.box;
        c.strokeRect(x0, y0, x1 - x0, y1 - y0);
        c.setLineDash([]);
        label(m.name, x0 - 8, y0 - 10, LOOK.box, `600 ${on ? 15 : 13}px system-ui, sans-serif`);
      } else {
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        c.beginPath();
        c.arc(mx, my, on ? 7 : 5.5, 0, Math.PI * 2);
        c.fillStyle = LOOK.box;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(11, 20, 25, 0.9)';
        c.stroke();
        label(shortName(m.name), mx, my, on ? LOOK.box : LOOK.text, `600 ${on ? 14 : 13}px system-ui, sans-serif`);
      }
    }
    // Harbours, on a map opened out far enough: the start berth's and the chosen one first.
    for (const m of order) {
      if (this.boxPx(m) < SHOW_PORTS_PX) continue;
      const ports = [...m.ports].filter((p) => p.berth).sort((a, b) => this.portRank(b, m) - this.portRank(a, m));
      for (const p of ports) {
        const [x, y] = this.toScreen(p.at[0], p.at[1]);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        const chosen = p === this.port;
        const isStart = p.berth === m.startBerth;
        c.beginPath();
        c.arc(x, y, chosen || p === this.hover ? 6 : 4, 0, Math.PI * 2);
        c.fillStyle = isStart ? LOOK.start : LOOK.port;
        c.fill();
        c.lineWidth = chosen ? 3 : 1.5;
        c.strokeStyle = chosen ? '#fff' : 'rgba(11, 20, 25, 0.9)';
        c.stroke();
        label(p.name, x, y, chosen || p === this.hover ? '#fff' : LOOK.dim, `${chosen ? 600 : 400} 12px system-ui, sans-serif`);
      }
    }
  }

  /** Which maps' names win a clash: the chosen one, then the one under the pointer. */
  private rank(m: OverviewMap): number {
    return (m === this.selected ? 2 : 0) + (m === this.hover ? 1 : 0);
  }

  /** Which harbours' names win: the chosen, the pointed at, the map's start, then harbours before piers. */
  private portRank(port: OverviewPort, m: OverviewMap): number {
    return (port === this.port ? 8 : 0) + (port === this.hover ? 4 : 0) + (port.berth === m.startBerth ? 2 : 0) + (port.kind === 'harbour' ? 1 : 0);
  }

  /** Lines of latitude and longitude, a round step for the zoom. */
  private drawGrid(): void {
    const c = this.ctx;
    const steps = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
    const step = steps.find((s) => s * this.scale < 160) ?? 0.01;
    const [lonA, yA] = this.fromScreen(0, 0);
    const [lonB, yB] = this.fromScreen(this.w, this.h);
    const latOf = (y: number) => ((2 * Math.atan(Math.exp((-y * Math.PI) / 180)) - Math.PI / 2) * 180) / Math.PI;
    c.strokeStyle = LOOK.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let lon = Math.ceil(lonA / step) * step; lon <= lonB; lon += step) {
      const [x] = this.toScreen(lon, 0);
      c.moveTo(x, 0);
      c.lineTo(x, this.h);
    }
    for (let lat = Math.ceil(latOf(yB) / step) * step; lat <= latOf(yA); lat += step) {
      const [, y] = this.toScreen(0, lat);
      c.moveTo(0, y);
      c.lineTo(this.w, y);
    }
    c.stroke();
  }
}

/** A map's name for a chip or a marker: without its leading "The". */
function shortName(name: string): string {
  return name.replace(/^The /, '');
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let picker: Promise<MapPicker> | null = null;

/** Open the picker (fetching the overview the first time). */
export function openMapPicker(): void {
  picker ??= fetch(new URL('regions/overview.json', location.href).toString())
    .then((r) => {
      if (!r.ok) throw new Error(`overview.json: ${r.status}`);
      return r.json() as Promise<Overview>;
    })
    .then((d) => {
      const p = new MapPicker(d);
      // For scripted checks in the browser during development (as main.ts's window.app).
      if (import.meta.env.DEV) (window as unknown as { mapPicker: MapPicker }).mapPicker = p;
      return p;
    });
  picker.then((p) => p.open()).catch((e) => {
    picker = null;
    console.warn('map picker:', e);
  });
}

// The front page: its "Choose on the map" buttons open it, and so does the address's #maps.
for (const b of document.querySelectorAll<HTMLElement>('[data-map-picker]')) {
  b.hidden = false;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (location.hash !== '#maps') history.pushState(null, '', '#maps');
    openMapPicker();
  });
}
if (location.hash === '#maps') openMapPicker();
// Back (or forward) through the #maps address shuts (or opens) it.
window.addEventListener('popstate', () => {
  if (location.hash === '#maps') openMapPicker();
  else void picker?.then((p) => p.close());
});
