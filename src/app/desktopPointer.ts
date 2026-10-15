import * as THREE from 'three';
import type { InteractionSystem } from '../controls/InteractionSystem';
import type { DesktopController } from '../player/desktopController';
import type { WristMenu } from '../ui/wristMenu';

/**
 * Desktop mouse for the bridge controls: with the pointer captured, a centre reticle
 * aims, click presses, click-and-drag moves levers and the wheel. Shows the hovered
 * control's name under the "+".
 */
export class DesktopPointer {
  private down = false;
  private pressed = false;
  private pingPressed = false;
  private released = false;
  private dx = 0;
  private dy = 0;
  private readonly reticle = document.createElement('div');
  private readonly ray = new THREE.Ray();
  private rightDown = false;
  private shift = false;
  /**
   * The chart table's pencil (set by the App): drag on the chart to draw, right-drag to
   * erase. Called before everything else; while it uses the buttons, nothing else sees
   * them (no ping, no control press).
   */
  chart: ((ray: THREE.Ray | null, b: { down: boolean; right: boolean; shift: boolean }) => { label: string | null; consumed: boolean }) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly desktop: DesktopController,
    private readonly interaction: InteractionSystem,
    /** The menu, when open, takes the reticle before the bridge controls. */
    private readonly menu: WristMenu,
    /** Cargo: picked up and set down with a click when the reticle isn't on a control. */
    private readonly cargo?: { carrying(): boolean; label(ray: THREE.Ray | null): string | null; click(ray: THREE.Ray | null): boolean },
    /** Right mouse button: drop a ping where the reticle points. */
    private readonly onPing?: (ray: THREE.Ray) => void,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === canvas && e.button === 2) {
        this.pingPressed = true;
        this.rightDown = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
    });
    const shift = (e: KeyboardEvent) => (this.shift = e.shiftKey);
    document.addEventListener('keydown', shift);
    document.addEventListener('keyup', shift);
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas || e.button !== 0) return;
      this.down = true;
      this.pressed = true;
      // Freeze mouse-look immediately if the reticle is on a control: movement events
      // arrive before the next frame processes the press and would swing the aim off it.
      if (this.interaction.desktopHoverLabel) this.desktop.lookFrozen = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.down) return;
      this.down = false;
      this.released = true;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.down) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });

    Object.assign(this.reticle.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      font: '600 13px system-ui, sans-serif',
      color: '#fff',
      textShadow: '0 0 3px #000',
      pointerEvents: 'none',
      textAlign: 'center',
      whiteSpace: 'pre',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.reticle);
  }

  /** Aim from the camera centre and feed this frame's mouse events to the controls. */
  update(camera: THREE.Camera): void {
    const locked = this.desktop.pointerLocked;
    let ray: THREE.Ray | null = null;
    if (locked) {
      camera.getWorldPosition(this.ray.origin);
      camera.getWorldDirection(this.ray.direction);
      ray = this.ray;
    }
    const onMenu = this.menu.updateDesktop(ray, this.pressed);
    const chart = !onMenu && this.chart && !this.cargo?.carrying() ? this.chart(locked ? ray : null, { down: this.down && locked, right: this.rightDown && locked, shift: this.shift }) : null;
    if (chart?.consumed) {
      // The pencil or eraser has the buttons.
      this.pressed = false;
      this.pingPressed = false;
    }
    if (this.pingPressed && ray) this.onPing?.(ray);
    this.pingPressed = false;
    // While carrying, a click sets the item down, whatever the reticle is on.
    const carrying = !onMenu && !!this.cargo?.carrying();
    const ctlRay = onMenu || carrying ? null : ray;
    this.desktop.lookFrozen = this.interaction.updateDesktop(ctlRay, this.down, this.pressed && !onMenu && !carrying, this.released, this.dx, this.dy);
    let label = onMenu ? null : (chart?.consumed ? chart.label : this.interaction.desktopHoverLabel);
    if (!onMenu && !label && this.cargo) {
      if (this.pressed && locked && !this.interaction.pressConsumed) this.cargo.click(ray);
      label = this.cargo.label(ray);
    }
    if (!label && chart?.label) label = chart.label;
    this.reticle.style.display = locked ? 'block' : 'none';
    this.reticle.textContent = label ? `+\n${label}` : '+';
    this.endFrame();
  }

  hide(): void {
    this.reticle.style.display = 'none';
    this.endFrame();
  }

  private endFrame(): void {
    this.pressed = false;
    this.released = false;
    this.dx = 0;
    this.dy = 0;
  }
}
