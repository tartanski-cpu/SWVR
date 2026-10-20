import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { INTERP_DELAY, type HostMessage, type PlayerPose, type RestartNotice } from './protocol';
import type { ClientTransport } from './transport';
import type { ChartMarks, ChartOp } from '../chart/marks';

interface Snapshot {
  world: WorldState;
  /** Local receive time (s). */
  recv: number;
}

/**
 * The joining player's side: says hello, receives its player id and the host's snapshots,
 * and keeps a short buffer of them to render ~INTERP_DELAY in the past, interpolated.
 * It also estimates the host's clock (snapshot time vs local receive time, smoothed), so
 * the waves - a function of world time - are drawn in step with the host.
 */
export class ClientSession {
  status: 'connecting' | 'connected' | 'closed' = 'connecting';
  closeReason = '';
  playerId: EntityId | null = null;
  private readonly snapshots: Snapshot[] = [];
  private offset: number | null = null;
  /** Called once with the host's world when we're in. */
  onWelcome: (playerId: EntityId, world: WorldState, chart?: ChartMarks) => void = () => {};
  /** A chart op from the host (someone else's pencil). */
  onChart: (op: ChartOp) => void = () => {};
  onClosed: (reason: string) => void = () => {};
  /** The host's page is starting again in another boat: build her and join again (App). */
  onRestart: (notice: RestartNotice) => void = () => {};

  constructor(
    private readonly transport: ClientTransport,
    name: string,
    private readonly now: () => number = () => performance.now() / 1000,
    /** This page's build (build.ts APP_BUILD), so the host can tell if it's behind us. */
    build?: string,
  ) {
    transport.onOpen = () => transport.send({ t: 'hello', name, ...(build ? { build } : {}) });
    transport.onMessage = (m) => this.receive(m as HostMessage);
    transport.onClose = (reason) => {
      if (this.status === 'closed') return;
      this.status = 'closed';
      this.closeReason = reason;
      this.onClosed(reason);
    };
  }

  private receive(msg: HostMessage): void {
    if (msg.t === 'welcome') {
      this.playerId = msg.playerId;
      this.status = 'connected';
      this.push(msg.world);
      this.onWelcome(msg.playerId, msg.world, msg.chart);
    } else if (msg.t === 'snapshot') {
      this.push(msg.world);
    } else if (msg.t === 'chart') {
      this.onChart(msg.op);
    } else if (msg.t === 'restart') {
      this.onRestart(msg);
    }
  }

  private push(world: WorldState): void {
    const recv = this.now();
    this.snapshots.push({ world, recv });
    if (this.snapshots.length > 8) this.snapshots.shift();
    const sample = world.time - recv;
    // Host clock estimate: jumps down to faster samples at once, drifts up slowly.
    this.offset = this.offset === null ? sample : sample < this.offset ? sample : this.offset + (sample - this.offset) * 0.05;
  }

  /** The newest world from the host (controls, engine, cargo, other players...). */
  get latest(): WorldState | null {
    return this.snapshots.length ? this.snapshots[this.snapshots.length - 1].world : null;
  }

  /** Host sim time to render now. */
  renderTime(): number {
    if (this.offset === null) return 0;
    return this.now() + this.offset - INTERP_DELAY;
  }

  /** The two snapshots around time `t` and the blend between them. */
  bracket(t: number): { a: WorldState; b: WorldState; alpha: number } | null {
    const s = this.snapshots;
    if (s.length === 0) return null;
    if (t <= s[0].world.time) return { a: s[0].world, b: s[0].world, alpha: 0 };
    for (let i = 0; i + 1 < s.length; i++) {
      const a = s[i].world;
      const b = s[i + 1].world;
      if (t <= b.time) return { a, b, alpha: (t - a.time) / Math.max(1e-6, b.time - a.time) };
    }
    const last = s[s.length - 1].world;
    return { a: last, b: last, alpha: 0 };
  }

  sendIntents(intents: Intent[]): void {
    if (intents.length && this.status === 'connected') this.transport.send({ t: 'intents', intents });
  }

  sendChart(op: ChartOp): void {
    if (this.status === 'connected') this.transport.send({ t: 'chart', op });
  }

  sendPose(pose: PlayerPose): void {
    if (this.status === 'connected') this.transport.send({ t: 'pose', pose });
  }

  close(): void {
    this.status = 'closed';
    this.transport.close();
  }
}
