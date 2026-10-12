/**
 * Polls WebXR controller gamepads once per frame and exposes button edges by hand.
 *
 * Button indices follow the 'xr-standard' mapping used by Quest Touch controllers:
 *   0 trigger, 1 grip (squeeze), 3 thumbstick press, 4 A/X, 5 B/Y
 * Thumbstick axes are 2 (x) and 3 (y).
 */
export type Handedness = 'left' | 'right';

export const XR_BUTTON = { trigger: 0, grip: 1, stick: 3, primary: 4, secondary: 5 } as const;

interface HandInput {
  connected: boolean;
  pressed: boolean[];
  prevPressed: boolean[];
  values: number[];
  stick: [number, number];
  gamepad: Gamepad | null;
}

const emptyHand = (): HandInput => ({
  connected: false,
  pressed: [],
  prevPressed: [],
  values: [],
  stick: [0, 0],
  gamepad: null,
});

export class XRInput {
  readonly hands: Record<Handedness, HandInput> = { left: emptyHand(), right: emptyHand() };

  update(session: XRSession | null): void {
    for (const hand of Object.values(this.hands)) {
      hand.prevPressed = hand.pressed;
      hand.pressed = [];
      hand.values = [];
      hand.connected = false;
      hand.gamepad = null;
      hand.stick = [0, 0];
    }
    if (!session) return;

    for (const source of session.inputSources) {
      if (source.handedness !== 'left' && source.handedness !== 'right') continue;
      const gp = source.gamepad;
      if (!gp) continue;
      const hand = this.hands[source.handedness];
      hand.connected = true;
      hand.gamepad = gp;
      hand.pressed = gp.buttons.map((b) => b.pressed);
      hand.values = gp.buttons.map((b) => b.value);
      hand.stick = [gp.axes[2] ?? 0, gp.axes[3] ?? 0];
    }
  }

  isDown(hand: Handedness, button: number): boolean {
    return this.hands[hand].pressed[button] ?? false;
  }

  wasPressed(hand: Handedness, button: number): boolean {
    const h = this.hands[hand];
    return (h.pressed[button] ?? false) && !(h.prevPressed[button] ?? false);
  }

  /** Short haptic pulse; silently ignored where unsupported. */
  pulse(hand: Handedness, intensity: number, durationMs: number): void {
    const gp = this.hands[hand].gamepad as (Gamepad & { hapticActuators?: { pulse(i: number, d: number): void }[] }) | null;
    gp?.hapticActuators?.[0]?.pulse(intensity, durationMs);
  }
}
