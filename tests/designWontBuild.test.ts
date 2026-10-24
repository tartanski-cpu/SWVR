/**
 * A Shipyard design the builder can't build (review, Oct 2026: a dash screen placed by hand
 * with more controls threw in the builder, and the game page never started). The game treats
 * it as no boat: boatType gives null, as for an unreadable code, and the default boat is used.
 */
import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { boatType } from '../src/boats/library';
import { designToken } from '../src/shipyard/designDoc';
import { buildDesign } from '../src/shipyard/build';

describe("a design that won't build", () => {
  it('gives no boat type, without throwing', () => {
    const base = FLEET.find((f) => f.id === 'starterBoat')!.design;
    const broken = { ...base, dashClock: 1, controls: 2 } as typeof base;
    // The builder itself still throws on it (the Shipyard chat's to mend).
    let threw = false;
    try {
      buildDesign(broken);
    } catch {
      threw = true;
    }
    if (!threw) return; // mended in the builder: nothing left to guard here
    expect(() => boatType(designToken(broken))).not.toThrow();
    expect(boatType(designToken(broken))).toBeNull();
    // A good design still builds.
    expect(boatType(designToken(base))).not.toBeNull();
  });
});
