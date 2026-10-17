/**
 * Designing a boat together (owner, Oct 2026; collaboration, part 1): a shared session.
 *
 * Everyone who opens a session's link edits the same design. There's no server of our own:
 * the browsers talk directly, over the same PeerJS link as the game's multiplayer
 * (net/transport.ts). One of them, the first to open the session, keeps the session going
 * (the "keeper"); the others connect to it. Nobody sees any of that: there are no roles
 * and no locks. If the keeper leaves, another person's browser takes over with its copy.
 *
 * The design is a handful of numbered choices (design.ts), so a change is a small patch of
 * fields: `{ length: 9 }`. Every change goes to the keeper, which applies it and passes it
 * on to everyone. The keeper's order is the order of record, so for any one field the last
 * change it receives wins. A few friends rarely collide, and undo (undo.ts) makes a
 * collision cheap to put right.
 *
 * Presence: each person has a name and a colour (given by the keeper), and shares where
 * their pointer is on the boat and which control they're holding, so a slider being dragged
 * shows that person's colour to the others.
 *
 * This file is the protocol only, with no page or network code, so it's tested with the
 * in-memory transport. The page (page.ts) and the link (yardLink.ts) sit on top of it.
 */
import type { ClientTransport, HostTransport, Link } from '../net/transport';
import type { ShipDesign } from './design';
import { cleanNote, cleanNotes, dropNote, putNote, type Note } from './notes';

/** One person in the session. */
export interface Person {
  id: string;
  name: string;
  /** CSS colour, e.g. '#d9622b'. */
  colour: string;
  /** Their pointer on the boat (boat axes, m), or null when it's off her. */
  cursor: [number, number, number] | null;
  /** The control they're holding (a design field, e.g. 'length'), or null. */
  holding: keyof ShipDesign | null;
}

/** What a session holds (saved in each browser, sent to anyone who joins). */
export interface YardDoc {
  v: 1;
  design: ShipDesign;
  /** Pins and marks on her (notes.ts); missing in copies saved before part 2. */
  notes?: Note[];
}

/** A change to the design: some of its fields. The gearbox isn't shared (each browser matches its own). */
export type DesignPatch = Partial<ShipDesign>;

type ToKeeper =
  | { t: 'hello'; name: string }
  | { t: 'set'; patch: DesignPatch }
  | { t: 'note'; note: Note }
  | { t: 'unnote'; id: string }
  | { t: 'me'; cursor?: Person['cursor']; holding?: Person['holding']; name?: string };
type FromKeeper =
  | { t: 'welcome'; you: string; doc: YardDoc; people: Person[] }
  | { t: 'patch'; patch: DesignPatch; by: string }
  | { t: 'note'; note: Note; by: string }
  | { t: 'unnote'; id: string; by: string }
  | { t: 'people'; people: Person[] };

/** Colours handed out in turn: clear on the page's pale blue and on the boat. */
export const COLOURS = ['#d9622b', '#2f8a4a', '#7a3fb0', '#c0392b', '#1f7fb8', '#b8860b', '#d63384', '#3d5a80'];
export const MAX_NAME = 20;

/** A tidy display name. */
export function cleanPersonName(name: string, fallback: string): string {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return n || fallback;
}

/** Only the design's own fields, numbers, and never the gearbox (each browser matches it itself). */
export function cleanPatch(patch: unknown, design: ShipDesign): DesignPatch {
  const out: DesignPatch = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'gear' || !(k in design) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    (out as Record<string, number>)[k] = v;
  }
  return out;
}

export interface SessionEvents {
  /** The design changed (from someone else, or from joining): `by` is who changed it. */
  onDesign: (design: ShipDesign, patch: DesignPatch, by: string | null) => void;
  /** Who's here changed (joined, left, moved their pointer, picked up a control). */
  onPeople: (people: Person[]) => void;
  /** The link to the keeper is gone (they left): the page takes over or reconnects. */
  onLost: (reason: string) => void;
  /** The pins and marks changed (anyone's, or from joining). */
  onNotes?: (notes: Note[]) => void;
}

/** Common to both sides: the copy of the design and the people. */
abstract class Side {
  design: ShipDesign;
  people: Person[] = [];
  /** Pins and marks on her (notes.ts). */
  notes: Note[];
  /** This browser's person id. */
  me = '';

  constructor(design: ShipDesign, protected readonly events: SessionEvents, notes: Note[] = []) {
    this.design = { ...design };
    this.notes = cleanNotes(notes);
  }

  /** Put a pin or mark (new, or changed: done, new text). */
  abstract note(n: Note): void;
  /** Take a pin or mark off. */
  abstract unnote(id: string): void;

  protected setNote(n: unknown): Note | null {
    const clean = cleanNote(n);
    if (!clean) return null;
    this.notes = putNote(this.notes, clean);
    this.events.onNotes?.(this.notes);
    return clean;
  }

  protected removeNote(id: unknown): boolean {
    if (typeof id !== 'string' || !this.notes.some((x) => x.id === id)) return false;
    this.notes = dropNote(this.notes, id);
    this.events.onNotes?.(this.notes);
    return true;
  }

  /** Change the design here and share it. */
  abstract edit(patch: DesignPatch): void;
  /** Share where this person's pointer is / what they're holding / their name. */
  abstract presence(update: { cursor?: Person['cursor']; holding?: Person['holding']; name?: string }): void;
  abstract close(): void;

  doc(): YardDoc {
    return { v: 1, design: { ...this.design }, notes: this.notes };
  }

  protected apply(patch: DesignPatch, by: string | null): void {
    const clean = cleanPatch(patch, this.design);
    if (!Object.keys(clean).length) return;
    this.design = { ...this.design, ...clean };
    this.events.onDesign(this.design, clean, by);
  }
}

/** The browser keeping the session: everyone else connects to it. */
export class Keeper extends Side {
  private readonly links = new Map<string, { link: Link; person: Person }>();
  private n = 0;

  constructor(design: ShipDesign, name: string, private readonly transport: HostTransport, events: SessionEvents, notes: Note[] = []) {
    super(design, events, notes);
    this.me = 'p0';
    this.people = [{ id: this.me, name: cleanPersonName(name, 'Person 1'), colour: COLOURS[0], cursor: null, holding: null }];
    transport.onMessage = (link, msg) => this.receive(link, msg as ToKeeper);
    transport.onDisconnect = (link) => {
      const gone = this.links.get(link.id)?.person.id;
      if (!gone) return;
      this.links.delete(link.id);
      this.people = this.people.filter((p) => p.id !== gone);
      this.sharePeople();
    };
  }

  private receive(link: Link, msg: ToKeeper): void {
    if (!msg || typeof msg !== 'object') return;
    const entry = this.links.get(link.id);
    if (msg.t === 'hello') {
      if (entry) return;
      const id = `p${++this.n}`;
      // The next colour nobody here has.
      const used = new Set(this.people.map((p) => p.colour));
      const colour = COLOURS.find((c) => !used.has(c)) ?? COLOURS[this.n % COLOURS.length];
      const person: Person = { id, name: cleanPersonName(msg.name, `Person ${this.people.length + 1}`), colour, cursor: null, holding: null };
      this.links.set(link.id, { link, person });
      this.people = [...this.people, person];
      link.send({ t: 'welcome', you: id, doc: this.doc(), people: this.people } satisfies FromKeeper);
      this.sharePeople(link.id);
      this.events.onPeople(this.people);
      return;
    }
    if (!entry) return;
    if (msg.t === 'set') {
      const clean = cleanPatch(msg.patch, this.design);
      if (!Object.keys(clean).length) return;
      this.apply(clean, entry.person.id);
      this.broadcast({ t: 'patch', patch: clean, by: entry.person.id });
    } else if (msg.t === 'note') {
      const n = this.setNote(msg.note);
      if (n) this.broadcast({ t: 'note', note: n, by: entry.person.id });
    } else if (msg.t === 'unnote') {
      if (this.removeNote(msg.id)) this.broadcast({ t: 'unnote', id: msg.id, by: entry.person.id });
    } else if (msg.t === 'me') {
      this.update(entry.person.id, msg);
    }
  }

  private update(id: string, u: { cursor?: Person['cursor']; holding?: Person['holding']; name?: string }): void {
    this.people = this.people.map((p) => {
      if (p.id !== id) return p;
      const q = { ...p };
      if (u.cursor !== undefined) q.cursor = Array.isArray(u.cursor) && u.cursor.length === 3 && u.cursor.every(Number.isFinite) ? [u.cursor[0], u.cursor[1], u.cursor[2]] : null;
      if (u.holding !== undefined) q.holding = typeof u.holding === 'string' && u.holding in this.design ? u.holding : null;
      if (u.name !== undefined) q.name = cleanPersonName(u.name, p.name);
      return q;
    });
    this.sharePeople();
  }

  private broadcast(msg: FromKeeper, except?: string): void {
    for (const [id, e] of this.links) if (id !== except) e.link.send(msg);
  }

  private sharePeople(except?: string): void {
    this.broadcast({ t: 'people', people: this.people }, except);
    this.events.onPeople(this.people);
  }

  edit(patch: DesignPatch): void {
    const clean = cleanPatch(patch, this.design);
    if (!Object.keys(clean).length) return;
    this.design = { ...this.design, ...clean };
    this.broadcast({ t: 'patch', patch: clean, by: this.me });
  }

  presence(update: { cursor?: Person['cursor']; holding?: Person['holding']; name?: string }): void {
    this.update(this.me, update);
  }

  note(n: Note): void {
    const clean = this.setNote(n);
    if (clean) this.broadcast({ t: 'note', note: clean, by: this.me });
  }

  unnote(id: string): void {
    if (this.removeNote(id)) this.broadcast({ t: 'unnote', id, by: this.me });
  }

  get count(): number {
    return this.people.length;
  }

  close(): void {
    this.transport.close();
  }
}

/** A browser connected to the keeper. */
export class Member extends Side {
  /** Joined (the keeper's welcome has come). */
  joined = false;

  constructor(design: ShipDesign, name: string, private readonly transport: ClientTransport, events: SessionEvents) {
    super(design, events);
    // Until welcomed, no notes: the session's replace this browser's own.
    transport.onOpen = () => transport.send({ t: 'hello', name } satisfies ToKeeper);
    transport.onMessage = (msg) => this.receive(msg as FromKeeper);
    transport.onClose = (reason) => events.onLost(reason);
  }

  private receive(msg: FromKeeper): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'welcome') {
      this.me = msg.you;
      this.joined = true;
      this.people = msg.people;
      // The session's design replaces whatever this browser had.
      this.design = { ...this.design, ...cleanPatch(msg.doc?.design, this.design) };
      this.events.onDesign(this.design, cleanPatch(msg.doc?.design, this.design), null);
      this.notes = cleanNotes(msg.doc?.notes);
      this.events.onNotes?.(this.notes);
      this.events.onPeople(this.people);
    } else if (msg.t === 'patch') {
      // Our own change coming back: already applied here.
      if (msg.by === this.me) return;
      this.apply(msg.patch, msg.by);
    } else if (msg.t === 'note') {
      if (msg.by !== this.me) this.setNote(msg.note);
    } else if (msg.t === 'unnote') {
      if (msg.by !== this.me) this.removeNote(msg.id);
    } else if (msg.t === 'people') {
      this.people = msg.people;
      this.events.onPeople(this.people);
    }
  }

  edit(patch: DesignPatch): void {
    const clean = cleanPatch(patch, this.design);
    if (!Object.keys(clean).length) return;
    this.design = { ...this.design, ...clean };
    this.transport.send({ t: 'set', patch: clean } satisfies ToKeeper);
  }

  presence(update: { cursor?: Person['cursor']; holding?: Person['holding']; name?: string }): void {
    this.transport.send({ t: 'me', ...update } satisfies ToKeeper);
  }

  note(n: Note): void {
    const clean = this.setNote(n);
    if (clean) this.transport.send({ t: 'note', note: clean } satisfies ToKeeper);
  }

  unnote(id: string): void {
    if (this.removeNote(id)) this.transport.send({ t: 'unnote', id } satisfies ToKeeper);
  }

  close(): void {
    this.transport.close();
  }
}

/** A new session id: 6 letters and digits, easy to read out (no 0/O, 1/I/L). */
export function newSessionId(rand: () => number = Math.random): string {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(rand() * A.length)];
  return s;
}

/** A session id from a link (?s=...), or null. */
export function sessionIdFrom(search: string): string | null {
  const s = new URLSearchParams(search).get('s');
  return s && /^[a-z0-9]{4,16}$/.test(s) ? s : null;
}

/** The PeerJS id a session's keeper registers (apart from the game's room ids). */
export const peerIdForSession = (id: string) => `swvr-yard-${id}`;
