import type { IdFactory, EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { createPlayerState } from '../player/playerState';
import { placeOnPlatform } from '../player/playerControl';
import { releaseHolds } from '../vessel/vesselControl';
import { dropCarried } from '../cargo/cargo';
import { NET_RATE, type ClientMessage, type HostMessage } from './protocol';
import type { HostTransport, Link } from './transport';
import { applyChartOp, type ChartMarks, type ChartOp } from '../chart/marks';

/**
 * The hosting player's side. The host's simulation is the authority: clients' intents are
 * queued into it (stamped with the sender's player id - a client can't act as someone else),
 * clients' poses are written into their PlayerState, and the whole world is broadcast to
 * every client NET_RATE times a second.
 */
export class HostSession {
  private readonly peers = new Map<string, { link: Link; playerId: EntityId }>();
  private pending: Intent[] = [];
  private sinceSend = 0;
  /** The log's seq as last sent (it travels on its own, only when it changes). */
  private logSent = -1;
  /** The host's chart marks (the App's copy): a joiner gets them, ops are applied to them. */
  marks: ChartMarks | null = null;

  constructor(
    private readonly world: WorldState,
    private readonly ids: IdFactory,
    private readonly transport: HostTransport,
    readonly code: string,
  ) {
    transport.onMessage = (link, msg) => this.receive(link, msg as ClientMessage);
    transport.onDisconnect = (link) => this.drop(link);
  }

  get playerCount(): number {
    return 1 + this.peers.size;
  }

  private receive(link: Link, msg: ClientMessage): void {
    if (msg.t === 'hello') {
      if (this.peers.has(link.id)) return;
      const playerId = this.ids.next('player');
      const p = createPlayerState(playerId, (msg.name || `Player ${this.peers.size + 2}`).slice(0, 24));
      placeOnPlatform(p);
      this.world.players[playerId] = p;
      this.peers.set(link.id, { link, playerId });
      this.send(link, { t: 'welcome', playerId, world: this.world, ...(this.marks ? { chart: this.marks } : {}) });
      return;
    }
    const peer = this.peers.get(link.id);
    if (!peer) return;
    if (msg.t === 'intents') {
      for (const i of msg.intents) {
        // Players may only act as themselves; player-targeted intents (boarding) are theirs alone.
        if (i.targetId in this.world.players && i.targetId !== peer.playerId) continue;
        this.pending.push({ ...i, playerId: peer.playerId });
      }
    } else if (msg.t === 'chart') {
      // A crewmate's pencil: apply it here and pass it on to the others.
      if (this.marks) applyChartOp(this.marks, msg.op);
      this.broadcastChart(msg.op, link);
    } else if (msg.t === 'pose') {
      const p = this.world.players[peer.playerId];
      if (!p) return;
      const pose = msg.pose;
      if (typeof pose.name === 'string' && pose.name) p.name = pose.name.slice(0, 24);
      p.aboardVesselId = pose.aboardVesselId && this.world.vessels[pose.aboardVesselId] ? pose.aboardVesselId : null;
      p.position = pose.position;
      p.yaw = pose.yaw;
      const tool = pose.tool && ['pencil', 'eraser'].includes(pose.tool.kind) && (pose.tool.hand === 'left' || pose.tool.hand === 'right') ? { kind: pose.tool.kind, hand: pose.tool.hand } : null;
      const laser = Array.isArray(pose.laser) && pose.laser.length === 7 && pose.laser.slice(0, 6).every(Number.isFinite) ? pose.laser : null;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right, tool, laser };
    }
  }

  private drop(link: Link): void {
    const peer = this.peers.get(link.id);
    if (!peer) return;
    dropCarried(this.world, peer.playerId);
    delete this.world.players[peer.playerId];
    for (const v of Object.values(this.world.vessels)) releaseHolds(v, peer.playerId);
    this.peers.delete(link.id);
  }

  /** Clients' intents received since the last call (for the host's next sim tick). */
  takeIntents(): Intent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Send a chart op to every client (but the one it came from). */
  broadcastChart(op: ChartOp, except?: Link): void {
    for (const { link } of this.peers.values()) if (link !== except) this.send(link, { t: 'chart', op });
  }

  /** Call every frame: broadcasts a snapshot NET_RATE times a second. */
  tick(dt: number): void {
    this.sinceSend += dt;
    if (this.sinceSend < 1 / NET_RATE) return;
    this.sinceSend = 0;
    const log = this.world.log;
    if (log && log.seq !== this.logSent) {
      this.logSent = log.seq;
      for (const { link } of this.peers.values()) this.send(link, { t: 'log', log });
    }
    // The world without the log (a shallow copy: the snapshot is serialised as it's sent).
    const world = { ...this.world, log: undefined };
    for (const { link } of this.peers.values()) this.send(link, { t: 'snapshot', world });
  }

  private send(link: Link, msg: HostMessage): void {
    link.send(msg);
  }

  close(): void {
    for (const { playerId } of this.peers.values()) {
      dropCarried(this.world, playerId);
      delete this.world.players[playerId];
      for (const v of Object.values(this.world.vessels)) releaseHolds(v, playerId);
    }
    this.peers.clear();
    this.transport.close();
  }
}
