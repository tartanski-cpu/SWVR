/**
 * Big messages in pieces, for the Shipyard's session link. A browser-to-browser data
 * channel takes messages up to a limit (in practice about 16 KB between some browsers), and a sketch's
 * snapshot is tens of KB, a session with a dozen of them hundreds: sent whole, one would
 * close the link. So anything over CHUNK characters (as JSON) goes as numbered pieces and is
 * put back together on the other side before anyone sees it. Small messages go as they are.
 *
 * Wraps the game's transports (net/transport.ts) without changing them.
 */
import type { ClientTransport, HostTransport, Link } from '../net/transport';

/** Under PeerJS's own 16 300-byte piece size: bigger messages are cut off between some browsers (Firefox to Chrome). */
export const CHUNK = 15_000;

interface Piece {
  t: '~piece';
  id: string;
  i: number;
  n: number;
  part: string;
}

let seq = 0;
/** The message as it goes on the wire: itself, or its pieces. */
export function pieces(msg: unknown): unknown[] {
  const s = JSON.stringify(msg);
  if (s.length <= CHUNK) return [msg];
  const id = `${Date.now().toString(36)}-${++seq}`;
  const n = Math.ceil(s.length / CHUNK);
  return Array.from({ length: n }, (_, i): Piece => ({ t: '~piece', id, i, n, part: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
}

/** Puts pieces back together (one per sender). */
export class Joiner {
  private readonly open = new Map<string, { n: number; parts: string[]; got: number }>();

  /** A message off the wire: the whole message when it's complete (or not a piece), else undefined. */
  take(msg: unknown): unknown {
    const p = msg as Piece;
    if (!p || p.t !== '~piece') return msg;
    if (typeof p.id !== 'string' || !Number.isInteger(p.n) || p.n < 1 || p.n > 2000 || !Number.isInteger(p.i) || p.i < 0 || p.i >= p.n || typeof p.part !== 'string') return undefined;
    let e = this.open.get(p.id);
    if (!e) {
      e = { n: p.n, parts: new Array(p.n), got: 0 };
      this.open.set(p.id, e);
      // Don't keep half-sent messages for ever.
      if (this.open.size > 20) this.open.delete(this.open.keys().next().value!);
    }
    if (e.parts[p.i] === undefined) e.got++;
    e.parts[p.i] = p.part;
    if (e.got < e.n) return undefined;
    this.open.delete(p.id);
    try {
      return JSON.parse(e.parts.join(''));
    } catch {
      return undefined;
    }
  }
}

/** A host transport that sends big messages in pieces and joins them on arrival. */
export function chunkedHost(t: HostTransport): HostTransport {
  const joiners = new Map<string, Joiner>();
  const links = new Map<string, Link>();
  const wrap = (l: Link): Link => {
    let w = links.get(l.id);
    if (!w) {
      w = { id: l.id, send: (m) => pieces(m).forEach((x) => l.send(x)), close: () => l.close() };
      links.set(l.id, w);
    }
    return w;
  };
  const out: HostTransport = {
    onConnect: () => {},
    onMessage: () => {},
    onDisconnect: () => {},
    close: () => t.close(),
  };
  t.onConnect = (l) => out.onConnect(wrap(l));
  t.onMessage = (l, m) => {
    let j = joiners.get(l.id);
    if (!j) joiners.set(l.id, (j = new Joiner()));
    const whole = j.take(m);
    if (whole !== undefined) out.onMessage(wrap(l), whole);
  };
  t.onDisconnect = (l) => {
    out.onDisconnect(wrap(l));
    joiners.delete(l.id);
    links.delete(l.id);
  };
  return out;
}

/** A client transport that sends big messages in pieces and joins them on arrival. */
export function chunkedClient(t: ClientTransport): ClientTransport {
  const j = new Joiner();
  const out: ClientTransport = {
    onOpen: () => {},
    onMessage: () => {},
    onClose: () => {},
    send: (m) => pieces(m).forEach((x) => t.send(x)),
    close: () => t.close(),
  };
  t.onOpen = () => out.onOpen();
  t.onMessage = (m) => {
    const whole = j.take(m);
    if (whole !== undefined) out.onMessage(whole);
  };
  t.onClose = (r) => out.onClose(r);
  return out;
}
