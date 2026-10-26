/**
 * The pipe between players. HostTransport accepts connections; ClientTransport makes one.
 * PeerTransport* use PeerJS (WebRTC data channels; the public PeerJS server only
 * introduces the peers). Loopback* connect host and clients in memory, for tests.
 */
import Peer, { type DataConnection } from 'peerjs';
import { CONFIG } from '../config';

/** The game finder's errors that are only its own connection's (the players' links carry on). */
const FINDER_ERRORS = ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'];

/**
 * The game finder's and the browser's error words in plain sentences (multiplayer study #20:
 * the menu said "server-error", "network" or "Negotiation of connection to swvr-room-... failed").
 * The words the game itself acts on ('No game with that code', 'The host left') pass as they are.
 */
export function plainNetError(raw: string): string {
  if (raw === 'peer-unavailable') return 'No game with that code';
  if (FINDER_ERRORS.includes(raw) || /network|server|socket/i.test(raw)) return "Can't reach the game finder: check the internet and try again in a minute";
  if (raw === 'unavailable-id') return 'That game code is in use';
  if (raw === 'browser-incompatible') return "This browser can't make game links: try another (Chrome, Edge, the Quest's)";
  if (/negotiation|webrtc|ice/i.test(raw)) return 'Found the host, but your networks block a direct link: try home Wi-Fi or a phone hotspot';
  if (/^[a-z-]+$/.test(raw)) return `Couldn't connect to the game (${raw})`;
  return raw;
}

export interface Link {
  readonly id: string;
  send(msg: unknown): void;
  close(): void;
}

export interface HostTransport {
  onConnect: (link: Link) => void;
  onMessage: (link: Link, msg: unknown) => void;
  onDisconnect: (link: Link) => void;
  close(): void;
}

export interface ClientTransport {
  onOpen: () => void;
  onMessage: (msg: unknown) => void;
  onClose: (reason: string) => void;
  send(msg: unknown): void;
  close(): void;
}

/** Room codes are short numbers (easy to type on a VR keypad); the peer id adds a prefix. */
export const peerIdForRoom = (code: string) => `swvr-room-${code}`;

export function randomRoomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Host side over PeerJS. `ready` resolves once the room code is registered. Its link to the
 * game finder (the PeerJS server: only it lets new crew find the game) can drop on a Wi-Fi
 * blip or a headset's sleep while the crew's own links carry on; it's reconnected, keeping
 * the code, waiting longer between each try (multiplayer study #14). `finder` says how it
 * stands: 'ok', 'reconnecting' (new crew can't join yet), or 'taken' (another page has the
 * code meanwhile).
 */
export class PeerHostTransport implements HostTransport {
  onConnect: (link: Link) => void = () => {};
  onMessage: (link: Link, msg: unknown) => void = () => {};
  onDisconnect: (link: Link) => void = () => {};
  readonly ready: Promise<void>;
  readonly peer: Peer;
  finder: 'ok' | 'reconnecting' | 'taken' = 'ok';
  private opened = false;
  private retryS = CONFIG.net.finderRetryS[0];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** `peerId`: the id to register (default: the game's room id for `code`; the Shipyard has its own). */
  constructor(code: string, peerId = peerIdForRoom(code)) {
    this.peer = new Peer(peerId);
    this.ready = new Promise((resolve, reject) => {
      this.peer.on('open', () => {
        this.opened = true;
        this.finder = 'ok';
        this.retryS = CONFIG.net.finderRetryS[0];
        resolve();
      });
      this.peer.on('error', (e) => {
        if (!this.opened) return reject(e);
        // Open once already: the finder's trouble, not the game's.
        if (e.type === 'unavailable-id') this.finder = 'taken';
        else if (FINDER_ERRORS.includes(e.type)) this.reconnectSoon();
      });
    });
    this.peer.on('disconnected', () => {
      if (this.opened) this.reconnectSoon();
    });
    this.peer.on('connection', (conn: DataConnection) => {
      const link: Link = { id: conn.peer, send: (m) => conn.open && conn.send(m), close: () => conn.close() };
      conn.on('open', () => this.onConnect(link));
      conn.on('data', (d) => this.onMessage(link, d));
      conn.on('close', () => this.onDisconnect(link));
      conn.on('error', () => this.onDisconnect(link));
    });
  }

  /** Back to the game finder after a while, each wait longer (to `finderRetryS[1]`). */
  private reconnectSoon(): void {
    if (this.peer.destroyed || this.retryTimer || this.finder === 'taken') return;
    this.finder = 'reconnecting';
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.peer.destroyed || !this.peer.disconnected) return;
      this.retryS = Math.min(CONFIG.net.finderRetryS[1], this.retryS * 2);
      this.peer.reconnect();
      // (Still down a moment later: try again, later.)
      setTimeout(() => {
        if (!this.peer.destroyed && this.peer.disconnected) this.reconnectSoon();
      }, 5000);
    }, this.retryS * 1000);
  }

  close(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    // A moment for anything just sent (the end of the game) to get out before the room closes.
    const peer = this.peer;
    setTimeout(() => peer.destroy(), 250);
  }
}

/** Client side over PeerJS. */
export class PeerClientTransport implements ClientTransport {
  onOpen: () => void = () => {};
  onMessage: (msg: unknown) => void = () => {};
  onClose: (reason: string) => void = () => {};
  readonly peer: Peer;
  private conn: DataConnection | null = null;
  /** How far the join has got (multiplayer study #8): reaching the game finder, looking for the host, linked (the world coming). */
  stage: 'finding' | 'linking' | 'loading' = 'finding';

  constructor(code: string, peerId = peerIdForRoom(code)) {
    this.peer = new Peer();
    this.peer.on('open', () => {
      this.stage = 'linking';
      // Binary (the default, binarypack): it cuts a message into 16 KB pieces and joins them
      // again. The 'json' channel sends each message whole and throws it away past 16 KB
      // (owner, Oct 2026: a host with a career, potting and the regions in her world sent a
      // welcome over that, and nobody could join; the crew sat at "connecting" with no error).
      const conn = this.peer.connect(peerId, { reliable: true, serialization: 'binary' });
      this.conn = conn;
      conn.on('open', () => {
        this.stage = 'loading';
        this.onOpen();
      });
      conn.on('data', (d) => this.onMessage(d));
      conn.on('close', () => this.onClose('The host left'));
      conn.on('error', (e) => this.onClose(plainNetError(String(e))));
    });
    // In the game (the link to the host open), the game finder's own trouble is ignored and
    // its connection quietly made again: the game goes on over the link (multiplayer study #9).
    this.peer.on('error', (e) => {
      if (this.conn?.open && FINDER_ERRORS.includes(e.type)) return this.refind();
      this.onClose(plainNetError(String(e.type ?? e)));
    });
    this.peer.on('disconnected', () => {
      if (this.conn?.open) this.refind();
    });
  }

  /** Back to the game finder in a moment, if the page is still here and still off it. */
  private refind(): void {
    setTimeout(() => {
      if (!this.peer.destroyed && this.peer.disconnected) this.peer.reconnect();
    }, CONFIG.net.finderRetryS[0] * 1000);
  }

  send(msg: unknown): void {
    if (this.conn?.open) this.conn.send(msg);
  }

  close(): void {
    // A moment for anything just sent (the goodbye) to get out before the link goes; a page
    // being closed may not get the moment (the host then notices the silence: hostSession.ts).
    const peer = this.peer;
    setTimeout(() => peer.destroy(), 250);
  }
}

/** In-memory host for tests: clients made with `client()` are connected immediately. */
export class LoopbackHost implements HostTransport {
  onConnect: (link: Link) => void = () => {};
  onMessage: (link: Link, msg: unknown) => void = () => {};
  onDisconnect: (link: Link) => void = () => {};
  private n = 0;
  private readonly clients: ClientTransport[] = [];

  client(): ClientTransport {
    const id = `loop-${++this.n}`;
    // JSON round trips catch anything that wouldn't survive the real wire.
    const wire = (m: unknown) => JSON.parse(JSON.stringify(m));
    const c: ClientTransport & { link?: Link } = {
      onOpen: () => {},
      onMessage: () => {},
      onClose: () => {},
      send: (m) => this.onMessage(link, wire(m)),
      close: () => this.onDisconnect(link),
    };
    const link: Link = { id, send: (m) => c.onMessage(wire(m)), close: () => c.onClose('closed') };
    this.clients.push(c);
    queueMicrotask(() => {
      this.onConnect(link);
      c.onOpen();
    });
    return c;
  }

  /** Like the host's peer going away: every client hears it. */
  close(): void {
    for (const c of this.clients.splice(0)) c.onClose('The host left');
  }
}
