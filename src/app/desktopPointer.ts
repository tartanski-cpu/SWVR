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
  private released = false;
  private dx = 0;
  private dy = 0;
  private readonly reticle = document.createElement('div');
  private readonly ray = new THREE.Ray();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly desktop: DesktopController,
    private readonly interaction: InteractionSystem,
    /** The menu, when open, takes the reticle before the bridge controls. */
    private readonly menu: WristMenu,
  ) {
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
    const ctlRay = onMenu ? null : ray;
    this.desktop.lookFrozen = this.interaction.updateDesktop(ctlRay, this.down, this.pressed && !onMenu, this.released, this.dx, this.dy);
    const label = onMenu ? null : this.interaction.desktopHoverLabel;
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
