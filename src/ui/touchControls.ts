import { CONFIG } from '../config';

/**
 * Touchscreen controls for a phone or tablet: a first step toward the touch version of the
 * game (owner request), on top of this app rather than a separate one, so it drives the
 * same boats through the same intents as the keyboard and the bridge controls. Plain HTML
 * over the canvas:
 *
 *   - a throttle slider on the left (ahead up, astern down, a neutral detent in the middle);
 *   - a helm slider along the bottom right (port / starboard; it stays where you leave it,
 *     as a wheel does; MID puts it amidships);
 *   - buttons: board at the helm / go ashore, start / stop the engine in one press, cast off /
 *     moor (alongside a berth), the menu, and start again in the other boat (for testing);
 *   - speed and rpm;
 *   - a finger dragged anywhere else turns your view.
 *
 * Shown on a touchscreen without a mouse, or with ?touch=1 (?touch=0 hides it); hidden in
 * VR. Your own boat only: no multiplayer from a phone yet (owner).
 */
export interface TouchHost {
  /** Are you aboard a boat? */
  aboard(): boolean;
  /** Board her at the helm, or go ashore. */
  toggleBoard(): void;
  /** Start her in one press (or stop her). */
  engine(): void;
  /** Is her engine (or motor) running? */
  running(): boolean;
  menu(): void;
  /** 'Cast off' while her lines are ashore, 'Moor here' alongside a berth, else null. */
  dockLabel(): string | null;
  /** Cast off, or put her lines ashore. */
  dock(): void;
  /** The other boat you can start in (her name), and starting the game again in her. */
  otherBoat(): string | null;
  switchBoat(): void;
  /** Set the lever (-1 astern .. 1 ahead) and the helm (-1 port .. 1 starboard); null leaves one as it is. */
  drive(lever: number | null, helm: number | null): void;
  /** Where her lever and helm are now, and her speed (kn) and rpm. */
  reading(): { lever: number; helm: number; knots: number; rpm: number | null };
  /** Turn the view by a drag of (dx, dy) pixels. */
  look(dx: number, dy: number): void;
}

/** Should the touch controls show? */
export function wantsTouchControls(): boolean {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

const STYLE = `
.tc { position: fixed; inset: 0; pointer-events: none; font: 600 14px system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; z-index: 20; }
.tc * { touch-action: none; }
.tc-btn { pointer-events: auto; background: rgba(20, 28, 36, 0.72); border: 2px solid rgba(255, 255, 255, 0.55); border-radius: 12px; color: #fff; font: inherit; padding: 12px 16px; min-width: 96px; }
.tc-btn:active { background: rgba(60, 110, 70, 0.85); }
.tc-buttons { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 10px; }
.tc-read { position: absolute; top: 14px; left: 14px; background: rgba(20, 28, 36, 0.6); border-radius: 8px; padding: 6px 10px; }
.tc-track { pointer-events: auto; position: absolute; background: rgba(20, 28, 36, 0.55); border: 2px solid rgba(255, 255, 255, 0.45); border-radius: 16px; }
.tc-throttle { left: 16px; bottom: 16px; width: 72px; height: min(52vh, 320px); }
.tc-helm { right: 16px; bottom: 16px; height: 72px; width: min(380px, max(50vw, calc(100vw - 120px))); }
.tc-knob { position: absolute; background: #e8e4d8; border-radius: 10px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
.tc-throttle .tc-knob { left: 6px; right: 6px; height: 40px; }
.tc-helm .tc-knob { top: 6px; bottom: 6px; width: 40px; }
.tc-mark { position: absolute; font-size: 11px; opacity: 0.85; }
.tc-mid { position: absolute; right: 16px; bottom: 100px; min-width: 64px; padding: 8px 10px; }
`;

export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly read = document.createElement('div');
  private readonly boardBtn: HTMLButtonElement;
  private readonly engineBtn: HTMLButtonElement;
  private readonly dockBtn: HTMLButtonElement;
  private readonly throttleKnob = document.createElement('div');
  private readonly helmKnob = document.createElement('div');
  private readonly throttle = document.createElement('div');
  private readonly helm = document.createElement('div');
  /** The slider a finger is on (it shows the finger's value, not the boat's, till let go). */
  private holding: 'throttle' | 'helm' | null = null;
  private held = 0;
  private lastText = '';
  private shown = true;
  private vrButtonChecked = false;

  constructor(
    private readonly host: TouchHost,
    canvas: HTMLCanvasElement,
  ) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    this.root.className = 'tc';
    this.read.className = 'tc-read';

    const buttons = document.createElement('div');
    buttons.className = 'tc-buttons';
    this.boardBtn = this.button('Board', () => host.toggleBoard());
    this.engineBtn = this.button('Start engine', () => host.engine());
    this.dockBtn = this.button('Cast off', () => host.dock());
    const other = host.otherBoat();
    buttons.append(this.boardBtn, this.engineBtn, this.dockBtn, this.button('Menu', () => host.menu()));
    if (other) buttons.append(this.button(`Switch to ${other}`, () => host.switchBoat()));

    // Throttle: up is ahead.
    this.throttle.className = 'tc-track tc-throttle';
    this.throttleKnob.className = 'tc-knob';
    this.throttle.append(this.mark('AHEAD', 'top: 4px; left: 0; right: 0; text-align: center'), this.mark('N', 'top: calc(50% - 7px); left: 4px'), this.mark('ASTERN', 'bottom: 4px; left: 0; right: 0; text-align: center'), this.throttleKnob);
    this.slider(this.throttle, 'throttle', (_x, y) => {
      const v = 1 - 2 * y;
      return Math.abs(v) < CONFIG.touch.leverDetent ? 0 : Math.max(-1, Math.min(1, v));
    });

    // Helm: right is starboard.
    this.helm.className = 'tc-track tc-helm';
    this.helmKnob.className = 'tc-knob';
    this.helm.append(this.mark('PORT', 'left: 8px; top: calc(50% - 7px)'), this.mark('STBD', 'right: 8px; top: calc(50% - 7px)'), this.helmKnob);
    this.slider(this.helm, 'helm', (x) => Math.max(-1, Math.min(1, 2 * x - 1)));
    const mid = this.button('MID', () => host.drive(null, 0));
    mid.classList.add('tc-mid');

    this.root.append(this.read, buttons, this.throttle, this.helm, mid);
    document.body.appendChild(this.root);

    // One finger dragged anywhere but on these controls turns the view, from the first touch:
    // no tap first. The page never scrolls or zooms under it (else the browser takes the
    // drag for itself and cancels it), and whatever lies over the scene (a notice, the
    // reticle) doesn't stop it: listened for on the whole page, not just the canvas.
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    canvas.style.touchAction = 'none';
    let finger: { id: number; x: number; y: number } | null = null;
    const onControls = (e: Event) => e.target instanceof Element && !!e.target.closest('.tc-btn, .tc-track');
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || finger || onControls(e)) return;
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    document.addEventListener('pointermove', (e) => {
      if (!finger || e.pointerId !== finger.id) return;
      host.look(e.clientX - finger.x, e.clientY - finger.y);
      finger.x = e.clientX;
      finger.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (finger && e.pointerId === finger.id) finger = null;
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  /** Refresh what they show (call every frame); hidden in VR. */
  update(inXR: boolean): void {
    const show = !inXR;
    if (show !== this.shown) {
      this.shown = show;
      this.root.style.display = show ? '' : 'none';
    }
    if (!show) return;
    // three.js's VR button says "VR NOT SUPPORTED" on a phone, under the helm slider: hide it there.
    if (!this.vrButtonChecked) {
      const vr = document.getElementById('VRButton');
      if (vr && /not supported/i.test(vr.textContent ?? '')) {
        vr.style.display = 'none';
        this.vrButtonChecked = true;
      }
    }
    const r = this.host.reading();
    const lever = this.holding === 'throttle' ? this.held : r.lever;
    const helm = this.holding === 'helm' ? this.held : r.helm;
    // The knobs (40 px) ride their tracks: the throttle's top (ahead) to bottom (astern), the
    // helm's left (port) to right (starboard).
    const ft = (1 - lever) / 2;
    const fh = (1 + helm) / 2;
    this.throttleKnob.style.top = `calc(${(ft * 100).toFixed(1)}% - ${(ft * 40).toFixed(1)}px)`;
    this.helmKnob.style.left = `calc(${(fh * 100).toFixed(1)}% - ${(fh * 40).toFixed(1)}px)`;
    const text = `${r.knots.toFixed(1)} kn${r.rpm === null ? '' : ` · ${Math.round(r.rpm / 10) * 10} rpm`}`;
    if (text !== this.lastText) this.read.textContent = this.lastText = text;
    const aboard = this.host.aboard();
    this.boardBtn.textContent = aboard ? 'Go ashore' : 'Board';
    this.engineBtn.textContent = this.host.running() ? 'Stop engine' : 'Start engine';
    this.engineBtn.style.display = aboard ? '' : 'none';
    const dock = aboard ? this.host.dockLabel() : null;
    if (dock) this.dockBtn.textContent = dock;
    this.dockBtn.style.display = dock ? '' : 'none';
  }

  private button(text: string, press: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'tc-btn';
    b.textContent = text;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      press();
    });
    return b;
  }

  private mark(text: string, css: string): HTMLDivElement {
    const m = document.createElement('div');
    m.className = 'tc-mark';
    m.textContent = text;
    m.style.cssText = css;
    return m;
  }

  /** A slider: the value under the finger (from its fraction across x, down y), sent as it moves. */
  private slider(el: HTMLElement, which: 'throttle' | 'helm', value: (x: number, y: number) => number): void {
    const at = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      const v = value((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
      if (this.holding === which && v === this.held) return;
      this.held = v;
      this.holding = which;
      this.host.drive(which === 'throttle' ? v : null, which === 'helm' ? v : null);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      at(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) at(e);
    });
    const done = (e: PointerEvent) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (this.holding === which) this.holding = null;
    };
    el.addEventListener('pointerup', done);
    el.addEventListener('pointercancel', done);
  }
}
