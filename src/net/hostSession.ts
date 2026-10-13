import type { IdFactory, EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { createPlayerState } from '../player/playerState';
import { placeOnPlatform } from '../player/playerControl';
import { NET_RATE, type ClientMessage, type HostMessage } from './protocol';
import type { HostTransport, Link } from './transport';

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
      this.send(link, { t: 'welcome', playerId, world: this.world });
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
    } else if (msg.t === 'pose') {
      const p = this.world.players[peer.playerId];
      if (!p) return;
      const pose = msg.pose;
      p.aboardVesselId = pose.aboardVesselId && this.world.vessels[pose.aboardVesselId] ? pose.aboardVesselId : null;
      p.position = pose.position;
      p.yaw = pose.yaw;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right };
    }
  }

  private drop(link: Link): void {
    const peer = this.peers.get(link.id);
    if (!peer) return;
    delete this.world.players[peer.playerId];
    this.peers.delete(link.id);
  }

  /** Clients' intents received since the last call (for the host's next sim tick). */
  takeIntents(): Intent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Call every frame: broadcasts a snapshot NET_RATE times a second. */
  tick(dt: number): void {
    this.sinceSend += dt;
    if (this.sinceSend < 1 / NET_RATE) return;
    this.sinceSend = 0;
    for (const { link } of this.peers.values()) this.send(link, { t: 'snapshot', world: this.world });
  }

  private send(link: Link, msg: HostMessage): void {
    link.send(msg);
  }

  close(): void {
    for (const { playerId } of this.peers.values()) delete this.world.players[playerId];
    this.peers.clear();
    this.transport.close();
  }
}
