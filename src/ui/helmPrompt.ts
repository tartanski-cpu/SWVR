/**
 * Desktop: the line at the bottom of the screen by the wheel, "F: take the helm", and the
 * controls while you're at it (app/App.ts). A small DOM pill; redrawn only when its text
 * changes, hidden when there's nothing to say (and by the recording camera's clean screen).
 */
export class HelmPrompt {
  private readonly el = document.createElement('div');
  private text = '';

  constructor() {
    const s = this.el.style;
    s.position = 'fixed';
    s.left = '50%';
    s.bottom = '72px';
    s.transform = 'translateX(-50%)';
    s.padding = '6px 14px';
    s.borderRadius = '14px';
    s.background = 'rgba(14, 22, 26, 0.72)';
    s.color = '#f2f5f5';
    s.font = '600 14px system-ui, sans-serif';
    s.pointerEvents = 'none';
    s.whiteSpace = 'pre';
    s.textAlign = 'center';
    s.display = 'none';
    document.body.appendChild(this.el);
  }

  show(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.el.textContent = text;
    this.el.style.display = text ? 'block' : 'none';
  }
}
