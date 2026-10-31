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
  private rightDown = false;
  private middleDown = false;
  /** The middle button is held: the laser pointer. */
  laserDown = false;
  /** The right button is held for the binoculars (not taken by the chart eraser). */
  binocularsDown = false;
  /**
   * The right button is held while a control is held (the wheel, a lever): the view is
   * free to look round and the mouse leaves the control where it is (owner: desktop
   * players couldn't look up from the wheel). Kept until the right button is let go, so
   * letting go of the wheel first doesn't snap into the binoculars.
   */
  freeLook = false;
  private shift = false;
  /** Holding hand gear (extinguisher, torch; set by the App): the left button works it. */
  gearHeld: (() => boolean) | null = null;
  /** Left button held for the gear (pressed off any control): spray. */
  gearDown = false;
  /** Left button pressed for the gear this frame: switch the torch. */
  gearPressed = false;
  private gearActive = false;
  /**
   * The chart table's pencil (set by the App): drag on the chart to draw, right-drag to
   * erase. Called before everything else; while it uses the buttons, nothing else sees
   * them (no laser, no control press).
   */
  chart: ((ray: THREE.Ray | null, b: { down: boolean; right: boolean; shift: boolean; wheel: number }) => { label: string | null; consumed: boolean }) | null = null;
  /** Looking through the binoculars (set by the App): a left click takes a bearing and does nothing else. */
  binoculars: (() => boolean) | null = null;
  /** A left click while looking through the binoculars, this frame. */
  bearingClick = false;
  /** The mouse wheel's notches since the last frame (+ toward you), for a planning chart's zoom. */
  private wheel = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly desktop: DesktopController,
    private readonly interaction: InteractionSystem,
    /** The menu, when open, takes the reticle before the bridge controls. */
    private readonly menu: WristMenu,
    /** Cargo: picked up and set down with a click when the reticle isn't on a control. */
    private readonly cargo?: { carrying(): boolean; label(ray: THREE.Ray | null): string | null; click(ray: THREE.Ray | null): boolean },
  ) {
    // No context menu on a right click: it would release the mouse and stall the view.
    // (Some browsers send it to the document while the pointer is captured.)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement === canvas) e.preventDefault();
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 2) this.rightDown = true;
      // Holding the wheel or a lever: the view is free from this moment (see freeLook), the
      // moves until the next frame not turning the control.
      if (e.button === 2 && this.interaction.desktopDragging && !this.binocularsDown) {
        this.freeLook = true;
        this.desktop.lookFrozen = false;
        this.dx = this.dy = 0;
      }
      if (e.button === 1) {
        this.middleDown = true;
        e.preventDefault(); // no auto-scroll
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
      // ...and back on the control at once when it's let go.
      if (e.button === 2 && this.freeLook) {
        this.freeLook = false;
        if (this.interaction.desktopDragging) this.desktop.lookFrozen = true;
      }
      if (e.button === 1) this.middleDown = false;
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
    document.addEventListener('wheel', (e) => {
      if (document.pointerLockElement === canvas) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.down || this.freeLook) return;
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
  /** A game controller is in use: it aims by the reticle without the mouse captured. */
  padAim = false;

  /** A game controller's trigger or bumper as a mouse button (0 left, 1 middle, 2 right). */
  padButton(button: 0 | 1 | 2, down: boolean): void {
    if (button === 0) {
      if (down && !this.down) {
        this.down = true;
        this.pressed = true;
      } else if (!down && this.down) {
        this.down = false;
        this.released = true;
      }
    } else if (button === 2) this.rightDown = down;
    else this.middleDown = down;
  }

  update(camera: THREE.Camera): void {
    const locked = this.desktop.pointerLocked || this.padAim;
    this.gearPressed = false;
    let ray: THREE.Ray | null = null;
    if (locked) {
      camera.getWorldPosition(this.ray.origin);
      camera.getWorldDirection(this.ray.direction);
      ray = this.ray;
    }
    this.bearingClick = locked && this.pressed && !!this.binoculars?.();
    if (this.bearingClick) this.pressed = false;
    const onMenu = this.menu.updateDesktop(ray, this.pressed);
    const chart = !onMenu && this.chart && !this.cargo?.carrying() ? this.chart(locked ? ray : null, { down: this.down && locked, right: this.rightDown && locked, shift: this.shift, wheel: locked ? this.wheel : 0 }) : null;
    if (chart?.consumed) {
      // The pencil or eraser has the buttons.
      this.pressed = false;
    }
    // Right button held, not erasing on the chart: the binoculars (owner request), or,
    // holding the wheel or a lever, free look (see freeLook); the middle button: the laser pointer.
    const right = locked && this.rightDown && !chart?.consumed;
    if (!right) this.freeLook = false;
    else if (this.interaction.desktopDragging && !this.binocularsDown) this.freeLook = true;
    this.binocularsDown = right && !this.freeLook;
    this.laserDown = locked && this.middleDown;
    // While carrying, a click sets the item down, whatever the reticle is on.
    const carrying = !onMenu && !!this.cargo?.carrying();
    const ctlRay = onMenu || carrying ? null : ray;
    // Looking round, the mouse turns the view, not the control (it stays held where it is).
    const [dx, dy] = this.freeLook ? [0, 0] : [this.dx, this.dy];
    this.desktop.lookFrozen = this.interaction.updateDesktop(ctlRay, this.down, this.pressed && !onMenu && !carrying, this.released, dx, dy) && !this.freeLook;
    let label = onMenu ? null : (chart?.consumed ? chart.label : this.interaction.desktopHoverLabel);
    if (label && this.interaction.desktopDragging) label += this.freeLook ? '\nlooking round: let go of the right button to steer' : '\nhold the right button to look round';
    // Holding gear: a press off any control is for the gear (not the cargo).
    const gear = !onMenu && locked && !carrying && !!this.gearHeld?.();
    if (gear && this.pressed && !this.interaction.pressConsumed) this.gearActive = this.gearPressed = true;
    if (!this.down || !gear) this.gearActive = false;
    this.gearDown = this.gearActive;
    if (!onMenu && !label && this.cargo && !gear) {
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
    this.wheel = 0;
    this.pressed = false;
    this.released = false;
    this.dx = 0;
    this.dy = 0;
  }
}
