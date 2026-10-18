// "Try her together" (owner, Oct 2026): one press in a Shipyard session sends everyone into the
// game, in one multiplayer room. The keeper passes the go on; nobody gets their own back.
import { describe, expect, it } from 'vitest';
import { LoopbackHost } from '../../src/net/transport';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { cleanGo, Keeper, Member, type Go, type SessionEvents } from '../../src/shipyard/session';

const tick = () => new Promise((r) => setTimeout(r, 0));
function events(gone: { go: Go; by: string }[]): SessionEvents {
  return { onDesign: () => {}, onPeople: () => {}, onLost: () => {}, onGo: (go, by) => gone.push({ go, by }) };
}
async function session() {
  const host = new LoopbackHost();
  const k: { go: Go; by: string }[] = [], a: typeof k = [], b: typeof k = [];
  const keeper = new Keeper({ ...DEFAULT_DESIGN }, 'Simon', host, events(k));
  const amy = new Member({ ...DEFAULT_DESIGN }, 'Amy', host.client(), events(a));
  const ben = new Member({ ...DEFAULT_DESIGN }, 'Ben', host.client(), events(b));
  await tick();
  await tick();
  return { keeper, amy, ben, k, a, b };
}
const GO = { design: 'ABCDE-FGHJK-12345', room: '48213' };

describe('try her together', () => {
  it("a member's go reaches the keeper and the others, not the sender", async () => {
    const { amy, k, a, b } = await session();
    amy.go(GO);
    await tick();
    expect(k).toEqual([{ go: GO, by: amy.me }]);
    expect(b).toEqual([{ go: GO, by: amy.me }]);
    expect(a).toEqual([]);
  });

  it("the keeper's go reaches every member", async () => {
    const { keeper, k, a, b } = await session();
    keeper.go(GO);
    await tick();
    expect(a).toEqual([{ go: GO, by: keeper.me }]);
    expect(b).toEqual([{ go: GO, by: keeper.me }]);
    expect(k).toEqual([]);
  });

  it('a bad room or code goes nowhere', async () => {
    const { amy, k, b } = await session();
    amy.go({ design: 'ABC', room: '12' });
    amy.go({ design: '<script>', room: '12345' });
    await tick();
    expect(k).toEqual([]);
    expect(b).toEqual([]);
    expect(cleanGo({ design: 'A1-B2', room: '00042' })).toEqual({ design: 'A1-B2', room: '00042' });
    expect(cleanGo(null)).toBeNull();
  });
});
