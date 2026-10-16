import { KEYS, type KeyAction } from '../core/keybindings';

/**
 * On-screen desktop help, generated from keybindings.ts so it can never drift from the
 * real bindings. Key names are shown as printed on the user's own keyboard where the
 * browser exposes the layout (Chrome/Edge: navigator.keyboard.getLayoutMap()); other
 * browsers fall back to US-layout names.
 */
type LayoutMap = Map<string, string>;

// Playing keys only (owner request after V1.0): what the menu already does (time of day,
// weather, motion coupling, sea trials, the drop/heel tests, debug views) is left out here.
// Those keys still work; they're listed in keybindings.ts.
const ROWS: (KeyAction | KeyAction[])[] = [
  'menu',
  ['forward', 'left', 'back', 'right'],
  'fast',
  'crouch',
  'jump',
  'board',
  'lash',
  'binoculars',
  'engine',
  ['leverAhead', 'leverAstern'],
  ['helmPort', 'helmStarboard'],
  ['leverNeutral', 'helmMidships'],
  'flyMode',
  ['up', 'down'],
  'toggleOverlay',
  'toggleHelp',
];

const ROW_TEXT: Partial<Record<KeyAction, string>> = {
  forward: 'Move',
  up: 'Up / down (free-fly)',
  leverAhead: 'Throttle lever ahead / astern',
  helmPort: 'Wheel to port / starboard',
  leverNeutral: 'Lever neutral / wheel amidships',
};

const SPECIAL: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export class HelpPanel {
  private readonly el: HTMLDivElement;
  private layout: LayoutMap | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'help';
    // Hidden until asked for (owner request after V1.0): H or F1 shows it.
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.render();

    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
    kb?.getLayoutMap?.()
      .then((map) => {
        this.layout = map;
        this.render();
      })
      .catch(() => {});
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  /** Label printed on the user's keycap for a physical key code. */
  private label(code: string): string {
    if (SPECIAL[code]) return SPECIAL[code];
    const fromLayout = this.layout?.get(code);
    if (fromLayout) return fromLayout.toUpperCase();
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code; // F1, F3, ...
  }

  private keys(action: KeyAction): string {
    // Show the primary key of each action; extra alternates only for single actions.
    return [...new Set(KEYS[action].codes.map((c) => this.label(c)))].map((k) => `<kbd>${k}</kbd>`).join(' ');
  }

  private render(): void {
    const rows = ROWS.map((row) => {
      if (Array.isArray(row)) {
        const keys = row.map((a) => `<kbd>${this.label(KEYS[a].codes[0])}</kbd>`).join(' ');
        const extra = '';
        return `<tr><td>${keys}${extra}</td><td>${ROW_TEXT[row[0]] ?? KEYS[row[0]].description}</td></tr>`;
      }
      return `<tr><td>${this.keys(row)}</td><td>${KEYS[row].description}</td></tr>`;
    }).join('');

    this.el.innerHTML = `
      <div class="title">Desktop controls</div>
      <div class="hint">Click the 3D view to steer the camera with the mouse · <kbd>Esc</kbd> releases it</div>
      <table>${rows}</table>
      <div class="hint">On the bridge: aim the <b>+</b> at a control · click buttons/switches · click-and-drag the lever (↕) and wheel (↔)</div>
      <div class="title">VR</div>
      <div class="hint">Press <b>Enter VR</b> · <b>Y</b>: menu on your left wrist (poke or point + trigger with the right hand) · <b>B</b>: debug panel<br>
      <b>Grip</b> a lever or the wheel to move it · <b>trigger</b> on buttons and switches (touch them, or point from a distance)<br>
      Grip on empty air + pull: move (two grips: turn) · Left stick: walk · Right stick ←/→: snap turn<br>
      Left stick click: board / leave</div>`;
  }
}
