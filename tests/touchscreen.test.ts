/**
 * The advanced touchscreen (CS5; owner, Oct 2026: "just one screen that you have tabs that you
 * have to flip between"): a press target over each tab it draws, sending that page on its
 * channel; the page is the boat's, kept in range; the crew all see it.
 */
import { describe, expect, it } from 'vitest';
import { touchPageOf, touchTabs, TOUCH_BAR } from '../src/controls/instruments';
import { TouchTab } from '../src/controls/TouchTab';
import { SCREEN } from '../src/modules/screen';
import { applyVesselIntent } from '../src/vessel/vesselControl';
import { createVesselState } from '../src/vessel/vesselState';

describe('the touchscreen', () => {
  it('has a press target over each tab it draws, each sending its page on the screen’s channel', () => {
    const pages = ['speed', 'heading', 'rpm', 'anchor', 'nav'] as const;
    const built = SCREEN.view!.build({ config: { screen: 'touch', mount: 'dash', pages: [...pages], channel: 'touchPage2', first: 2 }, display: () => {} } as never);
    const tabs = built.controls as TouchTab[];
    expect(tabs).toHaveLength(pages.length);
    const sent: [string, number][] = [];
    tabs.forEach((t) => t.bind({ emit: (c, v) => sent.push([c, v]), haptic: () => {} }));
    tabs.forEach((t) => t.pressStart());
    expect(sent).toEqual(pages.map((_, i) => ['touchPage2', i]));
    // Left to right across the glass.
    const xs = tabs.map((t) => t.root.position.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const tabSpans = touchTabs(pages.length);
    expect(tabSpans[0].x0).toBeGreaterThanOrEqual(TOUCH_BAR.x0);
    expect(tabSpans[pages.length - 1].x1).toBeLessThanOrEqual(TOUCH_BAR.x1);
    // One row, along the top of the screen (its centre is at the slot, 0), clear of the wheel's rim.
    for (const t of tabs) expect(t.root.position.y).toBeCloseTo(tabs[0].root.position.y, 6);
    expect(tabs[0].root.position.y).toBeGreaterThan(0);
  });

  it('shows the boat’s page, kept in range, else its first', () => {
    const s = createVesselState('v', 'design');
    expect(touchPageOf(s, 'touchPage1', 0, 6)).toBe(0);
    expect(touchPageOf(s, 'touchPage2', 2, 6)).toBe(2);
    applyVesselIntent(s, { playerId: 'p', targetId: 'v', control: 'touchPage1', value: 4 } as never);
    expect(touchPageOf(s, 'touchPage1', 0, 6)).toBe(4);
    // A page past the end (a screen with fewer pages): its last.
    expect(touchPageOf(s, 'touchPage1', 0, 3)).toBe(2);
  });
});
