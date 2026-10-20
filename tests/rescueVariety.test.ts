/**
 * More kinds of emergency (owner, Oct 2026): a capsized dinghy, a liferaft, a sinking motor
 * boat, divers adrift; survivors swim for a ring that lands near them.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { RESCUE_DEFS } from '../src/rescue/rescueDefs';
import { vesselToWorld } from '../src/rescue/recovery';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;

function setup(defId: string) {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0);
  const send = (control: string, opts: { value?: number; ref?: string; args?: number[] } = {}) =>
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value: opts.value ?? 1, ref: opts.ref, args: opts.args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  send('rescueDebugNear', { ref: defId });
  const inc = world.rescue!.active!;
  return { world, v, send, run, inc };
}

describe('the new emergencies', () => {
  it('a survivor swims for a ring landing within reach of them, and takes it', () => {
    const { world, send, run, inc } = setup('manOverboard');
    const t = inc.targets[0];
    send('ringTake');
    // The ring lands 9 m from them: too far to catch, near enough to see.
    const ringX = t.x + 9;
    send('ringThrow', { args: [ringX, 2, t.z, 0, 0, 0] });
    run(1);
    expect(world.rescue!.ring!.state).toBe('water');
    expect(t.phase).not.toBe('onLine');
    const x0 = t.x;
    run(4);
    expect(t.x).toBeGreaterThan(x0 + 1.5); // swimming toward it
    run(12);
    expect(t.phase).toBe('onLine');
  });

  it('a capsized dinghy: its people in the water round the hull, which drifts with them', () => {
    const { inc, run } = setup('dinghy');
    expect(inc.prop?.kind).toBe('dinghy');
    expect(inc.targets.length).toBeGreaterThanOrEqual(2);
    for (const t of inc.targets) {
      expect(t.phase ?? 'floating').toBe('floating');
      const d = Math.hypot(t.x - inc.prop!.x, t.z - inc.prop!.z);
      expect(d).toBeLessThan(12);
    }
    const x0 = inc.prop!.x;
    run(20);
    expect(inc.prop!.x).not.toBe(x0);
  });

  it('a liferaft: with the stern alongside it in neutral they climb aboard one after another; the rescue is done', () => {
    const { world, v, run, inc } = setup('liferaft');
    expect(inc.prop?.kind).toBe('liferaft');
    for (const t of inc.targets) expect(t.phase).toBe('raft');
    // Our stern by the raft.
    const stern = VESSEL_DEFS.workboat.rescueGear!.stern;
    placeVessel(v, inc.prop!.x, 0, inc.prop!.z - stern[2] - 2.5, 0);
    v.engine.gear = 0;
    const sw = vesselToWorld(v, stern);
    expect(Math.hypot(sw.x - inc.prop!.x, sw.z - inc.prop!.z)).toBeLessThan(CONFIG.rescue.raftRange);
    run(0.5);
    expect(inc.targets.filter((t) => t.phase === 'climbing').length).toBe(1);
    run((CONFIG.rescue.climbTime + 0.5) * inc.targets.length + 2);
    expect(inc.targets.every((t) => t.phase === 'aboard')).toBe(true);
    expect(inc.phase).toBe('recovered');
    expect(world.rescue!.radio?.text).toMatch(/off the raft/);
  });

  it('a sinking boat goes down in her time; her people are in the water then, for the ring', () => {
    const { world, run, inc } = setup('sinking');
    expect(inc.prop?.kind).toBe('sinking');
    expect(inc.targets.every((t) => t.phase === 'raft')).toBe(true);
    run(CONFIG.rescue.sinkTime + 2);
    expect(inc.prop!.sunk).toBe(true);
    expect(inc.targets.every((t) => t.phase === 'floating')).toBe(true);
    expect(world.rescue!.radio?.text).toMatch(/gone down/);
  });

  it('divers: three, spread well apart; every def names its people and has its words', () => {
    const { inc } = setup('divers');
    expect(inc.targets).toHaveLength(3);
    const [a, b] = inc.targets;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(15);
    for (const d of RESCUE_DEFS) {
      expect(d.call.length).toBeGreaterThan(20);
      if (d.target === 'person') expect(d.landed).toBeTruthy();
    }
  });
});
