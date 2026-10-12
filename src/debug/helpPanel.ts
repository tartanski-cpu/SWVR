import { KEYS, type KeyAction } from '../core/keybindings';

/**
 * On-screen desktop help, generated from keybindings.ts so it can never drift from the
 * real bindings. Key names are shown as printed on the user's own keyboard where the
 * browser exposes the layout (Chrome/Edge: navigator.keyboard.getLayoutMap()); other
 * browsers fall back to US-layout names.
 */
type LayoutMap = Map<string, string>;

const ROWS: (KeyAction | KeyAction[])[] = [
  ['forward', 'left', 'back', 'right'],
  ['up', 'down'],
  'fast',
  ['timeEarlier', 'timeLater'],
  'toggleOverlay',
  'toggleHelp',
];

const ROW_TEXT: Partial<Record<KeyAction, string>> = {
  forward: 'Move',
  up: 'Up / down (free-fly)',
  timeEarlier: 'Time of day − / + 30 min',
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
        const extra = row[0] === 'forward' ? ' or arrow keys' : '';
        return `<tr><td>${keys}${extra}</td><td>${ROW_TEXT[row[0]] ?? KEYS[row[0]].description}</td></tr>`;
      }
      return `<tr><td>${this.keys(row)}</td><td>${KEYS[row].description}</td></tr>`;
    }).join('');

    this.el.innerHTML = `
      <div class="title">Desktop controls</div>
      <div class="hint">Click the 3D view to steer the camera with the mouse · <kbd>Esc</kbd> releases it</div>
      <table>${rows}</table>
      <div class="title">VR</div>
      <div class="hint">Press <b>Enter VR</b> · <b>B</b> / <b>Y</b> on a controller toggles the debug panel</div>`;
  }
}
