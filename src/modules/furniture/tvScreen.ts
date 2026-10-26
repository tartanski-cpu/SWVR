/**
 * A TV's screen (furniture kind 'tv'; owner, Oct 2026: "streaming of another browser tab into
 * the TV screen"). Its case and bracket are the furniture piece's fixed parts; the screen is
 * its own mesh (one draw call a TV), dark when it's off, showing a picture when the app hands
 * it one (modules/furniture/tvCast.ts: a browser tab, from whoever is showing one on it).
 *
 * A press on it (a click, on a desktop) asks to show one of your tabs on it, or stops yours
 * ('tvCast' on its channel; the app works it: the browser's own tab picker). In VR there's
 * nothing to pick a tab with, so a press there only says so; the picture shows for everyone.
 *
 * In the piece's axes (furniture/index.ts): x along the wall, y up from the floor, the wall at
 * +z; the screen faces -z, out into the room.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Control } from '../../controls/Control';

export class TvScreen extends Control {
  readonly kind = 'press' as const;
  readonly label = 'TV: show a browser tab on it (desktop)';
  /** Its place's id on her (furniture.tv): which TV it is. */
  readonly socketId: string;
  private pressed = false;
  private readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly w: number;
  private readonly h: number;
  private shown: THREE.Texture | null = null;

  /**
   * @param width   the screen's width (m), inside its bezel
   * @param height  its height (m)
   * @param centre  its middle over the floor (m)
   * @param front   its face, out from the piece's middle (m, toward -z)
   */
  constructor(socketId: string, width: number, height: number, centre: number, front: number) {
    super('tv', `tvCast.${socketId}`);
    this.socketId = socketId;
    this.w = width;
    this.h = height;
    // Unlit: a screen gives its own light (and is black when it's off, day or night).
    const mat = new THREE.MeshBasicMaterial({ color: CONFIG.modules.furniture.colours.tvOff, toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height).rotateY(Math.PI), mat);
    this.screen.position.set(0, centre, front - 0.002);
    this.screen.name = 'tvScreen';
    this.root.add(this.screen);
    this.hitObjects.push(this.screen);
  }

  /** The screen's middle (world), for its sound and how far off it is. */
  centre(out: THREE.Vector3): THREE.Vector3 {
    return this.screen.getWorldPosition(out);
  }

  /**
   * Show a picture on it (null: dark). `aspect`: the picture's width over its height, so it
   * fits the screen without stretching: the lit part shrinks to the picture's shape, the dark
   * case showing as bars top and bottom, or at the sides.
   */
  show(tex: THREE.Texture | null, aspect = 16 / 9): void {
    const m = this.screen.material;
    if (tex !== this.shown) {
      m.map = tex;
      m.color.set(tex ? 0xffffff : CONFIG.modules.furniture.colours.tvOff);
      m.needsUpdate = true;
      this.shown = tex;
    }
    const s = this.w / this.h;
    if (tex && aspect > s) this.screen.scale.set(1, s / aspect, 1);
    else if (tex) this.screen.scale.set(aspect / s, 1, 1);
    else this.screen.scale.set(1, 1, 1);
  }

  distanceTo(world: THREE.Vector3): number {
    const p = this.screen.worldToLocal(world.clone());
    this.screen.geometry.computeBoundingBox();
    return this.screen.geometry.boundingBox!.distanceToPoint(p);
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.3, 30);
    this.ctx?.emit(this.channel, 1);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(): void {}
}
