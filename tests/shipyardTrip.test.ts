import { describe, expect, it } from 'vitest';
import { backUrl, designPrice, refitCost, refitReturn, shipyardUrl } from '../src/app/shipyardTrip';
import { FLEET } from '../src/boats/fleet';
import { createCareer, parseCareer, serializeCareer } from '../src/career/career';
import { designToken } from '../src/shipyard/designDoc';

// The yard's door into the Shipyard and back (owner, Oct 2026; docs/SHIPYARD_IN_GAME.md).
describe('to the Shipyard and back', () => {
  const code = (id: string) => designToken(FLEET.find((f) => f.id === id)!.design);

  it('goes out with her code, the mode, the way back, and in the career the money', () => {
    const out = shipyardUrl('ABC', 'career', 'https://x/career.html?a=1', 1234.4);
    const u = new URL(out, 'https://x/');
    expect(u.pathname).toBe('/shipyard.html');
    expect(u.searchParams.get('refit')).toBe('career');
    expect(u.searchParams.get('back')).toBe('https://x/career.html?a=1');
    expect(u.searchParams.get('money')).toBe('1234');
    expect(decodeURIComponent(u.hash.slice(1))).toBe('ABC');
    // Voyage: no money (owner).
    expect(new URL(shipyardUrl('ABC', 'voyage', 'b', 500), 'https://x/').searchParams.has('money')).toBe(false);
  });

  it('comes back to the game without its one-off parameters', () => {
    expect(backUrl('https://x/voyage.html?map=oban&design=OLD&start&t=5&refitFrom=Q')).toBe('https://x/voyage.html?map=oban');
  });

  it('reads a refit to settle from the address', () => {
    expect(refitReturn('?design=NEW&refitFrom=OLD')).toEqual({ from: 'OLD', to: 'NEW' });
    expect(refitReturn('?design=NEW')).toBeNull();
  });

  it("prices a refit as the difference in the Shipyard's price, nothing back for a cheaper boat", () => {
    const small = code('starterBoat');
    const big = code('pilotBoat');
    const a = designPrice(small)!;
    const b = designPrice(big)!;
    expect(b).toBeGreaterThan(a);
    expect(refitCost(small, big)).toBe(Math.round(b - a));
    expect(refitCost(big, small)).toBe(0);
    expect(refitCost(small, small)).toBe(0);
    expect(refitCost(small, 'not a code')).toBeNull();
  });

  it("the career keeps her refitted design in its save", () => {
    const c = createCareer();
    c.design = code('pilotBoat');
    expect(parseCareer(serializeCareer(c))?.design).toBe(c.design);
    expect(parseCareer(serializeCareer(createCareer()))?.design).toBeUndefined();
  });
});
