// The board's panel drawn on a canvas: not here (no document); only whether it's up matters.
vi.mock('../src/ui/wristMenu', () => ({
  WristMenu: class {
    isOpen = false;
    rayLine = {};
    openFixed() {
      this.isOpen = true;
    }
    close() {
      this.isOpen = false;
    }
    refresh() {}
  },
}));
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { backUrl, designPrice, isSeaTrial, isTryOut, refitCost, refitReturn, shipyardUrl } from '../src/app/shipyardTrip';
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

  it('a design the career has not paid for is a sea trial; her own boat, a purchase coming back, crew and Voyage are not (owner: 5 minutes)', () => {
    const small = code('starterBoat');
    const big = code('pilotBoat');
    const q = (c: string, extra = '') => `?design=${encodeURIComponent(c)}${extra}`;
    expect(isSeaTrial('career', q(big), undefined)).toBe(true); // no boat of her own yet
    expect(isSeaTrial('career', q(big), small)).toBe(true);
    expect(isSeaTrial('career', q(big), big)).toBe(false); // her own refitted boat
    expect(isSeaTrial('career', q(big, `&refitFrom=${encodeURIComponent(small)}`), small)).toBe(false); // bought, settling
    expect(isSeaTrial('career', q(big, '&join=12345'), small)).toBe(false); // crew in the host's boat
    expect(isSeaTrial('voyage', q(big), undefined)).toBe(false); // the sandbox
    expect(isSeaTrial('career', '', small)).toBe(false); // her own boat, no design on the address
  });

  it('Try her together, or following the host into her, is a try-out: no clock, nothing saved (multiplayer study #4, #26)', () => {
    const small = code('starterBoat');
    const big = code('pilotBoat');
    const q = (c: string, extra = '') => `?design=${encodeURIComponent(c)}${extra}`;
    for (const extra of ['&host=12345', '&together=12345']) {
      expect(isSeaTrial('career', q(big, extra), small)).toBe(false);
      expect(isTryOut('career', q(big, extra), small)).toBe(true);
    }
    expect(isTryOut('career', q(big, '&host=12345'), big)).toBe(false); // her own boat
    expect(isTryOut('career', q(big), small)).toBe(false); // alone: a sea trial
    expect(isTryOut('voyage', q(big, '&host=12345'), undefined)).toBe(false);
  });
});

describe('the Your boats board stays cheap (owner, Oct 2026: 2 fps on the Quest standing by it)', () => {
  it('a design is priced once: asked again, the price is remembered', () => {
    const code = designToken(FLEET[0].design);
    const t0 = performance.now();
    const first = designPrice(code);
    const t1 = performance.now();
    for (let i = 0; i < 50; i++) expect(designPrice(code)).toBe(first);
    const t2 = performance.now();
    expect(first).not.toBeNull();
    // Fifty more asks cost less than the one build did.
    expect(t2 - t1).toBeLessThan(t1 - t0);
  });

  it('the favourites are read from storage once and kept; afresh after saving one, or walking up to the Your boats board', async () => {
    const { ShipyardCodes } = await import('../src/shipyard/takeHer');
    const { ShipyardDoor } = await import('../src/ui/shipyardDoor');
    let reads = 0;
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => (reads++, m.get(k) ?? null), setItem: (k: string, v: string) => void m.set(k, v) };
    const codes = new ShipyardCodes(() => store);
    // Asked every frame for a long while: one read.
    for (let i = 0; i < 200; i++) codes.favourites();
    expect(reads).toBe(1);
    codes.saveBoat(designToken(FLEET[0].design), 'Test', '');
    expect(codes.favourites().map((f) => f.name)).toEqual(['Test']);
    // Walking up to the board (its own spot on the quay): read once more as it comes up, then kept while it's up.
    const at = { x: 0, y: 0, z: 0, farHeading: 0 };
    const board = ShipyardDoor.boats({ shipyardCodes: () => codes } as never, at as never);
    const scene = new THREE.Group();
    const far = new THREE.Vector3(500, 0, 0);
    const near = new THREE.Vector3(1, 0, 0);
    board.updateAt(scene, far);
    const before = reads;
    for (let i = 0; i < 20; i++) {
      board.updateAt(scene, near);
      codes.favourites();
    }
    expect(reads - before).toBe(1);
    // Away and back: once more.
    board.updateAt(scene, far);
    board.updateAt(scene, near);
    codes.favourites();
    expect(reads - before).toBe(2);
  });
});
