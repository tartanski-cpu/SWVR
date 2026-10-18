/**
 * The pipe between players. HostTransport accepts connections; ClientTransport makes one.
 * PeerTransport* use PeerJS (WebRTC data channels; the public PeerJS server only
 * introduces the peers). Loopback* connect host and clients in memory, for tests.
 */
import Peer, { type DataConnection } from 'peerjs';

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

/** Host side over PeerJS. `ready` resolves once the room code is registered. */
export class PeerHostTransport implements HostTransport {
  onConnect: (link: Link) => void = () => {};
  onMessage: (link: Link, msg: unknown) => void = () => {};
  onDisconnect: (link: Link) => void = () => {};
  readonly ready: Promise<void>;
  readonly peer: Peer;

  /** `peerId`: the id to register (default: the game's room id for `code`; the Shipyard has its own). */
  constructor(code: string, peerId = peerIdForRoom(code)) {
    this.peer = new Peer(peerId);
    this.ready = new Promise((resolve, reject) => {
      this.peer.on('open', () => resolve());
      this.peer.on('error', (e) => reject(e));
    });
    this.peer.on('connection', (conn: DataConnection) => {
      const link: Link = { id: conn.peer, send: (m) => conn.open && conn.send(m), close: () => conn.close() };
      conn.on('open', () => this.onConnect(link));
      conn.on('data', (d) => this.onMessage(link, d));
      conn.on('close', () => this.onDisconnect(link));
      conn.on('error', () => this.onDisconnect(link));
    });
  }

  close(): void {
    this.peer.destroy();
  }
}

/** Client side over PeerJS. */
export class PeerClientTransport implements ClientTransport {
  onOpen: () => void = () => {};
  onMessage: (msg: unknown) => void = () => {};
  onClose: (reason: string) => void = () => {};
  readonly peer: Peer;
  private conn: DataConnection | null = null;

  constructor(code: string, peerId = peerIdForRoom(code)) {
    this.peer = new Peer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(peerId, { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => this.onOpen());
      conn.on('data', (d) => this.onMessage(d));
      conn.on('close', () => this.onClose('The host left'));
      conn.on('error', (e) => this.onClose(String(e)));
    });
    this.peer.on('error', (e) => this.onClose(e.type === 'peer-unavailable' ? 'No game with that code' : String(e.type ?? e)));
  }

  send(msg: unknown): void {
    if (this.conn?.open) this.conn.send(msg);
  }

  close(): void {
    this.peer.destroy();
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
