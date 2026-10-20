import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import { MenuPanel, type MenuButton } from './menuPanel';
import type { MainMenu } from './mainMenu';
import { placeInFront } from './placeInFront';

/**
 * The in-game menu: a MenuPanel worn on the left wrist in VR (Y opens and closes it), or
 * floating in front of you on desktop (O) and in VR when the left controller isn't tracked.
 *
 * Operated with the RIGHT controller, two ways:
 *   poke    - touch a button with the controller tip (a press fires as the tip reaches the
 *             panel surface; pull back before the next press, like a real touchscreen);
 *   point   - aim the pointer ray and pull the trigger.
 * Desktop: aim the + reticle and click.
 *
 * While the right hand is on or pointing at the menu, its trigger belongs to the menu, so
 * a bridge button behind the panel can't be pressed through it.
 */
export class WristMenu {
  readonly root = new THREE.Group();
  readonly panel: MenuPanel;
  readonly rayLine: THREE.Line;
  private pokeLatched = false;
  /** Fingertip depth in front of the panel last frame (null = not over the panel). */
  private lastDepth: number | null = null;
  private hover: MenuButton | null = null;
  /** The flat desktop menu (owner): the panel's canvas as a page element, centred, mouse-driven. */
  private flat: HTMLDivElement | null = null;
  private flatOpen = false;

  /**
   * @param widthM the panel's width (m): the wrist menu's by default; a board in the world, wider.
   * @param reach  how far a pointer reaches it (m; VR ray, desktop reticle): a board on a wall, further.
   */
  constructor(
    menu: MainMenu,
    widthM: number = CONFIG.menu.width,
    private readonly reach: { ray: number; desktop: number } = { ray: CONFIG.menu.rayLength, desktop: CONFIG.interaction.desktopReach },
  ) {
    this.panel = new MenuPanel(menu.header, menu.pages, widthM);
    this.root.name = 'menu';
    this.root.add(this.panel.mesh);
    this.root.visible = false;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.rayLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 }));
    this.rayLine.visible = false;
    this.rayLine.frustumCulled = false;
  }

  get isOpen(): boolean {
    return this.root.visible || this.flatOpen;
  }

  /** Open flat on the page (desktop; not in 3D). */
  get isFlat(): boolean {
    return this.flatOpen;
  }

  /**
   * Desktop: the menu flat on the screen (owner request: easier to use than floating in
   * the 3D view). The same canvas the panel draws, shown as a page element in the middle of
   * the window, as tall as fits; the mouse hovers and clicks it directly. The mouse must be
   * free: the caller releases the pointer lock. Closed by `close()` (O again).
   */
  openFlat(): void {
    if (!this.flat && typeof document !== 'undefined') {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:100;background:rgba(0,0,0,0.25);cursor:default;';
      const c = this.panel.element;
      c.style.cssText = 'display:block;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.5);cursor:pointer;';
      d.appendChild(c);
      const at = (e: MouseEvent) => {
        const r = c.getBoundingClientRect();
        const s = this.panel.pixelSize;
        return { px: ((e.clientX - r.left) / r.width) * s.w, py: ((e.clientY - r.top) / r.height) * s.h };
      };
      c.addEventListener('mousemove', (e) => {
        const { px, py } = at(e);
        this.setHover(this.panel.hoverAt(px, py));
      });
      c.addEventListener('mouseleave', () => this.setHover(null));
      c.addEventListener('click', (e) => {
        const { px, py } = at(e);
        const b = this.panel.hoverAt(px, py);
        if (b) this.press(b, () => {});
        e.stopPropagation();
      });
      // A click on the dark surround closes it, as a dialog does.
      d.addEventListener('click', () => this.close());
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      document.body.appendChild(d);
      this.flat = d;
    }
    this.root.visible = false;
    this.flatOpen = true;
    if (this.flat) {
      this.flat.style.display = 'flex';
      this.fitFlat();
    }
    this.rayLine.visible = false;
    this.setHover(null);
    this.panel.refresh(true);
  }

  /** The flat menu as tall as the window allows (its own pixels at most), keeping its shape. */
  private fitFlat(): void {
    if (!this.flat) return;
    const s = this.panel.pixelSize;
    const scale = Math.min(1, (window.innerHeight * 0.92) / s.h, (window.innerWidth * 0.94) / s.w);
    const c = this.panel.element;
    c.style.width = `${Math.round(s.w * scale)}px`;
    c.style.height = `${Math.round(s.h * scale)}px`;
  }

  /** Wear the menu on a (left) controller grip. */
  openOnWrist(grip: THREE.Object3D): void {
    const m = CONFIG.menu;
    grip.add(this.root);
    // Grip axes: -Z out of the front of the controller, +Y out of its top face. The panel
    // stands above the hand, tilted back to face you.
    this.root.position.set(m.wristOffset[0], m.wristOffset[1] + this.panel.height / 2, m.wristOffset[2]);
    this.root.rotation.set((m.wristTiltDeg * Math.PI) / 180, 0, 0);
    this.show(true);
  }

  /**
   * Float the menu in front of the viewer, in `frame` (the frame the view rides in: the
   * rig's carrier, which follows the deck through the motion-comfort filter).
   */
  openInFront(frame: THREE.Object3D, camera: THREE.Camera): void {
    placeInFront(this.root, frame, camera, CONFIG.menu.floatDistance, 0.12);
    this.show(true);
  }

  /** Fixed in the world (a board on a wall): in `parent` at this place, facing +z turned by `yaw` (rad). */
  openFixed(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number): void {
    parent.add(this.root);
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
    this.show(true);
  }

  /** Once per frame: redraw if what it shows changed (e.g. time flowing, state from the sim). */
  refresh(): void {
    if (this.isOpen) this.panel.refresh();
  }

  close(): void {
    this.show(false);
  }

  private show(on: boolean): void {
    if (this.flatOpen) {
      this.flatOpen = false;
      if (this.flat) this.flat.style.display = 'none';
      // The canvas texture is drawn from the same canvas: nothing to put back.
    }
    this.root.visible = on;
    this.rayLine.visible = false;
    this.pokeLatched = false;
    this.lastDepth = null;
    this.setHover(null);
    if (on) this.panel.refresh(true);
  }

  /**
   * VR: the right hand against the menu. Returns true if the hand is on or pointing at
   * the menu this frame (its trigger must then not reach the bridge controls).
   */
  updateXR(hand: HandFrame, pulse: (intensity: number, ms: number) => void): boolean {
    this.rayLine.visible = false;
    if (!this.isOpen || !hand.tracked) {
      this.setHover(null);
      return false;
    }
    const m = CONFIG.menu;
    const tip = hand.ray.origin;
    let target: MenuButton | null = null;
    let consumed = false;
    // The wrist moves every frame: use this frame's pose, not last render's.
    this.root.updateWorldMatrix(true, true);

    const poke = this.panel.hitPoint(tip, m.pokeReach);
    if (poke) {
      consumed = true;
      target = poke.btn;
      if (poke.depth > m.pokeRelease) this.pokeLatched = false;
      // A poke must come from in front: reaching the surface from behind the panel (or
      // sliding in sideways below the press depth) doesn't count.
      const crossed = this.lastDepth !== null && this.lastDepth >= m.pokeDepth && poke.depth < m.pokeDepth;
      if (target && ((crossed && !this.pokeLatched) || hand.triggerPressed)) {
        this.pokeLatched = true;
        this.press(target, pulse);
      }
      this.lastDepth = poke.depth;
    } else {
      this.pokeLatched = false;
      this.lastDepth = null;
      const hit = this.panel.hitRay(hand.ray, this.reach.ray);
      if (hit) {
        consumed = true;
        target = hit.btn;
        this.showRay(tip, hit.point);
        if (target && hand.triggerPressed) this.press(target, pulse);
      }
    }
    if (target !== this.hover && target) pulse(0.1, 8);
    this.setHover(target);
    this.panel.refresh();
    return consumed;
  }

  /** Desktop: reticle ray + click. Returns true if the reticle is on the menu. */
  updateDesktop(ray: THREE.Ray | null, pressed: boolean): boolean {
    if (this.flatOpen) {
      this.fitFlat();
      return false; // the mouse works it directly
    }
    if (!this.isOpen || !ray) return false;
    this.root.updateWorldMatrix(true, true);
    const hit = this.panel.hitRay(ray, this.reach.desktop);
    const target = hit?.btn ?? null;
    if (target && pressed) this.press(target, () => {});
    this.setHover(target);
    this.panel.refresh();
    return !!hit;
  }

  private press(btn: MenuButton, pulse: (intensity: number, ms: number) => void): void {
    btn.press?.();
    pulse(0.45, 25);
  }

  private setHover(btn: MenuButton | null): void {
    this.hover = btn;
    this.panel.setHover(btn);
  }

  private showRay(from: THREE.Vector3, to: THREE.Vector3): void {
    const pos = this.rayLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.rayLine.visible = true;
  }
}
