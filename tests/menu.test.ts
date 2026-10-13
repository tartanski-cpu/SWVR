import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HandFrame } from '../src/controls/InteractionSystem';
import { formatHours, mainMenuRows, type MenuHost } from '../src/ui/mainMenu';
import type { MenuButton } from '../src/ui/menuPanel';
import type { WristMenu as WristMenuT } from '../src/ui/wristMenu';

// The menu draws onto a canvas; in Node, give it a canvas whose 2D context ignores
// every call. Hit-testing and press logic don't depend on what gets drawn.
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => {} });
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

function fakeHost() {
  const calls: string[] = [];
  const state = { time: 10.5, scale: 0, calm: false, coupling: 1, smooth: true, snap: 30, aboard: false, trials: false, dbg: false, hydro: false, probes: false };
  const host: MenuHost = {
    timeOfDay: () => state.time,
    shiftTime: (h) => calls.push(`shift ${h.toFixed(3)}`),
    timeScale: () => state.scale,
    setTimeScale: (v) => (state.scale = v),
    calmSea: () => state.calm,
    setCalmSea: (c) => (state.calm = c),
    coupling: () => state.coupling,
    setCoupling: (v) => (state.coupling = v),
    smoothWalk: () => state.smooth,
    setSmoothWalk: (on) => (state.smooth = on),
    snapTurnDeg: () => state.snap,
    setSnapTurnDeg: (d) => (state.snap = d),
    aboard: () => state.aboard,
    toggleBoard: () => calls.push('board'),
    dropBoat: () => calls.push('drop'),
    heelBoat: () => calls.push('heel'),
    seaTrialsShown: () => state.trials,
    toggleSeaTrials: () => calls.push('trials'),
    debugPanel: () => state.dbg,
    toggleDebugPanel: () => calls.push('debug'),
    hydroView: () => state.hydro,
    toggleHydroView: () => calls.push('hydro'),
    probes: () => state.probes,
    toggleProbes: () => calls.push('probes'),
    close: () => calls.push('close'),
  };
  return { host, calls, state };
}

const label = (b: MenuButton) => (typeof b.text === 'function' ? b.text() : b.text);

function findButton(rows: ReturnType<typeof mainMenuRows>, text: string): MenuButton {
  for (const r of rows) if ('buttons' in r) for (const b of r.buttons) if (label(b) === text) return b;
  throw new Error(`no button "${text}"`);
}

describe('main menu contents', () => {
  it('time buttons shift the time of day and the clock shows it', () => {
    const { host, calls } = fakeHost();
    const rows = mainMenuRows(host);
    findButton(rows, '+1 h').press!();
    findButton(rows, '−10′').press!();
    expect(calls).toEqual(['shift 1.000', 'shift -0.167']);
    expect(findButton(rows, '10:30').press).toBeUndefined(); // read-only value box
  });

  it('choice rows highlight the current setting and switch it', () => {
    const { host, state } = fakeHost();
    const rows = mainMenuRows(host);
    const x60 = findButton(rows, '×60');
    const stopped = findButton(rows, 'Stopped');
    expect(stopped.active!()).toBe(true);
    x60.press!();
    expect(state.scale).toBeCloseTo(1 / 60);
    expect(x60.active!()).toBe(true);
    expect(stopped.active!()).toBe(false);
    findButton(rows, 'Flat calm').press!();
    expect(state.calm).toBe(true);
    findButton(rows, '45°').press!();
    expect(state.snap).toBe(45);
    findButton(rows, 'Off').press!();
    expect(state.smooth).toBe(false);
  });

  it('coupling steps by 10 % and the board button names what it will do', () => {
    const { host, state } = fakeHost();
    const rows = mainMenuRows(host);
    findButton(rows, '−10 %').press!();
    expect(state.coupling).toBeCloseTo(0.9);
    expect(findButton(rows, 'Board boat (at the helm)')).toBeTruthy();
    state.aboard = true;
    expect(findButton(rows, 'Leave boat (to platform)')).toBeTruthy();
  });

  it('formats time of day, wrapping at midnight', () => {
    expect(formatHours(10.5)).toBe('10:30');
    expect(formatHours(23.9999)).toBe('00:00');
    expect(formatHours(-0.5)).toBe('23:30');
  });
});

describe('wrist menu pointing and poking', () => {
  let WristMenu: typeof WristMenuT;
  beforeAll(async () => {
    ({ WristMenu } = await import('../src/ui/wristMenu'));
  });

  /** A menu floating in front of a camera at the origin looking down -Z. */
  function setup() {
    const { host, calls } = fakeHost();
    const menu = new WristMenu(mainMenuRows(host));
    const frame = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld(true);
    menu.openInFront(frame, camera);
    frame.updateMatrixWorld(true);
    /** World point on a button's centre, `depth` m in front of the panel. */
    const at = (text: string, depth: number) => {
      const panel = menu.panel as unknown as { placed: { btn: MenuButton; x: number; y: number; w: number; h: number }[]; canvas: { width: number; height: number } };
      const p = panel.placed.find((q) => label(q.btn) === text)!;
      const W = panel.canvas.width;
      const H = panel.canvas.height;
      const x = ((p.x + p.w / 2) / W - 0.5) * menu.panel.width;
      const y = (0.5 - (p.y + p.h / 2) / H) * menu.panel.height;
      return menu.panel.mesh.localToWorld(new THREE.Vector3(x, y, depth));
    };
    const hand = (tip: THREE.Vector3, dir: THREE.Vector3, trigger = false): HandFrame => ({
      tracked: true,
      grip: tip.clone(),
      ray: new THREE.Ray(tip.clone(), dir.clone().normalize()),
      gripDown: false,
      gripPressed: false,
      triggerDown: trigger,
      triggerPressed: trigger,
    });
    return { menu, calls, at, hand };
  }

  it('a fingertip poke from the front presses once until it backs off', () => {
    const { menu, calls, at, hand } = setup();
    const fwd = new THREE.Vector3(0, 0, -1);
    const step = (d: number) => menu.updateXR(hand(at('Drop 4 m', d), fwd), () => {});
    expect(step(0.03)).toBe(true); // over the panel: the hand is the menu's
    step(0.015);
    step(0.0); // touches the surface -> press
    step(-0.005); // pushing through doesn't repeat
    step(0.01); // not backed off far enough to re-arm
    step(0.0);
    expect(calls).toEqual(['drop']);
    step(0.03); // back off...
    step(0.0); // ...and poke again
    expect(calls).toEqual(['drop', 'drop']);
  });

  it('reaching the surface from behind the panel does not press', () => {
    const { menu, calls, at, hand } = setup();
    const fwd = new THREE.Vector3(0, 0, -1);
    menu.updateXR(hand(at('Drop 4 m', -0.03), fwd), () => {});
    menu.updateXR(hand(at('Drop 4 m', -0.01), fwd), () => {});
    menu.updateXR(hand(at('Drop 4 m', 0.0), fwd), () => {});
    expect(calls).toEqual([]);
  });

  it('pointer ray + trigger presses from a distance; the ray alone does not', () => {
    const { menu, calls, at, hand } = setup();
    const target = at('Heel 20°', 0);
    const origin = target.clone().add(new THREE.Vector3(0.1, -0.2, 0.5));
    const dir = target.clone().sub(origin);
    expect(menu.updateXR(hand(origin, dir), () => {})).toBe(true);
    expect(calls).toEqual([]);
    menu.updateXR(hand(origin, dir, true), () => {});
    expect(calls).toEqual(['heel']);
    expect(menu.rayLine.visible).toBe(true);
  });

  it('a closed menu takes nothing', () => {
    const { menu, at, hand } = setup();
    menu.close();
    expect(menu.updateXR(hand(at('Drop 4 m', 0.01), new THREE.Vector3(0, 0, -1), true), () => {})).toBe(false);
  });
});
