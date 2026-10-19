/**
 * Designing a boat together (owner, Oct 2026; collaboration): a shared session.
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
 * What's shared (part 2, notes.ts; part 3, variants.ts): the main design and its variants,
 * each with its own pins and marks. Every change says which variant it's for; each person
 * works on one at a time (their tab).
 *
 * Presence: each person has a name and a colour (given by the keeper), and shares where
 * their pointer is on the boat, which control they're holding and which tab they're on, so
 * a slider being dragged shows that person's colour to the others.
 *
 * This file is the protocol only, with no page or network code, so it's tested with the
 * in-memory transport. The page (page.ts) and the link (yardLink.ts) sit on top of it.
 */
import type { ClientTransport, HostTransport, Link } from '../net/transport';
import type { ShipDesign } from './design';
import { cleanNote, dropNote, putNote, type Note } from './notes';
import { cleanDoc, cleanStep, cleanVariant, dropVariant, MAIN, newDoc, putVariant, type Variant, type YardDoc } from './variants';
import { cleanBrief, type Brief } from './brief';

export type { YardDoc } from './variants';

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
  /** The variant they're looking at (its tab). */
  variant: string;
}

/** A change to the design: some of its fields. The gearbox isn't shared (each browser matches its own). */
export type DesignPatch = Partial<ShipDesign>;

/** A change to what the session holds (each says which variant, `v`, it's for). */
type Op =
  | { t: 'set'; v: string; patch: DesignPatch }
  | { t: 'note'; v: string; note: Note }
  | { t: 'unnote'; v: string; id: string }
  | { t: 'variant'; variant: Variant }
  | { t: 'unvariant'; id: string }
  | { t: 'brief'; brief: Brief }
  | { t: 'step'; step: string };
type Presence = { cursor?: Person['cursor']; holding?: Person['holding']; name?: string; variant?: string };
/**
 * "Try her together": one person sends everyone into the game, in the same multiplayer
 * room. Not kept in the session (it's a one-off): the keeper passes it on to the others.
 */
export interface Go {
  /** The boat's design code (design.ts). */
  design: string;
  /** The game room the sender hosts (5 digits, as the game's own game codes). */
  room: string;
}
type ToKeeper = { t: 'hello'; name: string } | Op | ({ t: 'me' } & Presence) | ({ t: 'go' } & Go);
type FromKeeper = { t: 'welcome'; you: string; doc: YardDoc; people: Person[] } | (Op & { by: string }) | { t: 'people'; people: Person[] } | ({ t: 'go'; by: string } & Go);

/** A go message checked: a plausible design code and a 5-digit room, else null. */
export function cleanGo(msg: unknown): Go | null {
  const m = msg as Partial<Go> | null;
  if (!m || typeof m.design !== 'string' || typeof m.room !== 'string') return null;
  if (!/^[0-9A-Z-]{1,120}$/.test(m.design) || !/^\d{5}$/.test(m.room)) return null;
  return { design: m.design, room: m.room };
}

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
  /** A variant's design changed (from someone else, or from joining): `by` is who changed it. */
  onDesign: (design: ShipDesign, patch: DesignPatch, by: string | null, variant: string) => void;
  /** Who's here changed (joined, left, moved their pointer, picked up a control, changed tab). */
  onPeople: (people: Person[]) => void;
  /** The link to the keeper is gone (they left): the page takes over or reconnects. */
  onLost: (reason: string) => void;
  /** A variant's pins and marks changed (anyone's, or from joining). */
  onNotes?: (notes: Note[], variant: string) => void;
  /** Variants were made, renamed, promoted or deleted (or the lot, on joining). */
  onVariants?: (variants: Variant[], by: string | null) => void;
  /** The brief changed (or arrived, on joining). */
  onBrief?: (brief: Brief | null, by: string | null) => void;
  /** Someone else pressed "Try her together": go into the game, joining their room. */
  onGo?: (go: Go, by: string) => void;
  /** Someone moved the session to another step of the design flow (or it arrived, on joining). */
  onStep?: (step: string, by: string | null) => void;
}

/** Common to both sides: the session's copy of everything, and the people. */
abstract class Side {
  variants: Variant[];
  /** What she's for (brief.ts), once someone has set it. */
  brief: Brief | null;
  /** The step of the design flow everyone's on (null: not set yet). */
  step: string | null;
  people: Person[] = [];
  /** This browser's person id. */
  me = '';

  constructor(start: ShipDesign | YardDoc, protected readonly events: SessionEvents) {
    const doc = 'variants' in start ? cleanDoc(start) : null;
    this.variants = doc?.variants ?? newDoc(start as ShipDesign).variants;
    this.brief = doc?.brief ?? null;
    this.step = doc?.step ?? null;
  }

  /** The main design and its notes (the first tab). */
  get design(): ShipDesign {
    return this.variant(MAIN)!.design;
  }
  get notes(): Note[] {
    return this.variant(MAIN)!.notes;
  }
  variant(id: string): Variant | undefined {
    return this.variants.find((v) => v.id === id);
  }

  doc(): YardDoc {
    return { v: 3, variants: this.variants, ...(this.brief ? { brief: this.brief } : {}), ...(this.step ? { step: this.step } : {}) };
  }

  /** Set the brief (shared, whole). */
  setBrief(brief: Brief): void {
    this.act({ t: 'brief', brief });
  }

  /** Move everyone to a step of the design flow. */
  setStep(step: string): void {
    this.act({ t: 'step', step });
  }

  /** Change a variant's design here and share it. */
  edit(patch: DesignPatch, v = MAIN): void {
    this.act({ t: 'set', v, patch });
  }
  /** Put a pin or mark on a variant (new, or changed: done, new text). */
  note(n: Note, v = MAIN): void {
    this.act({ t: 'note', v, note: n });
  }
  /** Take a pin or mark off. */
  unnote(id: string, v = MAIN): void {
    this.act({ t: 'unnote', v, id });
  }
  /** Make or replace a variant whole (a fork, a rename, a promotion). */
  putVariant(variant: Variant): void {
    this.act({ t: 'variant', variant });
  }
  /** Delete a variant (never the main design). */
  dropVariant(id: string): void {
    this.act({ t: 'unvariant', id });
  }

  /** An op of ours: applied here, then shared. */
  protected abstract act(op: Op): void;
  /** Share where this person's pointer is / what they're holding / their name / their tab. */
  abstract presence(update: Presence): void;
  abstract close(): void;

  /** Apply an op (anyone's) to this copy. The cleaned op if it changed anything, else null. */
  protected apply(op: Op, by: string | null): Op | null {
    if (!op || typeof op !== 'object') return null;
    if (op.t === 'variant') {
      const v = cleanVariant(op.variant);
      if (!v) return null;
      if (v.id === MAIN) v.parent = null;
      this.variants = putVariant(this.variants, v);
      if (!this.variant(v.id)) return null; // the list is full
      this.events.onVariants?.(this.variants, by);
      return { t: 'variant', variant: v };
    }
    if (op.t === 'brief') {
      const b = cleanBrief(op.brief);
      if (!b) return null;
      this.brief = b;
      this.events.onBrief?.(b, by);
      return { t: 'brief', brief: b };
    }
    if (op.t === 'step') {
      const s = cleanStep(op.step);
      if (!s || s === this.step) return null;
      this.step = s;
      this.events.onStep?.(s, by);
      return { t: 'step', step: s };
    }
    if (op.t === 'unvariant') {
      if (op.id === MAIN || !this.variant(op.id)) return null;
      this.variants = dropVariant(this.variants, op.id);
      this.events.onVariants?.(this.variants, by);
      return { t: 'unvariant', id: op.id };
    }
    const target = typeof op.v === 'string' ? this.variant(op.v) : undefined;
    if (!target) return null;
    if (op.t === 'set') {
      const patch = cleanPatch(op.patch, target.design);
      if (!Object.keys(patch).length) return null;
      this.replace({ ...target, design: { ...target.design, ...patch } });
      this.events.onDesign(this.variant(target.id)!.design, patch, by, target.id);
      return { t: 'set', v: target.id, patch };
    }
    if (op.t === 'note') {
      const n = cleanNote(op.note);
      if (!n) return null;
      this.replace({ ...target, notes: putNote(target.notes, n) });
      this.events.onNotes?.(this.variant(target.id)!.notes, target.id);
      return { t: 'note', v: target.id, note: n };
    }
    if (op.t === 'unnote') {
      if (typeof op.id !== 'string' || !target.notes.some((x) => x.id === op.id)) return null;
      this.replace({ ...target, notes: dropNote(target.notes, op.id) });
      this.events.onNotes?.(this.variant(target.id)!.notes, target.id);
      return { t: 'unnote', v: target.id, id: op.id };
    }
    return null;
  }

  private replace(v: Variant): void {
    this.variants = this.variants.map((x) => (x.id === v.id ? v : x));
  }
}

/** The browser keeping the session: everyone else connects to it. */
export class Keeper extends Side {
  private readonly links = new Map<string, { link: Link; person: Person }>();
  private n = 0;

  constructor(start: ShipDesign | YardDoc, name: string, private readonly transport: HostTransport, events: SessionEvents) {
    super(start, events);
    this.me = 'p0';
    this.people = [{ id: this.me, name: cleanPersonName(name, 'Person 1'), colour: COLOURS[0], cursor: null, holding: null, variant: MAIN }];
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
      const person: Person = { id, name: cleanPersonName(msg.name, `Person ${this.people.length + 1}`), colour, cursor: null, holding: null, variant: MAIN };
      this.links.set(link.id, { link, person });
      this.people = [...this.people, person];
      link.send({ t: 'welcome', you: id, doc: this.doc(), people: this.people } satisfies FromKeeper);
      this.sharePeople(link.id);
      this.events.onPeople(this.people);
      return;
    }
    if (!entry) return;
    if (msg.t === 'me') return this.update(entry.person.id, msg);
    if (msg.t === 'go') return this.passGo(msg, entry.person.id);
    const done = this.apply(msg, entry.person.id);
    if (done) this.broadcast({ ...done, by: entry.person.id });
  }

  /** Send everyone (but the sender) into the game; the keeper goes too, if it isn't the sender. */
  private passGo(msg: unknown, by: string): void {
    const go = cleanGo(msg);
    if (!go) return;
    for (const e of this.links.values()) if (e.person.id !== by) e.link.send({ t: 'go', by, ...go } satisfies FromKeeper);
    if (by !== this.me) this.events.onGo?.(go, by);
  }

  /** "Try her together": everyone else into the game, joining the room this browser will host. */
  go(go: Go): void {
    this.passGo(go, this.me);
  }

  private update(id: string, u: Presence): void {
    this.people = this.people.map((p) => {
      if (p.id !== id) return p;
      const q = { ...p };
      if (u.cursor !== undefined) q.cursor = Array.isArray(u.cursor) && u.cursor.length === 3 && u.cursor.every(Number.isFinite) ? [u.cursor[0], u.cursor[1], u.cursor[2]] : null;
      if (u.holding !== undefined) q.holding = typeof u.holding === 'string' && u.holding in this.design ? u.holding : null;
      if (u.name !== undefined) q.name = cleanPersonName(u.name, p.name);
      if (u.variant !== undefined) q.variant = typeof u.variant === 'string' && this.variant(u.variant) ? u.variant : MAIN;
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

  protected act(op: Op): void {
    const done = this.apply(op, this.me);
    if (done) this.broadcast({ ...done, by: this.me });
  }

  presence(update: Presence): void {
    this.update(this.me, update);
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

  constructor(start: ShipDesign | YardDoc, name: string, private readonly transport: ClientTransport, events: SessionEvents) {
    // Until welcomed, this browser's own copy; the session's then replaces it.
    super(start, events);
    transport.onOpen = () => transport.send({ t: 'hello', name } satisfies ToKeeper);
    transport.onMessage = (msg) => this.receive(msg as FromKeeper);
    transport.onClose = (reason) => events.onLost(reason);
  }

  private receive(msg: FromKeeper): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'welcome') {
      const doc = cleanDoc(msg.doc);
      if (!doc) return;
      this.me = msg.you;
      this.joined = true;
      this.people = msg.people;
      this.variants = doc.variants;
      this.brief = doc.brief ?? null;
      this.step = doc.step ?? null;
      this.events.onBrief?.(this.brief, null);
      if (this.step) this.events.onStep?.(this.step, null);
      this.events.onVariants?.(this.variants, null);
      for (const v of this.variants) this.events.onNotes?.(v.notes, v.id);
      this.events.onDesign(this.design, cleanPatch(this.design, this.design), null, MAIN);
      this.events.onPeople(this.people);
    } else if (msg.t === 'people') {
      this.people = msg.people;
      this.events.onPeople(this.people);
    } else if (msg.t === 'go') {
      const go = cleanGo(msg);
      if (go && msg.by !== this.me) this.events.onGo?.(go, msg.by);
    } else if (msg.by !== this.me) {
      // Someone else's change (our own come back already applied).
      this.apply(msg, msg.by);
    }
  }

  protected act(op: Op): void {
    const done = this.apply(op, this.me);
    if (done) this.transport.send(done satisfies ToKeeper);
  }

  presence(update: Presence): void {
    this.transport.send({ t: 'me', ...update } satisfies ToKeeper);
  }

  /** "Try her together": the keeper passes it on to everyone else. */
  go(go: Go): void {
    if (cleanGo(go)) this.transport.send({ t: 'go', ...go } satisfies ToKeeper);
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
