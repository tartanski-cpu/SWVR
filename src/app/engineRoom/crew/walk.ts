/**
 * Walking in the crew area (crew/layout.ts): each deck's floor inside its walls, the stair
 * between them (the main deck has a hole there), round the partitions and the furniture.
 * The stair is walked as one smooth slope (owner, 29 Oct 2026: "I don't know why the collision
 * should just be a plane"; it is now), from the main floor at its head down to the lower
 * deck a tread beyond its foot, under the treads' nosings, across its whole width between
 * its walls: its handrails are only drawn. Which deck you're on is by your height: the floors overlap in plan (the cabins are
 * under the messroom). The boat's own walk area is put back when you go out (BelowDecks). In VR
 * its walls are solid too, and a head leaned through one fades the view (`insideSolid`).
 */
import type { WalkArea } from '../../../vessel/layout';
import { deckAtHeight, onDeck, type Box, type CrewLayout, type DeckName } from './layout';

/** How close to a wall or a piece your body goes (m). */
const BODY = 0.15;
/** How far the stair's slope runs on, level, past its head onto the main floor (m). */
const HEAD_OVER = 0.15;

export function crewWalkArea(l: CrewLayout): WalkArea {
  const M = l.decks.main!;
  const L = l.decks.lower;
  const deckOf = (n: DeckName) => (n === 'main' ? M : L!);
  const inWell = (x: number, z: number, m = 0) => !!l.well && x > l.well.x0 - m && x < l.well.x1 + m && z > l.well.z0 - m && z < l.well.z1 + m;
  // The stair's slope: its height at z, within its walls (its width and the gap to them), from
  // its head (the main floor) to a tread beyond its foot (the lower floor). It runs on level a
  // little past its head (HEAD_OVER) onto the main floor, so the step off it lands on floor:
  // the main deck keeps clear of the well's edge, and without the overlap the head of the stair
  // was a strip you couldn't step into (owner, 29 Oct 2026: "I get stuck before the platform").
  const S = l.plan.stair;
  const half = S ? S.width / 2 + 0.05 : 0;
  const rampAt = (x: number, z: number): number | null => {
    if (!S || Math.abs(x - S.x) > half || z > S.zTop + HEAD_OVER || z < S.zFoot - S.tread) return null;
    return Math.max(S.foot, S.top - ((S.zTop - z) * S.rise) / S.tread);
  };
  // On the lower deck the stair stands in its trunk: the space under it is closed.
  const underStair = (x: number, z: number) => !!l.well && x > l.well.x0 && x < l.well.x1 && z > l.well.z0 && z < l.well.z1;
  const blocks = (n: DeckName): Box[] => [...l.walls.filter((w) => w.deck === n), ...l.pieces.filter((p) => p.solid && p.deck === n)];
  const byDeck: Record<DeckName, Box[]> = { main: blocks('main'), lower: L ? blocks('lower') : [] };
  const hit = (n: DeckName, x: number, z: number, m: number, yUp = 0.1) => byDeck[n].some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && yUp < b.h);
  return {
    floorsAt: (x, z) => {
      const out: number[] = [];
      const ramp = rampAt(x, z);
      if (ramp !== null) out.push(ramp);
      if (onDeck(M, x, z) && !inWell(x, z)) out.push(M.floor);
      if (L && onDeck(L, x, z) && !underStair(x, z)) out.push(L.floor);
      return out;
    },
    walkable: (x, z, y) => {
      // On the stair: anywhere between its walls.
      const ramp = rampAt(x, z);
      if (ramp !== null && Math.abs(y - ramp) < 0.5) return Math.abs(x - S!.x) <= half - BODY;
      const n = deckAtHeight(l, y);
      const deck = deckOf(n);
      if (Math.abs(y - deck.floor) > 0.5 || !onDeck(deck, x, z, BODY)) return false;
      if (n === 'main' && inWell(x, z, 0.05)) return false;
      if (n === 'lower' && underStair(x, z)) return false;
      return !hit(n, x, z, BODY);
    },
    ladderAt: () => null,
    insideSolid: (x, y, z) => {
      // Between the decks (the main deck's floor and the lower deck's deckhead), solid but in the stair well.
      if (L && y < M.floor && y > L.deckhead) return !inWell(x, z);
      const n: DeckName = L && y <= L.deckhead ? 'lower' : 'main';
      const deck = deckOf(n);
      if (y > deck.deckhead || !onDeck(deck, x, z)) return !(inWell(x, z) && y > (L?.floor ?? M.floor));
      return hit(n, x, z, 0, y - deck.floor);
    },
    inBounds: (x, z) => onDeck(M, x, z, BODY) || (!!L && onDeck(L, x, z, BODY)),
  };
}
