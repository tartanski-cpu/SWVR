import { formatHydrostatics } from '../vessel/hydrostatics';
import { formatSeaTrials, runSeaTrials } from '../vessel/seaTrials';
import { VESSEL_DEFS } from '../vessel/vesselDef';

/** Desktop panel (T) with the hydrostatics + sea trials report for a vessel type. */
export class TrialsPanel {
  private readonly el = document.createElement('pre');

  constructor() {
    Object.assign(this.el.style, {
      position: 'fixed',
      right: '8px',
      top: '8px',
      margin: '0',
      font: '12px/1.4 ui-monospace, Menlo, Consolas, monospace',
      color: '#ffe9b0',
      background: 'rgba(0,0,0,0.7)',
      padding: '8px 10px',
      borderRadius: '4px',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  toggle(defId: string): void {
    if (this.el.style.display === 'block') {
      this.el.style.display = 'none';
      return;
    }
    this.el.textContent = 'Running hydrostatics and sea trials (calm water)...';
    this.el.style.display = 'block';
    // Let the message paint before the (~1 s) synchronous run.
    setTimeout(() => {
      const t0 = performance.now();
      const report = `${formatHydrostatics(VESSEL_DEFS[defId])}\n\n${formatSeaTrials(runSeaTrials(defId))}`;
      console.log(report);
      this.el.textContent = `${report}\n\n(${((performance.now() - t0) / 1000).toFixed(1)} s to simulate · T to close)`;
    }, 30);
  }
}
