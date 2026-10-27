import type { IdFactory, EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { reclaimBoats } from '../core/launch';
import { createPlayerState } from '../player/playerState';
import { randomLook } from './avatarOutfits';
import { HAND_POSES } from '../player/handGesture';
import { placeAshore } from '../player/playerControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { releaseHolds } from '../vessel/vesselControl';
import { dropCarried } from '../cargo/cargo';
import { CONFIG } from '../config';
import type { PlayerState } from '../player/playerState';
import { DeltaPacker } from './worldDelta';
import { NET_RATE, type ClientMessage, type HostMessage } from './protocol';
import type { HostTransport, Link } from './transport';
import { applyChartOp, type ChartMarks, type ChartOp } from '../chart/marks';

/**
 * The hosting player's side. The host's simulation is the authority: clients' intents are
 * queued into it (stamped with the sender's player id - a client can't act as someone else),
 * clients' poses are written into their PlayerState, and the whole world is broadcast to
 * every client NET_RATE times a second.
 *
 * A crew-mate who goes (Leave game, the page closed or reloaded) says `bye` and is dropped at
 * once. A page that couldn't say it (closed abruptly, the headset taken off and its browser
 * stopped) often leaves its link looking open, so a crew-mate the host hasn't heard from for
 * CONFIG.net.crewHoldS lets go of the controls they held (the wheel, a lever: free for the
 * others), and after CONFIG.net.crewSilentS is taken out of the world (no frozen avatar left
 * standing; owner, Oct 2026: five of them after a crew-mate's page tried again and again),
 * put back as they were if they're heard from again. A page that joins again from the same
 * browser tab (its hello's `clientId`) replaces its old self at once.
 */
export class HostSession {
  /** Each crew-mate: their link, their player, when they were last heard from (s, `now`), and how their silence stands. */
  private readonly peers = new Map<string, { link: Link; playerId: EntityId; heardAt: number; away?: PlayerState; freed?: boolean; clientId?: string; fresh?: boolean }>();
  /** This page is hidden, its game stepping slowly (App): said in each snapshot, for the crew. */
  paused = false;
  private pending: Intent[] = [];
  private sinceSend = 0;
  /** The host's chart marks (the App's copy): a joiner gets them, ops are applied to them. */
  marks: ChartMarks | null = null;

  constructor(
    private readonly world: WorldState,
    private readonly ids: IdFactory,
    private readonly transport: HostTransport,
    readonly code: string,
    /** The clock (s): real time, not the frames' (a slow frame rate mustn't slow the silence). */
    private readonly now: () => number = () => performance.now() / 1000,
  ) {
    transport.onMessage = (link, msg) => this.receive(link, msg as ClientMessage);
    transport.onDisconnect = (link) => this.drop(link);
  }

  /** A crew-mate's page is another build than ours (they won't stay: their page refuses ours). */
  onOtherBuild: (name: string, theirs: string) => void = () => {};

  /** Players in the game: the host and every crew-mate not gone quiet (taken out of the world). */
  get playerCount(): number {
    let n = 1;
    for (const p of this.peers.values()) if (!p.away) n++;
    return n;
  }

  /**
   * A name nobody else in the game has (multiplayer study #17: two "Skipper"s on the crew list
   * and the notices can't be told apart): the second gets " 2", the third " 3".
   */
  private uniqueName(wanted: string, playerId: EntityId): string {
    const base = wanted.slice(0, 21);
    const taken = new Set(Object.values(this.world.players).filter((o) => o.id !== playerId).map((o) => o.name));
    if (!taken.has(wanted.slice(0, 24))) return wanted.slice(0, 24);
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  private receive(link: Link, msg: ClientMessage): void {
    if (msg.t === 'hello') {
      if (this.peers.has(link.id)) return;
      // The same tab again (a reload, a dropped link): its old self goes first.
      const cid = typeof msg.clientId === 'string' ? msg.clientId.slice(0, 40) : undefined;
      if (cid)
        for (const old of [...this.peers.values()])
          if (old.clientId === cid) {
            this.drop(old.link);
            old.link.close();
          }
      // A number nobody has, nor any boat left waiting (a world kept or taken over has its own).
      let playerId = this.ids.next('player');
      while (playerId in this.world.players || Object.values(this.world.vessels).some((v) => v.owner === playerId)) playerId = this.ids.next('player');
      const p = createPlayerState(playerId, this.uniqueName(msg.name || `Player ${this.peers.size + 2}`, playerId));
      p.look = randomLook(); // a random set of working clothes (net/avatarOutfits.ts)
      if (cid) p.clientId = cid;
      // Crew join aboard the workboat (wherever she is), at her boarding spot; back from the
      // same tab, aboard their own boat if she waited for them (core/launch.ts).
      const boat = reclaimBoats(this.world, playerId, cid) ?? homeVessel(this.world);
      if (boat) {
        p.aboardVesselId = boat.id;
        p.position = [...VESSEL_DEFS[boat.defId].boardingSpot];
        p.mode = 'walk';
      } else placeAshore(p);
      p.peerId = link.id; // for voice (net/voice.ts): who to call
      const ours = this.world.build?.app;
      // (A crew page from another address, the live game and /next/, is sent to ours instead: App.)
      const sameSite = !msg.site || !this.world.build?.site || msg.site === this.world.build.site;
      if (sameSite && msg.build && ours && ours !== 'dev' && msg.build !== 'dev' && msg.build !== ours) this.onOtherBuild(p.name, msg.build);
      this.world.players[playerId] = p;
      this.peers.set(link.id, { link, playerId, heardAt: this.now(), fresh: true, ...(cid ? { clientId: cid } : {}) });
      this.send(link, { t: 'welcome', playerId, world: this.world, ...(this.marks ? { chart: this.marks } : {}) });
      return;
    }
    const peer = this.peers.get(link.id);
    if (!peer) return;
    if (msg.t === 'bye') return this.drop(link);
    // Heard from: back in the world if they'd gone quiet.
    peer.heardAt = this.now();
    peer.freed = false;
    if (peer.away) {
      this.world.players[peer.playerId] = peer.away;
      delete peer.away;
    }
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
      if (typeof pose.name === 'string' && pose.name) p.name = this.uniqueName(pose.name, p.id);
      p.aboardVesselId = pose.aboardVesselId && this.world.vessels[pose.aboardVesselId] ? pose.aboardVesselId : null;
      p.position = pose.position;
      p.yaw = pose.yaw;
      const tool = pose.tool && ['pencil', 'eraser'].includes(pose.tool.kind) && (pose.tool.hand === 'left' || pose.tool.hand === 'right') ? { kind: pose.tool.kind, hand: pose.tool.hand } : null;
      const laser = Array.isArray(pose.laser) && pose.laser.length === 7 && pose.laser.slice(0, 6).every(Number.isFinite) ? pose.laser : null;
      // Hand orientations: four finite numbers, or nothing (desktop players, older versions).
      const quat = (q: unknown) => (Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) ? (q as [number, number, number, number]) : null);
      // Hand gear: a known kind, a finite point and direction (the host sprays with it).
      const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
      const g = pose.gear;
      const gear = g && (g.kind === 'extinguisher' || g.kind === 'torch') && vec(g.p) && vec(g.d) ? { kind: g.kind, on: !!g.on, p: g.p, d: g.d } : null;
      // Hand gestures: two known pose codes, or relaxed hands.
      const code = (c: unknown) => (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < HAND_POSES.length ? c : 0);
      const poses: [number, number] = Array.isArray(pose.poses) ? [code(pose.poses[0]), code(pose.poses[1])] : [0, 0];
      // The VHF: a hand or the chest, and the talk button.
      const r = pose.radio;
      const radio = r && typeof r === 'object' ? { hand: r.hand === 'left' || r.hand === 'right' ? r.hand : null, tx: r.tx === true } : null;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right, leftQ: quat(pose.leftQ), rightQ: quat(pose.rightQ), poses, swimming: pose.swimming === true, resting: pose.resting === true, camera: pose.camera === true, tool, laser, gear, radio };
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

  /** Tell every client (the restart notice: the host's page is starting again in another boat). */
  broadcast(msg: HostMessage): void {
    for (const { link } of this.peers.values()) this.send(link, msg);
  }

  /** Call every frame: broadcasts a snapshot NET_RATE times a second; crew-mates gone quiet are taken out. */
  tick(dt: number): void {
    const now = this.now();
    for (const peer of this.peers.values()) {
      const silent = now - peer.heardAt;
      // Quiet a moment: what they held is let go (nobody's locked out of the wheel by a page that's gone).
      if (!peer.freed && silent >= CONFIG.net.crewHoldS) {
        peer.freed = true;
        for (const v of Object.values(this.world.vessels)) releaseHolds(v, peer.playerId);
      }
      if (peer.away || silent < CONFIG.net.crewSilentS) continue;
      const p = this.world.players[peer.playerId];
      if (!p) continue;
      dropCarried(this.world, peer.playerId);
      for (const v of Object.values(this.world.vessels)) releaseHolds(v, peer.playerId);
      peer.away = p;
      delete this.world.players[peer.playerId];
    }
    this.sinceSend += dt;
    if (this.sinceSend < 1 / NET_RATE) return;
    this.sinceSend = 0;
    // What changed since the last send, as one text for every crew-mate (study #3: the whole
    // world, packed again for each, was up to 159 KB a time). A crew-mate just welcomed gets
    // the whole world once more, the changes counted from here.
    const paused = this.paused ? { paused: true as const } : {};
    const delta = this.packer.pack(this.world) ?? {};
    let whole: string | null = null;
    const changes = JSON.stringify({ t: 'snapshot', delta, ...paused } satisfies HostMessage);
    for (const peer of this.peers.values()) {
      if (peer.fresh) {
        peer.fresh = false;
        whole ??= JSON.stringify({ t: 'snapshot', world: this.world, ...paused } satisfies HostMessage);
        peer.link.send(whole);
      } else peer.link.send(changes);
    }
  }

  /** The world's changes from send to send (net/worldDelta.ts). */
  private readonly packer = new DeltaPacker();

  private send(link: Link, msg: HostMessage): void {
    link.send(msg);
  }

  /** @param end the host stopped hosting on purpose: the crew are told the game's over (no takeover). */
  close(end = false): void {
    if (end) this.broadcast({ t: 'end' });
    for (const { playerId } of this.peers.values()) {
      dropCarried(this.world, playerId);
      delete this.world.players[playerId];
      for (const v of Object.values(this.world.vessels)) releaseHolds(v, playerId);
    }
    this.peers.clear();
    this.transport.close();
  }
}
