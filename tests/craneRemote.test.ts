/**
 * The deck crane's controls (owner, Oct 2026): two joysticks on its post, as on a crane's
 * radio remote (left: slew and boom; right: telescope and hoist), and for desktop and game
 * controller players the radio remote itself (app/craneRemote.ts), which works those same two
 * sticks and HOOK through the interaction system.
 */
import { describe, expect, it } from 'vitest';
import { cranePosts, remoteInput } from '../src/app/craneRemote';
import { Button } from '../src/controls/Button';
import { InteractionSystem } from '../src/controls/InteractionSystem';
import { Joystick } from '../src/controls/Joystick';
import { CONFIG } from '../src/config';
import { PAD, type PadState } from '../src/player/gamepad';

const crane = CONFIG.modules.deckCrane;
const pad = (more: Partial<PadState> = {}): PadState => ({ connected: true, lx: 0, ly: 0, rx: 0, ry: 0, down: [], pressed: [], released: [], ...more });

describe('the crane remote', () => {
  it('finds each crane’s two sticks and HOOK by their ids', () => {
    expect(cranePosts(['helm', 'deckCraneJoystick', 'deckCraneJoystick2', 'deckCraneHook', 'spotJoystick'])).toEqual([{ left: 'deckCraneJoystick', right: 'deckCraneJoystick2', hook: 'deckCraneHook' }]);
  });

  it('keys: W A S D the left stick, the arrows the right (up hoists: the stick pulled back), Space the hook', () => {
    const keys = new Set(['KeyW', 'KeyD', 'ArrowUp', 'ArrowRight', 'Space']);
    expect(remoteInput((c) => keys.has(c), null)).toEqual({ left: { x: 1, y: 1 }, right: { x: 1, y: -1 }, hook: true });
  });

  it('a controller: its two sticks (pushed forward is up on the remote), A the hook; LB held, the right stick only looks', () => {
    const i = remoteInput(() => false, pad({ lx: 0.5, ly: -1, rx: -0.3, ry: 0.8, down: [true] }));
    expect(i).toEqual({ left: { x: 0.5, y: 1 }, right: { x: -0.3, y: -0.8 }, hook: true });
    const look = remoteInput(() => false, pad({ rx: 1, ry: 1, down: Object.assign([], { [PAD.lb]: true }) }));
    expect(look.right).toEqual({ x: 0, y: 0 });
  });

  it('works the post’s own sticks and HOOK: they send what a hand on them would, and let go', () => {
    const sent: [string, number][] = [];
    const left = new Joystick('cJoystick', { panRateDeg: crane.slewRateDeg, tiltRateDeg: crane.luffRateDeg, panLimitDeg: crane.slewLimitDeg, tiltMinDeg: crane.luffMinDeg, tiltMaxDeg: crane.luffMaxDeg }, { pan: 'crane.slew', tilt: 'crane.luff' });
    const right = new Joystick('cJoystick2', { panRateDeg: crane.extendRate, tiltRateDeg: crane.hoistRate, panMinDeg: 0, panLimitDeg: crane.extendMax, tiltMinDeg: crane.wireMin, tiltMaxDeg: crane.wireMax }, { pan: 'crane.extend', tilt: 'crane.wire' });
    const hook = new Button('cHook', 'crane.hook', 'HOOK', 'momentary', 0xc0302a);
    const sys = new InteractionSystem([left, right, hook], (c, v) => sent.push([c, v]), () => {});
    const post = cranePosts(sys.controlIds)[0];
    // Full left stick forward and right, the right stick pulled back (hoist) and right (out), for a second.
    for (let i = 0; i < 60; i++) {
      sys.remoteDrive([{ id: post.left, x: 1, y: 1 }, { id: post.right, x: 1, y: -1 }], [{ id: post.hook, down: i < 30 }]);
      left.tick(1 / 60);
      right.tick(1 / 60);
    }
    const last = (c: string) => sent.filter(([k]) => k === c).at(-1)?.[1];
    expect(last('crane.slew')).toBeCloseTo(crane.slewRateDeg, 0);
    expect(last('crane.luff')).toBeCloseTo(crane.luffRateDeg, 0);
    expect(last('crane.extend')).toBeGreaterThan(0.2);
    // Hoisting below its shortest wire: held at the limit.
    expect(last('crane.wire') ?? crane.wireMin).toBeGreaterThanOrEqual(crane.wireMin);
    // HOOK pressed once, and let go.
    expect(sent.filter(([k]) => k === 'crane.hook')).toEqual([['crane.hook', 1], ['crane.hook', 0]]);
    // Telescope never asked below fully in.
    sys.remoteDrive([{ id: post.right, x: -1, y: 0 }], []);
    for (let i = 0; i < 600; i++) right.tick(1 / 60);
    expect(last('crane.extend')).toBeGreaterThanOrEqual(0);
    sys.remoteRelease();
    expect(left.held).toBe(false);
    expect(right.held).toBe(false);
  });
});
