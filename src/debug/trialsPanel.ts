import * as THREE from 'three';
import { formatHydrostatics } from '../vessel/hydrostatics';
import { formatSeaTrials, runSeaTrials } from '../vessel/seaTrials';
import { VESSEL_DEFS } from '../vessel/vesselDef';

/**
 * The hydrostatics + sea trials report for a vessel type: a DOM panel on desktop (T), or
 * a large text panel floating in front of you in VR (menu > Sea trials).
 * Running the trials takes about a second, during which the frame freezes.
 */
export class TrialsPanel {
  /** VR text panel; the App places it (in front of the player) when it's shown. */
  readonly vrMesh: THREE.Mesh;
  private readonly el = document.createElement('pre');
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private shownDom = false;

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

    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.vrMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, fog: false }),
    );
    this.vrMesh.name = 'seaTrialsReport';
    this.vrMesh.visible = false;
  }

  get shown(): boolean {
    return this.shownDom || this.vrMesh.visible;
  }

  /** Desktop: show/hide the DOM panel. */
  toggle(defId: string): void {
    if (this.shownDom) {
      this.hide();
      return;
    }
    this.shownDom = true;
    this.el.textContent = 'Running hydrostatics and sea trials (calm water)...';
    this.el.style.display = 'block';
    // Let the message paint before the (~1 s) synchronous run.
    setTimeout(() => {
      if (!this.shownDom) return;
      this.el.textContent = this.report(defId);
    }, 30);
  }

  /** VR: run the trials and draw the report onto `vrMesh` (the caller positions it). */
  showVR(defId: string): void {
    this.drawVR(this.report(defId));
    this.vrMesh.visible = true;
  }

  hide(): void {
    this.shownDom = false;
    this.el.style.display = 'none';
    this.vrMesh.visible = false;
  }

  private report(defId: string): string {
    const t0 = performance.now();
    const report = `${formatHydrostatics(VESSEL_DEFS[defId])}\n\n${formatSeaTrials(runSeaTrials(defId))}`;
    console.log(report);
    return `${report}\n\n(${((performance.now() - t0) / 1000).toFixed(1)} s to simulate)`;
  }

  /** Monospace text, sized so the longest line fits; panel 1.1 m wide at the given aspect. */
  private drawVR(text: string): void {
    const lines = text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 20);
    const W = 1600;
    const charW = (W - 60) / longest;
    const fontPx = Math.min(30, Math.floor(charW / 0.6));
    const lineH = Math.round(fontPx * 1.3);
    const H = lines.length * lineH + 60;
    this.canvas.width = W;
    this.canvas.height = H;
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = 'rgba(8, 12, 14, 0.9)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe9b0';
    g.font = `${fontPx}px ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, 30, 30 + i * lineH));
    // A resized canvas needs a fresh GPU texture.
    this.texture.dispose();
    this.texture.needsUpdate = true;
    const widthM = 1.1;
    this.vrMesh.scale.set(widthM, (widthM * H) / W, 1);
  }
}
