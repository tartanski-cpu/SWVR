/**
 * Getting into a shared session over PeerJS (session.ts has the protocol). Try to join
 * whoever keeps the session; if nobody does, keep it ourselves; if the keeper leaves,
 * someone else takes over after a short random wait (so two browsers rarely try at once,
 * and if they do, the second finds the first and joins it).
 */
import { PeerClientTransport, PeerHostTransport } from '../net/transport';
import type { ShipDesign } from './design';
import { Keeper, Member, peerIdForSession, type SessionEvents } from './session';
import type { Note } from './notes';

/** How long to wait for the keeper to answer before keeping the session ourselves (ms). */
const JOIN_WAIT = 6000;

export type Side = Keeper | Member;

export class YardLink {
  side: Side | null = null;
  /** What's happening, for the page: 'connecting', 'keeping', 'joined', 'offline'. */
  state: 'connecting' | 'keeping' | 'joined' | 'offline' = 'connecting';
  private closed = false;

  constructor(
    readonly id: string,
    private name: string,
    /** The design to start from (this browser's copy) if we end up keeping the session. */
    private design: () => ShipDesign,
    /** The pins and marks to start from if we end up keeping the session. */
    private notes: () => Note[],
    private readonly events: SessionEvents & { onState: (s: YardLink['state']) => void },
  ) {
    void this.connect();
  }

  private setState(s: YardLink['state']): void {
    this.state = s;
    this.events.onState(s);
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    this.setState('connecting');
    // A keeper who closed the browser without leaving holds the id at the broker for up to a
    // minute: keep trying for a while, a little longer each time.
    for (let attempt = 0; attempt < 12 && !this.closed; attempt++) {
      if (await this.tryJoin()) return;
      if (await this.tryKeep()) return;
      await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * (attempt + 1))));
    }
    if (!this.closed) this.setState('offline');
  }

  /** Join the keeper. True once welcomed. */
  private tryJoin(): Promise<boolean> {
    return new Promise((resolve) => {
      const transport = new PeerClientTransport('', peerIdForSession(this.id));
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) member.close();
        resolve(ok);
      };
      const member: Member = new Member(this.design(), this.name, transport, {
        onDesign: (d, p, by) => {
          if (member.joined && !settled) {
            this.side = member;
            this.setState('joined');
            done(true);
          }
          this.events.onDesign(d, p, by);
        },
        onPeople: (p) => this.events.onPeople(p),
        onNotes: (n) => this.events.onNotes?.(n),
        onLost: (reason) => {
          if (!settled) return done(false);
          if (this.side !== member) return;
          // The keeper left: someone takes over, after a short random wait.
          this.side = null;
          this.events.onLost(reason);
          setTimeout(() => void this.connect(), 300 + Math.random() * 1500);
        },
      });
      const timer = setTimeout(() => done(false), JOIN_WAIT);
    });
  }

  /** Keep the session here. False if someone else registered it first. */
  private async tryKeep(): Promise<boolean> {
    const transport = new PeerHostTransport('', peerIdForSession(this.id));
    try {
      await transport.ready;
    } catch {
      transport.close();
      return false;
    }
    const keeper = new Keeper(this.design(), this.name, transport, this.events, this.notes());
    this.side = keeper;
    this.setState('keeping');
    this.events.onPeople(keeper.people);
    return true;
  }

  rename(name: string): void {
    this.name = name;
    this.side?.presence({ name });
  }

  close(): void {
    this.closed = true;
    this.side?.close();
    this.side = null;
  }
}
