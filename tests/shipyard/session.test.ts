/** Designing together: one keeper, members joining, patches passed on, presence, undo. */
import { describe, expect, it } from 'vitest';
import { LoopbackHost } from '../../src/net/transport';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { cleanPatch, Keeper, Member, newSessionId, sessionIdFrom, type Person, type SessionEvents } from '../../src/shipyard/session';
import { UndoStack } from '../../src/shipyard/undo';

const tick = () => new Promise((r) => setTimeout(r, 0));
function recorder() {
  const log = { design: null as ShipDesign | null, people: [] as Person[], by: [] as (string | null)[], lost: '' };
  const events: SessionEvents = {
    onDesign: (d, _p, by) => {
      log.design = d;
      log.by.push(by);
    },
    onPeople: (p) => (log.people = p),
    onLost: (r) => (log.lost = r),
  };
  return { log, events };
}

async function session() {
  const host = new LoopbackHost();
  const k = recorder();
  const keeper = new Keeper({ ...DEFAULT_DESIGN, length: 7 }, 'Simon', host, k.events);
  const a = recorder();
  const amy = new Member({ ...DEFAULT_DESIGN }, 'Amy', host.client(), a.events);
  const b = recorder();
  const ben = new Member({ ...DEFAULT_DESIGN, length: 2 }, 'Ben', host.client(), b.events);
  await tick();
  await tick();
  return { host, keeper, amy, ben, k, a, b };
}

describe('designing together: a shared session', () => {
  it("joining gets the session's design, a name and a colour of one's own", async () => {
    const { keeper, amy, ben, b } = await session();
    expect(amy.joined && ben.joined).toBe(true);
    expect(ben.design.length).toBe(7); // the session's, not Ben's own copy
    expect(b.log.design?.length).toBe(7);
    expect(keeper.people.map((p) => p.name)).toEqual(['Simon', 'Amy', 'Ben']);
    expect(new Set(keeper.people.map((p) => p.colour)).size).toBe(3);
    expect(ben.people).toHaveLength(3);
  });

  it("a change by anyone reaches everyone; for one field the keeper's last received wins", async () => {
    const { keeper, amy, ben, a, k } = await session();
    ben.edit({ length: 12 });
    await tick();
    expect(keeper.design.length).toBe(12);
    expect(amy.design.length).toBe(12);
    expect(a.log.by.at(-1)).toBe(ben.me);
    expect(k.log.by.at(-1)).toBe(ben.me);
    // Both at once: whichever the keeper gets last.
    amy.edit({ beam: 3 });
    ben.edit({ beam: 5 });
    await tick();
    for (const s of [keeper, amy, ben]) expect(s.design.beam).toBe(5);
    keeper.edit({ headroom: 1 });
    await tick();
    expect(amy.design.headroom).toBe(1);
    expect(ben.design.headroom).toBe(1);
  });

  it('the gearbox and anything not a design field stay out of patches', () => {
    expect(cleanPatch({ length: 3, gear: 9, nonsense: 1, beam: 'x', hull: NaN }, DEFAULT_DESIGN)).toEqual({ length: 3 });
  });

  it("presence: pointers and held controls are shared; someone leaving is gone from the list", async () => {
    const { keeper, amy, ben, b } = await session();
    amy.presence({ cursor: [1, 2, 3], holding: 'length' });
    await tick();
    const amyHere = b.log.people.find((p) => p.id === amy.me)!;
    expect(amyHere.cursor).toEqual([1, 2, 3]);
    expect(amyHere.holding).toBe('length');
    amy.presence({ holding: 'nonsense' as keyof ShipDesign });
    await tick();
    expect(b.log.people.find((p) => p.id === amy.me)!.holding).toBeNull();
    amy.close();
    await tick();
    expect(keeper.people.map((p) => p.name)).toEqual(['Simon', 'Ben']);
    expect(ben.people.map((p) => p.name)).toEqual(['Simon', 'Ben']);
  });

  it('the keeper leaving tells the members (so one of them takes over)', async () => {
    const { host, b } = await session();
    host.close();
    expect(b.log.lost).toMatch(/left/);
  });

  it('session ids: short, readable, and read back from a link', () => {
    const id = newSessionId();
    expect(id).toMatch(/^[a-z2-9]{6}$/);
    expect(sessionIdFrom(`?s=${id}`)).toBe(id);
    expect(sessionIdFrom('?s=BAD id')).toBeNull();
    expect(sessionIdFrom('')).toBeNull();
  });
});

describe('undo', () => {
  it('a slider dragged through many steps is one undo; undo then redo', () => {
    const u = new UndoStack();
    let d: ShipDesign = { ...DEFAULT_DESIGN, length: 5 };
    const edit = (p: Partial<ShipDesign>, t: number) => {
      u.record(d, p, t);
      d = { ...d, ...p };
    };
    edit({ length: 6 }, 0);
    edit({ length: 7 }, 300);
    edit({ length: 8 }, 600);
    edit({ beam: 1 }, 5000);
    expect(u.undo()).toEqual({ beam: DEFAULT_DESIGN.beam });
    expect(u.undo()).toEqual({ length: 5 });
    expect(u.undo()).toBeNull();
    expect(u.redo()).toEqual({ length: 8 });
    // A new change clears the redo.
    edit({ headroom: 0 }, 9000);
    expect(u.canRedo).toBe(false);
  });

  it('a change to nothing new is not a step', () => {
    const u = new UndoStack();
    u.record(DEFAULT_DESIGN, { length: DEFAULT_DESIGN.length }, 0);
    expect(u.canUndo).toBe(false);
  });
});
