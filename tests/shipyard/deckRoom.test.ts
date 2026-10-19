/** A design's deck room: crates and pots on her open deck, by the game's own placing rule. */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { deckCapacity } from '../../src/cargo/deck';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { deckRoom, sizeForDeck } from '../../src/shipyard/deckRoom';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

const typed = (hull: number, patch: Partial<ShipDesign> = {}) => {
  useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...patch });
  return deckRoom();
};

describe('deck room', () => {
  it('counts the game workboat’s open deck', () => {
    const crates = deckCapacity('workboat', { hx: 0.3, hz: 0.25 });
    expect(crates).toBeGreaterThan(20);
    expect(crates).toBeLessThan(60);
  });

  it('a bigger hull takes more; a pot takes more room than a crate', () => {
    const lc = typed(0);
    const wb = typed(2);
    expect(wb.crates).toBeGreaterThan(lc.crates);
    expect(wb.pots).toBeLessThan(wb.crateRoom);
    expect(lc.crates).toBeGreaterThanOrEqual(6); // the biggest cargo job
  });

  it('follows her as she changes: a longer hull, a longer house', () => {
    const base = typed(2);
    expect(typed(2, { length: 15 }).crateRoom).toBeGreaterThan(base.crateRoom);
    expect(typed(2, { houseLength: 15 }).crateRoom).toBeLessThan(base.crateRoom);
  });

  it('never more crates than her payload carries', () => {
    for (const hull of [0, 1, 2, 3]) {
      const r = typed(hull);
      expect(r.crates).toBeLessThanOrEqual(r.crateRoom);
      expect(r.crates * 40).toBeLessThanOrEqual(r.payloadKg);
    }
  });

  it('sizes her for the brief’s deck: longer and beamier together until it fits, never smaller', () => {
    const lc = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, deckCrane: 0, searchlight: 0, fireMonitor: 0 };
    const s = sizeForDeck(lc, { crates: 30, pots: 0 });
    expect(s.met).toBe(true);
    expect(s.room.crates).toBeGreaterThanOrEqual(30);
    expect(s.patch.length! - lc.length).toBe(s.patch.beam! - lc.beam); // her proportions kept
    expect(s.patch.length!).toBeGreaterThan(lc.length);
    // Already enough: left as she is.
    expect(sizeForDeck(lc, { crates: 10, pots: 0 }).patch).toEqual({ length: lc.length, beam: lc.beam });
    // More than she can ever take: as big as she goes, and says so.
    const big = sizeForDeck(lc, { crates: 2000, pots: 0 });
    expect(big.met).toBe(false);
    expect(big.patch.length).toBe(15);
    expect(big.room.crates).toBeGreaterThan(200); // (the landing craft grows to 22.5 m)
  });
});
